const { getGroupMetadata, cleanJid, resolveParticipant, getBotIdentity } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const { pickWinners } = require('../../utils/raffle');

module.exports = {
  name: 'sortear',
  aliases: ['sortear', 'sorteio', 'sorteo', 'raffle', 'draw', 'ganhador'],
  usage: 'sortear [qtd] [prêmio]',
  description: 'Sorteio rápido e justo entre os membros do grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, from, args, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    // Busca metadados atualizados com fallback direto para a API do WhatsApp
    let metadata = await getGroupMetadata(sock, from);
    if (!metadata || !Array.isArray(metadata.participants) || metadata.participants.length <= 1) {
      try {
        metadata = await sock.groupMetadata(from);
        if (metadata) groupCache.set(from, metadata);
      } catch (_) {}
    }

    if (!metadata || !Array.isArray(metadata.participants)) {
      return reply(t('common.error'));
    }

    // Identifica o bot para exclusão automática (tanto por Phone quanto por LID)
    const { botJid, botLid, botNum } = getBotIdentity(sock);

    // 1. Tenta filtrar apenas membros comuns (exclui o bot e administradores para sorteios normais)
    let pool = metadata.participants.filter(p => {
      const pId = cleanJid(p.id);
      const pLid = p.lid ? cleanJid(p.lid) : '';
      const pJid = p.jid ? cleanJid(p.jid) : '';
      const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');

      if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
      if (p.admin === 'admin' || p.admin === 'superadmin') return false;
      return true;
    });

    // 2. Se todos no grupo forem administradores (ex: grupo de equipe ou grupo de testes),
    // sorteia entre todos os participantes reais do grupo, excluindo apenas o próprio bot!
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
      return reply(t('raffle.not_enough'));
    }

    // Parsing da quantidade e do prêmio
    let count = 1;
    let prize = 'Prêmio do Grupo';

    if (args.length > 0) {
      const firstArgNum = parseInt(args[0], 10);
      if (!isNaN(firstArgNum) && firstArgNum > 0) {
        count = Math.min(firstArgNum, pool.length);
        const prizePart = args.slice(1).join(' ').trim();
        if (prizePart) prize = prizePart;
      } else {
        prize = args.join(' ').trim();
      }
    }

    if (!prize) {
      prize = 'Prêmio do Grupo';
    }

    // Sorteia os vencedores com Fisher-Yates uniforme (sem viés estatístico)
    const winners = pickWinners(pool, count);
    const mentionsSet = new Set();
    let winnersText = '';

    for (let idx = 0; idx < winners.length; idx++) {
      const w = winners[idx];
      let displayNum = '';
      const resolved = await resolveParticipant(sock, from, w.id);

      const phoneJid = resolved?.phoneJid || (w.id?.endsWith('@s.whatsapp.net') ? cleanJid(w.id) : null);
      const groupJidTarget = resolved?.groupJid || cleanJid(w.id);

      if (groupJidTarget) mentionsSet.add(groupJidTarget);
      if (phoneJid) mentionsSet.add(phoneJid);
      if (w.lid) mentionsSet.add(cleanJid(w.lid));
      if (w.jid) mentionsSet.add(cleanJid(w.jid));

      displayNum = resolved?.displayNum || (phoneJid ? phoneJid.replace(/@.*$/, '').replace(/\D/g, '') : cleanJid(w.id).replace(/@.*$/, '').replace(/\D/g, ''));

      winnersText += `🏅 *${idx + 1}º Lugar:* @${displayNum}\n`;
    }

    let result = `${t('raffle.title')}\n\n`;
    result += `${t('raffle.prize', { prize })}\n\n`;
    result += `${t('raffle.winners', { winners: winnersText })}`;

    return reply(result, { mentions: Array.from(mentionsSet) });
  }
};
