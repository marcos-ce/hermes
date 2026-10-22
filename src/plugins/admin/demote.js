const { groupCache } = require('../../utils/cache');
const { resolveTarget, checkAdminStatus } = require('../../utils/jidResolver');
const settings = require('../../config/settings');

module.exports = {
  name: 'demote',
  aliases: ['demote', 'rebaixar', 'tiraradm', 'quitaradm', 'unadmin'],
  description: 'Rebaixa administrador a membro comum',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const targetData = await resolveTarget(sock, msg, from, text);
    if (!targetData) {
      return reply(t('common.not_found_target'));
    }

    if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
      return reply(t('demote.cannot_demote_owner'));
    }

    const adminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
    if (!adminCheck.isAdmin) {
      return reply(t('demote.already_member'));
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'demote');
      groupCache.del(from); // Invalida o cache

      return reply(t('demote.success', { user: targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    } catch (err) {
      return reply(t('common.error'));
    }
  }
};
