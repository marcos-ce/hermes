const { groupCache } = require('../../utils/cache');
const { extractTarget, checkAdminStatus } = require('../../utils/jidResolver');

module.exports = {
  name: 'promote',
  aliases: ['promote', 'promover', 'adm', 'admin', 'daradm'],
  description: 'Promove membro a Administrador do grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const target = extractTarget(msg, text);
    if (!target) {
      return reply(t('common.not_found_target'));
    }

    const adminCheck = await checkAdminStatus(sock, from, target);
    if (adminCheck.isAdmin) {
      return reply(t('promote.already_admin'));
    }

    try {
      await sock.groupParticipantsUpdate(from, [target], 'promote');
      groupCache.del(from); // Invalida o cache

      const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');
      return reply(t('promote.success', { user: targetNum }), {
        mentions: [target]
      });
    } catch (err) {
      return reply(t('common.error'));
    }
  }
};
