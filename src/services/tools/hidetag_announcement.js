const { sendSafeMessage } = require('../../utils/antiBan');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');

module.exports = async function hidetagAnnouncement({ sock, from, lang, args }) {
  const text = args.message;
  if (!text || text.trim().length === 0) {
    return { success: false, error: t(lang, 'hidetag.empty') };
  }

  // BLINDAGEM ANTI-BAN: Envia comunicado oficial em destaque visual SEM marcação em massa
  // de membros no array mentions, eliminando o vetor principal de banimento por spam da Meta.
  await sendSafeMessage(sock, from, {
    text: `📢 *COMUNICADO:*\n\n${text.trim()}`
  });

  return { success: true };
};
