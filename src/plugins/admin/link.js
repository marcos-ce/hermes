const logger = require('../../utils/logger');

module.exports = {
  name: 'link',
  aliases: ['link', 'convite', 'invite', 'linkgrupo', 'grouplink', 'revogalink', 'resetlink'],
  usage: 'link [reset]',
  description: 'Obtém ou redefine o link oficial de convite do grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, from, args, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmdLower = (command || '').toLowerCase();
    const firstArg = (args[0] || '').toLowerCase();

    const isReset = ['revogalink', 'resetlink'].includes(cmdLower) || ['reset', 'revogar', 'renovar', 'new', 'novo'].includes(firstArg);

    try {
      if (isReset) {
        const code = await sock.groupRevokeInvite(from);
        return reply(t('link.revoked', { code }));
      }

      const code = await sock.groupInviteCode(from);
      return reply(t('link.success', { code }));
    } catch (err) {
      logger.error({ err, from, isReset }, 'Erro ao obter/revogar link de convite do grupo');
      return reply(t('link.error'));
    }
  }
};
