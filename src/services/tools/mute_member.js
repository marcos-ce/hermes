const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const { checkAdminStatus, getBotIdentity } = require('../../utils/jidResolver');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { parseDuration } = require('../timeParser');
const { t } = require('../../utils/i18n');

module.exports = async function muteMember({ sock, msg, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: false, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  const { botJid, botLid, botNum } = getBotIdentity(sock);

  if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
    return { success: false, error: t(lang, 'mutemember.cannot_mute_bot') };
  }

  if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
    return { success: false, error: t(lang, 'mutemember.cannot_mute_owner') };
  }

  const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
  if (targetAdminCheck.isAdmin) {
    return { success: false, error: t(lang, 'mutemember.cannot_mute_admin') };
  }

  let parsedDuration = parseDuration(args.duration);
  if (!parsedDuration) {
    parsedDuration = { minutes: 15, ms: 15 * 60 * 1000, formatted: '15m' };
  }

  const reason = args.reason ? String(args.reason).trim() : '';
  const until = Date.now() + parsedDuration.ms;

  configManager.muteMember(from, targetData.phoneJid, until, reason, sender);

  const adminNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
  const adminText = `\n👮 *Por:* @${adminNum}`;
  const reasonText = reason ? `\n📝 *Motivo:* ${reason}` : '';

  const muteMsg = t(lang, 'mutemember.muted', {
    user: formatUserDisplay(from, targetData),
    duration: parsedDuration.formatted,
    admin: adminText,
    reason: reasonText
  });

  return {
    success: true,
    message: muteMsg,
    mentions: [targetData.groupJid, sender]
  };
};
