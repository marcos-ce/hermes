const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function getGroupInviteLink({ sock, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const action = args.action || 'get';
  try {
    if (action === 'revoke') {
      const code = await sock.groupRevokeInvite(from);
      return {
        success: true,
        message: t(lang, 'link.revoked', { code })
      };
    }

    const code = await sock.groupInviteCode(from);
    return {
      success: true,
      message: t(lang, 'link.success', { code })
    };
  } catch (err) {
    logger.error({ err, from, action }, 'Erro ao obter/revogar link de convite via Hermes');
    return { success: false, error: t(lang, 'link.error') };
  }
};
