const { getGroupMetadata } = require('../../utils/jidResolver');
const settings = require('../../config/settings');

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

    // Identifica o bot para exclusão automática
    const botNum = sock?.user?.id?.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    // Filtra apenas membros comuns (exclui bot e admins por padrão para sorteios justos)
    const eligibleMembers = metadata.participants.filter(p => {
      const pNum = p.id.replace(/@.*$/, '').replace(/\D/g, '');
      if (pNum === botNum) return false;
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
    const mentions = winners.map(w => w.id);

    let winnersText = '';
    winners.forEach((w, idx) => {
      const num = w.id.replace(/@.*$/, '').replace(/\D/g, '');
      winnersText += `🏅 *${idx + 1}º Lugar:* @${num}\n`;
    });

    let result = `${t('raffle.title')}\n\n`;
    result += `${t('raffle.prize', { prize })}\n\n`;
    result += `${t('raffle.winners', { winners: winnersText })}`;

    return reply(result, { mentions });
  }
};
