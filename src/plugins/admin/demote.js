const { groupCache } = require('../../utils/cache');
const { extractTarget, checkAdminStatus } = require('../../utils/jidResolver');
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

    const target = extractTarget(msg, text);
    if (!target) {
      return reply(t('common.not_found_target'));
    }

    if (settings.isOwner(target, sock)) {
      return reply(t('demote.cannot_demote_owner'));
    }

    const adminCheck = await checkAdminStatus(sock, from, target);
    if (!adminCheck.isAdmin) {
      return reply(t('demote.already_member'));
    }

    try {
      await sock.groupParticipantsUpdate(from, [target], 'demote');
      groupCache.del(from); // Invalida o cache

      const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');
      return reply(t('demote.success', { user: targetNum }), {
        mentions: [target]
      });
    } catch (err) {
      return reply(t('common.error'));
    }
  }
};
