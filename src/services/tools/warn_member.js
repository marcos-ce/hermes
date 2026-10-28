const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const { safeKick } = require('../../utils/antiBan');
const { checkAdminStatus } = require('../../utils/jidResolver');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function warnMember({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: false, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
    return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
  }

  const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
  if (targetAdminCheck.isAdmin) {
    return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
  }

  const reason = args.reason || 'Comportamento inadequado';
  const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
  const maxWarns = warnCfg.maxWarns || 3;
  const count = configManager.addWarn(from, targetData.phoneJid, reason);

  if (count >= maxWarns) {
    await safeKick(sock, from, targetData.groupJid);
    configManager.resetWarns(from, targetData.phoneJid);
    return {
      success: true,
      message: t(lang, 'warn.max_reached', { user: formatUserDisplay(from, targetData), max: maxWarns }),
      mentions: [targetData.groupJid]
    };
  }

  return {
    success: true,
    message: t(lang, 'warn.added', { user: formatUserDisplay(from, targetData), reason, warns: count, max: maxWarns }),
    mentions: [targetData.groupJid]
  };
};
