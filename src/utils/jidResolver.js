const { groupCache, metadataRefreshCache } = require('./cache');
const settings = require('../config/settings');
const { getBr } = settings;

// Mapas bidirecionais em memória para resolução instantânea de @lid <-> @s.whatsapp.net
const lidToPhoneMap = new Map();
const phoneToLidMap = new Map();
const MAX_LID_CACHE = 10000;

// Cache de nomes vistos em mensagens do grupo (pushName -> JID) para o fallback @Fulano.
const participantNameMap = new Map();
const MAX_NAME_CACHE_KEYS = 20000;

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
 * Normaliza nomes de participantes para o cache de busca por @Nome.
 * @param {string} value
 * @returns {string}
 */
function normalizeParticipantName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Registra o pushName de um participante visto em mensagens do grupo.
 * Mantém o nome completo e o primeiro nome para permitir "@Fulano".
 * @param {string} groupJid
 * @param {string} participantJid
 * @param {string} name
 */
function registerParticipantName(groupJid, participantJid, name) {
  const group = cleanJid(groupJid);
  const jid = cleanJid(participantJid);
  const normalized = normalizeParticipantName(name);

  if (!group.endsWith('@g.us') || !jid || !normalized) return;
  if (/^\d{8,20}$/.test(normalized)) return;

  const keys = new Set([normalized, normalized.split(' ')[0]]);
  for (const key of keys) {
    if (!key) continue;

    const mapKey = `${group}|${key}`;
    let jids = participantNameMap.get(mapKey);
    if (!jids) {
      if (participantNameMap.size >= MAX_NAME_CACHE_KEYS) {
        const oldestKey = participantNameMap.keys().next().value;
        if (oldestKey) participantNameMap.delete(oldestKey);
      }
      jids = new Set();
      participantNameMap.set(mapKey, jids);
    }
    jids.add(jid);
  }
}

/**
 * Busca JIDs de participantes pelo nome visto no grupo.
 * @param {string} groupJid
 * @param {string} name
 * @returns {string[]}
 */
function findParticipantJidsByName(groupJid, name) {
  const group = cleanJid(groupJid);
  const normalized = normalizeParticipantName(String(name || '').replace(/^@/, ''));
  if (!group.endsWith('@g.us') || !normalized) return [];

  const jids = participantNameMap.get(`${group}|${normalized}`);
  return jids ? [...jids] : [];
}

/**
 * Extrai apenas os dígitos de um JID/número (ignora device suffix e domínio).
 * @param {string} jidOrNum
 * @returns {string}
 */
function digitsOf(jidOrNum) {
  if (!jidOrNum) return '';
  return String(jidOrNum).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
}

/**
 * Heurística para diferenciar telefone de LID. Telefones têm no máximo 13 dígitos
 * no formato usado pelo bot (DDI + DDD + número); LIDs costumam ter 15.
 * @param {string} jidOrNum
 * @returns {boolean}
 */
function isPlausiblePhoneNumber(jidOrNum) {
  const digits = digitsOf(jidOrNum);
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * Obtém o JID de telefone de um participante, cobrindo as variações de metadados
 * (`jid`, `phoneNumber`, `phone_number` e `id` quando já é PN).
 * @param {object} p
 * @param {string} [pId]
 * @returns {string|null}
 */
function getParticipantPhoneJid(p, pId = cleanJid(p?.id || '')) {
  if (!p) return null;
  if (p.jid) return cleanJid(p.jid);

  const alt = p.phoneNumber || p.phone_number;
  if (alt) {
    const digits = digitsOf(alt);
    if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
  }

  return pId.endsWith('@s.whatsapp.net') ? pId : null;
}

/**
 * Obtém o JID LID de um participante, cobrindo `lid` e `id` quando já é LID.
 * @param {object} p
 * @param {string} [pId]
 * @returns {string|null}
 */
function getParticipantLidJid(p, pId = cleanJid(p?.id || '')) {
  if (!p) return null;
  if (p.lid) return cleanJid(p.lid);
  return pId.endsWith('@lid') ? pId : null;
}

/**
 * Monta o conjunto de JIDs candidatos para um alvo.
 * Aceita JID completo, número puro ou apenas dígitos e inclui os equivalentes
 * LID/PN conhecidos no mapa em memória.
 * @param {string} targetJid
 * @returns {Set<string>}
 */
function buildTargetCandidates(targetJid) {
  const candidates = new Set();
  const cleanTarget = cleanJid(targetJid);
  if (!cleanTarget) return candidates;

  const digits = digitsOf(cleanTarget);
  if (!cleanTarget.includes('@') && digits) {
    // Ambíguo: pode ser telefone digitado ou LID recebido em menção.
    candidates.add(`${digits}@s.whatsapp.net`);
    candidates.add(`${digits}@lid`);
  } else {
    candidates.add(cleanTarget);
  }

  for (const id of [...candidates]) {
    const mappedPn = lidToPhoneMap.get(id);
    if (mappedPn) candidates.add(cleanJid(mappedPn));
    const mappedLid = phoneToLidMap.get(id);
    if (mappedLid) candidates.add(cleanJid(mappedLid));
  }

  return candidates;
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

  // Cache de pushName para o fallback de promoção por nome literal (@Fulano).
  if (from.endsWith('@g.us') && msg.pushName) {
    registerParticipantName(from, rawSender, msg.pushName);
  }

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

  // 3. Extração por número digitado no texto.
  // Retorna apenas os dígitos: o resolveParticipant decide se é telefone ou @lid,
  // evitando classificar um LID como @s.whatsapp.net.
  if (textArgs && typeof textArgs === 'string') {
    const match = textArgs.match(/@?(\d{8,20})/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Resolve o participante de forma assíncrona com suporte completo a @lid.
 * Aceita JID completo, @lid, telefone ou apenas dígitos (texto de menção).
 * @param {object} sock 
 * @param {string} groupJid 
 * @param {string} targetJid 
 * @returns {Promise<{ phoneJid: string, groupJid: string, displayNum: string, name: string|null, displayUser: string, resolved: boolean }|null>}
 */
async function resolveParticipant(sock, groupJid, targetJid) {
  if (!targetJid) return null;

  const cleanTarget = cleanJid(String(targetJid).trim());
  if (!cleanTarget) return null;

  const targetDigits = digitsOf(cleanTarget);
  const targetIsLid = cleanTarget.endsWith('@lid');
  const isBareNumber = !cleanTarget.includes('@');
  const candidates = buildTargetCandidates(cleanTarget);

  let phoneJid = cleanTarget.endsWith('@s.whatsapp.net') ? cleanTarget : (lidToPhoneMap.get(cleanTarget) || null);
  let groupParticipantJid = cleanTarget;
  let matchedName = null;
  let resolved = false;

  /**
   * Procura o participante nos metadados do grupo.
   * @param {object|null} meta
   * @returns {{ p: object, pId: string, pJid: string|null, pLid: string|null }|null}
   */
  const findMatch = (meta) => {
    if (!meta || !Array.isArray(meta.participants)) return null;

    const targetBr = getBr(targetDigits);
    const targetIsPhoneLike = isPlausiblePhoneNumber(targetDigits);

    for (const p of meta.participants) {
      registerParticipantLid(p);

      const pId = cleanJid(p.id || '');
      const pJid = getParticipantPhoneJid(p, pId);
      const pLid = getParticipantLidJid(p, pId);
      const participantIds = new Set([pId, pJid, pLid].filter(Boolean).map(cleanJid));

      // Expande os IDs do participante com os mapeamentos LID <-> PN conhecidos.
      for (const id of [...participantIds]) {
        const mappedPn = lidToPhoneMap.get(id);
        if (mappedPn) participantIds.add(cleanJid(mappedPn));
        const mappedLid = phoneToLidMap.get(id);
        if (mappedLid) participantIds.add(cleanJid(mappedLid));
      }

      const exactMatch = [...candidates].some(c => participantIds.has(c));
      const participantNumbers = new Set([pId, pJid, pLid].map(digitsOf).filter(Boolean));
      const numericMatch = Boolean(targetDigits && participantNumbers.has(targetDigits));

      let brMatch = false;
      if (!exactMatch && !numericMatch && targetIsPhoneLike) {
        for (const pNumber of participantNumbers) {
          if (!isPlausiblePhoneNumber(pNumber)) continue;
          const pBr = getBr(pNumber);
          if (targetBr.ddd && pBr.ddd && targetBr.ddd === pBr.ddd && targetBr.last8 === pBr.last8) {
            brMatch = true;
            break;
          }
        }
      }

      if (exactMatch || numericMatch || brMatch) {
        return { p, pId, pJid, pLid };
      }
    }

    return null;
  };

  if (groupJid && groupJid.endsWith('@g.us') && sock) {
    let meta = await getGroupMetadata(sock, groupJid);
    let match = findMatch(meta);

    // O cache pode estar velho (metadados anteriores à migração LID do grupo)
    // ou incompleto. Força uma atualização única antes de desistir do alvo.
    if (!match) {
      meta = await getGroupMetadata(sock, groupJid, { refresh: true });
      match = findMatch(meta);
    }

    if (match) {
      const { p, pId, pJid, pLid } = match;
      resolved = true;

      // pId é o JID canônico que o grupo/Baileys espera nas ações (add/remove/promote/demote).
      groupParticipantJid = pId || pJid || pLid || cleanTarget;

      if (pJid) phoneJid = pJid;
      else if (pLid && lidToPhoneMap.has(pLid)) phoneJid = lidToPhoneMap.get(pLid);
      else if (pLid) phoneJid = pLid;
      else if (pId) phoneJid = pId;

      const foundName = p.notify || p.name || p.verifiedName;
      if (foundName) matchedName = foundName;
    } else {
      // Não está nos metadados. Se houver mapeamento conhecido, usa o JID
      // equivalente mais provável para a ação (em vez de mandar um LID solto).
      if (targetIsLid && lidToPhoneMap.has(cleanTarget)) {
        phoneJid = lidToPhoneMap.get(cleanTarget);
        groupParticipantJid = phoneJid;
      } else if (targetIsLid && phoneToLidMap.has(cleanTarget)) {
        groupParticipantJid = cleanTarget;
      } else if (isBareNumber) {
        const pnCandidate = `${targetDigits}@s.whatsapp.net`;
        if (phoneToLidMap.has(pnCandidate)) {
          groupParticipantJid = phoneToLidMap.get(pnCandidate);
          phoneJid = pnCandidate;
        } else if (lidToPhoneMap.has(pnCandidate)) {
          phoneJid = lidToPhoneMap.get(pnCandidate);
          groupParticipantJid = phoneJid;
        }
      }
    }
  } else if (targetIsLid && lidToPhoneMap.has(cleanTarget)) {
    phoneJid = lidToPhoneMap.get(cleanTarget);
  }

  const finalPhoneJid = phoneJid || cleanTarget;
  const displayNum = finalPhoneJid.replace(/@.*$/, '').replace(/\D/g, '') || cleanTarget.replace(/@.*$/, '');
  const cleanName = (matchedName && !/^\d{8,20}$/.test(String(matchedName).trim())) ? String(matchedName).trim() : null;

  return {
    phoneJid: finalPhoneJid,
    groupJid: groupParticipantJid,
    displayNum,
    name: cleanName,
    displayUser: cleanName ? `${displayNum} (${cleanName})` : displayNum,
    resolved
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
    const matches = textArgs.matchAll(/@?(\d{8,20})/g);
    for (const match of matches) {
      targets.add(match[1]);
    }
  }

  return Array.from(targets);
}

/**
 * Obtém os metadados do grupo com cache em RAM
 * @param {object} sock 
 * @param {string} groupJid 
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
async function getGroupMetadata(sock, groupJid, { refresh = false } = {}) {
  if (!groupJid || !groupJid.endsWith('@g.us')) return null;

  const previousCached = groupCache.get(groupJid);
  if (refresh) {
    if (!metadataRefreshCache.get(groupJid)) {
      metadataRefreshCache.set(groupJid, true);
      groupCache.del(groupJid);
    }
  }

  const cached = groupCache.get(groupJid);
  if (cached) {
    if (Array.isArray(cached.participants)) {
      for (const p of cached.participants) {
        registerParticipantLid(p);
      }
    }
    return cached;
  }

  if (typeof sock?.groupMetadata !== 'function') return previousCached || null;

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
      return metadata;
    }
    if (previousCached) groupCache.set(groupJid, previousCached);
    return previousCached || null;
  } catch (_err) {
    if (timer) clearTimeout(timer);
    if (previousCached) groupCache.set(groupJid, previousCached);
    return previousCached || null;
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
  const { botJid, botLid, botNum: botNumber } = getBotIdentity(sock);
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

/**
 * Extrai a identidade completa do bot (JID, LID e números limpos) em uma única chamada.
 * @param {object} sock Instância do Baileys
 * @returns {{ botJid: string, botLid: string, botNum: string, botLidNum: string }}
 */
/**
 * Escapa caracteres especiais para uso seguro em RegExp.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extrai a identidade completa do bot (JID, LID, números limpos e nome) em uma única chamada.
 * Consulta tanto sock.user quanto sock.authState.creds.me e mapeamentos bidirecionais.
 * @param {object} sock Instância do Baileys
 * @returns {{ botJid: string, botLid: string, botNum: string, botLidNum: string, botName: string }}
 */
function getBotIdentity(sock) {
  const rawId = sock?.user?.id || sock?.authState?.creds?.me?.id || '';
  const rawLid = sock?.user?.lid || sock?.authState?.creds?.me?.lid || '';
  const botName = sock?.user?.name || sock?.authState?.creds?.me?.name || '';

  let botJid = cleanJid(rawId);
  let botLid = cleanJid(rawLid);

  // Fallback de JID a partir do BOT_NUMBER do .env se não estiver no socket
  if (!botJid && settings.botNumber) {
    const envNum = String(settings.botNumber).replace(/\D/g, '');
    if (envNum) botJid = `${envNum}@s.whatsapp.net`;
  }

  // Tenta resolver botLid a partir do phoneToLidMap se ainda desconhecido
  if (!botLid && botJid && phoneToLidMap.has(botJid)) {
    botLid = phoneToLidMap.get(botJid);
  }

  // Tenta resolver botJid a partir do lidToPhoneMap se ainda desconhecido
  if (!botJid && botLid && lidToPhoneMap.has(botLid)) {
    botJid = lidToPhoneMap.get(botLid);
  }

  const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  return { botJid, botLid, botNum, botLidNum, botName };
}

/**
 * Verifica se um JID/número corresponde à identidade do próprio bot.
 * @param {object} sock Instância do Baileys
 * @param {string} jidOrNum JID ou número a comparar
 * @returns {boolean}
 */
function isBotIdentity(sock, jidOrNum) {
  if (!jidOrNum) return false;
  const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);
  const clean = cleanJid(String(jidOrNum).trim());
  const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  // 1. Igualdade exata de JID limpo
  if (clean && (clean === botJid || clean === botLid)) return true;

  // 2. Resolução via mapas bidirecionais LID <-> Phone
  if (clean.endsWith('@lid')) {
    if (botLid && clean === botLid) return true;
    const mappedPhone = lidToPhoneMap.get(clean);
    if (mappedPhone && (mappedPhone === botJid || (botNum && mappedPhone.includes(botNum)))) return true;
  } else if (clean.endsWith('@s.whatsapp.net')) {
    if (botJid && clean === botJid) return true;
    const mappedLid = phoneToLidMap.get(clean);
    if (mappedLid && (mappedLid === botLid || (botLidNum && mappedLid.includes(botLidNum)))) return true;
  }

  // 3. Igualdade numérica direta (número de telefone ou LID numérico)
  if (botNum && num === botNum) return true;
  if (botLidNum && num === botLidNum) return true;

  // 4. Fallback para BOT_NUMBER do .env se configurado
  const envBotNum = (settings.botNumber || '').replace(/\D/g, '');
  if (envBotNum && num === envBotNum) return true;

  // 5. Comparação resiliente do 9º dígito brasileiro (DDD + últimos 8 dígitos)
  if (num) {
    const numBr = getBr(num);
    if (numBr.ddd && numBr.last8) {
      if (botNum) {
        const botBr = getBr(botNum);
        if (botBr.ddd && botBr.ddd === numBr.ddd && botBr.last8 === numBr.last8) return true;
      }
      if (envBotNum) {
        const envBr = getBr(envBotNum);
        if (envBr.ddd && envBr.ddd === numBr.ddd && envBr.last8 === numBr.last8) return true;
      }
    }
  }

  return false;
}

/**
 * Detecta de forma abrangente e infalível se o bot foi mencionado na mensagem, cobrindo:
 * 1. Menção nativa nos metadados do WhatsApp (contextInfo.mentionedJid com JID ou LID)
 * 2. Contato não salvo na agenda do cliente (texto @55... gerado pelo WhatsApp ou digitado)
 * 3. Contato salvo com qualquer nome personalizado na agenda do cliente (ex: "@Administrativo", "@Hermes Bot", "@Suporte")
 * 4. Menções textuais literais (@hermes, @bot, etc.)
 * 5. Resposta direta (quote/reply) ao bot
 *
 * @param {object} sock Instância do Baileys
 * @param {object} msg Mensagem original do Baileys
 * @param {string} [text] Texto extraído da mensagem
 * @returns {{
 *   isMentioned: boolean,
 *   isMentionedInMeta: boolean,
 *   isReplyToBot: boolean,
 *   isExplicitTextTag: boolean,
 *   mentionPrefix: string | null,
 *   cleanText: string,
 *   mentionedJids: string[]
 * }}
 */
function detectBotMention(sock, msg, text = '') {
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

  // 1. Identifica se foi resposta (quote) ao próprio bot
  const quotedParticipant = cleanJid(contextInfo?.participant || contextInfo?.quotedMessage?.participant || '');
  const isReplyToBot = Boolean(contextInfo?.stanzaId && isBotIdentity(sock, quotedParticipant));

  // 2. Extrai metadados de menção do WhatsApp
  const rawMentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  const mentionedJids = rawMentions.map(cleanJid).filter(Boolean);
  const isMentionedInMeta = mentionedJids.some(j => isBotIdentity(sock, j));

  // 3. Obtém identidade completa do bot
  const { botJid, botLid, botNum, botLidNum, botName } = getBotIdentity(sock);
  const envBotNum = (settings.botNumber || '').replace(/\D/g, '');
  const rawText = String(text || '').trim();

  // 4. Monta lista de regexes para menções textuais conhecidas ao bot
  const botNumberVariants = new Set();
  if (botNum) botNumberVariants.add(botNum);
  if (envBotNum) botNumberVariants.add(envBotNum);
  if (botLidNum) botNumberVariants.add(botLidNum);

  for (const num of [...botNumberVariants]) {
    const br = getBr(num);
    if (br.ddd && br.last8) {
      botNumberVariants.add(`55${br.ddd}9${br.last8}`);
      botNumberVariants.add(`55${br.ddd}${br.last8}`);
      botNumberVariants.add(`${br.ddd}9${br.last8}`);
      botNumberVariants.add(`${br.ddd}${br.last8}`);
    }
  }

  const explicitTextRegexes = [/@hermes(?:\s*\d{1,4})?\b/i, /@bot(?:\s*\d{1,4})?\b/i];
  if (botName && botName.length >= 2) {
    explicitTextRegexes.push(new RegExp(`@${escapeRegex(botName)}(?:\\s*\\d{1,4})?\\b`, 'i'));
  }
  for (const num of botNumberVariants) {
    if (num && num.length >= 8) {
      explicitTextRegexes.push(new RegExp(`@${num}\\b`, 'i'));
    }
  }

  let isExplicitTextTag = explicitTextRegexes.some(rx => rx.test(rawText));

  let cleanText = rawText;
  let mentionPrefix = null;
  const otherMentions = mentionedJids.filter(j => !isBotIdentity(sock, j));

  // Prioridade 1: Se o bot foi mencionado nos metadados do WhatsApp (autocomplete)
  // e o texto começa com @, a menção inicial pertence ao bot!
  if (rawText.startsWith('@')) {
    if (isMentionedInMeta) {
      if (otherMentions.length === 0) {
        // Se após a menção há um comando com prefixo conhecido (ex: "@Administrativo !config", "@Hermes Bot /menu")
        const cmdMatch = cleanText.match(/^(@[^\n!/#.$]+?)\s*(?=[!/#.$])/);
        if (cmdMatch) {
          mentionPrefix = cmdMatch[0] + (cleanText.slice(cmdMatch[0].length).match(/^\s+/)?.[0] || '');
          cleanText = cleanText.slice(mentionPrefix.length);
        } else {
          // Se começa com @botName conhecido (ex: "@Hermes 02", "@Hermes") ou @botNum
          const escName = (botName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const nameRegex = escName ? `(?:${escName}|hermes|bot)` : '(?:hermes|bot)';
          const botNumPattern = botNum ? `|${botNum}` : '';
          const botTagMatch = cleanText.match(new RegExp(`^@(?:${nameRegex}${botNumPattern})(?:\\s*\\d{1,4})?\\b[\\s,.:!?-]*`, 'i'));

          if (botTagMatch) {
            mentionPrefix = botTagMatch[0];
            cleanText = cleanText.slice(mentionPrefix.length);
          } else if (cleanText.match(/^(@\S+(?:\s+\S+)?)\s+/)) {
            const spaceMatch = cleanText.match(/^(@\S+(?:\s+\S+)?)\s+/);
            mentionPrefix = spaceMatch[0];
            cleanText = cleanText.slice(mentionPrefix.length);
          } else {
            const singleMatch = cleanText.match(/^(@\S+)\s*/);
            if (singleMatch) {
              mentionPrefix = singleMatch[0];
              cleanText = cleanText.slice(mentionPrefix.length);
            }
          }
        }
      } else {
        // Há outros membros mencionados: verifica se o primeiro token @ não é de outro membro
        const firstTokenMatch = cleanText.match(/^@([^\s!/#.$]+)/);
        if (firstTokenMatch) {
          const firstToken = firstTokenMatch[1];
          const isOther = otherMentions.some(om => om.includes(firstToken));
          if (!isOther) {
            mentionPrefix = firstTokenMatch[0] + (cleanText.slice(firstTokenMatch[0].length).match(/^\s+/)?.[0] || '');
            cleanText = cleanText.slice(mentionPrefix.length);
          }
        }
      }
    }

    // Se ainda não capturou mentionPrefix (ex: digitado manualmente sem autocomplete),
    // checa contra os regexes explícitos de @hermes, @bot, @5545...
    if (!mentionPrefix) {
      for (const rx of explicitTextRegexes) {
        const startMatch = cleanText.match(new RegExp(`^${rx.source}[\\s,.:!?-]*`, 'i'));
        if (startMatch) {
          mentionPrefix = startMatch[0];
          cleanText = cleanText.slice(mentionPrefix.length);
          isExplicitTextTag = true;
          break;
        }
      }
    }
  }

  // Remove menções conhecidas ao bot que estejam no meio ou final do texto
  for (const rx of explicitTextRegexes) {
    cleanText = cleanText.replace(new RegExp(`(?:^|\\s)${rx.source}`, 'gi'), ' ');
  }

  // Se o bot foi mencionado via autocomplete nos metadados e NÃO há outros membros mencionados,
  // remove qualquer menção residual @Nome no meio da frase (ex: "Olá @Administrativo você pode me ajudar?")
  if (isMentionedInMeta && otherMentions.length === 0) {
    cleanText = cleanText.replace(/(?:^|\s)@[^\s@]+/g, ' ');
  }

  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  const isMentioned = Boolean(isMentionedInMeta || isExplicitTextTag || mentionPrefix);

  return {
    isMentioned,
    isMentionedInMeta,
    isReplyToBot,
    isExplicitTextTag,
    mentionPrefix,
    cleanText,
    mentionedJids
  };
}

/**
 * Valida o retorno de sock.groupParticipantsUpdate.
 * O Baileys devolve uma lista de { status, jid, content }; somente status 200
 * significa que a ação foi aceita pelo WhatsApp.
 * @param {any} result
 * @returns {{ ok: boolean, failures: Array<object> }}
 */
function checkGroupUpdateResult(result) {
  const list = Array.isArray(result) ? result : (result ? [result] : []);
  const failures = list.filter(item => item && item.status != null && String(item.status) !== '200');
  return { ok: failures.length === 0, failures };
}

/**
 * Retorna os administradores de um grupo para menção, excluindo rigorosamente o próprio bot.
 * @param {object} sock Instância do Baileys
 * @param {string} groupJid JID do grupo
 * @returns {Promise<{ adminJids: string[], mentionText: string }>}
 */
async function getGroupAdmins(sock, groupJid) {
  if (!groupJid || !groupJid.endsWith('@g.us') || !sock) {
    return { adminJids: [], mentionText: '' };
  }

  const metadata = await getGroupMetadata(sock, groupJid);
  if (!metadata || !Array.isArray(metadata.participants)) {
    return { adminJids: [], mentionText: '' };
  }

  const adminJidsSet = new Set();
  const mentionTokens = [];

  for (const p of metadata.participants) {
    registerParticipantLid(p);

    if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;

    // Exclui o próprio bot com verificação completa de identidade (JID, LID, número)
    if (isBotIdentity(sock, p.id) || isBotIdentity(sock, p.jid) || isBotIdentity(sock, p.lid)) {
      continue;
    }

    const pId = cleanJid(p.id);
    const pLid = p.lid ? cleanJid(p.lid) : (pId.endsWith('@lid') ? pId : '');
    const pJid = p.jid ? cleanJid(p.jid) : (pId.endsWith('@s.whatsapp.net') ? pId : (lidToPhoneMap.get(pLid) || ''));

    // Inclui todos os identificadores conhecidos do admin para o array mentions do Baileys
    if (pJid) adminJidsSet.add(pJid);
    if (pId) adminJidsSet.add(pId);
    if (pLid) adminJidsSet.add(pLid);

    // Número legível para o token @numero no texto da mensagem
    const phoneNum = (pJid || pId).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    if (phoneNum) {
      const token = `@${phoneNum}`;
      if (!mentionTokens.includes(token)) {
        mentionTokens.push(token);
      }
    }
  }

  return {
    adminJids: Array.from(adminJidsSet),
    mentionText: mentionTokens.join(' ')
  };
}

module.exports = {
  cleanJid,
  digitsOf,
  isPlausiblePhoneNumber,
  getParticipantPhoneJid,
  getParticipantLidJid,
  buildTargetCandidates,
  registerParticipantName,
  findParticipantJidsByName,
  extractSender,
  resolveSender,
  extractTarget,
  resolveTarget,
  resolveParticipant,
  extractAllTargets,
  getGroupMetadata,
  getGroupAdmins,
  checkAdminStatus,
  checkGroupUpdateResult,
  formatNumber,
  getBotIdentity,
  isBotIdentity,
  detectBotMention,
  escapeRegex,
  getBr,
  setLidMapping,
  registerParticipantLid,
  lidToPhoneMap,
  phoneToLidMap,
  participantNameMap
};
