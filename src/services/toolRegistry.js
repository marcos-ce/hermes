const settings = require('../config/settings');
const configManager = require('../core/configManager');
const logger = require('../utils/logger');
const { safeKick, safeDelete, sendSafeMessage } = require('../utils/antiBan');
const { resolveTarget, resolveParticipant, checkAdminStatus, getGroupMetadata, cleanJid } = require('../utils/jidResolver');
const { groupCache } = require('../utils/cache');

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
          return { success: false, error: 'Não posso banir membros porque não sou administrador do grupo.' };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: 'Não consegui identificar o membro alvo para expulsão.' };
        }

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
          return { success: false, error: 'Não posso banir a mim mesmo.' };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: 'Não é permitido banir o Dono do bot.' };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: 'Não é permitido banir administradores do grupo.' };
        }

        await safeKick(sock, from, targetData.groupJid);
        return {
          success: true,
          message: `O membro @${targetData.displayNum} foi expulso do grupo com sucesso.`
        };
      }

      case 'set_group_mute': {
        if (!isBotAdmin) {
          return { success: false, error: 'Não posso alterar as configurações do grupo porque não sou administrador.' };
        }

        const action = args.action === 'close' ? 'announcement' : 'not_announcement';
        await sock.groupSettingUpdate(from, action);

        return {
          success: true,
          message: action === 'announcement'
            ? 'Grupo fechado com sucesso. Apenas administradores podem enviar mensagens agora.'
            : 'Grupo aberto com sucesso. Todos os membros podem enviar mensagens agora.'
        };
      }

      case 'warn_member': {
        if (!isBotAdmin) {
          return { success: false, error: 'Não sou administrador do grupo para aplicar advertências e eventuais punições.' };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: 'Membro alvo para advertência não encontrado.' };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: 'Não é permitido advertir o Dono do bot.' };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: 'Não é permitido aplicar advertências a administradores.' };
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
            message: `@${targetData.displayNum} atingiu o limite de ${maxWarns} advertências e foi expulso do grupo.`
          };
        }

        return {
          success: true,
          message: `@${targetData.displayNum} recebeu uma advertência (${count}/${maxWarns}). Motivo: ${reason}`
        };
      }

      case 'delete_message': {
        if (!isBotAdmin) {
          return { success: false, error: 'Preciso ser administrador do grupo para apagar mensagens de outros membros.' };
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
          return { success: false, error: 'Nenhuma mensagem respondida ou ID fornecido para apagar.' };
        }

        await safeDelete(sock, from, {
          remoteJid: from,
          id: quotedStanzaId,
          participant: quotedParticipant
        });

        return { success: true, message: 'Mensagem apagada com sucesso.' };
      }

      case 'hidetag_announcement': {
        const text = args.message;
        if (!text || text.trim().length === 0) {
          return { success: false, error: 'Mensagem do comunicado não informada.' };
        }

        const metadata = await getGroupMetadata(sock, from);
        if (!metadata || !Array.isArray(metadata.participants)) {
          return { success: false, error: 'Falha ao buscar participantes do grupo.' };
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
          return { success: false, error: 'Preciso ser administrador do grupo para promover membros.' };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: 'Membro alvo para promoção não encontrado.' };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (check.isAdmin) {
          return { success: false, error: `@${targetData.displayNum} já é um administrador.` };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
        groupCache.del(from);

        return {
          success: true,
          message: `@${targetData.displayNum} promovido a Administrador com sucesso.`
        };
      }

      case 'demote_member': {
        if (!isBotAdmin) {
          return { success: false, error: 'Preciso ser administrador do grupo para rebaixar administradores.' };
        }

        const targetData = await resolveTarget(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: 'Membro alvo para rebaixamento não encontrado.' };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: 'Não é permitido rebaixar o Dono do bot.' };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (!check.isAdmin) {
          return { success: false, error: `@${targetData.displayNum} já é um membro comum.` };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'demote');
        groupCache.del(from);

        return {
          success: true,
          message: `@${targetData.displayNum} rebaixado a membro comum.`
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
          return { success: false, error: 'Não há membros suficientes no grupo para realizar um sorteio.' };
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
          return { success: false, error: 'Nenhum membro elegível para o sorteio.' };
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

        const resultMsg = `🎉 *RESULTADO DO SORTEIO* 🎉\n🎁 *Prêmio:* ${prize}\n\n🏆 *Ganhador(es):*\n${winnersText}`;
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
