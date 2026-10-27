const configManager = require('../../core/configManager');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');
const logger = require('../../utils/logger');

/**
 * Extrai o código de convite de um link de grupo WhatsApp
 * Suporta:
 * - https://chat.whatsapp.com/ABCdef12345
 * - http://chat.whatsapp.com/ABCdef12345
 * - chat.whatsapp.com/ABCdef12345
 * - Código direto alfanumérico (20 a 26 caracteres)
 * @param {string} input
 * @returns {string|null}
 */
function extractInviteCode(input) {
  if (!input) return null;
  const clean = input.trim();
  const match = clean.match(/(?:chat\.whatsapp\.com\/)([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,26}$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Extrai e normaliza um JID de grupo WhatsApp
 * @param {string} input
 * @returns {string|null}
 */
function extractGroupJid(input) {
  if (!input) return null;
  const clean = input.trim();
  if (clean.endsWith('@g.us')) return clean;
  if (/^\d{15,25}$/.test(clean)) return `${clean}@g.us`;
  return null;
}

module.exports = {
  name: 'liberar',
  aliases: ['liberar', 'join', 'entrar', 'liberargp', 'liberargrupo', 'liberarbot'],
  usage: 'liberar <link|id> [dias]',
  description: 'Libera o bot remotamente via link de convite ou ID, ativando com padrões e enviando a saudação oficial',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,
  allowWhenBanned: true,
  allowWhenInactive: true,

  async execute({ sock, msg, _msg, from, sender, args, command, reply, t, prefix, isOwner, isGroup }) {
    if (!isOwner) return;

    let targetJid = null;
    let inviteCode = null;
    let inviteInfo = null;
    let days = null;

    // Varre argumentos para identificar link, JID e dias
    for (const arg of args) {
      const code = extractInviteCode(arg);
      if (code) {
        inviteCode = code;
        continue;
      }
      const jid = extractGroupJid(arg);
      if (jid) {
        targetJid = jid;
        continue;
      }
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num > 0) {
        days = num;
        continue;
      }
    }

    // Se não informou target e o comando foi executado dentro de um grupo, usa o grupo atual
    if (!targetJid && !inviteCode && isGroup) {
      targetJid = from;
    }

    // Se temos um código de convite, tenta obter info e entrar no grupo
    if (inviteCode) {
      try {
        inviteInfo = await sock.groupGetInviteInfo(inviteCode);
        if (inviteInfo?.id) {
          targetJid = inviteInfo.id.endsWith('@g.us') ? inviteInfo.id : `${inviteInfo.id}@g.us`;
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Falha ao consultar info do convite');
      }

      try {
        const joinedJid = await sock.groupAcceptInvite(inviteCode);
        if (joinedJid) {
          targetJid = joinedJid.endsWith('@g.us') ? joinedJid : `${joinedJid}@g.us`;
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'groupAcceptInvite retornou erro (possivelmente já está no grupo)');
        // Se já tínhamos o targetJid obtido via inviteInfo, prossegue normalmente
        if (!targetJid) {
          return reply(t('saas.liberate_invite_error'));
        }
      }
    }

    if (!targetJid) {
      return reply(t('saas.liberate_usage', { prefix: prefix || '!' }));
    }

    // Se o grupo estava na lista negra/banidos, desbane imediatamente
    if (configManager.isGroupBanned(targetJid)) {
      configManager.unbanGroup(targetJid);
    }

    // Tenta obter metadados e nome do grupo
    let groupName = (inviteCode && inviteInfo?.subject) ? inviteInfo.subject : 'Grupo';
    try {
      const meta = await getGroupMetadata(sock, targetJid);
      if (meta?.subject) {
        groupName = meta.subject;
      }
    } catch (_) {}

    configManager.getOrCreateGroup(targetJid, groupName);

    // Configura validade (vitalício ou número de dias)
    let expiryDisplay = t('common.lifetime');
    if (days && days > 0) {
      const expiresAt = configManager.addDaysToGroup(targetJid, days);
      expiryDisplay = new Date(expiresAt).toLocaleDateString();
    } else {
      configManager.setGroupExpiry(targetJid, null);
    }

    // Aplica configurações padrão recomendadas e marca como ativado/onboarded
    configManager.setGroupEnabled(targetJid, true);
    configManager.setGroupOnboarded(targetJid, true);
    configManager.setGroupStyle(targetJid, 'natural');
    configManager.updatePluginConfig(targetJid, 'hermes', {
      enabled: true,
      memoryEnabled: true,
      configured: true
    });
    configManager.flushSync();

    // Mensagem de apresentação oficial do bot no grupo
    const groupPrefix = configManager.getGroupPrefix(targetJid) || '!';
    const groupLang = configManager.getGroupLang(targetJid) || 'pt';
    const presentationText = t(groupLang, 'saas.group_presentation', { prefix: groupPrefix });

    // Se o comando foi disparado de fora do grupo (ex: no Privado / DM)
    if (!isGroup || from !== targetJid) {
      // 1. Envia a apresentação no grupo com pequeno delay anti-ban
      setTimeout(async () => {
        try {
          await sendSafeMessage(sock, targetJid, { text: presentationText });
        } catch (err) {
          logger.error({ err }, 'Erro ao enviar mensagem de apresentação no grupo liberado');
        }
      }, 1200);

      // 2. Responde confirmação detalhada para o Dono no chat atual
      return reply(t('saas.liberate_success_owner', {
        name: groupName,
        id: targetJid,
        expiry: expiryDisplay
      }));
    }

    // Se o comando foi executado diretamente dentro do grupo alvo
    return reply(presentationText);
  }
};
