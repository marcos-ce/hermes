const configManager = require('../../core/configManager');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function unmuteMember({ sock, msg, from, lang, args }) {
  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: false, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  const isMuted = configManager.isMemberMuted(from, targetData.phoneJid);
  if (!isMuted) {
    return {
      success: true,
      message: t(lang, 'mutemember.not_muted', { user: formatUserDisplay(from, targetData) }),
      mentions: [targetData.groupJid]
    };
  }

  configManager.unmuteMember(from, targetData.phoneJid);
  return {
    success: true,
    message: t(lang, 'mutemember.unmuted', { user: formatUserDisplay(from, targetData) }),
    mentions: [targetData.groupJid]
  };
};
