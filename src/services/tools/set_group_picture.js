const configManager = require('../../core/configManager');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function setGroupPicture({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const action = args.action || 'update';
  if (action === 'remove') {
    try {
      await sock.removeProfilePicture(from);
      return {
        success: true,
        message: t(lang, 'setpic.cleared')
      };
    } catch (err) {
      logger.error({ err, from }, 'Erro ao remover foto do grupo via Hermes');
      return { success: false, error: t(lang, 'setpic.error') };
    }
  }

  const setpicPlugin = require('../../plugins/admin/setpic');
  const buffer = await setpicPlugin.extractImageBuffer(sock, msg);
  if (!buffer) {
    return {
      success: false,
      error: t(lang, 'setpic.no_image', { prefix: configManager.getGroupPrefix(from) || '!' })
    };
  }

  try {
    await sock.updateProfilePicture(from, buffer);
    return {
      success: true,
      message: t(lang, 'setpic.success')
    };
  } catch (err) {
    logger.error({ err, from }, 'Erro ao atualizar foto do grupo via Hermes');
    return { success: false, error: t(lang, 'setpic.error') };
  }
};
