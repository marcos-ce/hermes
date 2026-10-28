const settings = require('../../config/settings');
const { checkAdminStatus } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function demoteMember({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: false, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
    return { success: false, error: t(lang, 'demote.cannot_demote_owner') };
  }

  const check = await checkAdminStatus(sock, from, targetData.phoneJid);
  if (!check.isAdmin) {
    return { success: false, error: t(lang, 'demote.already_member') };
  }

  await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'demote');
  groupCache.del(from);

  return {
    success: true,
    message: t(lang, 'demote.success', { user: formatUserDisplay(from, targetData) }),
    mentions: [targetData.groupJid]
  };
};
