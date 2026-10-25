const { groupCache } = require('./cache');
const settings = require('../config/settings');
const { getBr } = settings;

// Mapas bidirecionais em memória para resolução instantânea de @lid <-> @s.whatsapp.net
const lidToPhoneMap = new Map();
const phoneToLidMap = new Map();
const MAX_LID_CACHE = 10000;

/**
 * Registra mapeamento bidirecional LID <-> Phone com limite máximo em RAM (FIFO eviction)
 * @param {string} lid 
 * @param {string} phoneJid 
 */
function setLidMapping(lid, phoneJid) {
  if (!lid || !phoneJid) return;
  if (!lidToPhoneMap.has(lid) && lidToPhoneMap.size >= MAX_LID_CACHE) {
    const oldestLid = lidToPhoneMap.keys().next().value;
    if (oldestLid) {
      const oldestPhone = lidToPhoneMap.get(oldestLid);
      lidToPhoneMap.delete(oldestLid);
      if (oldestPhone) phoneToLidMap.delete(oldestPhone);
    }
  }
  lidToPhoneMap.set(lid, phoneJid);
  phoneToLidMap.set(phoneJid, lid);
}

/**
 * Normaliza um JID removendo sufixos de dispositivo (:1@s.whatsapp.net -> @s.whatsapp.net)
 * e limpando formatação.
 * @param {string} jid 
 * @returns {string}
 */
function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const [userPart, serverPart] = jid.split('@');
  if (!serverPart) return jid;
  const cleanUser = userPart.split(':')[0];
  return `${cleanUser}@${serverPart}`;
}

/**
 * Registra o mapeamento de um participante (LID <-> Phone)
 * @param {object} p 
 */
function registerParticipantLid(p) {
  if (!p) return;
  const pId = cleanJid(p.id || '');
  let pJid = p.jid ? cleanJid(p.jid) : null;
  const pLid = p.lid ? cleanJid(p.lid) : (pId.endsWith('@lid') ? pId : null);

  // Trata variações em que o telefone vem em atributos alternativos
  if (!pJid && p.phoneNumber) {
    const digits = String(p.phoneNumber).replace(/\D/g, '');
    if (digits.length >= 8) pJid = `${digits}@s.whatsapp.net`;
  }
  if (!pJid && p.phone_number) {
    const digits = String(p.phone_number).replace(/\D/g, '');
    if (digits.length >= 8) pJid = `${digits}@s.whatsapp.net`;
  }
  if (!pJid && pId.endsWith('@s.whatsapp.net')) {
    pJid = pId;
  }

  if (pJid && pLid) {
    setLidMapping(pLid, pJid);
  }
}

/**
 * Resolve o remetente real convertendo @lid em número de telefone (@s.whatsapp.net)
 * consultando os atributos do Baileys e metadados do grupo.
 * @param {object} sock 
 * @param {object} msg 
 * @returns {Promise<string>}
 */
async function resolveSender(sock, msg) {
  if (!msg || !msg.key) return '';
  const from = msg.key.remoteJid || '';
  let rawSender = msg.key.participant || msg.participant || from || '';
  rawSender = cleanJid(rawSender);

  // 1. Extração direta dos metadados de mensagem decodificada pelo Baileys
  // (Baileys v6 decodifica participant_pn e sender_pn diretamente na chave da mensagem)
  const directPn = msg.key?.participantPn || msg.key?.senderPn || msg?.participantPn || msg?.senderPn;
  const directLid = msg.key?.participantLid || msg.key?.senderLid || (rawSender.endsWith('@lid') ? rawSender : null);

  if (directPn && directLid) {
    const cleanPn = cleanJid(directPn);
    const cleanL = cleanJid(directLid);
    setLidMapping(cleanL, cleanPn);
    if (rawSender === cleanL) {
      return cleanPn;
    }
  }

  if (directPn && rawSender.endsWith('@lid')) {
    const cleanPn = cleanJid(directPn);
    setLidMapping(rawSender, cleanPn);
    return cleanPn;
  }

  // Se já for @s.whatsapp.net, retorna direto
  if (rawSender.endsWith('@s.whatsapp.net')) {
    return rawSender;
  }

  // Se for @lid, checa o mapa em RAM
  if (rawSender.endsWith('@lid')) {
    if (lidToPhoneMap.has(rawSender)) {
      return lidToPhoneMap.get(rawSender);
    }

    // Se a mensagem veio de um grupo, carrega metadados para mapear os LIDs
    if (from.endsWith('@g.us') && sock) {
      const metadata = await getGroupMetadata(sock, from);
      if (metadata && Array.isArray(metadata.participants)) {
        for (const p of metadata.participants) {
          registerParticipantLid(p);
        }
      }

      if (lidToPhoneMap.has(rawSender)) {
        return lidToPhoneMap.get(rawSender);
      }
    }
  }

  return rawSender;
}

/**
 * Extrai o remetente imediato (sem aguardar async)
 * @param {object} msg 
 * @returns {string}
 */
function extractSender(msg) {
  if (!msg || !msg.key) return '';
  const from = msg.key.remoteJid || '';

  const directPn = msg.key?.participantPn || msg.key?.senderPn || msg?.participantPn || msg?.senderPn;
  if (directPn) {
    return cleanJid(directPn);
  }
  
  if (from.endsWith('@g.us')) {
    const participant = msg.key.participant || msg.participant || '';
    const clean = cleanJid(participant);
    return lidToPhoneMap.get(clean) || clean;
  }
  
  const clean = cleanJid(from);
  return lidToPhoneMap.get(clean) || clean;
}

/**
 * Extrai o JID alvo da mensagem através de:
 * 1. Mensagem respondida (Quoted participant)
 * 2. Menção direta (@5511...)
 * 3. Número digitado no texto do comando
 * @param {object} msg 
 * @param {string} textArgs 
 * @returns {string|null}
 */
function extractTarget(msg, textArgs = '') {
  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo ||
                      msg?.message?.extendedTextMessage?.contextInfo;

  // 1. Mensagem respondida
  const quotedParticipant = 
    contextInfo?.participant ||
    contextInfo?.quotedMessage?.participant;
  
  if (quotedParticipant) {
    const clean = cleanJid(quotedParticipant);
    return lidToPhoneMap.get(clean) || clean;
  }

  // 2. Menção na mensagem
  const mentions = contextInfo?.mentionedJid || [];
  if (Array.isArray(mentions) && mentions.length > 0) {
    const clean = cleanJid(mentions[0]);
    return lidToPhoneMap.get(clean) || clean;
  }

  // 3. Extração por número de telefone digitado no texto
  if (textArgs && typeof textArgs === 'string') {
    const match = textArgs.match(/@?(\d{8,15})/);
    if (match && match[1]) {
      return `${match[1]}@s.whatsapp.net`;
    }
  }

  return null;
}

/**
 * Resolve o participante de forma assíncrona com suporte completo a @lid
 * @param {object} sock 
 * @param {string} groupJid 
 * @param {string} targetJid 
 * @returns {Promise<{ phoneJid: string, groupJid: string, displayNum: string }|null>}
 */
async function resolveParticipant(sock, groupJid, targetJid) {
  if (!targetJid) return null;
  const cleanTarget = cleanJid(targetJid);

  let phoneJid = cleanTarget.endsWith('@s.whatsapp.net') ? cleanTarget : (lidToPhoneMap.get(cleanTarget) || null);
  let groupParticipantJid = cleanTarget;
  let matchedName = null;

  if (groupJid && groupJid.endsWith('@g.us') && sock) {
    const targetNumber = cleanTarget.replace(/@.*$/, '').replace(/\D/g, '');
    const targetBr = getBr(targetNumber);

    const meta = await getGroupMetadata(sock, groupJid);
    if (meta && Array.isArray(meta.participants)) {
      for (const p of meta.participants) {
        registerParticipantLid(p);

        const pId = cleanJid(p.id);
        const pJid = p.jid ? cleanJid(p.jid) : (pId.endsWith('@s.whatsapp.net') ? pId : null);
        const pLid = p.lid ? cleanJid(p.lid) : (pId.endsWith('@lid') ? pId : null);
        const pNumber = (pJid || pId).replace(/@.*$/, '').replace(/\D/g, '');
        const pBr = getBr(pNumber);

        const isMatch = (pId === cleanTarget) || 
                        (pJid === cleanTarget) || 
                        (pLid === cleanTarget) ||
                        (targetNumber && pNumber && targetNumber === pNumber) ||
                        (targetBr.ddd && pBr.ddd && targetBr.ddd === pBr.ddd && targetBr.last8 === pBr.last8);

        if (isMatch) {
          groupParticipantJid = pId; // O JID exato que o grupo espera nas ações do Baileys
          if (pJid) phoneJid = pJid;
          if (p.notify || p.name) matchedName = p.notify || p.name;
          break;
        }
      }
    }
  }

  const finalPhoneJid = phoneJid || cleanTarget;
  const displayNum = finalPhoneJid.replace(/@.*$/, '').replace(/\D/g, '') || cleanTarget.replace(/@.*$/, '');
  const cleanName = (matchedName && !/^\d{8,15}$/.test(String(matchedName).trim())) ? String(matchedName).trim() : null;

  return {
    phoneJid: finalPhoneJid,
    groupJid: groupParticipantJid,
    displayNum,
    name: cleanName,
    displayUser: cleanName ? `${displayNum} (${cleanName})` : displayNum
  };
}

/**
 * Extrai e resolve o alvo da mensagem (Quote, Menção ou Número) convertendo @lid se necessário
 * @param {object} sock 
 * @param {object} msg 
 * @param {string} groupJid 
 * @param {string} textArgs 
 * @returns {Promise<{ phoneJid: string, groupJid: string, displayNum: string }|null>}
 */
async function resolveTarget(sock, msg, groupJid, textArgs = '') {
  const rawTarget = extractTarget(msg, textArgs);
  if (!rawTarget) return null;
  return await resolveParticipant(sock, groupJid, rawTarget);
}

/**
 * Extrai todas as menções presentes na mensagem ou argumentos
 * @param {object} msg 
 * @param {string} textArgs 
 * @returns {string[]}
 */
function extractAllTargets(msg, textArgs = '') {
  const targets = new Set();

  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo ||
                      msg?.message?.extendedTextMessage?.contextInfo;

  const quotedParticipant = contextInfo?.participant || contextInfo?.quotedMessage?.participant;
  if (quotedParticipant) {
    const clean = cleanJid(quotedParticipant);
    targets.add(lidToPhoneMap.get(clean) || clean);
  }

  const mentions = contextInfo?.mentionedJid || [];
  for (const m of mentions) {
    const clean = cleanJid(m);
    targets.add(lidToPhoneMap.get(clean) || clean);
  }

  if (textArgs && typeof textArgs === 'string') {
    const matches = textArgs.matchAll(/@?(\d{8,15})/g);
    for (const match of matches) {
      targets.add(`${match[1]}@s.whatsapp.net`);
    }
  }

  return Array.from(targets);
}

/**
 * Obtém os metadados do grupo com cache em RAM
 * @param {object} sock 
 * @param {string} groupJid 
 * @returns {Promise<object|null>}
 */
async function getGroupMetadata(sock, groupJid) {
  if (!groupJid || !groupJid.endsWith('@g.us')) return null;

  const cached = groupCache.get(groupJid);
  if (cached) {
    if (Array.isArray(cached.participants)) {
      for (const p of cached.participants) {
        registerParticipantLid(p);
      }
    }
    return cached;
  }

  let timer = null;
  try {
    const metaPromise = sock.groupMetadata(groupJid);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout_metadata')), 5000);
    });

    const metadata = await Promise.race([metaPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);

    if (metadata) {
      groupCache.set(groupJid, metadata);
      if (Array.isArray(metadata.participants)) {
        for (const p of metadata.participants) {
          registerParticipantLid(p);
        }
      }
    }
    return metadata;
  } catch (_err) {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/**
 * Verifica o status de admin do usuário e do bot no grupo (compatível com @lid)
 * @param {object} sock 
 * @param {string} groupJid 
 * @param {string} userJid 
 * @returns {Promise<{ isAdmin: boolean, isSuperAdmin: boolean, isBotAdmin: boolean, metadata: object|null }>}
 */
async function checkAdminStatus(sock, groupJid, userJid) {
  const result = {
    isAdmin: false,
    isSuperAdmin: false,
    isBotAdmin: false,
    metadata: null
  };

  if (!groupJid || !groupJid.endsWith('@g.us')) {
    // Se for no privado, o dono é tratado como admin
    if (settings.isOwner(userJid, sock)) {
      result.isAdmin = true;
      result.isSuperAdmin = true;
    }
    return result;
  }

  const metadata = await getGroupMetadata(sock, groupJid);
  if (!metadata || !Array.isArray(metadata.participants)) {
    return result;
  }

  result.metadata = metadata;

  const cleanUser = cleanJid(userJid);
  const botJid = cleanJid(sock?.user?.id || '');
  const botLid = cleanJid(sock?.user?.lid || '');
  const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  const userNumber = cleanUser.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  const userBr = getBr(userNumber);
  const botBr = getBr(botNumber);

  for (const p of metadata.participants) {
    registerParticipantLid(p);

    const pId = cleanJid(p.id);
    const pLid = p.lid ? cleanJid(p.lid) : (pId.endsWith('@lid') ? pId : '');
    const pJid = p.jid ? cleanJid(p.jid) : (pId.endsWith('@s.whatsapp.net') ? pId : (lidToPhoneMap.get(pLid) || ''));
    const pNumber = (pJid || pId).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const pBr = getBr(pNumber);

    const isMatchUser = (pId === cleanUser) || 
                        (pLid && pLid === cleanUser) ||
                        (pJid && pJid === cleanUser) ||
                        (userNumber && pNumber === userNumber) || 
                        (userBr.ddd && pBr.ddd && userBr.ddd === pBr.ddd && userBr.last8 === pBr.last8);

    const isMatchBot = (pId === botJid) || 
                       (botLid && (pId === botLid || pLid === botLid)) ||
                       (pJid && pJid === botJid) ||
                       (botNumber && pNumber === botNumber) || 
                       (botBr.ddd && pBr.ddd && botBr.ddd === pBr.ddd && botBr.last8 === pBr.last8);

    if (isMatchUser) {
      if (p.admin === 'admin') result.isAdmin = true;
      if (p.admin === 'superadmin') {
        result.isAdmin = true;
        result.isSuperAdmin = true;
      }
    }

    if (isMatchBot) {
      if (p.admin === 'admin' || p.admin === 'superadmin') {
        result.isBotAdmin = true;
      }
    }
  }

  // Se o usuário for o dono supremo do bot, concede privilégio de admin
  if (settings.isOwner(userJid, sock)) {
    result.isAdmin = true;
  }

  return result;
}

/**
 * Formata um JID para exibição limpa de telefone ou menção
 * @param {string} jid 
 * @returns {string}
 */
function formatNumber(jid) {
  if (!jid) return '';
  const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
  return num ? `+${num}` : jid;
}

module.exports = {
  cleanJid,
  extractSender,
  resolveSender,
  extractTarget,
  resolveTarget,
  resolveParticipant,
  extractAllTargets,
  getGroupMetadata,
  checkAdminStatus,
  formatNumber,
  getBr,
  registerParticipantLid,
  lidToPhoneMap,
  phoneToLidMap
};
