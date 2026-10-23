const { cooldownCache } = require('./cache');
const { cleanJid } = require('./jidResolver');
const logger = require('./logger');

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

  const payload = typeof content === 'string' ? { text: content } : { ...content };
  const rawText = payload.text || payload.caption || '';

  // Garante que menções passadas em options sejam incluídas no payload do Baileys
  if (options.mentions && !payload.mentions) {
    payload.mentions = options.mentions;
  }

  // 1. Atraso inicial de leitura humana (300ms a 700ms)
  await randomDelay(300, 700);

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
 * Compatível com mensagens próprias do bot e mensagens de outros membros em grupos.
 * @param {object} sock 
 * @param {string} jid 
 * @param {object} key 
 */
async function safeDelete(sock, jid, key) {
  if (!sock || !jid || !key) return;

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

  // Clona e normaliza a chave
  const cleanKey = {
    remoteJid: key.remoteJid || jid,
    id: key.id,
    fromMe: Boolean(isFromMe)
  };

  if (key.participant) {
    cleanKey.participant = key.participant;
  } else if (isGroup && cleanKey.fromMe) {
    cleanKey.participant = botJid || botLid;
  }

  // 1. Tenta deletar normalmente com a chave preparada
  let deleted = false;
  try {
    await sock.sendMessage(jid, { delete: cleanKey });
    deleted = true;
  } catch (_) {}

  // 2. Se for em grupo e mensagem de terceiros, reforça com admin revoke caso necessário
  if (!deleted && isGroup && !cleanKey.fromMe) {
    try {
      const adminRevokeKey = {
        remoteJid: jid,
        id: key.id,
        fromMe: false,
        participant: cleanKey.participant
      };
      await sock.sendMessage(jid, { delete: adminRevokeKey });
    } catch (err) {
      logger.warn({ err, jid, key: cleanKey }, 'Falha no admin revoke de mensagem em grupo');
    }
  }
}

/**
 * Ação de Emergência (Zero Delay): Expulsar participante imediatamente
 * @param {object} sock 
 * @param {string} jid 
 * @param {string|string[]} participants 
 */
async function safeKick(sock, jid, participants) {
  if (!sock || !jid || !participants) return;
  const list = Array.isArray(participants) ? participants : [participants];
  try {
    await sock.groupParticipantsUpdate(jid, list, 'remove');
  } catch (err) {
    logger.warn({ err, jid, participants: list }, 'Falha ao remover participante no safeKick');
  }
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

module.exports = {
  sleep,
  randomInt,
  randomDelay,
  sendSafeMessage,
  safeDelete,
  safeKick,
  checkCooldown
};
