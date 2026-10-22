const { groupCache } = require('../../utils/cache');
const { resolveTarget, checkAdminStatus } = require('../../utils/jidResolver');

module.exports = {
  name: 'promote',
  aliases: ['promote', 'promover', 'adm', 'admin', 'daradm'],
  description: 'Promove membro a Administrador do grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const targetData = await resolveTarget(sock, msg, from, text);
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

      return reply(t('promote.success', { user: targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    } catch (err) {
      return reply(t('common.error'));
    }
  }
};
