const { groupCache } = require('../../utils/cache');
const { resolveParticipant, checkAdminStatus, cleanJid, isBotIdentity } = require('../../utils/jidResolver');

module.exports = {
  name: 'promote',
  aliases: ['promote', 'promover', 'promove', 'adm', 'admin', 'daradm'],
  usage: 'adm @user',
  description: 'Promove membro a Administrador do grupo (requer menção expressa com @)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    // Trava de segurança obrigatória: só permite promover quem for marcado expressamente com @
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

    const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    const nonBotMentions = rawMentions.filter(m => !isBotIdentity(sock, m));

    const textMatch = typeof text === 'string' ? text.match(/@(\d{8,15})/) : null;
    const hasValidAtText = textMatch && !isBotIdentity(sock, textMatch[1]);

    if (nonBotMentions.length === 0 && !hasValidAtText) {
      return reply(t('promote.need_explicit_mention'));
    }

    let targetData = null;
    if (nonBotMentions.length > 0) {
      targetData = await resolveParticipant(sock, from, cleanJid(nonBotMentions[0]));
    } else if (hasValidAtText) {
      targetData = await resolveParticipant(sock, from, `${textMatch[1]}@s.whatsapp.net`);
    }

    if (!targetData) {
      return reply(t('common.not_found_target'));
    }

    const adminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
    if (adminCheck.isAdmin) {
      return reply(t('promote.already_admin'));
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
      groupCache.del(from); // Invalida o cache

      return reply(t('promote.success', { user: targetData.displayUser || targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    } catch (_err) {
      return reply(t('common.error'));
    }
  }
};
