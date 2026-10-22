const { groupCache } = require('./cache');
const settings = require('../config/settings');

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
 * Extrai o remetente real de uma mensagem de forma segura
 * @param {object} msg 
 * @returns {string}
 */
function extractSender(msg) {
  if (!msg || !msg.key) return '';
  const from = msg.key.remoteJid || '';
  
  if (from.endsWith('@g.us')) {
    const participant = msg.key.participant || msg.participant || '';
    return cleanJid(participant);
  }
  
  return cleanJid(from);
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
  // 1. Mensagem respondida
  const quotedParticipant = 
    msg?.message?.extendedTextMessage?.contextInfo?.participant ||
    msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.participant;
  
  if (quotedParticipant) {
    return cleanJid(quotedParticipant);
  }

  // 2. Menção na mensagem
  const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (Array.isArray(mentions) && mentions.length > 0) {
    return cleanJid(mentions[0]);
  }

  // 3. Extração por número de telefone digitado no texto
  if (textArgs && typeof textArgs === 'string') {
    // Procura por menção em texto @5511... ou números com pelo menos 8 dígitos
    const match = textArgs.match(/@?(\d{8,15})/);
    if (match && match[1]) {
      return `${match[1]}@s.whatsapp.net`;
    }
  }

  return null;
}

/**
 * Extrai todas as menções presentes na mensagem ou argumentos
 * @param {object} msg 
 * @param {string} textArgs 
 * @returns {string[]}
 */
function extractAllTargets(msg, textArgs = '') {
  const targets = new Set();

  const quotedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) {
    targets.add(cleanJid(quotedParticipant));
  }

  const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  for (const m of mentions) {
    targets.add(cleanJid(m));
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
  if (cached) return cached;

  try {
    const metadata = await sock.groupMetadata(groupJid);
    if (metadata) {
      groupCache.set(groupJid, metadata);
    }
    return metadata;
  } catch (err) {
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
  const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  const userNumber = cleanUser.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  const getBr = (num) => {
    const c = (num || '').replace(/\D/g, '');
    if (c.startsWith('55') && c.length >= 12) {
      return { ddd: c.slice(2, 4), last8: c.slice(-8) };
    }
    if (c.length === 10 || c.length === 11) {
      return { ddd: c.slice(0, 2), last8: c.slice(-8) };
    }
    return { ddd: '', last8: c.slice(-8) };
  };

  const userBr = getBr(userNumber);
  const botBr = getBr(botNumber);

  for (const p of metadata.participants) {
    const pClean = cleanJid(p.id);
    const pNumber = pClean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const pLid = p.lid ? cleanJid(p.lid) : '';
    const pBr = getBr(pNumber);

    const isMatchUser = (pClean === cleanUser) || 
                        (userNumber && pNumber === userNumber) || 
                        (userBr.ddd && pBr.ddd && userBr.ddd === pBr.ddd && userBr.last8 === pBr.last8) ||
                        (pLid && pLid === cleanUser);

    const isMatchBot = (pClean === botJid) || 
                       (botNumber && pNumber === botNumber) || 
                       (botBr.ddd && pBr.ddd && botBr.ddd === pBr.ddd && botBr.last8 === pBr.last8) ||
                       (pLid && pLid === botJid);

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
  extractTarget,
  extractAllTargets,
  getGroupMetadata,
  checkAdminStatus,
  formatNumber
};
