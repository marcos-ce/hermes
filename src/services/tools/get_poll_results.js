const pollTracker = require('../../utils/pollTracker');

module.exports = async function getPollResults({ from, args }) {
  const targetId = typeof args.pollId === 'string' ? args.pollId.trim() : null;
  const pollResults = pollTracker.getPollResults(from, targetId);
  if (!pollResults) {
    return {
      success: true,
      message: 'Nenhuma enquete recente com votos registrados foi encontrada neste grupo.'
    };
  }

  const winnerStr = pollResults.winner
    ? `🏆 Vencedor atual: "${pollResults.winner.name}" com ${pollResults.winner.votes} voto(s)`
    : (pollResults.isTie ? '⚖️ Empate entre as opções mais votadas' : 'Nenhum voto computado ainda');

  return {
    success: true,
    message: `📊 *Resultado da Enquete: "${pollResults.title}"*\n\n${pollResults.summary.split(' | ').map(s => `• ${s}`).join('\n')}\n\n${winnerStr}\n(Total de votos apurados: ${pollResults.totalVotes})`
  };
};
