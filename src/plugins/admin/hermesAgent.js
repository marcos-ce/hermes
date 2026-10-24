const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const pluginLoader = require('../../core/pluginLoader');
const aiService = require('../../services/aiService');
const memoryEngine = require('../../services/memoryEngine');
const toolRegistry = require('../../services/toolRegistry');
const { cleanJid, getGroupMetadata } = require('../../utils/jidResolver');
const { checkCooldown, sendSafeMessage } = require('../../utils/antiBan');
const { wizardCache } = require('../../utils/cache');
const settings = require('../../config/settings');
const logger = require('../../utils/logger');

// Cache em memória para debounce de alertas de erro enviados ao dono (10 min de cooldown)
const ownerAlertCooldown = new Map();

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
  cmdNumber: 23,
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
      const memStatus = cfg.memoryEnabled !== false ? 'Ativa' : 'Desativada';

      return reply(
        `🤖 *Hermes IA:* ATIVADO com sucesso!\n` +
        `🎭 *Personalidade:* \`${personality}\`\n` +
        `🧠 *Memória Local:* \`${memStatus}\`\n\n` +
        `👉 Para conversar, envie *@hermes*, chame por *hermes* ou responda a qualquer mensagem minha!`
      );
    }

    if (['off', 'desativar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      configManager.setPluginEnabled(from, 'hermes', false);
      return reply('🛑 *Hermes IA:* DESATIVADO neste grupo.\nAs configurações foram preservadas.');
    }

    if (['config', 'wizard', 'setup'].includes(sub) || (!sub && (isAdmin || isOwner))) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
    }

    if (['limpar', 'clear', 'reset', 'zerar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      memoryEngine.clearGroupMemory(from);
      return reply('🧹 *Memória limpa:* O histórico de contexto deste grupo foi zerado.');
    }

    // 2. Exibir status detalhado: /hermes status
    if (sub === 'status' || sub === 'info') {
      const isEnabled = configManager.isPluginEnabled(from, 'hermes');
      const stats = memoryEngine.getGroupStats(from);
      const isConfigured = aiService.isConfigured();

      let info = `🤖 *STATUS DO HERMES IA*\n\n`;
      info += `🟢 *Estado no grupo:* ${isEnabled ? '✅ ATIVADO' : '❌ DESATIVADO (use ' + groupPrefix + 'hermes on)'}\n`;
      info += `🎭 *Personalidade:* \`${cfg.personality || 'descontraido'}\`\n`;
      info += `🧠 *Buffer de Memória:* ${stats.count} mensagens registradas\n`;
      info += `🔌 *Provedor:* DeepSeek Oficial (\`${aiService.model}\`)\n`;
      info += `🔑 *Chave de API:* ${isConfigured ? '✅ Configurada (.env)' : '❌ Não configurada (.env)'}\n\n`;
      if (!isConfigured) {
        info += `⚠️ *Atenção:* Configure \`AI_API_KEY\` no arquivo \`.env\` para ativar as respostas.\n\n`;
      }
      info += `💡 *Dica:* Envie *${groupPrefix}hermes on* para ativar ou fale diretamente comigo no chat!`;

      return reply(info);
    }

    // 3. Se o usuário enviou uma pergunta direta como comando: /hermes <pergunta> ou /ia <pergunta>
    const question = text.trim();
    if (question.length > 0) {
      if (!configManager.isPluginEnabled(from, 'hermes')) {
        return reply(`⚠️ O Hermes IA está desativado neste grupo.\n👉 Peça a um administrador para ativar enviando: *${groupPrefix}hermes on*`);
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

      await this.processAIInteraction({
        sock,
        msg,
        from,
        sender,
        queryText: question,
        reply,
        lang,
        cfg,
        contextInfo
      });
      return;
    }

    return reply(`👉 Para falar comigo, mencione *@hermes*, digite *hermes [pergunta]* ou use *${groupPrefix}hermes status*.`);
  },

  /**
   * Hook passivo: monitora mensagens em tempo real no grupo
   * 1. Salva mensagens no buffer de memória local (R$ 0,00)
   * 2. Intercepta menções a @hermes, nome hermes ou respostas ao bot
   */
  async onMessage({ sock, msg, from, sender, text, reply, lang }) {
    if (!from || !from.endsWith('@g.us')) return false;

    const senderName = msg.pushName || '';

    // Proteção 1 (Wizard ativo): Se o remetente possuir sessão ativa no wizardCache, entrega ao wizardEngine
    const rawSender = msg?.key?.participant || msg?.participant;
    if (
      wizardCache.get(`${from}:${sender}`) ||
      (rawSender && (wizardCache.get(`${from}:${cleanJid(rawSender)}`) || wizardCache.get(`${from}:${rawSender}`)))
    ) {
      return false;
    }

    const groupPrefix = configManager.getGroupPrefix(from) || '!';
    const trimmedText = (text || '').trim();

    // Proteção 2 (Comandos determinísticos via prefixo ou menção @bot / @hermes):
    let isUnknownCommandAttempt = false;
    if (trimmedText.startsWith(groupPrefix) || trimmedText.startsWith('/') || trimmedText.startsWith('!')) {
      const prefixLen = trimmedText.startsWith(groupPrefix) ? groupPrefix.length : 1;
      const afterPrefix = trimmedText.slice(prefixLen).trim();
      const firstWord = afterPrefix.split(/\s+/)[0]?.toLowerCase();
      const cmdPlugin = firstWord ? pluginLoader.findCommand(firstWord) : null;
      if (cmdPlugin && (trimmedText.startsWith(groupPrefix) || cmdPlugin.name !== 'hermes')) {
        return false;
      }
      // Se começou com o prefixo do grupo + palavra alfabética (ex: "!trancar", "!como usa", "!tirar @user"),
      // mas o comando não existe, o Hermes IA (quando ativo) intercepta para executar ou ensinar o comando certo!
      if (
        !cmdPlugin &&
        trimmedText.startsWith(groupPrefix) &&
        /^[a-zA-ZÀ-ÿ]{2,}/.test(afterPrefix) &&
        configManager.isPluginEnabled(from, 'hermes') &&
        aiService.isConfigured()
      ) {
        isUnknownCommandAttempt = true;
      }
    } else if (/^@[a-zA-Z0-9_:.-]+\s+/i.test(trimmedText)) {
      let afterMention = trimmedText.replace(/^@[a-zA-Z0-9_:.-]+\s+/i, '').trim();
      if (afterMention.startsWith(groupPrefix) || afterMention.startsWith('/') || afterMention.startsWith('!')) {
        afterMention = afterMention.slice(1).trim();
      }
      const firstWord = afterMention.split(/\s+/)[0]?.toLowerCase();
      const cmdPlugin = firstWord ? pluginLoader.findCommand(firstWord) : null;
      if (cmdPlugin && cmdPlugin.name !== 'hermes') {
        return false;
      }
    }

    // 2. Verificação ampla de endereçamento ao bot
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

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

    // C. Menção no texto por nome: "@hermes", "@bot", ou iniciando por "hermes"
    const lowerText = (text || '').toLowerCase().trim();
    const hasNameTag = lowerText.includes('@hermes') || lowerText.includes('@bot');
    const startsWithName = /^hermes[\s,.:!?-]/i.test(lowerText) || lowerText === 'hermes';

    const isAddressed = isReplyToBot || isBotMentionedMeta || hasNameTag || startsWithName || isUnknownCommandAttempt;

    // Se o bot não foi expressamente chamado, grava a conversa no buffer local e mantém silêncio absoluto
    if (!isAddressed) {
      memoryEngine.saveMessage(from, sender, text, msg.messageTimestamp, senderName);
      return false;
    }

    // 3. Se foi chamado expressamente MAS o plugin está desativado no grupo:
    if (!configManager.isPluginEnabled(from, 'hermes')) {
      await reply(
        `🤖 *Hermes IA está desativado neste grupo.*\n\n` +
        `👉 Para ativá-lo, um administrador deve enviar:\n` +
        `*${groupPrefix}hermes on* (ou *${groupPrefix}ia on*)`
      );
      return true;
    }

    // 4. Se a chave da API não estiver configurada no .env:
    if (!aiService.isConfigured()) {
      await reply(
        '⚠️ *Hermes IA:* A chave da DeepSeek não foi detectada no arquivo `.env` (`AI_API_KEY`).\n\n' +
        '👉 Adicione sua chave em `AI_API_KEY=sk-...` no `.env` e reinicie a aplicação na hospedagem.'
      );
      return true;
    }

    // 5. Anti-Spam / Rate Limit de 2s por usuário
    if (checkCooldown(sender, 2000)) {
      return true;
    }

    // 6. Limpa apenas os prefixos de chamada ao próprio bot (preservando menções a outros membros!)
    let cleanQuery = text;
    if (isUnknownCommandAttempt && cleanQuery.trim().startsWith(groupPrefix)) {
      cleanQuery = cleanQuery.trim().slice(groupPrefix.length).trim();
    }
    cleanQuery = cleanQuery
      .replace(/^hermes[\s,.:!?-]*/i, '')
      .replace(/@hermes\b/gi, '')
      .replace(/@bot\b/gi, '');

    if (botNum) {
      cleanQuery = cleanQuery.replace(new RegExp(`@${botNum}\\b`, 'g'), '');
    }
    if (botLidNum) {
      cleanQuery = cleanQuery.replace(new RegExp(`@${botLidNum}\\b`, 'g'), '');
    }
    cleanQuery = cleanQuery.trim();

    // Se o usuário apenas chamou "hermes" ou "@hermes" sem escrever nada
    if (cleanQuery.length === 0 && !contextInfo?.quotedMessage) {
      const cfg = configManager.getPluginConfig(from, 'hermes') || {};
      const greeting = cfg.personality === 'formal'
        ? 'Olá! Como posso ajudar você ou o grupo agora?'
        : 'E aí! Fala comigo, como posso ajudar?';
      await reply(greeting);
      return true;
    }

    const cfg = configManager.getPluginConfig(from, 'hermes') || {};

    await this.processAIInteraction({
      sock,
      msg,
      from,
      sender,
      queryText: cleanQuery,
      reply,
      lang,
      cfg,
      contextInfo
    });

    return true; // Interrompe o pipeline com sucesso
  },

  /**
   * Processa a consulta com IA, contexto recente e execução de ferramentas
   */
  async processAIInteraction({ sock, msg, from, sender, queryText, reply, lang, cfg, contextInfo = null }) {
    const personality = cfg?.personality || 'descontraido';
    const memoryEnabled = cfg?.memoryEnabled !== false;

    // Busca o nome do grupo para o framing do sistema
    let groupName = '';
    try {
      const meta = await getGroupMetadata(sock, from);
      groupName = meta?.subject || '';
    } catch (_) {}

    // Monta o prompt do usuário com contexto e histórico limpos em uma única mensagem de diálogo
    const userPromptParts = [];

    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    // Se houver alvos marcados na mensagem (excluindo o próprio bot), informa explicitamente ao modelo
    const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    const targetMentions = rawMentions
      .map(m => cleanJid(m))
      .filter(m => {
        const num = m.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
        return m !== botJid && m !== botLid && (!botNum || num !== botNum) && (!botLidNum || num !== botLidNum);
      });

    if (targetMentions.length > 0) {
      const formattedTargets = targetMentions.map(m => `@${m.replace(/@.*$/, '')}`).join(', ');
      userPromptParts.push(`[Alvo marcado/mencionado: ${formattedTargets}]`);
    }

    // Se a mensagem cita outra mensagem anterior, adiciona o autor citado e o trecho
    if (contextInfo?.participant) {
      const qParticipant = cleanJid(contextInfo.participant);
      const qNum = qParticipant.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      const isQuotingBot = qParticipant === botJid || qParticipant === botLid || (botNum && qNum === botNum) || (botLidNum && qNum === botLidNum);
      if (!isQuotingBot && qNum) {
        userPromptParts.push(`[Respondendo ao membro: @${qNum}]`);
      }
    }

    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      const quotedContent = qm.conversation ||
                            qm.extendedTextMessage?.text ||
                            qm.imageMessage?.caption ||
                            qm.videoMessage?.caption || '';
      if (quotedContent) {
        userPromptParts.push(`[Mensagem citada/respondida]: "${quotedContent}"`);
      }
    }

    // Se a memória local estiver ativada, adiciona o histórico recente (25 mensagens anteriores)
    // ANTES de gravar a pergunta atual, evitando duplicação da mesma mensagem no final do histórico
    if (memoryEnabled) {
      const historyText = memoryEngine.getFormattedHistory(from, 25);
      if (historyText) {
        userPromptParts.push(`[Histórico recente de conversas do grupo]:\n${historyText}`);
      }
    }

    // Grava a mensagem atual do usuário na memória para as interações seguintes
    if (queryText) {
      memoryEngine.saveMessage(from, sender, queryText, msg.messageTimestamp, msg.pushName || '');
    }

    // Estado real das configurações de TODOS os plugins do grupo
    const schedCfg = configManager.getPluginConfig(from, 'schedule') || {};
    const schedActive = configManager.isPluginEnabled(from, 'schedule');
    const antilinkCfg = configManager.getPluginConfig(from, 'antilink') || {};
    const antifloodCfg = configManager.getPluginConfig(from, 'antiflood') || {};
    const antifakeCfg = configManager.getPluginConfig(from, 'antifake') || {};
    const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
    const groupData = configManager.getGroup(from) || {};
    const activeMods = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule']
      .filter(m => configManager.isPluginEnabled(from, m));
    const schedSummary = schedActive
      ? `Ativo (Fecha: ${schedCfg.closeTime || '23:00'}, Abre: ${schedCfg.openTime || '07:00'})`
      : 'Desativado';
    const antilinkDoms = Array.isArray(antilinkCfg.allowedDomains) && antilinkCfg.allowedDomains.length > 0
      ? antilinkCfg.allowedDomains.join(', ')
      : 'nenhum site liberado';
    const antifakeDdis = Array.isArray(antifakeCfg.allowedDdis) && antifakeCfg.allowedDdis.length > 0
      ? antifakeCfg.allowedDdis.join(', ')
      : '55, 351, 1, 34, 54, 52';
    const warnsEntries = Object.entries(groupData.warns || {})
      .filter(([, w]) => w && w.count > 0)
      .map(([jid, w]) => `@${jid.replace(/@.*$/, '')}(${w.count}/${warnCfg.maxWarns || 3})`);

    userPromptParts.push(
      `[Estado atual do grupo]: Prefixo: "${configManager.getGroupPrefix(from)}" | Idioma: ${lang.toUpperCase()} | ` +
      `Horários: ${schedSummary} | Módulos ativos: ${activeMods.length > 0 ? activeMods.join(', ') : 'nenhum'} | ` +
      `AntiLink: punição=${antilinkCfg.action || 'delete'}, liberados=[${antilinkDoms}] | ` +
      `AntiFlood: máx=${antifloodCfg.maxMessages || 6}msgs/5s, trava=${antifloodCfg.maxChars || 2500}chars, punição=${antifloodCfg.action || 'warn'} | ` +
      `AntiFake DDIs: [${antifakeDdis}] | ` +
      `Advertências (limite ${warnCfg.maxWarns || 3}): ${warnsEntries.length > 0 ? warnsEntries.join(', ') : 'ninguém advertido'} | ` +
      `Blacklist: ${(groupData.blacklist || []).length} bloqueados`
    );

    // Mensagem atual do usuário com identificador e @numero
    const senderNum = (sender || '').replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const senderDisplay = msg.pushName
      ? `${msg.pushName}${senderNum ? ` (@${senderNum})` : ''}`
      : (senderNum ? `@${senderNum}` : 'Membro');
    userPromptParts.push(`[Mensagem atual para você responder ou executar]:\n${senderDisplay}: ${queryText}`);

    const messages = [
      {
        role: 'user',
        content: userPromptParts.join('\n\n')
      }
    ];

    try {
      // 1ª Chamada à API da DeepSeek com prefixo do grupo
      const prefix = configManager.getGroupPrefix(from) || '!';
      let aiResponse = await aiService.chatCompletion({
        messages,
        tools: toolRegistry.getTools(),
        personality,
        lang,
        groupName,
        prefix
      });

      // Se falhar e o erro for HTTP 400 (ex: formato de tools), tenta fallback sem tools
      if (!aiResponse.success && String(aiResponse.error).includes('400')) {
        logger.warn('DeepSeek retornou 400 com tools. Tentando fallback sem tools...');
        aiResponse = await aiService.chatCompletion({
          messages,
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

        // 1. Notifica o Dono no privado com o diagnóstico completo (sem expor no grupo)
        await notifyOwnerAboutAIError({
          sock,
          errorDetails: err,
          groupName,
          from,
          sender,
          queryText
        });

        // 2. Resposta discreta e amigável no grupo para não expor falhas aos membros
        return reply('Tive uma oscilação momentânea na conexão com minha IA. Tente novamente em alguns instantes!');
      }

      // Se o modelo solicitou Tool Calls (ações no grupo)
      if (Array.isArray(aiResponse.toolCalls) && aiResponse.toolCalls.length > 0) {
        for (const toolCall of aiResponse.toolCalls) {
          logger.info({ toolCall, sender, from }, 'Executando Tool Call do Hermes');
          const execResult = await toolRegistry.executeTool({
            sock,
            msg,
            from,
            sender,
            toolName: toolCall.name,
            args: toolCall.arguments
          });

          // Se a ferramenta retornou mensagem de sucesso ou erro determinístico
          if (execResult.message) {
            const mentionOpts = Array.isArray(execResult.mentions) && execResult.mentions.length > 0
              ? { mentions: execResult.mentions }
              : {};
            await reply(execResult.message, mentionOpts);
            memoryEngine.saveMessage(from, 'hermes@bot', execResult.message, null, 'Hermes');
          } else if (execResult.error) {
            await reply(execResult.error);
          }
        }
        return;
      }

      // Se o modelo gerou texto direto
      if (aiResponse.content && aiResponse.content.trim().length > 0) {
        const finalReply = aiResponse.content.trim();
        await reply(finalReply);
        memoryEngine.saveMessage(from, 'hermes@bot', finalReply, null, 'Hermes');
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
      return reply('Tive uma oscilação momentânea na conexão com minha IA. Tente novamente em alguns instantes!');
    }
  }
};
