const { checkAdminStatus } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function promoteMember({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  // Trava de segurança obrigatória: só permite promover quem for marcado expressamente com @
  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicitMention: true, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  const check = await checkAdminStatus(sock, from, targetData.phoneJid);
  if (check.isAdmin) {
    return { success: false, error: t(lang, 'promote.already_admin') };
  }

  await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
  groupCache.del(from);

  return {
    success: true,
    message: t(lang, 'promote.success', { user: formatUserDisplay(from, targetData) }),
    mentions: [targetData.groupJid]
  };
};
