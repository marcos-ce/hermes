/**
 * Utilitário de Sorteio com Algoritmo Fisher-Yates (Sem viés estatístico)
 * Usado pelo comando !sortear (raffle.js), ferramenta de IA (toolRegistry.js)
 * e sorteios automáticos agendados (calendar.js).
 */

/**
 * Seleciona vencedores aleatórios de uma lista usando o algoritmo Fisher-Yates.
 * Garante distribuição probabilística uniforme e sem viés estatístico.
 * 
 * @template T
 * @param {Array<T>} pool Lista de participantes candidatos
 * @param {number} [count=1] Quantidade de vencedores a sortear
 * @returns {Array<T>} Lista dos participantes sorteados
 */
function pickWinners(pool, count = 1) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const k = Math.max(1, Math.min(parseInt(count, 10) || 1, pool.length));

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, k);
}

module.exports = {
  pickWinners
};
