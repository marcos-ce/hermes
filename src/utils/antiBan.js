const { cooldownCache, groupCache } = require('./cache');
const { cleanJid } = require('./jidResolver');
const logger = require('./logger');
const settings = require('../config/settings');

/**
 * Aguarda um período em milissegundos
 * @param {number} ms 
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retorna um número inteiro aleatório entre min e max (inclusive)
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Aguarda um atraso aleatório (Jitter) entre min e max
 * @param {number} min 
 * @param {number} max 
 * @returns {Promise<void>}
 */
async function randomDelay(min = 300, max = 700) {
  const ms = randomInt(min, max);
  await sleep(ms);
}

/**
 * Envia mensagem simulando digitação humana realista, atraso de leitura e modo furtivo.
 * @param {object} sock Instância do Baileys
 * @param {string} jid Destino
 * @param {string|object} content Texto ou payload Baileys (ex: { text: 'Olá' })
 * @param {object} options Opções de envio do Baileys (ex: { quoted: msg })
 * @returns {Promise<object>} Mensagem enviada
 */
async function sendSafeMessage(sock, jid, content, options = {}) {
  if (!sock || !jid) return null;

  // 🛡️ BLINDAGEM ANTI-BAN RIGOROSA: NUNCA enviar mensagens no privado (DM) de membros comuns
  // Mensagens privadas não solicitadas para membros (ex: aviso de regras, warns, punições)
  // geram denúncias de spam e bloqueios imediatos da Meta.
  // O bot só envia mensagens no privado para o Dono (isOwner)
  // ou para usuários comuns se o privado estiver expressamente ativado (!pv on) E for resposta direta a uma mensagem (quoted).
  const isGroup = jid.endsWith('@g.us');
  if (!isGroup) {
    const isOwnerTarget = settings.isOwner(jid, sock);
    if (!isOwnerTarget) {
      const configManager = require('../core/configManager');
      if (!configManager.isPrivateEnabled() || !options.quoted) {
        logger.warn({ jid }, '[antiBan] Mensagem privada cancelada: proibido enviar DMs para membros comuns.');
        return null;
      }
    }
  }

  const payload = typeof content === 'string' ? { text: content } : { ...content };
  const rawText = payload.text || payload.caption || '';

  // Garante que menções passadas em options sejam incluídas no payload do Baileys
  if (options.mentions && !payload.mentions) {
    payload.mentions = options.mentions;
  }

  // 1. Atraso inicial de leitura humana (300ms a 700ms)
  await randomDelay(300, 700);

  // 1b. Confirmação de Leitura Cirúrgica Anti-Ban:
  // Marca como lida exclusivamente a mensagem a que o bot está respondendo (evita flood no grupo e simula humano abrindo o chat)
  if (settings.markReadOnReply && options.markAsRead !== false) {
    const targetKey = options.quoted?.key || (options.key?.id ? options.key : null);
    if (targetKey?.id && !targetKey.fromMe && typeof sock.readMessages === 'function') {
      sock.readMessages([targetKey]).catch(() => {});
    }
  }

  // 2. Simulação de "Digitando..." proporcional ao tamanho do texto
  if (rawText.length > 0) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
    } catch (_) {}

    const typingDuration = Math.min(Math.max(rawText.length * 12, 600), 2200) + randomInt(100, 400);
    await sleep(typingDuration);

    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch (_) {}
  }

  // 3. Disparo da mensagem com garantia de restauração da presença
  try {
    const sent = await sock.sendMessage(jid, payload, options);
    if (sent?.key?.id && sent?.message) {
      try {
        const { storeMsgForRetry } = require('../core/connection');
        storeMsgForRetry(sent);
      } catch (_) {}
    }
    try {
      await sock.sendPresenceUpdate('unavailable');
    } catch (_) {}
    return sent;
  } catch (err) {
    try {
      await sock.sendPresenceUpdate('unavailable');
    } catch (_) {}
    throw err;
  }
}

/**
 * Ação de Emergência (Zero Delay): Apagar mensagem imediatamente
 * Compatível com mensagens próprias do bot e mensagens de outros membros em grupos (Admin Revoke).
 * Suporta fallbackParticipants (@lid vs @s.whatsapp.net vs raw) e sanitização de :device
 * para garantir que a revogação seja processada pelo WhatsApp mesmo com identificadores alternativos.
 * @param {object} sock Instância do Baileys
 * @param {string} jid JID do destino (grupo ou chat)
 * @param {object} key Objeto msg.key da mensagem
 * @param {string|string[]} [fallbackParticipants=[]] Identificadores alternativos do remetente
 * @returns {Promise<boolean>} Retorna true se a instrução de exclusão foi despachada com sucesso
 */
async function safeDelete(sock, jid, key, fallbackParticipants = []) {
  if (!sock || !jid || !key) return false;

  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us');
  const botJid = cleanJid(sock?.user?.id || '');
  const botLid = cleanJid(sock?.user?.lid || '');
  const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  let isFromMe = key.fromMe;
  if (isFromMe === undefined) {
    if (key.participant) {
      const p = cleanJid(key.participant);
      const pNum = p.replace(/@.*$/, '').replace(/\D/g, '');
      isFromMe = (botJid && p === botJid) || (botLid && p === botLid) || (botNum && pNum === botNum);
    } else {
      isFromMe = true;
    }
  }

  // 1. Mensagem enviada pelo próprio bot
  if (isFromMe) {
    const cleanKey = {
      remoteJid: key.remoteJid || jid,
      id: key.id,
      fromMe: true
    };
    if (isGroup) {
      cleanKey.participant = botJid || botLid;
    }
    try {
      await sock.sendMessage(jid, { delete: cleanKey });
      return true;
    } catch (err) {
      logger.warn({ err: err?.message, jid, id: key.id }, 'safeDelete: Falha ao deletar mensagem própria');
      return false;
    }
  }

  // 2. Mensagem de terceiros em grupo (Admin Revoke)
  // Monta lista de candidatos a participant em ordem de prioridade
  const candidates = [];
  const addCandidate = (cand) => {
    if (!cand || typeof cand !== 'string') return;
    const trimmed = cand.trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
    const clean = cleanJid(trimmed);
    if (clean && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  addCandidate(key.participant);
  if (Array.isArray(fallbackParticipants)) {
    fallbackParticipants.forEach(addCandidate);
  } else if (typeof fallbackParticipants === 'string') {
    addCandidate(fallbackParticipants);
  }

  // Se nenhum participante foi identificado, tenta sem participant como último recurso
  if (candidates.length === 0) {
    candidates.push(undefined);
  }

  let deleted = false;
  for (const participant of candidates) {
    try {
      const targetKey = {
        remoteJid: key.remoteJid || jid,
        id: key.id,
        fromMe: false
      };
      if (participant) {
        targetKey.participant = participant;
      }
      await sock.sendMessage(jid, { delete: targetKey });
      deleted = true;
      break;
    } catch (err) {
      logger.warn({ err: err?.message, jid, id: key.id, participant }, 'safeDelete: Tentativa de admin revoke falhou para candidato');
    }
  }

  return deleted;
}

/**
 * Ação de Emergência (Zero Delay): Expulsar participante imediatamente
 * Suporta múltiplos identificadores de fallback (@lid vs @s.whatsapp.net vs raw)
 * e valida o status 200 retornado pelo WhatsApp/Baileys.
 * @param {object} sock Instância do Baileys
 * @param {string} jid JID do grupo (@g.us)
 * @param {string|string[]} participants JID(s) principais do alvo
 * @param {string|string[]} [fallbackJids=[]] JIDs alternativos em caso de recusa (ex: @lid ou telefone)
 * @returns {Promise<boolean>} Retorna true se a remoção foi confirmada com sucesso pelo WhatsApp
 */
async function safeKick(sock, jid, participants, fallbackJids = []) {
  if (!sock || !jid || !participants) return false;

  const primaryList = (Array.isArray(participants) ? participants : [participants]).filter(Boolean);
  if (primaryList.length === 0) return false;

  const isSuccess = (result) => {
    if (!result) return false;
    const list = Array.isArray(result) ? result : [result];
    if (list.length === 0) return false;
    return list.some(item => item && String(item.status) === '200');
  };

  // 1. Tenta com a lista de JIDs primários
  try {
    const res = await sock.groupParticipantsUpdate(jid, primaryList, 'remove');
    if (isSuccess(res)) {
      return true;
    }
    logger.warn({ jid, primaryList, res }, 'safeKick: Tentativa primária não retornou status 200');
  } catch (err) {
    logger.warn({ err, jid, primaryList }, 'safeKick: Erro na chamada primária de groupParticipantsUpdate');
  }

  // 2. Se falhou e existem JIDs alternativos (ex: @lid, telefone, rawParticipant), tenta cada um como fallback
  const altCandidates = (Array.isArray(fallbackJids) ? fallbackJids : [fallbackJids])
    .filter(j => Boolean(j) && !primaryList.includes(j));

  for (const altJid of altCandidates) {
    try {
      const resAlt = await sock.groupParticipantsUpdate(jid, [altJid], 'remove');
      if (isSuccess(resAlt)) {
        logger.info({ jid, altJid }, 'safeKick: Participante removido com sucesso via fallback de JID');
        return true;
      }
    } catch (errAlt) {
      logger.warn({ err: errAlt, jid, altJid }, 'safeKick: Falha na tentativa de fallback');
    }
  }

  return false;
}

/**
 * Rate-limit de comandos por usuário (Cooldown Anti-Spam)
 * @param {string} sender JID do remetente
 * @param {number} cooldownMs Tempo de cooldown (padrão: 2000ms)
 * @returns {boolean} Retorna true se estiver EM COOLDOWN (bloqueado), false se liberado
 */
function checkCooldown(sender, cooldownMs = 2000) {
  if (!sender) return false;
  
  if (cooldownCache.has(sender)) {
    return true; // Bloqueia execução duplicada
  }

  const ttlSecs = Math.max(Math.ceil(cooldownMs / 1000), 2);
  cooldownCache.set(sender, Date.now(), ttlSecs);
  return false; // Permitido
}

/**
 * Fila global sequencial para saídas de grupos (Anti-Ban & Movimento Humano)
 * Impede saídas em lote/simultâneas que acionam gatilhos de automação na Meta.
 */
class LeaveQueue {
  constructor() {
    this.queue = [];
    this.running = false;
    this.pendingJids = new Set();
  }

  enqueue(sock, groupJid, reason = '') {
    if (!sock || !groupJid || !groupJid.endsWith('@g.us')) return Promise.resolve(false);
    if (this.pendingJids.has(groupJid)) {
      logger.debug({ groupJid }, 'safeGroupLeave: Saída já agendada na fila para este grupo');
      return Promise.resolve(true);
    }
    this.pendingJids.add(groupJid);

    return new Promise((resolve) => {
      this.queue.push({ sock, groupJid, reason, resolve });
      this._process();
    });
  }

  async _process() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        const { sock, groupJid, reason, resolve } = item;

        try {
          // 1. Simula comportamento humano pré-saída:
          // Aguarda de 2500ms a 5000ms (tempo de um humano abrir o chat, acessar dados do grupo e clicar em sair)
          await randomDelay(2500, 5000);

          try {
            await sock.sendPresenceUpdate('unavailable');
          } catch (_) {}

          // 2. Executa a saída oficial do grupo
          await sock.groupLeave(groupJid);
          logger.info({ groupJid, reason }, 'safeGroupLeave: Bot saiu do grupo com sucesso (movimento humano simulado)');

          // 3. Atualiza o estado em configManager e invalida cache
          try {
            const configManager = require('../core/configManager');
            const grp = configManager.getGroup(groupJid);
            if (grp) {
              grp.leftAt = Date.now();
              grp.enabled = false;
              configManager.flushSync();
            }
            groupCache.del(groupJid);
          } catch (_) {}

          resolve(true);
        } catch (err) {
          const msg = String(err?.message || err);
          const isAlreadyGone = /not.?in|forbidden|item-not-found|not-authorized|403|404/i.test(msg);
          if (isAlreadyGone) {
            logger.info({ groupJid, msg }, 'safeGroupLeave: Bot já não estava no grupo ou grupo foi removido');
            try {
              const configManager = require('../core/configManager');
              const grp = configManager.getGroup(groupJid);
              if (grp) {
                grp.leftAt = Date.now();
                grp.enabled = false;
                configManager.flushSync();
              }
              groupCache.del(groupJid);
            } catch (_) {}
            resolve(true);
          } else {
            logger.warn({ err: msg, groupJid }, 'safeGroupLeave: Falha ao sair do grupo');
            resolve(false);
          }
        } finally {
          this.pendingJids.delete(groupJid);
          try {
            await sock.sendPresenceUpdate('unavailable');
          } catch (_) {}
        }

        // 4. Jitter humano de intervalo entre saídas (Anti-Burst):
        // Se ainda houver outros grupos na fila de saída, aguarda de 4000ms a 8000ms entre uma saída e outra
        if (this.queue.length > 0) {
          await randomDelay(4000, 8000);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

const leaveQueueInstance = new LeaveQueue();

/**
 * Saída Segura de Grupos com Blindagem Anti-Ban e Movimento Humano.
 * Roteia a saída através de uma fila sequencial única com Jitter delay e intervalo entre saídas.
 * @param {object} sock Instância do Baileys
 * @param {string} groupJid JID do grupo (@g.us)
 * @param {string} [reason=''] Motivo do log
 * @returns {Promise<boolean>}
 */
function safeGroupLeave(sock, groupJid, reason = '') {
  return leaveQueueInstance.enqueue(sock, groupJid, reason);
}

module.exports = {
  sleep,
  randomInt,
  randomDelay,
  sendSafeMessage,
  safeDelete,
  safeKick,
  safeGroupLeave,
  checkCooldown
};
