const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const { safeKick, safeDelete } = require('../../utils/antiBan');
const { checkAdminStatus, cleanJid, getBotIdentity } = require('../../utils/jidResolver');
const { resolveActionTarget } = require('../targetResolver');
const { formatUserDisplay } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function banMember({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  // Remoção só com alvo explícito: marcado (@) ou reply (nunca inferido pelo modelo)
  const targetRes = await resolveActionTarget(sock, msg, from, args.target, { requireExplicit: true, lang });
  if (!targetRes.success) {
    return { success: false, error: targetRes.error };
  }
  const targetData = targetRes.targetData;

  const { botJid, botLid, botNum } = getBotIdentity(sock);

  if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
    return { success: false, error: t(lang, 'ban.cannot_ban_bot') };
  }

  if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
    return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
  }

  const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
  if (targetAdminCheck.isAdmin) {
    return { success: false, error: t(lang, 'ban.cannot_ban_admin') };
  }

  const banCfg = configManager.getPluginConfig(from, 'ban') || {};
  if (banCfg.deleteMessage !== false) {
    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    const quotedStanzaId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant;
    if (quotedStanzaId && cleanJid(quotedParticipant) !== botJid && cleanJid(quotedParticipant) !== botLid) {
      await safeDelete(sock, from, {
        remoteJid: from,
        id: quotedStanzaId,
        participant: quotedParticipant
      });
    }
  }

  await safeKick(sock, from, targetData.groupJid);

  const banMessage =
    banCfg.customMessage && String(banCfg.customMessage).trim().length > 0 && banCfg.customMessage !== '.'
      ? String(banCfg.customMessage).replace(/\{user\}/gi, `@${formatUserDisplay(from, targetData)}`)
      : t(lang, 'ban.success', { user: formatUserDisplay(from, targetData) });

  return {
    success: true,
    message: banMessage,
    mentions: [targetData.groupJid]
  };
};
