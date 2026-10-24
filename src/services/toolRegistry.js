const settings = require('../config/settings');
const configManager = require('../core/configManager');
const logger = require('../utils/logger');
const { safeKick, safeDelete, sendSafeMessage } = require('../utils/antiBan');
const { resolveTarget, resolveParticipant, checkAdminStatus, getGroupMetadata, cleanJid } = require('../utils/jidResolver');
const { groupCache } = require('../utils/cache');
const { t } = require('../utils/i18n');

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
      description: 'Tranca o grupo para apenas administradores falarem, ou abre o grupo para todos os membros.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['close', 'open'],
            description: '"close" para trancar o grupo (apenas admins falam) ou "open" para abrir para todos os membros.'
          }
        },
        required: ['action']
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

class ToolRegistry {
  constructor() {
    this.tools = TOOLS;
  }

  getTools() {
    return this.tools;
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
   * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
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
        error: 'Ação administrativa negada: você precisa ser Administrador do grupo para solicitar essa ação.'
      };
    }

    // Bot precisa ser admin para a maioria das ações administrativas
    const isBotAdmin = adminCheck.isBotAdmin;

    switch (toolName) {
      case 'ban_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

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
          if (quotedStanzaId) {
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
          message: banMessage
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

      case 'warn_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
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
            message: t(lang, 'warn.max_reached', { user: targetData.displayNum, max: maxWarns })
          };
        }

        return {
          success: true,
          message: t(lang, 'warn.added', { user: targetData.displayNum, reason, warns: count, max: maxWarns })
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

        const quotedStanzaId = args.messageId || contextInfo?.stanzaId;
        const quotedParticipant = contextInfo?.participant;

        if (!quotedStanzaId) {
          return { success: false, error: t(lang, 'clear.reply_required') };
        }

        await safeDelete(sock, from, {
          remoteJid: from,
          id: quotedStanzaId,
          participant: quotedParticipant
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

        return { success: true, message: 'Comunicado enviado marcando todos os membros do grupo.' };
      }

      case 'promote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
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
          message: t(lang, 'promote.success', { user: targetData.displayNum })
        };
      }

      case 'demote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
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
          message: t(lang, 'demote.success', { user: targetData.displayNum })
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

        return { success: true, message: `Sorteio de ${count} ganhador(es) realizado com sucesso.` };
      }

      default:
        return { success: false, error: `Ferramenta "${toolName}" não reconhecida.` };
    }
  }
}

const toolRegistry = new ToolRegistry();
module.exports = toolRegistry;
