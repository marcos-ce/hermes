const { getGroupMetadata, cleanJid } = require('../../utils/jidResolver');

module.exports = {
  name: 'sortear',
  aliases: ['sortear', 'sorteio', 'sorteo', 'raffle', 'draw', 'ganhador'],
  description: 'Sorteio rápido e justo entre os membros do grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, from, args, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const metadata = await getGroupMetadata(sock, from);
    if (!metadata || !Array.isArray(metadata.participants)) {
      return reply(t('common.error'));
    }

    // Identifica o bot para exclusão automática (tanto por Phone quanto por LID)
    const botJid = sock?.user?.id ? cleanJid(sock.user.id) : '';
    const botLid = sock?.user?.lid ? cleanJid(sock.user.lid) : '';
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    // Filtra apenas membros comuns (exclui bot e admins por padrão para sorteios justos)
    const eligibleMembers = metadata.participants.filter(p => {
      const pId = cleanJid(p.id);
      const pLid = p.lid ? cleanJid(p.lid) : '';
      const pJid = p.jid ? cleanJid(p.jid) : '';
      const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');

      if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
      if (p.admin === 'admin' || p.admin === 'superadmin') return false;
      return true;
    });

    if (eligibleMembers.length === 0) {
      return reply(t('raffle.not_enough'));
    }

    // Parsing da quantidade e do prêmio
    let count = 1;
    let prize = text;

    if (args.length > 0) {
      const firstArgNum = parseInt(args[0], 10);
      if (!isNaN(firstArgNum) && firstArgNum > 0) {
        count = Math.min(firstArgNum, eligibleMembers.length);
        prize = args.slice(1).join(' ').trim();
      }
    }

    if (!prize) {
      prize = 'Prêmio do Grupo';
    }

    // Embaralha com algoritmo Fisher-Yates
    const shuffled = [...eligibleMembers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const winners = shuffled.slice(0, count);
    const mentionsSet = new Set();
    let winnersText = '';

    winners.forEach((w, idx) => {
      if (w.id) mentionsSet.add(w.id);
      if (w.jid) mentionsSet.add(w.jid);
      if (w.lid) mentionsSet.add(w.lid);

      const realPhone = w.jid || (w.id?.endsWith('@s.whatsapp.net') ? w.id : null);
      const displayNum = realPhone ? realPhone.replace(/@.*$/, '').replace(/\D/g, '') : w.id.replace(/@.*$/, '');

      winnersText += `🏅 *${idx + 1}º Lugar:* @${displayNum}\n`;
    });

    let result = `${t('raffle.title')}\n\n`;
    result += `${t('raffle.prize', { prize })}\n\n`;
    result += `${t('raffle.winners', { winners: winnersText })}`;

    return reply(result, { mentions: Array.from(mentionsSet) });
  }
};
