const { sendSafeMessage } = require('../../utils/antiBan');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');

module.exports = async function hidetagAnnouncement({ sock, from, lang, args }) {
  const text = args.message;
  if (!text || text.trim().length === 0) {
    return { success: false, error: t(lang, 'hidetag.empty') };
  }

  const metadata = await getGroupMetadata(sock, from);
  if (!metadata || !Array.isArray(metadata.participants)) {
    return { success: false, error: t(lang, 'common.error') };
  }

  const allMembers = new Set();
  metadata.participants.forEach(p => {
    if (p.id) allMembers.add(p.id);
    if (p.jid) allMembers.add(p.jid);
    if (p.lid) allMembers.add(p.lid);
  });

  await sendSafeMessage(sock, from, {
    text: `📢 *COMUNICADO:*\n\n${text.trim()}`,
    mentions: Array.from(allMembers)
  });

  return { success: true };
};
