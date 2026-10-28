const { getGroupMetadata, cleanJid, resolveParticipant } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');
const { pickWinners } = require('../../utils/raffle');
const { t } = require('../../utils/i18n');

module.exports = async function raffleMembers({ sock, from, lang, args }) {
  let metadata = await getGroupMetadata(sock, from);
  if (!metadata || !Array.isArray(metadata.participants)) {
    try {
      metadata = await sock.groupMetadata(from);
    } catch (_) {}
  }

  if (!metadata || !Array.isArray(metadata.participants) || metadata.participants.length <= 1) {
    return { success: false, error: t(lang, 'raffle.not_enough') };
  }

  const botJid = sock?.user?.id ? cleanJid(sock.user.id) : '';
  const botLid = sock?.user?.lid ? cleanJid(sock.user.lid) : '';
  const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  let pool = metadata.participants.filter(p => {
    const pId = cleanJid(p.id);
    const pLid = p.lid ? cleanJid(p.lid) : '';
    const pJid = p.jid ? cleanJid(p.jid) : '';
    const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');

    if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
    if (p.admin === 'admin' || p.admin === 'superadmin') return false;
    return true;
  });

  if (pool.length === 0) {
    pool = metadata.participants.filter(p => {
      const pId = cleanJid(p.id);
      const pLid = p.lid ? cleanJid(p.lid) : '';
      const pJid = p.jid ? cleanJid(p.jid) : '';
      const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');
      if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
      return true;
    });
  }

  if (pool.length === 0) {
    return { success: false, error: t(lang, 'raffle.not_enough') };
  }

  const count = Math.min(Math.max(parseInt(args.quantity, 10) || 1, 1), pool.length);
  const prize = args.prize || 'Sorteio do Grupo';

  const winners = pickWinners(pool, count);
  const mentions = [];
  let winnersText = '';

  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const resolved = await resolveParticipant(sock, from, w.id);
    const displayNum = resolved?.displayNum || cleanJid(w.id).replace(/@.*$/, '').replace(/\D/g, '');
    const targetGroup = resolved?.groupJid || cleanJid(w.id);
    mentions.push(targetGroup);
    winnersText += `🏅 *${i + 1}º Lugar:* @${displayNum}\n`;
  }

  const resultMsg = `${t(lang, 'raffle.title')}\n${t(lang, 'raffle.prize', { prize })}\n\n${t(lang, 'raffle.winners', { winners: winnersText })}`;
  await sendSafeMessage(sock, from, { text: resultMsg, mentions });

  return { success: true };
};
