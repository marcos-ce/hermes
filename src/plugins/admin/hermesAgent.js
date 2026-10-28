const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const pluginLoader = require('../../core/pluginLoader');
const aiService = require('../../services/aiService');
const memoryEngine = require('../../services/memoryEngine');
const toolRegistry = require('../../services/toolRegistry');
const { cleanJid, getGroupMetadata, checkAdminStatus, resolveParticipant, getBotIdentity } = require('../../utils/jidResolver');
const { checkCooldown, sendSafeMessage } = require('../../utils/antiBan');
const { wizardCache } = require('../../utils/cache');
const settings = require('../../config/settings');
const logger = require('../../utils/logger');
const pollTracker = require('../../utils/pollTracker');
const { t: tr } = require('../../utils/i18n');

// Cache em memória para debounce de alertas de erro enviados ao dono (10 min de cooldown)
const ownerAlertCooldown = new Map();

// Trilhos de custo e segurança da IA (100% determinísticos, sem chamar o modelo)
const MAX_HISTORY_MESSAGES = 20;          // contexto recente enxuto (economiza ~350 tokens graças ao Perfil Cultural)
const MAX_TOOL_CALLS = 6;                 // ações máximas por pedido
const MAX_DESTRUCTIVE_CALLS = 3;          // bans/rebaixamentos/blacklist máximos por pedido
const DESTRUCTIVE_TOOLS = new Set(['ban_member', 'demote_member', 'manage_blacklist']);
const processedMsgIds = new Set();        // evita processar 2x a mesma mensagem (reentrega do Baileys)
const inflightRequests = new Set();       // 1 pedido por vez por admin/grupo (evita spam durante os 15s da API)
const hourlyQuota = new Map();            // limite de chamadas à API por grupo/hora
// Só envia o "[Estado do grupo]" ao modelo quando o pedido trata de configuração (economia de tokens)
const STATE_KEYWORDS = /hor[aá]rio|abr[ei]|fech|tranc|m[oó]dulo|link|links|antilink|antiflood|flood|spam|trava|antifake|ddi|warn|advert|aviso|ban|banir|banimento|kick|expuls|mut|silenci|desmut|puni|prote[cç][aã]o|config|prefix|idioma|lig[ao]|desliga|ativ|status|blacklist|bem-?vind|automsg|agenda|calend[aá]rio|calendar|evento|tarefa|compromisso|estado|regra|descr|bio|desfa[zç]|desfazer|cancela|reverte|aprende|anota|esquece|apelido|cultura|enquete|poll|vota[cç][aã]o|decid|resultado|ganh|venc|apur|escolh|faça|execute|placar|voto|votos|venceu|disputa|parcial|frente|sortei|sorteio|desfix|despin|\d{1,2}[:h]\d{0,2}/i;

// Ações reversíveis registradas para o mecanismo de "desfazer" (Ideia 4)
const REVERSIBLE_TOOLS = new Set([
  'set_group_mute',
  'pin_group_message',
  'warn_member',
  'promote_member',
  'demote_member',
  'toggle_group_protection',
  'mute_member',
  'set_group_description'
]);

/**
 * Consome 1 unidade da cota horária de chamadas à IA do grupo
 * @param {string} groupJid
 * @returns {boolean} false se o limite foi atingido
 */
function consumeQuota(groupJid) {
  const limit = parseInt(process.env.AI_MAX_CALLS_PER_HOUR, 10) || 60;
  const now = Date.now();
  const entry = hourlyQuota.get(groupJid);
  if (!entry || now - entry.start > 3600000) {
    hourlyQuota.set(groupJid, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/**
 * Verifica se o remetente é administrador do grupo ou dono do bot
 */
async function isAdminOrOwner(sock, from, sender) {
  try {
    if (settings.isOwner(sender, sock)) return true;
    const status = await checkAdminStatus(sock, from, sender);
    return Boolean(status?.isAdmin);
  } catch (_) {
    return false;
  }
}

/**
 * Gatekeeper Anti-Desperdício: Detecta se a mensagem é um pedido de promoção a administrador sem menção @.
 * Executado localmente em 0ms para evitar queimar tokens de IA inutilmente.
 * 
 * @param {object} params
 * @param {string} params.queryText Texto limpo da mensagem
 * @param {object} params.msg Objeto original da mensagem
 * @param {object} params.sock Socket do Baileys
 * @returns {boolean}
 */
function isUnmarkedPromotionRequest({ queryText, msg, sock }) {
  if (!queryText || typeof queryText !== 'string') return false;

  const norm = queryText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // 1. Verifica se expressa intenção de promover / dar adm
  // Padrões diretos: "dá adm", "dar adm", "promove", "promover", "bota de adm", "virar adm", "add adm"
  const isPromotionVerb = /\b(?:promove|promover|promueva|promueve|promote)\b/i.test(norm);
  const isGiveAdmin = /\b(?:da|de|dar|bote|bota|botar|coloque|coloca|colocar|passa|passar|torne|torna|tornar|faca|faz|fazer|virar|vira|adiciona|adicionar|add|give|make|poner|pon|nombrar)\b(?:\s+(?:ele|ela|o|a|esse|essa|este|esta|alguem|alguien|someone|him|her|this|the))?\s+(?:de\s+|como\s+|a\s+|pra\s+|para\s+)?(?:adm|admin|administrador(?:a)?)\b/i.test(norm);
  const isDirectAdm = /^(?:adm|admin)\b/i.test(norm);

  if (!isPromotionVerb && !isGiveAdmin && !isDirectAdm) {
    return false;
  }

  // 2. Filtra dúvidas ou perguntas puramente informativas (ex: "quem é o adm?", "como funciona o adm?")
  const isQuestion = /\b(?:quem|quais|qual|o\s+que|oque|quien|quienes|cual|cuales|who|what|how)\s+(?:e|sao|seria|consigo|posso|viro|funciona|ser|is|are|can|do|does)\b/i.test(norm);
  if (isQuestion) {
    return false;
  }

  // 3. Extrai menções com @ para verificar se alguém além do bot foi marcado
  const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);
  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo;

  const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  const targetMentions = rawMentions
    .map(m => cleanJid(m))
    .filter(m => {
      const num = m.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return m !== botJid && m !== botLid && (!botNum || num !== botNum) && (!botLidNum || num !== botLidNum);
    });

  // Verifica menções por texto: @551199999999 (PN/LID) ou @Fulano (nome literal).
  const textAtTokens = (queryText.match(/(?:^|\s)@([^\s@]+)/g) || [])
    .map(tm => tm.replace(/^[^@]*@/, '').replace(/[.,!?;:)\]}'"»”’]+$/g, '').trim())
    .filter(Boolean)
    .filter(token => {
      const numeric = token.replace(/^\+/, '');
      if (/^\d{8,20}$/.test(numeric)) return numeric !== botNum && numeric !== botLidNum;

      const normalized = token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalized !== 'hermes' && normalized !== 'bot';
    });

  const hasExplicitMention = targetMentions.length > 0 || textAtTokens.length > 0;

  // Se tem intenção de promover MAS NÃO tem menção explícita com @ -> INTERCEPTAR!
  return !hasExplicitMention;
}

/**
 * Notifica o Dono do bot no privado com diagnóstico completo caso ocorra erro na IA
 * Evita expor falhas técnicas e saldo insuficiente nos grupos
 */
async function notifyOwnerAboutAIError({ sock, errorDetails, groupName, from, sender, queryText }) {
  try {
    const ownerJid = settings.getOwnerJid();
    if (!sock || !ownerJid) {
      logger.warn('Não foi possível notificar o dono sobre erro de IA: OWNER_NUMBER não configurado no .env');
      return;
    }

    const errStr = String(errorDetails || '');
    let category = 'OUTRO';
    let errorTitle = '⚠️ *Falha na Requisição de IA*';
    let actionTip = `👉 *Detalhes Técnicos:* \`${errStr.slice(0, 180)}\``;

    if (errStr.includes('402') || errStr.toLowerCase().includes('insufficient') || errStr.toLowerCase().includes('balance')) {
      category = '402_BALANCE';
      errorTitle = '💸 *DeepSeek: Saldo Insuficiente (HTTP 402)*';
      actionTip =
        '👉 *Como Resolver:*\n' +
        'Acesse *platform.deepseek.com/top_up* e adicione créditos para reativar as respostas e ações da IA.';
    } else if (errStr.includes('401') || errStr.toLowerCase().includes('unauthorized') || errStr.toLowerCase().includes('invalid')) {
      category = '401_AUTH';
      errorTitle = '🔑 *DeepSeek: Chave de API Inválida (HTTP 401)*';
      actionTip = '👉 Verifique a chave `AI_API_KEY` no arquivo `.env` (obtenha em *platform.deepseek.com/api_keys*).';
    } else if (errStr.includes('API_KEY_MISSING')) {
      category = 'KEY_MISSING';
      errorTitle = '⚠️ *Nenhuma Chave da DeepSeek Configurada no .env*';
      actionTip = '👉 Adicione `AI_API_KEY=sk-...` no seu arquivo `.env`.';
    } else if (errStr.includes('TIMEOUT')) {
      category = 'TIMEOUT';
      errorTitle = '⏱️ *Timeout na API da DeepSeek (> 15s)*';
      actionTip = '👉 A DeepSeek demorou mais de 15 segundos para responder. Pode ser instabilidade temporária na API.';
    }

    // Cooldown de 10 minutos (600.000 ms) para não inundar o privado do dono
    const now = Date.now();
    const lastAlert = ownerAlertCooldown.get(category) || 0;
    if (now - lastAlert < 10 * 60 * 1000) {
      logger.info({ category, remainingSec: Math.round((600000 - (now - lastAlert)) / 1000) }, 'Alerta ao dono suprimido por cooldown');
      return;
    }
    ownerAlertCooldown.set(category, now);

    const cleanSender = (sender || '').replace(/@.*$/, '');
    const promptSnippet = (queryText || '').slice(0, 100);

    const alertMessage =
      `🚨 *[ALERTA HERMES IA - DONO]*\n\n` +
      `${errorTitle}\n\n` +
      `📍 *Grupo:* ${groupName || from}\n` +
      `👤 *Membro:* @${cleanSender}\n` +
      (promptSnippet ? `💬 *Mensagem:* "${promptSnippet}..."\n\n` : '\n') +
      `${actionTip}\n\n` +
      `🛡️ _Esta notificação foi enviada apenas para você no privado. No grupo, os membros receberam apenas uma resposta discreta de oscilação temporária._`;

    await sendSafeMessage(sock, ownerJid, alertMessage, { mentions: sender ? [sender] : [] });
    logger.info({ ownerJid, category }, 'Alerta de erro de IA enviado com sucesso ao dono no privado');
  } catch (alertErr) {
    logger.error({ alertErr }, 'Erro ao enviar alerta de IA ao dono no privado');
  }
}

module.exports = {
  name: 'hermes',
  priority: 100,
  cmdNumber: 33,
  aliases: ['hermes', 'ia', 'ai', 'agente', 'agent'],
  usage: 'hermes [on|off|config|status|pergunta]',
  description: 'Agente de Inteligência Artificial oficial DeepSeek para auxílio e moderação',
  ownerOnly: false,
  adminOnly: false, // Permite perguntas via /ia <pergunta>; subcomandos de config checam admin internamente
  botAdminRequired: false,

  /**
   * Hook acionado no !reload para limpar o cache dos serviços satélites da IA
   * mantendo 100% de isolamento sem sujar o núcleo (pluginLoader.js)
   */
  onReload() {
    try {
      delete require.cache[require.resolve('../../services/aiService')];
      delete require.cache[require.resolve('../../services/toolRegistry')];
      delete require.cache[require.resolve('../../services/humanizer')];
      delete require.cache[require.resolve('../../services/timeParser')];
    } catch (_) {}
  },

  configSchema: {
    title: {
      pt: 'Agente de IA Hermes (DeepSeek)',
      es: 'Agente de IA Hermes (DeepSeek)',
      en: 'Hermes AI Agent (DeepSeek)'
    },
    description: {
      pt: 'Inteligência Artificial oficial da DeepSeek com Tool Calling e memória contextual',
      es: 'Inteligencia Artificial oficial de DeepSeek con Tool Calling y memoria contextual',
      en: 'Official DeepSeek AI with Tool Calling and contextual memory'
    },
    fields: [
      {
        name: 'personality',
        type: 'choice',
        question: {
          pt: 'Qual personalidade o Hermes deve adotar no grupo?',
          es: '¿Qué personalidad debe adoptar Hermes en el grupo?',
          en: 'What personality should Hermes adopt in the group?'
        },
        choices: [
          {
            value: 'descontraido',
            label: {
              pt: 'Descontraído (rápido, informal, gírias leves do WhatsApp)',
              es: 'Relajado (rápido, informal, estilo WhatsApp)',
              en: 'Casual (fast, informal, WhatsApp style)'
            }
          },
          {
            value: 'formal',
            label: {
              pt: 'Formal (educado, objetivo e profissional)',
              es: 'Formal (educado, objetivo y profesional)',
              en: 'Formal (polite, objective and professional)'
            }
          }
        ],
        default: 'descontraido'
      },
      {
        name: 'memoryEnabled',
        type: 'boolean',
        question: {
          pt: 'Manter memória local das últimas conversas do grupo?',
          es: '¿Mantener memoria local de las últimas conversaciones del grupo?',
          en: 'Maintain local memory of recent group conversations?'
        },
        default: true
      }
    ]
  },

  /**
   * Execução de comandos manuais do plugin (!hermes, !ia)
   */
  async execute({ sock, msg, from, sender, args, text, reply, t, lang, isGroup, isAdmin, isOwner }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'hermes') || {};
    const groupPrefix = configManager.getGroupPrefix(from) || '!';

    // 1. Subcomandos restritos a administradores
    if (['on', 'ativar', 'activar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      configManager.setPluginEnabled(from, 'hermes', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
      }

      const personality = cfg.personality || 'descontraido';
      const memStatus = cfg.memoryEnabled !== false ? t('common.enabled') : t('common.disabled');

      return reply(t('hermes.on_ok', { personality, memory: memStatus }));
    }

    if (['off', 'desativar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      configManager.setPluginEnabled(from, 'hermes', false);
      return reply(t('hermes.off_ok'));
    }

    if (['config', 'wizard', 'setup'].includes(sub) || (!sub && (isAdmin || isOwner))) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
    }

    if (['limpar', 'clear', 'reset', 'zerar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      memoryEngine.clearGroupMemory(from);
      return reply(t('hermes.cleared'));
    }

    // 2. Exibir status detalhado: /hermes status
    if (sub === 'status' || sub === 'info') {
      const isEnabled = configManager.isPluginEnabled(from, 'hermes');
      const stats = memoryEngine.getGroupStats(from);
      const isConfigured = aiService.isConfigured();

      const keyLabel = isConfigured ? t('hermes.key_ok') : t('hermes.key_missing_short');
      let info = t('hermes.status', {
        state: isEnabled ? `✅ ${t('common.enabled')}` : `❌ ${t('hermes.status_off_hint', { prefix: groupPrefix })}`,
        personality: cfg.personality || 'descontraido',
        count: stats.count,
        model: aiService.model,
        key: keyLabel
      }) + '\n\n';
      if (!isConfigured) info += t('hermes.status_nokey') + '\n\n';
      info += t('hermes.status_tip', { prefix: groupPrefix });

      return reply(info);
    }

    // 3. Se o usuário enviou uma pergunta direta como comando: /hermes <pergunta> ou /ia <pergunta>
    const question = text.trim();
    if (question.length > 0) {
      // IA só acorda para administradores (membros comuns não geram custo de API)
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));

      if (!configManager.isPluginEnabled(from, 'hermes')) {
        return reply(t('hermes.disabled_hint', { prefix: groupPrefix }));
      }

      const realMsg = msg?.message?.ephemeralMessage?.message ||
                      msg?.message?.viewOnceMessage?.message ||
                      msg?.message?.viewOnceMessageV2?.message ||
                      msg?.message?.documentWithCaptionMessage?.message ||
                      msg?.message;

      const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                          realMsg?.imageMessage?.contextInfo ||
                          realMsg?.videoMessage?.contextInfo ||
                          realMsg?.documentMessage?.contextInfo;

      // Desacopla o processamento assíncrono da IA para não bloquear o pipeline de mensagens do bot (P1.1)
      this.processAIInteraction({
        sock,
        msg,
        from,
        sender,
        queryText: question,
        reply,
        lang,
        cfg,
        contextInfo
      }).catch(err => {
        logger.error({ err, from, sender }, 'Erro assíncrono na execução do comando manual do Hermes IA');
      });
      return;
    }

    return reply(t('hermes.usage_hint', { prefix: groupPrefix }));
  },

  /**
   * Hook passivo: monitora mensagens em tempo real no grupo
   * 1. Salva mensagens no buffer de memória local (R$ 0,00)
   * 2. Intercepta menções a @hermes, nome hermes ou respostas ao bot
   */
  async onMessage({ sock, msg, from, sender, text, reply, lang }) {
    if (!from || !from.endsWith('@g.us')) return false;

    const senderName = msg.pushName || '';

    const rawSender = msg?.key?.participant || msg?.participant;

    const groupPrefix = configManager.getGroupPrefix(from) || '!';
    const trimmedText = (text || '').trim();

    // Proteção 2 (Comandos determinísticos via prefixo):
    // Mensagens com prefixo (!, /) são comandos determinísticos. O Hermes IA NUNCA intercepta
    // comandos desconhecidos ou erros de digitação (ex: /relaod, !banrrr), economizando 100% de tokens de API.
    if (trimmedText.startsWith(groupPrefix) || trimmedText.startsWith('/') || trimmedText.startsWith('!')) {
      const prefixLen = trimmedText.startsWith(groupPrefix) ? groupPrefix.length : 1;
      const afterPrefix = trimmedText.slice(prefixLen).trim();
      const parts = afterPrefix.split(/\s+/);
      const firstWord = (parts[0] || '').toLowerCase();
      const cmdPlugin = firstWord ? pluginLoader.findCommand(firstWord) : null;
      if (!cmdPlugin || cmdPlugin.name !== 'hermes') {
        return false;
      }

      // Subcomandos determinísticos do Hermes (on/off/config/status/limpar) pertencem ao execute().
      // Sem isso, o onMessage interceptaria "!hermes on" e o mandaria para a IA como texto livre,
      // tornando impossível ligar/desligar/configurar o agente pelo comando.
      const sub = (parts[1] || '').toLowerCase();
      const HERMES_SUBCOMMANDS = ['on', 'ativar', 'activar', 'off', 'desativar', 'config', 'wizard', 'setup', 'limpar', 'clear', 'reset', 'zerar', 'status', 'info'];
      if (!sub || HERMES_SUBCOMMANDS.includes(sub)) {
        return false;
      }
    } else if (/^@[a-zA-Z0-9_:.-]+\s+/i.test(trimmedText)) {
      let afterMention = trimmedText.replace(/^@[a-zA-Z0-9_:.-]+\s+/i, '').trim();
      const hasPrefixChar = afterMention.startsWith(groupPrefix) || afterMention.startsWith('/') || afterMention.startsWith('!');
      if (hasPrefixChar) {
        afterMention = afterMention.slice(1).trim();
      }
      const words = afterMention.split(/\s+/).filter(Boolean);
      const firstWord = words[0]?.toLowerCase();
      const cmdPlugin = firstWord ? pluginLoader.findCommand(firstWord) : null;

      // Se começar com prefixo explícito (ex: "@bot !fechar") ou for comando simples de até 3 palavras
      // sem conectivos de linguagem natural (ex: "@bot ping", "@bot fechar", "@bot ban @user"):
      // delega para o plugin tradicional determinístico.
      // MAS se contiver linguagem natural, múltiplos pedidos ou frases (ex: "feche o grupo e reabra amanhã",
      // "com um lembrete", "se chover"), entrega para a IA do Hermes atender o pedido composto completo!
      const hasNaturalLanguage = /\b(e|com|para|pra|que|quando|se|amanh[aã]|depois|daqui|horas?|lembrete|aviso|ver|favor|por favor)\b/i.test(afterMention);
      const isSimpleDeterministicCmd = cmdPlugin && cmdPlugin.name !== 'hermes' && (hasPrefixChar || (!hasNaturalLanguage && words.length <= 3));

      if (isSimpleDeterministicCmd) {
        return false;
      }
    }

    // 2. Verificação ampla de endereçamento ao bot
    const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo;

    // A. Resposta direta (quote) a uma mensagem do bot:
    const quotedParticipant = cleanJid(contextInfo?.participant || '');
    const quotedNum = quotedParticipant.replace(/@.*$/, '').replace(/\D/g, '');
    const isReplyToBot = Boolean(
      contextInfo?.stanzaId && (
        quotedParticipant === botJid ||
        quotedParticipant === botLid ||
        (botNum && quotedNum === botNum) ||
        (botLidNum && quotedNum === botLidNum)
      )
    );

    // B. Menção nos metadados do WhatsApp (quando o usuário clica no contato do bot na lista)
    const mentionedJids = contextInfo?.mentionedJid || [];
    const isBotMentionedMeta = Array.isArray(mentionedJids) && mentionedJids.some(j => {
      const clean = cleanJid(j);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return clean === botJid || clean === botLid || (botNum && num === botNum);
    });

    // C. Menção no texto por nome: "@hermes", "@bot", iniciando por "hermes" ou mencionando a palavra "hermes"
    const lowerText = (text || '').toLowerCase().trim();
    const hasNameTag = lowerText.includes('@hermes') || lowerText.includes('@bot');
    const startsWithName = /^hermes[\s,.:!?-]/i.test(lowerText) || lowerText === 'hermes';
    const mentionsHermes = /\bhermes\b/i.test(lowerText);

    // D. Continuidade em duas etapas (Ideia 5): Se o bot fez uma pergunta recente (< 60s) para este admin
    // e o admin respondeu apontando alguém (quote), mencionando (@) ou com resposta confirmativa/curta
    let isContinuation = false;
    const activeClarif = wizardCache.get(`clarif:${from}:${sender}`);
    if (activeClarif) { // TTL 60s garantido pelo node-cache
      const isShortResponse = lowerText.length <= 40 &&
        /^(\b(esse|ele|ela|esse aqui|essa|essa daqui|sim|pode|confirmo|este|esta|bora|vai|isso|isso mesmo|o proprio)\b|@|\d+)/i.test(lowerText);
      const hasQuotedTarget = Boolean(contextInfo?.quotedMessage && !isReplyToBot);

      if (isShortResponse || hasQuotedTarget) {
        isContinuation = true;
      }
    }

    const isAddressed = isReplyToBot || isBotMentionedMeta || hasNameTag || startsWithName || mentionsHermes || isContinuation;

    // Se o bot não foi expressamente chamado, grava a conversa no buffer local e mantém silêncio absoluto
    if (!isAddressed) {
      const mediaTag = !text && (
        realMsg?.imageMessage ? '[Foto]' :
        realMsg?.videoMessage ? '[Vídeo]' :
        realMsg?.stickerMessage ? '[Figurinha]' :
        realMsg?.audioMessage ? '[Áudio]' :
        realMsg?.documentMessage ? '[Documento]' : ''
      );
      memoryEngine.saveMessage(from, sender, text || mediaTag, msg.messageTimestamp, senderName, {
        msgId: msg?.key?.id,
        participant: msg?.key?.participant || sender
      });
      return false;
    }

    // Gatekeeper Anti-Desperdício: Detecta se o quote ao bot é apenas reação social, risada ou figurinha
    // sem intenção de comando nem de conversa com o bot (evita queimar ~7.500 tokens para gerar [SILENCIO])
    if (isReplyToBot && !isContinuation) {
      const isSticker = Boolean(realMsg?.stickerMessage);
      const trimmedClean = lowerText.replace(/@\S+/g, '').trim();

      // 1. Figurinha sem legenda
      if (isSticker && !text) {
        memoryEngine.saveMessage(from, sender, '[Figurinha]', msg.messageTimestamp, senderName, {
          msgId: msg?.key?.id,
          participant: msg?.key?.participant || sender
        });
        return false;
      }

      // 2. Apenas emojis ou caracteres de pontuação
      const isOnlyEmojis = trimmedClean.length > 0 && /^[\p{Emoji}\s.,!?~^:;()\-—_]+$/u.test(trimmedClean);

      // 3. Apenas risadas (kkk, haha, rsrs, lol, etc.)
      const isOnlyLaughter = /^(?:k+|ha|he|hi|ho|hu|rs|ja|je|ji|jo|ju|lol|lmao)+$/i.test(trimmedClean.replace(/[\s.,!?~^:;()\-—_]/g, ''));

      // 4. Comentário social a outro membro citando o bot sem pedir ação (ex: "kkk bem feito", "olha aí @fulano", "toma")
      const isSocialReaction = /^(?:(?:k+|ha|he|rs|lol)\s+)?(?:bem feito|olha a[ií]|toma|toma vergonha|toma jeito|se fodeu|se lascou|boa|parab[eé]ns|triste|eita|nossa|vish|caramba|mds|uai|pqp|valeu|obrigad[oa]|show|top)(?:\s|$)/iu.test(trimmedClean);
      const mentionsActionKeyword = /\b(ban|chuta|tira|some|muta|silencia|apaga|deleta|limpa|avisa|adverte|warn|fecha|tranca|abre|destranca|pina|fixa|ajuda|link|enquete|adm|hor[aá]rio)\b/i.test(lowerText);

      if ((isOnlyEmojis || isOnlyLaughter || isSocialReaction) && !mentionsActionKeyword && !mentionsHermes) {
        logger.info({ from, sender, text: trimmedClean }, 'Gatekeeper: quote ao bot identificado como reação social/risada. Silêncio mantido localmente (economia de ~7.500 tokens)');
        memoryEngine.saveMessage(from, sender, text, msg.messageTimestamp, senderName, {
          msgId: msg?.key?.id,
          participant: msg?.key?.participant || sender
        });
        return false;
      }
    }

    // Proteção 1 (Wizard ativo): Se o admin possui uma sessão de Wizard ou Onboarding ativa,
    // as respostas dele (incluindo quotes/replies de opções numéricas) pertencem ao wizardEngine.
    // A IA não deve interceptar nem apagar o wizard ativo!
    const activeWizard = wizardCache.get(`${from}:${sender}`) ||
      (rawSender && (wizardCache.get(`${from}:${cleanJid(rawSender)}`) || wizardCache.get(`${from}:${rawSender}`)));

    if (activeWizard) {
      return false; // Permite que o wizardEngine.handleInput processe a resposta do menu
    }

    // 2.1 Gatilho exclusivo de administradores: a IA permanece 100% adormecida para membros comuns
    if (!(await isAdminOrOwner(sock, from, sender))) {
      return false;
    }

    // 3. Se foi chamado expressamente MAS o plugin está desativado no grupo:
    if (!configManager.isPluginEnabled(from, 'hermes')) {
      await reply(tr(lang, 'hermes.disabled_called', { prefix: groupPrefix }));
      return true;
    }

    // 4. Se a chave da API não estiver configurada no .env:
    if (!aiService.isConfigured()) {
      await reply(tr(lang, 'hermes.key_missing'));
      return true;
    }

    // 5. Anti-Spam / Rate Limit de 2s por usuário
    if (checkCooldown(sender, 2000)) {
      return true;
    }

    // 6. Limpa apenas os prefixos de chamada ao próprio bot (preservando menções a outros membros!)
    let cleanQuery = text;

    // Remove o prefixo de comando do início quando presente (ex: "!hermes ...", "/hermes ...")
    if (cleanQuery.startsWith(groupPrefix)) {
      cleanQuery = cleanQuery.slice(groupPrefix.length).trim();
    } else if (/^[!/.#$]/.test(cleanQuery)) {
      cleanQuery = cleanQuery.slice(1).trim();
    }

    cleanQuery = cleanQuery
      .replace(/^hermes[\s,.:!?-]*/i, '')
      .replace(/(?:^|\s)(?:ei|ô|o|fala|eai|ae|por\s+favor)?\s*hermes[\s,.:!?-]*/gi, ' ')
      .replace(/@hermes\b/gi, '')
      .replace(/@bot\b/gi, '');

    if (botNum) {
      cleanQuery = cleanQuery.replace(new RegExp(`@${botNum}\\b`, 'g'), '');
    }
    if (botLidNum) {
      cleanQuery = cleanQuery.replace(new RegExp(`@${botLidNum}\\b`, 'g'), '');
    }
    cleanQuery = cleanQuery.replace(/\s+/g, ' ').trim();

    // Se o usuário apenas chamou "hermes" ou "@hermes" sem escrever nada
    if (cleanQuery.length === 0 && !contextInfo?.quotedMessage) {
      const cfg = configManager.getPluginConfig(from, 'hermes') || {};
      await reply(tr(lang, cfg.personality === 'formal' ? 'hermes.greeting_formal' : 'hermes.greeting_casual'));
      return true;
    }

    const cfg = configManager.getPluginConfig(from, 'hermes') || {};

    // Desacopla o processamento assíncrono da IA para não bloquear o pipeline de mensagens do bot (P1.1)
    this.processAIInteraction({
      sock,
      msg,
      from,
      sender,
      queryText: cleanQuery,
      reply,
      lang,
      cfg,
      contextInfo
    }).catch(err => {
      logger.error({ err, from, sender }, 'Erro assíncrono na interação do Hermes IA');
    });

    return true; // Interrompe o pipeline com sucesso imediatamente
  },

  /**
   * Porta de entrada da IA com trilhos determinísticos: deduplicação, 1 pedido por vez e cota horária.
   */
  async processAIInteraction(params) {
    const { sock, msg, from, sender, reply, queryText, lang } = params;

    const msgId = msg?.key?.id;
    if (msgId) {
      if (processedMsgIds.has(msgId)) return;
      processedMsgIds.add(msgId);
      if (processedMsgIds.size > 300) {
        processedMsgIds.delete(processedMsgIds.values().next().value);
      }
    }

    // Gatekeeper Anti-Desperdício: Pedido de promoção sem menção explícita com @
    // Responde com template padrão determinístico sem gastar tokens da API DeepSeek
    if (isUnmarkedPromotionRequest({ queryText, msg, sock })) {
      logger.info({ from, sender, queryText }, 'Gatekeeper: pedido de promoção sem menção @ barrado localmente (economia de tokens de IA)');
      await reply(tr(lang, 'promote.need_explicit_mention'));
      return;
    }

    const flightKey = `${from}:${sender}`;
    if (inflightRequests.has(flightKey)) return;

    if (!consumeQuota(from)) {
      await reply(tr(params.lang, 'hermes.quota'));
      return;
    }

    inflightRequests.add(flightKey);
    try {
      await this._runAIInteraction(params);
    } finally {
      inflightRequests.delete(flightKey);
    }
  },

  /**
   * Processa a consulta com IA, contexto recente (50 mensagens do SQLite) e execução de ferramentas
   */
  async _runAIInteraction({ sock, msg, from, sender, queryText, reply, lang, cfg, contextInfo = null }) {
    const personality = cfg?.personality || 'descontraido';
    const memoryEnabled = cfg?.memoryEnabled !== false;

    // Busca o nome do grupo para o framing do sistema
    let groupName = '';
    let groupDesc = '';
    try {
      const meta = await getGroupMetadata(sock, from);
      groupName = meta?.subject || '';
      groupDesc = meta?.desc || '';
    } catch (_) {}

    // Monta o prompt do usuário com contexto e histórico compactos em uma única mensagem
    const userPromptParts = [];

    const groupPrefix = configManager.getGroupPrefix(from) || '!';
    userPromptParts.push(`[Contexto do Grupo: "${groupName || 'sem nome'}" | Prefixo (P): "${groupPrefix}"]`);

    // Detecta mídia anexada na mensagem ATUAL do admin (foto/vídeo/áudio) para o modelo saber
    // que pode usá-la (ex: anexar como anúncio periódico via set_automsg_media).
    const realMsgCurrent = msg?.message?.ephemeralMessage?.message ||
                           msg?.message?.viewOnceMessage?.message ||
                           msg?.message?.viewOnceMessageV2?.message ||
                           msg?.message?.documentWithCaptionMessage?.message ||
                           msg?.message;

    if (realMsgCurrent?.imageMessage) {
      userPromptParts.push('[O admin enviou uma FOTO/IMAGEM anexada nesta mensagem]');
    } else if (realMsgCurrent?.videoMessage) {
      userPromptParts.push('[O admin enviou um VÍDEO anexado nesta mensagem]');
    } else if (realMsgCurrent?.audioMessage) {
      userPromptParts.push('[O admin enviou um ÁUDIO anexado nesta mensagem]');
    }

    // Injeção de Data e Hora em Tempo Real (fuso configurado, padrão Brasília)
    const now = new Date();
    const tz = settings.timezone || 'America/Sao_Paulo';
    let currentDateTimeStr = '';
    try {
      const dateFormatted = now.toLocaleDateString('pt-BR', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const timeFormatted = now.toLocaleTimeString('pt-BR', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      currentDateTimeStr = `${dateFormatted}, ${timeFormatted}`;
    } catch (_) {
      currentDateTimeStr = now.toISOString();
    }


    const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);

    // Alvos marcados na mensagem (excluindo o próprio bot) com resolução de nome
    const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    const targetMentions = rawMentions
      .map(m => cleanJid(m))
      .filter(m => {
        const num = m.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
        return m !== botJid && m !== botLid && (!botNum || num !== botNum) && (!botLidNum || num !== botLidNum);
      });

    const formattedTargets = []; // escopo externo: cross-inference pode acessar
    if (targetMentions.length > 0) {
      for (const tm of targetMentions) {
        const resolved = await resolveParticipant(sock, from, tm);
        const name = (resolved?.name) || memoryEngine.getParticipantName(from, tm) || memoryEngine.getParticipantName(from, resolved?.phoneJid) || '';
        const num = resolved?.displayNum || tm.replace(/@.*$/, '').replace(/\D/g, '');
        formattedTargets.push(name ? `${name} (@${num})` : `@${num}`);
      }
      userPromptParts.push(`[Alvo marcado com @: ${formattedTargets.join(', ')}]`);
    }

    // Mensagem citada: autor (resolvido com nome e número real, tratando @lid) + trecho curto
    const rawQuotedJid = contextInfo?.participant || contextInfo?.quotedMessage?.participant;
    let quotedAuthor = '';
    let isQuotingBot = false;

    if (rawQuotedJid) {
      const qParticipant = cleanJid(rawQuotedJid);
      const qNum = qParticipant.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      isQuotingBot = qParticipant === botJid || qParticipant === botLid || (botNum && qNum === botNum) || (botLidNum && qNum === botLidNum);
      
      if (!isQuotingBot) {
        const resolved = await resolveParticipant(sock, from, qParticipant);
        const resolvedNum = resolved?.displayNum || qNum;
        const qName = resolved?.name || memoryEngine.getParticipantName(from, qParticipant) || memoryEngine.getParticipantName(from, resolved?.phoneJid) || '';
        quotedAuthor = qName ? `${qName} (@${resolvedNum})` : `@${resolvedNum}`;
      }
    }

    const rawQuotedMsg = contextInfo?.quotedMessage;
    const unwrappedQuoted = rawQuotedMsg?.ephemeralMessage?.message ||
                            rawQuotedMsg?.viewOnceMessage?.message ||
                            rawQuotedMsg?.viewOnceMessageV2?.message ||
                            rawQuotedMsg?.documentWithCaptionMessage?.message ||
                            rawQuotedMsg;

    let snippet = '';
    let quotedPoll = null;

    if (unwrappedQuoted) {
      const isQuotedImage = Boolean(unwrappedQuoted.imageMessage || unwrappedQuoted.stickerMessage);
      const isQuotedVideo = Boolean(unwrappedQuoted.videoMessage);
      const isQuotedAudio = Boolean(unwrappedQuoted.audioMessage);
      quotedPoll = unwrappedQuoted.pollCreationMessage ||
                   unwrappedQuoted.pollCreationMessageV2 ||
                   unwrappedQuoted.pollCreationMessageV3;

      const quotedContent = (unwrappedQuoted.conversation ||
                            unwrappedQuoted.extendedTextMessage?.text ||
                            unwrappedQuoted.imageMessage?.caption ||
                            unwrappedQuoted.videoMessage?.caption ||
                            '').trim();
      snippet = quotedContent.length > 250 ? `${quotedContent.slice(0, 250)}…` : quotedContent;

      if (isQuotedImage) {
        userPromptParts.push(`[A mensagem citada contém uma FOTO/IMAGEM${snippet ? ` com legenda: "${snippet}"` : ' (sem legenda)'}]`);
      } else if (isQuotedVideo) {
        userPromptParts.push(`[A mensagem citada contém um VÍDEO${snippet ? ` com legenda: "${snippet}"` : ''}]`);
      } else if (isQuotedAudio) {
        userPromptParts.push(`[A mensagem citada contém um ÁUDIO${snippet ? ` com legenda: "${snippet}"` : ''}]`);
      } else if (quotedPoll) {
        userPromptParts.push(`[A mensagem citada é uma ENQUETE: "${quotedPoll.name || 'Enquete'}"]`);
      }

      if (isQuotingBot) {
        userPromptParts.push(`[Respondendo à mensagem anterior do próprio bot (Hermes): "${snippet}"]`);

        // Extrai alvos ou membros que o próprio bot havia mencionado/punido na mensagem citada
        const quotedMentions = Array.isArray(unwrappedQuoted?.extendedTextMessage?.contextInfo?.mentionedJid)
          ? unwrappedQuoted.extendedTextMessage.contextInfo.mentionedJid
          : [];
        const botQuotedTargets = [];
        for (const qm of quotedMentions) {
          const cleanM = cleanJid(qm);
          const numM = cleanM.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
          if (cleanM !== botJid && cleanM !== botLid && (!botNum || numM !== botNum) && (!botLidNum || numM !== botLidNum)) {
            const res = await resolveParticipant(sock, from, cleanM);
            const name = res?.name || memoryEngine.getParticipantName(from, cleanM) || memoryEngine.getParticipantName(from, res?.phoneJid) || '';
            const disp = res?.displayNum || numM;
            botQuotedTargets.push(name ? `${name} (@${disp})` : `@${disp}`);
          }
        }

        if (botQuotedTargets.length === 0 && snippet) {
          const numMatches = snippet.match(/@(\d{8,20})\b/g) || [];
          for (const m of numMatches) {
            const rawNum = m.replace('@', '');
            if (rawNum !== botNum && rawNum !== botLidNum) {
              const res = await resolveParticipant(sock, from, rawNum);
              const name = res?.name || memoryEngine.getParticipantName(from, res?.phoneJid || rawNum) || '';
              botQuotedTargets.push(name ? `${name} (@${res?.displayNum || rawNum})` : `@${rawNum}`);
            }
          }
        }

        if (botQuotedTargets.length > 0) {
          userPromptParts.push(`[Membro(s) citado(s) no aviso anterior do Hermes: ${[...new Set(botQuotedTargets)].join(', ')}]`);
        }
      } else if (quotedAuthor) {
        if (snippet && !isQuotedImage) {
          userPromptParts.push(`[Respondendo a ${quotedAuthor}: "${snippet}"]`);
        }
        userPromptParts.push(`[Alvo da mensagem citada: ${quotedAuthor}]`);
      } else if (snippet && !isQuotedImage) {
        userPromptParts.push(`[Respondendo a mensagem: "${snippet}"]`);
      }
    } else if (quotedAuthor && !isQuotingBot) {
      userPromptParts.push(`[Alvo da mensagem citada: ${quotedAuthor}]`);
    }

    // Injeção do Perfil Cultural do Grupo (Group Soul - apenas 30 a 60 tokens)
    const culture = configManager.getGroupCulture(from);
    const cultureParts = [];
    if (culture.vibe) cultureParts.push(`Vibe: ${culture.vibe}`);
    if (culture.tone) cultureParts.push(`Tom: ${culture.tone}`);
    if (Array.isArray(culture.rules) && culture.rules.length > 0) {
      cultureParts.push(`Regras tácitas: ${culture.rules.slice(0, 8).join('; ')}`);
    }
    if (culture.facts && Object.keys(culture.facts).length > 0) {
      const factsList = Object.entries(culture.facts).slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', ');
      cultureParts.push(`Fatos/Apelidos: ${factsList}`);
    }
    if (cultureParts.length > 0) {
      userPromptParts.push(`[Perfil Cultural do Grupo]: ${cultureParts.join(' | ')}`);
    }

    // ── Cross-inference local (Group Soul) ── zero custo de API ─────────────
    // Fix P0-2: reutiliza formattedTargets já resolvido — zero re-query SQLite
    // Fix P1-3: word-boundary regex em vez de includes() — zero falsos positivos
    const crossRefs = [];

    // Helper: escapa caracteres especiais de regex
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Helper: testa match de palavra inteira (word-boundary)
    const wordMatch = (needle, haystack) => {
      try { return new RegExp('\\b' + escRe(needle) + '\\b').test(haystack); }
      catch (_) { return haystack.includes(needle); }
    };

    // 1. @menções → fatos/apelidos cadastrados
    // formattedTargets já foi resolvido acima — zero re-query SQLite
    if (formattedTargets.length > 0 &&
        culture.facts && Object.keys(culture.facts).length > 0) {
      for (const displayName of formattedTargets) {
        // "Lucas (@55119...)" → "lucas"
        const namePart = displayName.split('(')[0].replace(/^@/, '').trim().toLowerCase();
        if (!namePart) continue;
        for (const [key, value] of Object.entries(culture.facts)) {
          const lowerKey = key.toLowerCase();
          if (wordMatch(lowerKey, namePart) || wordMatch(namePart, lowerKey)) {
            crossRefs.push(`${namePart} → ${key}: ${value}`);
          }
        }
      }
    }

    // 2. Texto da mensagem → regras tácitas (≥2 palavras-chave com >4 chars)
    // Word-boundary: "spam" não casa em "espamei", "link" não casa em "linkando"
    if (Array.isArray(culture.rules) && culture.rules.length > 0 && queryText) {
      const lowerQuery = queryText.toLowerCase();
      for (const rule of culture.rules) {
        const ruleKeywords = rule.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        if (ruleKeywords.length === 0) continue;
        const matches = ruleKeywords.filter(kw => wordMatch(kw, lowerQuery));
        if (matches.length >= 2) {
          crossRefs.push(`Regra aplicável: ${rule}`);
        }
      }
    }

    if (crossRefs.length > 0) {
      userPromptParts.push(`[Contexto Relevante]: ${crossRefs.join(' | ')}`);
    }
    // ── fim cross-inference ───────────────────────────────────────────────

    // Histórico recente (últimas mensagens do SQLite) ANTES de gravar a pergunta atual (sem duplicação)
    if (memoryEnabled) {
      const historyText = memoryEngine.getFormattedHistory(from, MAX_HISTORY_MESSAGES);
      if (historyText) {
        userPromptParts.push(`[Histórico]\n${historyText}`);
      }
    }

    // Grava o pedido atual na memória para as interações seguintes
    if (queryText) {
      memoryEngine.saveMessage(from, sender, queryText, msg.messageTimestamp, msg.pushName || '', {
        msgId: msg?.key?.id,
        participant: msg?.key?.participant || sender
      });
    }

    // Estado do grupo: só quando o pedido trata de configuração (economiza tokens em perguntas/moderação simples)
    if (STATE_KEYWORDS.test(queryText || '')) {
      const schedCfg = configManager.getPluginConfig(from, 'schedule') || {};
      const schedActive = configManager.isPluginEnabled(from, 'schedule');
      const antilinkCfg = configManager.getPluginConfig(from, 'antilink') || {};
      const antifloodCfg = configManager.getPluginConfig(from, 'antiflood') || {};
      const antifakeCfg = configManager.getPluginConfig(from, 'antifake') || {};
      const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
      const groupData = configManager.getGroup(from) || {};
      const activeMods = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'calendar']
        .filter(m => configManager.isPluginEnabled(from, m));

      const calCfg = configManager.getPluginConfig(from, 'calendar') || {};
      const calActive = configManager.isPluginEnabled(from, 'calendar');
      const activeEvents = Array.isArray(calCfg.events)
        ? calCfg.events.filter(e => !e.executed).slice(0, 5).map(e => `${e.date} às ${e.time}: ${e.text}`)
        : [];
      const calSummary = activeEvents.length > 0
        ? activeEvents.join('; ')
        : (calActive ? 'nenhum evento pendente' : 'off');
      const schedSummary = schedActive
        ? `fecha ${schedCfg.closeTime || '23:00'}/abre ${schedCfg.openTime || '07:00'}`
        : 'off';
      const antilinkDoms = Array.isArray(antilinkCfg.allowedDomains) && antilinkCfg.allowedDomains.length > 0
        ? antilinkCfg.allowedDomains.join(',')
        : 'nenhum';
      const antifakeDdis = Array.isArray(antifakeCfg.allowedDdis) && antifakeCfg.allowedDdis.length > 0
        ? antifakeCfg.allowedDdis.join(',')
        : '55,351,1,34,54,52';
      const warnsEntries = Object.entries(groupData.warns || {})
        .filter(([, w]) => w && w.count > 0)
        .map(([jid, w]) => `@${jid.replace(/@.*$/, '')}(${w.count}/${warnCfg.maxWarns || 3})`);

      const pollData = pollTracker.getPollResults(from);
      let pollSummary = 'nenhuma';
      if (pollData) {
        const winnerDesc = pollData.winner
          ? `vencedor="${pollData.winner.name}"(${pollData.winner.votes} votos)`
          : (pollData.isTie ? 'empate' : 'sem votos');
        pollSummary = `"${pollData.title}" (${pollData.summary} | ${winnerDesc})`;
      }

      const antilinkActive = configManager.isPluginEnabled(from, 'antilink');
      const antilinkAction = antilinkActive ? (antilinkCfg.action || 'delete') : 'off';
      userPromptParts.push(
        `[Estado] idioma=${lang} | horários=${schedSummary} | ativos=${activeMods.join(',') || 'nenhum'} | ` +
        `antilink=${antilinkAction},liberados=${antilinkDoms} | warnLimite=${warnCfg.maxWarns || 3} | ` +
        `antiflood=${antifloodCfg.maxMessages || 6}msg/5s,${antifloodCfg.maxChars || 2500}chars,${antifloodCfg.action || 'warn'} | ` +
        `antifake=${antifakeDdis} | agenda=${calSummary} | enquete=${pollSummary} | warns=${warnsEntries.join(' ') || 'nenhum'} | blacklist=${(groupData.blacklist || []).length}` +
        (groupDesc && /descr|regra|bio/i.test(queryText || '') ? ` | descrição="${groupDesc.slice(0, 300)}"` : '')
      );
    }

    // Ideia 4: Injeção da Pilha de Desfazer (Undo Stack) apenas sob demanda (economiza tokens)
    const isUndoRequest = /desfa[zç]|desfazer|cancela|reverte|desfaz tudo|volta atr[aá]s|despina|desfixa/i.test(queryText || '');
    if (isUndoRequest) {
      const undoStack = wizardCache.get(`undo_stack:${from}`) || (wizardCache.get(`undo:${from}`) ? [wizardCache.get(`undo:${from}`)] : []);
      if (undoStack.length > 0) {
        const stackSummary = undoStack.slice(0, 5).map((act, i) => {
          const minutesAgo = Math.max(1, Math.round((Date.now() - act.timestamp) / 60000));
          return `${i + 1}. [há ${minutesAgo}m] ${act.tool}(${JSON.stringify(act.args)})`;
        }).join(' | ');
        userPromptParts.push(`[Ações recentes do Hermes que podem ser desfeitas (ordem LIFO, 1 é a mais recente)]: ${stackSummary}`);
      }
    }

    // Injeção de Enquete / Votação sob demanda: APENAS quando o admin cita uma enquete diretamente
    // ou pede expressamente apuração/resultado/placar (evita desenterrar enquetes antigas em pedidos gerais)
    const pollResultKeywords = /\b(apurar|resultado|placar|parcial|quem\s+ganhou|quem\s+venceu|como\s+t[aá]\s+a\s+vota[cç][aã]o|votos\s+da\s+enquete|mostrar\s+votos|ver\s+votos|apurar\s+enquete)\b/i;
    const isPollRelated = Boolean(quotedPoll) || pollResultKeywords.test(queryText || '') || pollResultKeywords.test(snippet || '');

    if (isPollRelated) {
      const targetPollId = (contextInfo?.stanzaId && pollTracker.getPoll(contextInfo.stanzaId))
        ? contextInfo.stanzaId
        : null;
      const pollData = pollTracker.getPollResults(from, targetPollId);
      if (pollData) {
        const winnerDesc = pollData.winner
          ? `VENCEDOR CLARO: "${pollData.winner.name}" com ${pollData.winner.votes} voto(s)`
          : (pollData.isTie ? 'EMPATE entre as opções mais votadas' : 'NENHUM VOTO computado ainda');
        userPromptParts.push(
          `[Resultado Atual da Enquete no Grupo: "${pollData.title}" | Opções e Votos: ${pollData.summary} | ${winnerDesc}]`
        );
      } else {
        userPromptParts.push(
          `[Aviso de Enquete: Nenhuma enquete com votos registrada recentemente neste grupo. Chame get_poll_results para verificar ou informe o admin]`
        );
      }
    }

    // Ideia 5: Continuação ativa — TTL 60s garantido pelo node-cache (zero leak)
    const clarifKey = `clarif:${from}:${sender}`;
    if (wizardCache.get(clarifKey)) {
      userPromptParts.push(`[Continuação de conversa: o admin está respondendo à pergunta anterior que você fez]`);
      wizardCache.del(clarifKey);
    }

    // Data e Hora em Tempo Real (no fim do contexto para proteger o cache de prefixo)
    userPromptParts.push(`[Data e Hora Atual no Servidor: ${currentDateTimeStr} (${tz})]`);

    // Pedido atual do admin (único trecho tratado como instrução)
    userPromptParts.push(`[Pedido do admin] ${msg.pushName || 'Admin'}: ${queryText}`);

    const baseContent = userPromptParts.join('\n\n');
    const messages = [{ role: 'user', content: baseContent }];
    let degraded = false; // true quando o retry sem tools foi usado (resposta só em texto)

    try {
      const prefix = configManager.getGroupPrefix(from) || '!';
      const tools = toolRegistry.getTools();
      let aiResponse = await aiService.chatCompletion({
        messages,
        tools,
        personality,
        lang,
        groupName,
        prefix
      });

      // Falha HTTP 400 (ex: formato de tools): 1 retry sem tools, avisando o modelo para NÃO fingir que executou ação
      if (!aiResponse.success && String(aiResponse.error).includes('400')) {
        degraded = true;
        logger.warn('DeepSeek retornou 400 com tools. Tentando fallback sem tools...');
        aiResponse = await aiService.chatCompletion({
          messages: [{
            role: 'user',
            content: `${baseContent}\n\n[Sistema: ferramentas indisponíveis agora. NÃO diga que executou ações; se for pedido de ação, indique o comando manual.]`
          }],
          tools: null,
          personality,
          lang,
          groupName,
          prefix
        });
      }

      if (!aiResponse.success) {
        logger.warn({ error: aiResponse.error }, 'Falha na resposta da IA');
        const err = String(aiResponse.error || '');

        // Notifica o Dono no privado com o diagnóstico completo (sem expor no grupo)
        await notifyOwnerAboutAIError({
          sock,
          errorDetails: err,
          groupName,
          from,
          sender,
          queryText
        });

        // Resposta discreta e amigável no grupo
        return reply(tr(lang, 'hermes.oscillation'));
      }

      if (aiResponse.usage) {
        logger.info({ usage: aiResponse.usage, from }, 'Consumo de tokens do Hermes');
      }

      // Se o modelo solicitou Tool Calls (ações no grupo)
      if (Array.isArray(aiResponse.toolCalls) && aiResponse.toolCalls.length > 0) {
        const seen = new Set();
        const validCalls = [];
        let invalidReason = '';
        let destructiveCount = 0;

        for (const toolCall of aiResponse.toolCalls) {
          if (validCalls.length >= MAX_TOOL_CALLS) {
            logger.warn({ from }, 'Limite de tool calls por pedido atingido; excedentes descartados');
            break;
          }

          // JSON quebrado / cortado por limite de tokens: nunca executa com argumentos vazios
          if (toolCall.invalidArgs) {
            invalidReason = invalidReason || 'invalid_json';
            continue;
          }

          const validation = toolRegistry.validateArgs(toolCall.name, toolCall.arguments);
          if (!validation.ok) {
            logger.warn({ tool: toolCall.name, error: validation.error }, 'Tool call rejeitada pela validação de schema');
            invalidReason = invalidReason || validation.error;
            continue;
          }

          const signature = `${toolCall.name}:${JSON.stringify(validation.args)}`;
          if (seen.has(signature)) continue;
          seen.add(signature);

          if (DESTRUCTIVE_TOOLS.has(toolCall.name)) {
            if (destructiveCount >= MAX_DESTRUCTIVE_CALLS) {
              logger.warn({ tool: toolCall.name, from }, 'Limite de ações destrutivas por pedido atingido');
              continue;
            }
            destructiveCount += 1;
          }

          validCalls.push({ name: toolCall.name, args: validation.args });
        }

        if (validCalls.length === 0) {
          logger.warn({ invalidReason, from }, 'Nenhuma tool call válida no pedido');
          return reply(tr(lang, 'hermes.unclear'));
        }

        for (const call of validCalls) {
          logger.info({ tool: call.name, args: call.args, sender, from }, 'Executando Tool Call do Hermes');

          let execResult;
          try {
            execResult = await toolRegistry.executeTool({
              sock,
              msg,
              from,
              sender,
              toolName: call.name,
              args: call.args
            });
          } catch (toolErr) {
            logger.error({ err: toolErr, tool: call.name }, 'Erro ao executar Tool Call do Hermes');
            await reply(tr(lang, 'hermes.tool_failed'));
            continue;
          }

          // Mensagem de sucesso ou erro determinístico (gerada pelo código, não pelo modelo)
          if (execResult?.message) {
            const mentionOpts = Array.isArray(execResult.mentions) && execResult.mentions.length > 0
              ? { mentions: execResult.mentions }
              : {};
            await reply(execResult.message, mentionOpts);
            memoryEngine.saveMessage(from, 'hermes@bot', execResult.message, null, 'Hermes');

            // Ideia 4: Registra ação na Pilha de Desfazer (Undo Stack) — TTL 1800s, zero memory leak
            if (REVERSIBLE_TOOLS.has(call.name)) {
              const stack = wizardCache.get(`undo_stack:${from}`) || [];
              stack.unshift({
                tool: call.name,
                args: call.args,
                timestamp: Date.now(),
                message: execResult.message
              });
              if (stack.length > 8) stack.pop();
              wizardCache.set(`undo_stack:${from}`, stack, 1800);
              wizardCache.set(`undo:${from}`, stack[0], 1800);
            }
          } else if (execResult?.error) {
            await reply(execResult.error);
          }
        }
        return;
      }

      // Resposta em texto direto (com aviso curto se estiver no modo sem ferramentas)
      const notice = degraded ? `${tr(lang, 'hermes.degraded')}\n` : '';
      if (aiResponse.content && aiResponse.content.trim().length > 0) {
        const rawContent = aiResponse.content.trim();
        const cleanSilence = rawContent.replace(/[*_"`']/g, '').trim();
        if (/^\[SIL[EÊ]NCIO\]/i.test(cleanSilence)) {
          logger.info({ from, sender }, 'Hermes identificou conversa direcionada a terceiros ou comentário de referência e manteve silêncio natural.');
          return;
        }

        const finalReply = rawContent;
        await reply(`${notice}${finalReply}`);
        memoryEngine.saveMessage(from, 'hermes@bot', finalReply, null, 'Hermes');

        // Ideia 5: Se o Hermes terminou a resposta fazendo uma pergunta de clarificação,
        // ativa a janela de continuidade de 60 segundos para este admin
        if (/\?(\s*)$/.test(finalReply)) {
          wizardCache.set(`clarif:${from}:${sender}`, { question: finalReply }, 60);
        }
      } else if (degraded) {
        await reply(tr(lang, 'hermes.degraded'));
      }
    } catch (err) {
      logger.error({ err }, 'Erro inesperado na interação do Hermes IA');
      await notifyOwnerAboutAIError({
        sock,
        errorDetails: err.message || String(err),
        groupName,
        from,
        sender,
        queryText
      });
      return reply(tr(lang, 'hermes.oscillation'));
    }
  }
};
