const { getAggregateVotesInPollMessage, updateMessageWithPollUpdate } = require('@whiskeysockets/baileys');
const logger = require('./logger');

/**
 * Gerenciador e agregador em memória de enquetes ativas e seus votos
 * Totalmente determinístico (Zero IA / Zero chamadas externas)
 */
class PollTracker {
  constructor() {
    /** @type {Map<string, object>} pollId -> WAMessage da criação da enquete */
    this.polls = new Map();
    /** @type {Map<string, string>} groupJid -> último pollId */
    this.latestByGroup = new Map();
    this.MAX_POLLS = 100;
  }

  /**
   * Salva a mensagem de criação de uma enquete
   * @param {string} groupJid 
   * @param {object} pollMsg WAMessage retornada pelo sock.sendMessage
   */
  savePoll(groupJid, pollMsg) {
    if (!pollMsg?.key?.id || !pollMsg.message) return;
    const pollId = pollMsg.key.id;

    if (!this.polls.has(pollId) && this.polls.size >= this.MAX_POLLS) {
      const oldestId = this.polls.keys().next().value;
      if (oldestId) this.polls.delete(oldestId);
    }

    // Inicializa estrutura com array de pollUpdates vazio
    const stored = {
      key: pollMsg.key,
      message: pollMsg.message,
      pollUpdates: []
    };

    this.polls.set(pollId, stored);
    if (groupJid) {
      this.latestByGroup.set(groupJid, pollId);
    }

    logger.debug({ pollId, groupJid }, 'Enquete registrada no pollTracker');
  }

  /**
   * Obtém o objeto da mensagem da enquete pelo ID (usado também pelo getMessage do Baileys)
   * @param {string} pollId 
   * @returns {object|null}
   */
  getPoll(pollId) {
    if (!pollId) return null;
    return this.polls.get(pollId) || null;
  }

  /**
   * Processa atualizações de votos de enquete recebidas via messages.update
   * @param {object} key Key da mensagem de criação da enquete
   * @param {Array<object>} pollUpdates Array de votos
   * @param {string} meId JID do bot
   */
  handlePollUpdate(key, pollUpdates, meId) {
    if (!key?.id || !Array.isArray(pollUpdates)) return;
    const pollId = key.id;
    const stored = this.polls.get(pollId);
    if (!stored) return;

    try {
      for (const update of pollUpdates) {
        updateMessageWithPollUpdate(stored, update);
      }
      logger.debug({ pollId, count: pollUpdates.length }, 'Votos de enquete agregados com sucesso');
    } catch (err) {
      logger.warn({ err, pollId }, 'Falha ao agregar votos na enquete');
    }
  }

  /**
   * Retorna os resultados agregados da enquete mais recente ou de um ID específico
   * @param {string} groupJid 
   * @param {string} [pollId] 
   * @param {string} [meId] 
   * @returns {{ title: string, pollId: string, options: Array<{ name: string, votes: number }>, totalVotes: number, winner: { name: string, votes: number }|null, summary: string }|null}
   */
  getPollResults(groupJid, pollId = null, meId = '') {
    const targetId = pollId || this.latestByGroup.get(groupJid);
    if (!targetId) return null;

    const stored = this.polls.get(targetId);
    if (!stored?.message) return null;

    const creation = stored.message.pollCreationMessage ||
                     stored.message.pollCreationMessageV2 ||
                     stored.message.pollCreationMessageV3;

    if (!creation) return null;

    const title = creation.name || 'Enquete';

    try {
      const aggregates = getAggregateVotesInPollMessage(
        { message: stored.message, pollUpdates: stored.pollUpdates },
        meId
      );

      let totalVotes = 0;
      let winner = null;

      const options = aggregates.map(opt => {
        const votes = Array.isArray(opt.voters) ? opt.voters.length : 0;
        totalVotes += votes;
        const item = { name: opt.name, votes };
        if (!winner || votes > winner.votes) {
          winner = item;
        } else if (winner && votes === winner.votes && votes > 0) {
          winner.isTie = true;
        }
        return item;
      });

      const optionsSummary = options.map(o => `"${o.name}": ${o.votes} voto(s)`).join(' | ');

      return {
        title,
        pollId: targetId,
        options,
        totalVotes,
        winner: (winner && winner.votes > 0 && !winner.isTie) ? winner : null,
        isTie: Boolean(winner?.isTie),
        summary: optionsSummary
      };
    } catch (err) {
      logger.warn({ err, targetId }, 'Erro ao calcular votos da enquete');
      return null;
    }
  }
}

module.exports = new PollTracker();
