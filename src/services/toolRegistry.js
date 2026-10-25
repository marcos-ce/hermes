const settings = require('../config/settings');
const configManager = require('../core/configManager');
const wizardEngine = require('../core/wizardEngine');
const logger = require('../utils/logger');
const { safeKick, safeDelete, sendSafeMessage } = require('../utils/antiBan');
const { resolveTarget, resolveParticipant, checkAdminStatus, getGroupMetadata, cleanJid } = require('../utils/jidResolver');
const { groupCache } = require('../utils/cache');
const { t } = require('../utils/i18n');
const memoryEngine = require('./memoryEngine');

/**
 * Definição dos Schemas de Ferramentas (Tool Calling) compatíveis com OpenAI / DeepSeek
 */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Remove/expulsa um membro infrator do grupo de WhatsApp imediatamente.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" se estiver respondendo a uma mensagem do infrator.'
          },
          reason: {
            type: 'string',
            description: 'Motivo da expulsão do membro.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_mute',
      description: 'Tranca o grupo imediatamente para apenas administradores falarem, ou abre o grupo imediatamente para todos os membros.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['close', 'open'],
            description: '"close" para trancar/fechar o grupo agora ou "open" para abrir o grupo agora.'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_schedule',
      description: 'Configura, altera ou desativa os horários automáticos diários para fechar e abrir o grupo.',
      parameters: {
        type: 'object',
        properties: {
          closeTime: {
            type: 'string',
            description: 'Horário diário para fechar o grupo no formato HH:MM (ex: "23:00", "22:30", "00:00") ou "0" para não fechar.'
          },
          openTime: {
            type: 'string',
            description: 'Horário diário para abrir o grupo no formato HH:MM (ex: "07:00", "08:00") ou "0" para não abrir.'
          },
          enabled: {
            type: 'boolean',
            description: 'True para ativar os horários agendados ou false para desativar o agendamento automático.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_group_protection',
      description: 'Ativa, desativa ou configura detalhadamente os plugins do grupo (antilink, antiflood, antifake, welcome, automsg, schedule, warn, ban, hermes).',
      parameters: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            enum: ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes'],
            description: 'Nome do plugin a ser ativado, desativado ou configurado.'
          },
          enabled: {
            type: 'boolean',
            description: 'True para ativar o módulo ou false para desativar.'
          },
          action: {
            type: 'string',
            enum: ['delete', 'warn', 'ban'],
            description: 'Punição para antilink ("delete", "warn" ou "ban") ou antiflood ("warn" ou "ban").'
          },
          allowedDomains: {
            type: 'string',
            description: 'Sites liberados no antilink separados por vírgula (ex: "youtube.com, instagram.com") ou "." para bloquear todos.'
          },
          maxMessages: {
            type: 'integer',
            description: 'Máximo de mensagens em 5s para o antiflood (ex: 6).'
          },
          maxChars: {
            type: 'integer',
            description: 'Limite máximo de caracteres anti-trava no antiflood (ex: 2500).'
          },
          allowedDdis: {
            type: 'string',
            description: 'DDIs permitidos no antifake separados por vírgula (ex: "55, 351").'
          },
          welcomeMessage: {
            type: 'string',
            description: 'Texto de boas-vindas (quando module="welcome", suporta {user}, {group}, {desc}).'
          },
          autoDeleteSeconds: {
            type: 'integer',
            description: 'Segundos para apagar boas-vindas automaticamente (quando module="welcome", 0 para não apagar).'
          },
          autoMsgText: {
            type: 'string',
            description: 'Texto do anúncio periódico automático (quando module="automsg").'
          },
          intervalMinutes: {
            type: 'integer',
            description: 'Intervalo em minutos para o anúncio periódico (quando module="automsg").'
          },
          maxWarns: {
            type: 'integer',
            description: 'Limite de advertências antes do banimento automático (quando module="warn", padrão 3).'
          },
          customBanMessage: {
            type: 'string',
            description: 'Mensagem personalizada ao banir membro (quando module="ban", suporta {user}).'
          },
          personality: {
            type: 'string',
            enum: ['descontraido', 'formal'],
            description: 'Personalidade do Hermes IA (quando module="hermes").'
          }
        },
        required: ['module']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_settings',
      description: 'Altera configurações gerais do grupo: idioma (pt/es/en), prefixo de comandos (!, /, #, .), abre o painel interativo (!config) ou limpa a memória da IA.',
      parameters: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['pt', 'es', 'en'],
            description: 'Novo idioma do grupo ("pt", "es" ou "en").'
          },
          prefix: {
            type: 'string',
            description: 'Novo prefixo de 1 caractere do grupo (ex: "!", "/", "#", ".").'
          },
          openPanel: {
            type: 'boolean',
            description: 'True para abrir o Painel Interativo de Configurações (!config) para o administrador.'
          },
          clearMemory: {
            type: 'boolean',
            description: 'True para limpar o histórico de memória de conversas do Hermes neste grupo.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'warn_member',
      description: 'Aplica uma advertência formal a um membro do grupo. Ao atingir o limite configurado (padrão 3), o membro é banido automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do membro a ser advertido.'
          },
          reason: {
            type: 'string',
            description: 'Motivo da advertência.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unwarn_member',
      description: 'Remove 1 advertência (perdoa) de um membro do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do membro a ser perdoado.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_blacklist',
      description: 'Adiciona ou remove um número/membro da Lista Negra (blacklist) do grupo.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove'],
            description: '"add" para adicionar à lista negra (e expulsar se estiver no grupo) ou "remove" para remover da lista negra.'
          },
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do alvo.'
          }
        },
        required: ['action', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Apaga uma mensagem específica ou a mensagem que foi respondida (quoted) no chat.',
      parameters: {
        type: 'object',
        properties: {
          messageId: {
            type: 'string',
            description: 'ID da mensagem a ser apagada, ou omita para apagar a mensagem respondida.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'hidetag_announcement',
      description: 'Envia um comunicado oficial no grupo marcando todos os membros de forma invisível/oculta.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Texto do comunicado a ser transmitido para todos os membros.'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'promote_member',
      description: 'Promove um membro comum a Administrador do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone ou menção com @ do membro a ser promovido.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'demote_member',
      description: 'Rebaixa um administrador a membro comum do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone ou menção com @ do administrador a ser rebaixado.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'raffle_members',
      description: 'Realiza um sorteio aleatório e justo entre os membros do grupo.',
      parameters: {
        type: 'object',
        properties: {
          quantity: {
            type: 'integer',
            description: 'Quantidade de membros a serem sorteados (padrão: 1).'
          },
          prize: {
            type: 'string',
            description: 'Nome do prêmio do sorteio.'
          }
        },
        required: []
      }
    }
  }
];

// Descrição unificada (curta) para todo parâmetro "target": economiza tokens e reforça o uso de refs reais
const TARGET_DESCRIPTION = 'Ref da mensagem do histórico (ex: "m123"), número com DDI, @menção ou "quoted". Nunca invente.';
const MAX_ARG_STRING = 500;

// Endurece os schemas: sem propriedades extras e com target padronizado
for (const tool of TOOLS) {
  const params = tool.function.parameters;
  params.additionalProperties = false;
  if (params.properties && params.properties.target) {
    params.properties.target.description = TARGET_DESCRIPTION;
  }
  if (params.properties && params.properties.messageId) {
    params.properties.messageId.description = 'Ref da mensagem do histórico (ex: "m123"), ou omita para apagar a mensagem respondida (quoted).';
  }
}

class ToolRegistry {
  constructor() {
    this.tools = TOOLS;
  }

  getTools() {
    return this.tools;
  }

  /**
   * Valida e sanitiza os argumentos de uma tool call contra o schema JSON declarado.
   * Remove propriedades desconhecidas, coage tipos simples e rejeita enum/required inválidos
   * ANTES de executar qualquer ação (evita, por exemplo, abrir o grupo por um "action" ausente).
   * @param {string} toolName
   * @param {object} rawArgs
   * @returns {{ ok: boolean, args?: object, error?: string }}
   */
  validateArgs(toolName, rawArgs) {
    const tool = this.tools.find(t => t.function.name === toolName);
    if (!tool) return { ok: false, error: `Ferramenta "${toolName}" não reconhecida.` };

    const schema = tool.function.parameters;
    const input = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const clean = {};

    for (const [key, def] of Object.entries(schema.properties || {})) {
      let value = input[key];
      if (value === undefined || value === null || value === '') continue;

      if (def.type === 'string') {
        if (typeof value === 'number') value = String(value);
        if (typeof value !== 'string') return { ok: false, error: `Argumento "${key}" inválido.` };
        value = value.trim().slice(0, MAX_ARG_STRING);
        if (!value) continue;
      } else if (def.type === 'integer') {
        const num = typeof value === 'string' ? Number(value.trim()) : value;
        if (!Number.isFinite(num)) return { ok: false, error: `Argumento "${key}" inválido.` };
        value = Math.trunc(num);
      } else if (def.type === 'boolean') {
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (typeof value !== 'boolean') return { ok: false, error: `Argumento "${key}" inválido.` };
      }

      if (Array.isArray(def.enum) && !def.enum.includes(value)) {
        return { ok: false, error: `Valor inválido para "${key}".` };
      }
      clean[key] = value;
    }

    for (const req of schema.required || []) {
      if (clean[req] === undefined) return { ok: false, error: `Argumento obrigatório ausente: "${req}".` };
    }

    // Ferramentas sem campos obrigatórios que não podem rodar vazias
    if (toolName === 'set_group_schedule' && !['closeTime', 'openTime', 'enabled'].some(k => clean[k] !== undefined)) {
      return { ok: false, error: 'Informe os horários de fechar/abrir ou ative/desative o agendamento.' };
    }

    return { ok: true, args: clean };
  }

  /**
   * Normaliza um horário para o formato HH:MM (ex: "7:00" -> "07:00", "23h" -> "23:00") ou "0"
   * @param {string} val
   * @returns {string|null}
   */
  _normalizeTime(val) {
    if (val === undefined || val === null) return null;
    const raw = String(val).trim().toLowerCase();
    if (raw === '0' || raw === 'off' || raw === 'nenhum' || raw === 'desativar') return '0';

    const matchHHMM = raw.match(/^([0-1]?[0-9]|2[0-3])[:h]([0-5][0-9])?$/);
    if (matchHHMM) {
      const hh = matchHHMM[1].padStart(2, '0');
      const mm = (matchHHMM[2] || '00').padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return null;
  }

  /**
   * Resolve o participante alvo filtrando o próprio JID/LID do bot
   * Evita que "@Hermes bane @Infrator" ou reply ao próprio bot selecione o bot como alvo
   */
  async _resolveTargetSmart(sock, msg, from, targetArg = '') {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBotIdentity = (jidOrNum) => {
      if (!jidOrNum) return false;
      const clean = cleanJid(jidOrNum);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return (
        clean === botJid ||
        clean === botLid ||
        (botNum && num === botNum) ||
        (botLidNum && num === botLidNum)
      );
    };

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    // 0. Ref explícito do histórico ("m123"): resolvido por lookup determinístico no SQLite (autor real da mensagem)
    if (typeof targetArg === 'string' && /^m\d{1,9}$/i.test(targetArg.trim())) {
      const refData = memoryEngine.getMessageByRef(from, targetArg.trim());
      const refJid = refData ? cleanJid(refData.participant || refData.sender) : '';
      if (!refJid || isBotIdentity(refJid)) return null;
      return await resolveParticipant(sock, from, refJid);
    }

    // 1. Menções na mensagem que NÃO sejam o próprio bot
    const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    const nonBotMentions = mentions.filter(m => !isBotIdentity(m));
    if (nonBotMentions.length > 0) {
      return await resolveParticipant(sock, from, cleanJid(nonBotMentions[0]));
    }

    // 2. Número explícito passado em targetArg que NÃO seja o próprio bot
    if (targetArg && typeof targetArg === 'string') {
      const numMatch = targetArg.match(/@?(\d{8,15})/);
      if (numMatch && numMatch[1] && !isBotIdentity(numMatch[1])) {
        const candidateJid = targetArg.includes('@lid')
          ? `${numMatch[1]}@lid`
          : `${numMatch[1]}@s.whatsapp.net`;
        return await resolveParticipant(sock, from, candidateJid);
      }
    }

    // 3. Mensagem respondida (Quote), desde que não seja resposta a uma mensagem do próprio bot
    const quotedParticipant = contextInfo?.participant || contextInfo?.quotedMessage?.participant;
    if (quotedParticipant && !isBotIdentity(quotedParticipant)) {
      return await resolveParticipant(sock, from, cleanJid(quotedParticipant));
    }

    // 4. Busca por nome no histórico de conversas do grupo (ex: "Hermes, adverte o João")
    if (targetArg && typeof targetArg === 'string') {
      const cleanedArg = targetArg.trim().toLowerCase();
      if (cleanedArg && cleanedArg !== 'quoted' && cleanedArg !== 'mentioned') {
        const jidByName = memoryEngine.findParticipantByName(from, targetArg);
        if (jidByName && !isBotIdentity(jidByName)) {
          return await resolveParticipant(sock, from, cleanJid(jidByName));
        }
      }
    }

    // 5. Fallback padrão
    return await resolveTarget(sock, msg, from, targetArg);
  }

  /**
   * Alvos EXPLÍCITOS da mensagem do admin: pessoas marcadas (@) ou autor da mensagem respondida (reply).
   * Exclui o próprio bot. É a única origem aceita para remoções (ban / blacklist add).
   * @returns {Promise<Array<object>>} participantes resolvidos (mesmo formato de resolveParticipant)
   */
  async _getExplicitTargets(sock, msg, from) {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBot = (jid) => {
      const clean = cleanJid(jid);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return clean === botJid || clean === botLid || (botNum && num === botNum) || (botLidNum && num === botLidNum);
    };

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    const candidates = [];
    const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    for (const m of mentions) {
      if (m && !isBot(m)) candidates.push(cleanJid(m));
    }
    const quotedParticipant = contextInfo?.participant;
    if (quotedParticipant && !isBot(quotedParticipant)) candidates.push(cleanJid(quotedParticipant));

    const resolved = [];
    for (const jid of [...new Set(candidates)]) {
      const data = await resolveParticipant(sock, from, jid);
      if (data) resolved.push(data);
    }
    return resolved;
  }

  /**
   * Garante que a remoção só atinja quem o admin marcou (@) ou a quem respondeu (reply).
   * Se o modelo escolheu o alvo só pelo contexto (ref "mNN", nome ou número), a ação é recusada.
   * @returns {Promise<{ targetData?: object, error?: string }>}
   */
  async _requireExplicitTarget(sock, msg, from, targetArg, lang) {
    const explicit = await this._getExplicitTargets(sock, msg, from);
    if (explicit.length === 0) {
      return { error: t(lang, 'hermes.need_explicit_target') };
    }

    const arg = String(targetArg || '').trim().toLowerCase();
    if (!arg || arg === 'quoted' || arg === 'mentioned') {
      return { targetData: explicit[0] };
    }

    const chosen = await this._resolveTargetSmart(sock, msg, from, targetArg);
    if (!chosen) return { error: t(lang, 'common.not_found_target') };

    const idsOf = (d) => [d.groupJid, d.phoneJid, d.displayNum].filter(Boolean).map(String);
    const chosenIds = new Set(idsOf(chosen));
    const match = explicit.find(e => idsOf(e).some(id => chosenIds.has(id)));
    if (!match) {
      return { error: t(lang, 'hermes.need_explicit_target') };
    }
    return { targetData: match };
  }

  /**
   * Executa uma ferramenta com validação determinística de permissões (Anti-Prompt Injection)
   * O LLM sugere a ação, mas o código Node.js valida e barra tentativas não autorizadas.
   * @param {object} params
   * @param {object} params.sock Baileys socket
   * @param {object} params.msg Mensagem original
   * @param {string} params.from JID do grupo
   * @param {string} params.sender JID do remetente original
   * @param {string} params.toolName Nome da ferramenta invocada
   * @param {object} params.args Argumentos passados pelo modelo
   * @returns {Promise<{ success: boolean, message?: string, error?: string, mentions?: string[] }>}
   */
  async executeTool({ sock, msg, from, sender, toolName, args }) {
    if (!from || !from.endsWith('@g.us')) {
      return { success: false, error: 'Ferramentas de moderação só podem ser executadas dentro de grupos.' };
    }

    const lang = configManager.getGroupLang(from);

    // ========================================================
    // REGRA 2: VALIDAÇÃO DETERMINÍSTICA ANTI-PROMPT INJECTION
    // O Node.js valida obrigatoriamente se o remetente original é administrador.
    // Membros comuns tentando ordens administrativas são fisicamente barrados aqui.
    // ========================================================
    const isOwner = settings.isOwner(sender, sock);
    const adminCheck = await checkAdminStatus(sock, from, sender);
    const isAdmin = Boolean(adminCheck.isAdmin || isOwner);

    if (!isAdmin) {
      logger.warn({ sender, toolName, from }, 'Tentativa de Tool Call administrativa bloqueada para membro comum (Anti-Prompt Injection)');
      return {
        success: false,
        error: t(lang, 'common.no_permission_admin')
      };
    }

    // Bot precisa ser admin para a maioria das ações administrativas no WhatsApp
    const isBotAdmin = adminCheck.isBotAdmin;

    switch (toolName) {
      case 'ban_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        // Remoção só com alvo explícito: marcado (@) ou reply (nunca inferido pelo modelo)
        const guard = await this._requireExplicitTarget(sock, msg, from, args.target, lang);
        if (guard.error) {
          return { success: false, error: guard.error };
        }
        const targetData = guard.targetData;

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_bot') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: t(lang, 'ban.cannot_ban_admin') };
        }

        const banCfg = configManager.getPluginConfig(from, 'ban') || {};
        if (banCfg.deleteMessage !== false) {
          const realMsg = msg?.message?.ephemeralMessage?.message ||
                          msg?.message?.viewOnceMessage?.message ||
                          msg?.message;

          const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                              realMsg?.imageMessage?.contextInfo ||
                              msg?.message?.extendedTextMessage?.contextInfo;

          const quotedStanzaId = contextInfo?.stanzaId;
          const quotedParticipant = contextInfo?.participant;
          if (quotedStanzaId && cleanJid(quotedParticipant) !== botJid && cleanJid(quotedParticipant) !== botLid) {
            await safeDelete(sock, from, {
              remoteJid: from,
              id: quotedStanzaId,
              participant: quotedParticipant
            });
          }
        }

        await safeKick(sock, from, targetData.groupJid);

        const banMessage =
          banCfg.customMessage && String(banCfg.customMessage).trim().length > 0 && banCfg.customMessage !== '.'
            ? String(banCfg.customMessage).replace(/\{user\}/gi, `@${targetData.displayNum}`)
            : t(lang, 'ban.success', { user: targetData.displayNum });

        return {
          success: true,
          message: banMessage,
          mentions: [targetData.groupJid]
        };
      }

      case 'set_group_mute': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const action = args.action === 'close' ? 'announcement' : 'not_announcement';
        await sock.groupSettingUpdate(from, action);

        return {
          success: true,
          message: action === 'announcement'
            ? t(lang, 'mute.closed')
            : t(lang, 'mute.opened')
        };
      }

      case 'set_group_schedule': {
        const currentCfg = configManager.getPluginConfig(from, 'schedule') || {};
        if (args.enabled === false) {
          configManager.setPluginEnabled(from, 'schedule', false);
          return {
            success: true,
            message: `${t(lang, 'common.saved')}\n⏰ *Horários Automáticos:* ${t(lang, 'common.disabled')}`
          };
        }

        const normClose = args.closeTime !== undefined ? this._normalizeTime(args.closeTime) : null;
        const normOpen = args.openTime !== undefined ? this._normalizeTime(args.openTime) : null;

        if (args.closeTime !== undefined && !normClose) {
          return { success: false, error: 'Formato de horário de fechamento inválido. Use HH:MM (ex: 23:00).' };
        }
        if (args.openTime !== undefined && !normOpen) {
          return { success: false, error: 'Formato de horário de abertura inválido. Use HH:MM (ex: 07:00).' };
        }

        const closeTime = normClose || currentCfg.closeTime || '23:00';
        const openTime = normOpen || currentCfg.openTime || '07:00';

        configManager.updatePluginConfig(from, 'schedule', {
          closeTime,
          openTime,
          enabled: true
        });

        return {
          success: true,
          message: t(lang, 'schedule.status', {
            status: t(lang, 'common.enabled'),
            close: closeTime === '0' ? '—' : closeTime,
            open: openTime === '0' ? '—' : openTime
          })
        };
      }

      case 'toggle_group_protection': {
        const mod = String(args.module || '').toLowerCase();
        const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes'];
        if (!validModules.includes(mod)) {
          return { success: false, error: `Módulo "${mod}" inválido.` };
        }

        const currentCfg = configManager.getPluginConfig(from, mod) || {};
        const enabled = args.enabled !== undefined ? Boolean(args.enabled) : (currentCfg.enabled !== false);
        const updates = { enabled };

        if (mod === 'antilink') {
          if (args.action && ['delete', 'warn', 'ban'].includes(args.action)) {
            updates.action = args.action;
          }
          if (args.allowedDomains !== undefined) {
            const rawDoms = String(args.allowedDomains).trim();
            updates.allowedDomains = (rawDoms === '.' || rawDoms === '' || rawDoms === 'todos')
              ? []
              : rawDoms.split(/[\s,]+/).map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')).filter(Boolean);
          }
        }

        if (mod === 'antiflood') {
          if (args.action && ['warn', 'ban'].includes(args.action)) {
            updates.action = args.action;
          }
          if (args.maxMessages && Number(args.maxMessages) >= 2) {
            updates.maxMessages = parseInt(args.maxMessages, 10);
          }
          if (args.maxChars && Number(args.maxChars) >= 100) {
            updates.maxChars = parseInt(args.maxChars, 10);
          }
        }

        if (mod === 'antifake' && args.allowedDdis !== undefined) {
          const ddis = String(args.allowedDdis).split(/[\s,]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
          if (ddis.length > 0) updates.allowedDdis = ddis;
        }

        if (mod === 'welcome') {
          if (args.welcomeMessage && String(args.welcomeMessage).trim().length > 0) {
            updates.message = String(args.welcomeMessage).trim();
          }
          if (args.autoDeleteSeconds !== undefined && Number(args.autoDeleteSeconds) >= 0) {
            updates.autoDeleteSeconds = parseInt(args.autoDeleteSeconds, 10);
          }
        }

        if (mod === 'automsg') {
          if (args.autoMsgText && String(args.autoMsgText).trim().length > 0) {
            updates.message = String(args.autoMsgText).trim();
          }
          if (args.intervalMinutes && Number(args.intervalMinutes) > 0) {
            updates.intervalMinutes = Math.max(parseInt(args.intervalMinutes, 10), 5);
          }
        }

        if (mod === 'warn' && args.maxWarns && Number(args.maxWarns) >= 1) {
          updates.maxWarns = parseInt(args.maxWarns, 10);
        }

        if (mod === 'ban' && args.customBanMessage !== undefined) {
          updates.customMessage = String(args.customBanMessage).trim();
        }

        if (mod === 'hermes' && args.personality && ['descontraido', 'formal'].includes(args.personality)) {
          updates.personality = args.personality;
        }

        if (Object.keys(updates).length > 1) {
          configManager.updatePluginConfig(from, mod, updates);
        } else {
          configManager.setPluginEnabled(from, mod, enabled);
        }

        const stateLabel = enabled ? t(lang, 'common.enabled') : t(lang, 'common.disabled');
        return {
          success: true,
          message: `${t(lang, 'common.saved')}\n⚙️ *${mod.toUpperCase()}:* ${stateLabel}`
        };
      }

      case 'set_group_settings': {
        const results = [];
        if (args.lang && ['pt', 'es', 'en'].includes(args.lang)) {
          configManager.setGroupLang(from, args.lang);
          results.push(t(args.lang, 'lang.changed'));
        }
        if (args.prefix && String(args.prefix).trim().length === 1) {
          const newPrefix = String(args.prefix).trim();
          configManager.setGroupPrefix(from, newPrefix);
          results.push(t(lang, 'wizard.prefix_changed', { prefix: newPrefix }));
        }
        if (args.clearMemory) {
          memoryEngine.clearGroupMemory(from);
          results.push('🧹 *Memória limpa:* O histórico de conversas do Hermes neste grupo foi zerado.');
        }
        if (args.openPanel) {
          await wizardEngine.startConfigPanel(sock, msg, from, sender);
          return { success: true };
        }
        if (results.length > 0) {
          return { success: true, message: results.join('\n') };
        }
        return { success: false, error: t(lang, 'common.error') };
      }

      case 'warn_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
        }

        const reason = args.reason || 'Comportamento inadequado';
        const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
        const maxWarns = warnCfg.maxWarns || 3;
        const count = configManager.addWarn(from, targetData.phoneJid, reason);

        if (count >= maxWarns) {
          await safeKick(sock, from, targetData.groupJid);
          configManager.resetWarns(from, targetData.phoneJid);
          return {
            success: true,
            message: t(lang, 'warn.max_reached', { user: targetData.displayNum, max: maxWarns }),
            mentions: [targetData.groupJid]
          };
        }

        return {
          success: true,
          message: t(lang, 'warn.added', { user: targetData.displayNum, reason, warns: count, max: maxWarns }),
          mentions: [targetData.groupJid]
        };
      }

      case 'unwarn_member': {
        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
        const maxWarns = warnCfg.maxWarns || 3;
        const remaining = configManager.removeWarn(from, targetData.phoneJid);

        return {
          success: true,
          message: t(lang, 'warn.removed', { user: targetData.displayNum, warns: remaining, max: maxWarns }),
          mentions: [targetData.groupJid]
        };
      }

      case 'manage_blacklist': {
        let targetData;
        if (args.action === 'remove') {
          targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
          if (!targetData) {
            return { success: false, error: t(lang, 'common.not_found_target') };
          }
        } else {
          // Adicionar à blacklist expulsa o membro: exige alvo marcado (@) ou reply
          const guard = await this._requireExplicitTarget(sock, msg, from, args.target, lang);
          if (guard.error) {
            return { success: false, error: guard.error };
          }
          targetData = guard.targetData;
        }

        if (args.action === 'remove') {
          configManager.removeGroupBlacklist(from, targetData.phoneJid);
          return {
            success: true,
            message: t(lang, 'blacklist.removed', { user: targetData.displayNum }),
            mentions: [targetData.groupJid]
          };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
        }

        configManager.addGroupBlacklist(from, targetData.phoneJid);
        if (isBotAdmin) {
          try {
            await safeKick(sock, from, targetData.groupJid);
          } catch (_) {}
        }

        return {
          success: true,
          message: t(lang, 'blacklist.added', { user: targetData.displayNum }),
          mentions: [targetData.groupJid]
        };
      }

      case 'delete_message': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const realMsg = msg?.message?.ephemeralMessage?.message ||
                        msg?.message?.viewOnceMessage?.message ||
                        msg?.message;

        const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                            realMsg?.imageMessage?.contextInfo ||
                            msg?.message?.extendedTextMessage?.contextInfo;

        let deleteId = contextInfo?.stanzaId;
        let deleteParticipant = contextInfo?.participant;

        // Ref do histórico ("m123"): chave real (id + participante) vem do SQLite; IDs inventados são ignorados
        if (args.messageId && /^m\d{1,9}$/i.test(String(args.messageId).trim())) {
          const refData = memoryEngine.getMessageByRef(from, String(args.messageId).trim());
          if (!refData || !refData.msgId) {
            return { success: false, error: t(lang, 'hermes.msg_not_found') };
          }
          deleteId = refData.msgId;
          deleteParticipant = refData.participant || refData.sender;
        }

        if (!deleteId) {
          return { success: false, error: t(lang, 'clear.reply_required') };
        }

        await safeDelete(sock, from, {
          remoteJid: from,
          id: deleteId,
          participant: deleteParticipant
        });

        return { success: true, message: t(lang, 'clear.success') };
      }

      case 'hidetag_announcement': {
        const text = args.message;
        if (!text || text.trim().length === 0) {
          return { success: false, error: t(lang, 'hidetag.empty') };
        }

        const metadata = await getGroupMetadata(sock, from);
        if (!metadata || !Array.isArray(metadata.participants)) {
          return { success: false, error: t(lang, 'common.error') };
        }

        const allMembers = new Set();
        metadata.participants.forEach(p => {
          if (p.id) allMembers.add(p.id);
          if (p.jid) allMembers.add(p.jid);
          if (p.lid) allMembers.add(p.lid);
        });

        await sendSafeMessage(sock, from, {
          text: `📢 *COMUNICADO:*\n\n${text.trim()}`,
          mentions: Array.from(allMembers)
        });

        return { success: true };
      }

      case 'promote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (check.isAdmin) {
          return { success: false, error: t(lang, 'promote.already_admin') };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
        groupCache.del(from);

        return {
          success: true,
          message: t(lang, 'promote.success', { user: targetData.displayNum }),
          mentions: [targetData.groupJid]
        };
      }

      case 'demote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'demote.cannot_demote_owner') };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (!check.isAdmin) {
          return { success: false, error: t(lang, 'demote.already_member') };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'demote');
        groupCache.del(from);

        return {
          success: true,
          message: t(lang, 'demote.success', { user: targetData.displayNum }),
          mentions: [targetData.groupJid]
        };
      }

      case 'raffle_members': {
        let metadata = await getGroupMetadata(sock, from);
        if (!metadata || !Array.isArray(metadata.participants)) {
          try {
            metadata = await sock.groupMetadata(from);
          } catch (_) {}
        }

        if (!metadata || !Array.isArray(metadata.participants) || metadata.participants.length <= 1) {
          return { success: false, error: t(lang, 'raffle.not_enough') };
        }

        const botJid = sock?.user?.id ? cleanJid(sock.user.id) : '';
        const botLid = sock?.user?.lid ? cleanJid(sock.user.lid) : '';
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        let pool = metadata.participants.filter(p => {
          const pId = cleanJid(p.id);
          const pLid = p.lid ? cleanJid(p.lid) : '';
          const pJid = p.jid ? cleanJid(p.jid) : '';
          const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');

          if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
          if (p.admin === 'admin' || p.admin === 'superadmin') return false;
          return true;
        });

        if (pool.length === 0) {
          pool = metadata.participants.filter(p => {
            const pId = cleanJid(p.id);
            const pLid = p.lid ? cleanJid(p.lid) : '';
            const pJid = p.jid ? cleanJid(p.jid) : '';
            const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');
            if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
            return true;
          });
        }

        if (pool.length === 0) {
          return { success: false, error: t(lang, 'raffle.not_enough') };
        }

        const count = Math.min(Math.max(parseInt(args.quantity, 10) || 1, 1), pool.length);
        const prize = args.prize || 'Sorteio do Grupo';

        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const winners = shuffled.slice(0, count);
        const mentions = [];
        let winnersText = '';

        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const resolved = await resolveParticipant(sock, from, w.id);
          const displayNum = resolved?.displayNum || cleanJid(w.id).replace(/@.*$/, '').replace(/\D/g, '');
          const targetGroup = resolved?.groupJid || cleanJid(w.id);
          mentions.push(targetGroup);
          winnersText += `🏅 *${i + 1}º Lugar:* @${displayNum}\n`;
        }

        const resultMsg = `${t(lang, 'raffle.title')}\n${t(lang, 'raffle.prize', { prize })}\n\n${t(lang, 'raffle.winners', { winners: winnersText })}`;
        await sendSafeMessage(sock, from, { text: resultMsg, mentions });

        return { success: true };
      }

      default:
        return { success: false, error: `Ferramenta "${toolName}" não reconhecida.` };
    }
  }
}

const toolRegistry = new ToolRegistry();
module.exports = toolRegistry;
