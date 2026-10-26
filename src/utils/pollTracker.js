const {
  getAggregateVotesInPollMessage,
  updateMessageWithPollUpdate,
  decryptPollVote,
  getKeyAuthor,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { lidToPhoneMap, phoneToLidMap, cleanJid } = require('./jidResolver');

/**
 * Gerenciador, agregador e decriptador de enquetes ativas e seus votos no WhatsApp.
 * Totalmente determinístico (Zero IA / Zero chamadas externas).
 * Persistência atômica anti-perda em data/polls.json.
 */
class PollTracker {
  constructor() {
    /** @type {Map<string, object>} pollId -> WAMessage da criação da enquete */
    this.polls = new Map();
    /** @type {Map<string, string>} groupJid -> último pollId */
    this.latestByGroup = new Map();
    this.MAX_POLLS = 100;
    this.filePath = path.resolve(process.cwd(), 'data', 'polls.json');
    this.saveTimer = null;

    this.load();
  }

  /**
   * Carrega enquetes persistidas de data/polls.json restaurando Buffers de chaves
   */
  load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      if (!raw.trim()) return;

      const entries = JSON.parse(raw, (k, v) => {
        if (v && v.type === 'Buffer' && Array.isArray(v.data)) {
          return Buffer.from(v.data);
        }
        return v;
      });

      if (Array.isArray(entries)) {
        for (const [id, data] of entries) {
          if (id && data?.key && data?.message) {
            this.polls.set(id, data);
            const groupJid = data.key.remoteJid;
            if (groupJid && groupJid.endsWith('@g.us')) {
              this.latestByGroup.set(groupJid, id);
            }
          }
        }
        logger.debug({ count: this.polls.size }, 'Enquetes carregadas do disco com sucesso');
      }
    } catch (err) {
      logger.warn({ err }, 'Falha ao carregar enquetes salvas de data/polls.json');
    }
  }

  /**
   * Agenda gravação atômica em disco com debounce de 500ms
   */
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushAsync().catch(err => {
        logger.warn({ err }, 'Erro na gravação assíncrona de data/polls.json');
      });
    }, 500);
  }

  /**
   * Grava enquetes em data/polls.json de forma atômica (.tmp -> .json)
   */
  async flushAsync() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const tmpPath = `${this.filePath}.tmp`;
      const entries = Array.from(this.polls.entries());
      const data = JSON.stringify(entries, null, 2);

      await fs.promises.writeFile(tmpPath, data, 'utf-8');
      await fs.promises.rename(tmpPath, this.filePath);
    } catch (err) {
      logger.error({ err }, 'Erro ao persistir atomicamente data/polls.json');
    }
  }

  /**
   * Gravação síncrona de emergência no encerramento do processo
   */
  flushSync() {
    try {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp`;
      const entries = Array.from(this.polls.entries());
      const data = JSON.stringify(entries, null, 2);
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (_) {}
  }

  /**
   * Salva a mensagem de criação de uma enquete (enviada pelo bot ou por membros do grupo)
   * @param {string} groupJid 
   * @param {object} pollMsg WAMessage da criação da enquete
   */
  savePoll(groupJid, pollMsg) {
    if (!pollMsg?.key?.id || !pollMsg.message) return;
    const pollId = pollMsg.key.id;

    // Desencapsula mensagens efêmeras ou viewOnce preservando messageContextInfo (messageSecret)
    const rawMsg = pollMsg.message;
    const unwrapped = rawMsg?.ephemeralMessage?.message ||
                      rawMsg?.viewOnceMessage?.message ||
                      rawMsg?.viewOnceMessageV2?.message ||
                      rawMsg?.documentWithCaptionMessage?.message ||
                      rawMsg;

    const messageContextInfo = unwrapped?.messageContextInfo || rawMsg?.messageContextInfo;
    const storedMessage = {
      ...unwrapped,
      ...(messageContextInfo ? { messageContextInfo } : {})
    };

    const hasPollCreation = Boolean(
      storedMessage.pollCreationMessage ||
      storedMessage.pollCreationMessageV2 ||
      storedMessage.pollCreationMessageV3
    );

    if (!hasPollCreation) return;

    if (!this.polls.has(pollId) && this.polls.size >= this.MAX_POLLS) {
      const oldestId = this.polls.keys().next().value;
      if (oldestId) this.polls.delete(oldestId);
    }

    const existing = this.polls.get(pollId);
    const stored = {
      key: pollMsg.key,
      message: storedMessage,
      pollUpdates: existing?.pollUpdates || []
    };

    this.polls.set(pollId, stored);
    const targetGroup = groupJid || pollMsg.key.remoteJid;
    if (targetGroup && targetGroup.endsWith('@g.us')) {
      this.latestByGroup.set(targetGroup, pollId);
    }

    this.scheduleSave();
    logger.debug({ pollId, targetGroup }, 'Enquete registrada no pollTracker');
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
   * Processa voto recebido em tempo real via messages.upsert (pollUpdateMessage)
   * Decripta o payload criptografado com AES-GCM e chave HMAC conforme protocolo do WhatsApp.
   * @param {object} sock Instância do Baileys
   * @param {object} msg Mensagem do evento messages.upsert contendo pollUpdateMessage
   * @param {object} pollUpdate Conteúdo do pollUpdateMessage
   */
  async processIncomingVote(sock, msg, pollUpdate) {
    if (!pollUpdate?.pollCreationMessageKey || !pollUpdate.vote) return;

    const creationKey = pollUpdate.pollCreationMessageKey;
    const pollId = creationKey.id;
    if (!pollId) return;

    // 1. Busca a enquete de criação correspondente
    let stored = this.polls.get(pollId);
    if (!stored?.message) {
      logger.debug({ pollId }, 'Enquete não encontrada no cache para decriptar voto recebido');
      return;
    }

    // 2. Extrai a chave secreta da enquete (pollEncKey de 32 bytes)
    const pollMsg = stored.message;
    const pollEncKey = pollMsg.messageContextInfo?.messageSecret ||
                       stored.messageContextInfo?.messageSecret ||
                       pollMsg.pollCreationMessage?.pollEncKey ||
                       pollMsg.pollCreationMessageV2?.pollEncKey ||
                       pollMsg.pollCreationMessageV3?.pollEncKey;

    if (!pollEncKey) {
      logger.warn({ pollId }, 'Chave secreta (messageSecret) não encontrada para decriptar enquete');
      return;
    }

    // 3. Resolve candidatos para pollCreatorJid (compatível com LID e telefone)
    const meId = sock?.user?.id || '';
    const meLid = sock?.user?.lid || '';
    const meNormalized = jidNormalizedUser(meId);
    const meLidNormalized = jidNormalizedUser(meLid);

    const creatorCandidates = [];
    if (creationKey.fromMe) {
      if (meNormalized) creatorCandidates.push(meNormalized);
      if (meLidNormalized) creatorCandidates.push(meLidNormalized);
      if (meId && meId !== meNormalized) creatorCandidates.push(meId);
    } else {
      const author = getKeyAuthor(creationKey, meNormalized);
      if (author) {
        creatorCandidates.push(jidNormalizedUser(author), author);
      }
      if (creationKey.participant) {
        const pNorm = jidNormalizedUser(creationKey.participant);
        creatorCandidates.push(pNorm, creationKey.participant);
        const mappedPhone = lidToPhoneMap.get(creationKey.participant);
        if (mappedPhone) creatorCandidates.push(jidNormalizedUser(mappedPhone), mappedPhone);
        const mappedLid = phoneToLidMap.get(creationKey.participant);
        if (mappedLid) creatorCandidates.push(jidNormalizedUser(mappedLid), mappedLid);
      }
      if (creationKey.remoteJid) {
        creatorCandidates.push(jidNormalizedUser(creationKey.remoteJid), creationKey.remoteJid);
      }
    }
    const uniqueCreators = [...new Set(creatorCandidates.filter(Boolean))];

    // 4. Resolve candidatos para voterJid (compatível com @lid e @s.whatsapp.net)
    const rawVoter = msg.key?.participant || msg.participant || msg.key?.remoteJid || '';
    const voterCandidates = [];
    if (rawVoter) {
      const vNorm = jidNormalizedUser(rawVoter);
      voterCandidates.push(vNorm);
      if (rawVoter !== vNorm) voterCandidates.push(rawVoter);

      const mappedPhone = lidToPhoneMap.get(rawVoter);
      if (mappedPhone) voterCandidates.push(jidNormalizedUser(mappedPhone), mappedPhone);
      const mappedLid = phoneToLidMap.get(rawVoter);
      if (mappedLid) voterCandidates.push(jidNormalizedUser(mappedLid), mappedLid);
    }
    if (msg.key?.fromMe) {
      if (meNormalized) voterCandidates.push(meNormalized);
      if (meLidNormalized) voterCandidates.push(meLidNormalized);
    }
    const uniqueVoters = [...new Set(voterCandidates.filter(Boolean))];

    // 5. Executa decriptografia com tratamento de fallback
    let decryptedVote = null;
    let usedCreator = '';
    let usedVoter = '';

    for (const cCreator of uniqueCreators) {
      for (const cVoter of uniqueVoters) {
        try {
          decryptedVote = decryptPollVote(pollUpdate.vote, {
            pollEncKey,
            pollCreatorJid: cCreator,
            pollMsgId: pollId,
            voterJid: cVoter
          });
          if (decryptedVote) {
            usedCreator = cCreator;
            usedVoter = cVoter;
            break;
          }
        } catch (_) {}
      }
      if (decryptedVote) break;
    }

    if (!decryptedVote) {
      logger.warn({ pollId, rawVoter }, 'Falha ao decriptar voto de enquete (autenticação GCM falhou)');
      return;
    }

    // 6. Atualiza a mensagem da enquete com o voto agregado
    const senderTimestampMs = typeof pollUpdate.senderTimestampMs === 'object' && pollUpdate.senderTimestampMs?.toNumber
      ? pollUpdate.senderTimestampMs.toNumber()
      : Number(pollUpdate.senderTimestampMs) || Date.now();

    const updateObj = {
      pollUpdateMessageKey: msg.key,
      vote: decryptedVote,
      senderTimestampMs
    };

    try {
      updateMessageWithPollUpdate(stored, updateObj);
      this.scheduleSave();
      logger.info({
        pollId,
        voter: usedVoter,
        selectedCount: decryptedVote.selectedOptions?.length || 0
      }, 'Voto de enquete decriptado e computado com sucesso');
    } catch (err) {
      logger.warn({ err, pollId }, 'Erro ao agregar voto na enquete');
    }
  }

  /**
   * Processa atualizações de votos de enquete recebidas via messages.update (caso o Baileys emita)
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
      this.scheduleSave();
      logger.debug({ pollId, count: pollUpdates.length }, 'Votos de enquete agregados via messages.update');
    } catch (err) {
      logger.warn({ err, pollId }, 'Falha ao agregar votos na enquete');
    }
  }

  /**
   * Retorna os resultados agregados da enquete mais recente ou de um ID específico
   * @param {string} groupJid 
   * @param {string} [pollId] 
   * @param {string} [meId] 
   * @returns {{ title: string, pollId: string, options: Array<{ name: string, votes: number }>, totalVotes: number, winner: { name: string, votes: number }|null, isTie: boolean, summary: string }|null}
   */
  getPollResults(groupJid, pollId = null, meId = '') {
    let targetId = pollId || this.latestByGroup.get(groupJid);

    // Fallback: procura a enquete mais recente do grupo se não estiver no mapa latestByGroup
    if (!targetId && groupJid) {
      for (const [id, poll] of Array.from(this.polls.entries()).reverse()) {
        if (poll.key?.remoteJid === groupJid) {
          targetId = id;
          this.latestByGroup.set(groupJid, id);
          break;
        }
      }
    }

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
