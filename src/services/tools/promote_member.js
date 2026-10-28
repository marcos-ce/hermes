const { checkAdminStatus, checkGroupUpdateResult } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

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

  // Alvo precisa ser membro confirmado nos metadados do grupo
  if (!targetData || targetData.resolved === false) {
    return { success: false, error: t(lang, 'common.not_found_target') };
  }

  const check = await checkAdminStatus(sock, from, targetData.phoneJid || targetData.groupJid);
  if (check.isAdmin) {
    return { success: false, error: t(lang, 'promote.already_admin') };
  }

  try {
    const result = await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
    const { ok, failures } = checkGroupUpdateResult(result);
    groupCache.del(from);

    if (!ok) {
      logger.warn(
        {
          groupJid: from,
          targetJid: targetData.groupJid,
          failures
        },
        'promote_member: WhatsApp recusou a promoção'
      );
      return { success: false, error: t(lang, 'common.error') };
    }

    const mentions = [...new Set([targetData.groupJid, targetData.phoneJid].filter(Boolean))];
    return {
      success: true,
      message: t(lang, 'promote.success', { user: formatUserDisplay(from, targetData) }),
      mentions
    };
  } catch (err) {
    groupCache.del(from);
    logger.error(
      {
        err,
        groupJid: from,
        targetJid: targetData.groupJid
      },
      'promote_member: erro ao executar groupParticipantsUpdate'
    );
    return { success: false, error: t(lang, 'common.error') };
  }
};
