const configManager = require('../../core/configManager');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function unwarnMember({ sock, msg, from, lang, args }) {
  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: false, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
  const maxWarns = warnCfg.maxWarns || 3;
  const remaining = configManager.removeWarn(from, targetData.phoneJid);

  return {
    success: true,
    message: t(lang, 'warn.removed', { user: formatUserDisplay(from, targetData), warns: remaining, max: maxWarns }),
    mentions: [targetData.groupJid]
  };
};
