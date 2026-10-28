const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const { safeKick } = require('../../utils/antiBan');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function manageBlacklist({ sock, msg, from, isBotAdmin, lang, args }) {
  const isRemove = args.action === 'remove';
  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: !isRemove, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  if (args.action === 'remove') {
    configManager.removeGroupBlacklist(from, targetData.phoneJid);
    return {
      success: true,
      message: t(lang, 'blacklist.removed', { user: formatUserDisplay(from, targetData) }),
      mentions: [targetData.groupJid]
    };
  }

  if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
    return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
  }

  configManager.addGroupBlacklist(from, targetData.phoneJid);
  if (isBotAdmin) {
    try {
      await safeKick(sock, from, targetData.groupJid);
    } catch (_) {}
  }

  return {
    success: true,
    message: t(lang, 'blacklist.added', { user: formatUserDisplay(from, targetData) }),
    mentions: [targetData.groupJid]
  };
};
