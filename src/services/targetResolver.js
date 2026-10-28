const { resolveTarget, resolveParticipant, cleanJid, getBotIdentity } = require('../utils/jidResolver');
const memoryEngine = require('./memoryEngine');
const { t } = require('../utils/i18n');

/**
 * Utilitário central de resolução de alvo para ferramentas do Agente Hermes.
 * Implementa resolução inteligente de alvos (quote, @menção, @lid, ref mID, nome no SQLite)
 * e blindagem estrita contra Prompt Injection (requireExplicit para ações destrutivas).
 */

/**
 * Extrai a mensagem real e seu contextInfo desencapsulando mensagens efêmeras e viewOnce.
 * @param {object} msg 
 * @returns {{ realMsg: object|null, contextInfo: object|null }}
 */
function extractContextInfo(msg) {
  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo ||
                      msg?.message?.extendedTextMessage?.contextInfo ||
                      null;

  return { realMsg, contextInfo };
}

/**
 * Cria verificador de identidade do bot para filtrar o próprio bot de alvos.
 * @param {object} sock 
 * @returns {(jidOrNum: string) => boolean}
 */
function createBotChecker(sock) {
  const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);
  return (jidOrNum) => {
    if (!jidOrNum) return false;
    const clean = cleanJid(jidOrNum);
    const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    return (
      clean === botJid ||
      clean === botLid ||
      (botNum && num === botNum) ||
      (botLidNum && num === botLidNum)
    );
  };
}

/**
 * Extrai candidatos explícitos (citações e menções) da mensagem do admin.
 * @param {object} sock 
 * @param {object} msg 
 * @param {string} from 
 * @returns {Promise<Array<object>>} Lista de alvos resolvidos via resolveParticipant
 */
async function getExplicitTargets(sock, msg, from) {
  const isBot = createBotChecker(sock);
  const { contextInfo } = extractContextInfo(msg);

  const candidates = [];
  const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  for (const m of mentions) {
    if (m && !isBot(m)) candidates.push(cleanJid(m));
  }

  const quotedParticipant = contextInfo?.participant;
  if (quotedParticipant && !isBot(quotedParticipant)) {
    candidates.push(cleanJid(quotedParticipant));
  } else if (quotedParticipant && isBot(quotedParticipant)) {
    // Se respondeu a uma mensagem do próprio bot, extrai os membros mencionados naquela mensagem do bot
    const rawQuoted = contextInfo?.quotedMessage;
    const unwrapped = rawQuoted?.ephemeralMessage?.message ||
                      rawQuoted?.viewOnceMessage?.message ||
                      rawQuoted?.viewOnceMessageV2?.message ||
                      rawQuoted?.documentWithCaptionMessage?.message ||
                      rawQuoted;
    const botQuotedMentions = Array.isArray(unwrapped?.extendedTextMessage?.contextInfo?.mentionedJid)
      ? unwrapped.extendedTextMessage.contextInfo.mentionedJid
      : [];
    for (const m of botQuotedMentions) {
      if (m && !isBot(m)) candidates.push(cleanJid(m));
    }
    const botText = (unwrapped?.conversation ||
                    unwrapped?.extendedTextMessage?.text ||
                    unwrapped?.imageMessage?.caption ||
                    unwrapped?.videoMessage?.caption || '').trim();
    const textMatches = botText.match(/@(\d{8,15})\b/g) || [];
    for (const tm of textMatches) {
      const rawNum = tm.replace('@', '');
      const jid = `${rawNum}@s.whatsapp.net`;
      if (!isBot(jid)) candidates.push(jid);
    }
  }

  const resolved = [];
  for (const jid of [...new Set(candidates)]) {
    const data = await resolveParticipant(sock, from, jid);
    if (data) resolved.push(data);
  }
  return resolved;
}

/**
 * Extrai APENAS candidatos marcados expressamente com @ (excluindo quotes/replies sem menção direta).
 * @param {object} sock 
 * @param {object} msg 
 * @param {string} from 
 * @returns {Promise<Array<object>>} Lista de alvos resolvidos via resolveParticipant
 */
async function getExplicitMentionTargets(sock, msg, from) {
  const isBot = createBotChecker(sock);
  const { realMsg, contextInfo } = extractContextInfo(msg);

  const candidates = [];
  const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  for (const m of mentions) {
    if (m && !isBot(m)) candidates.push(cleanJid(m));
  }

  const text = (realMsg?.conversation ||
                realMsg?.extendedTextMessage?.text ||
                realMsg?.imageMessage?.caption ||
                realMsg?.videoMessage?.caption || '').trim();
  const textMatches = text.match(/@(\d{8,15})\b/g) || [];
  for (const tm of textMatches) {
    const rawNum = tm.replace('@', '');
    const jid = `${rawNum}@s.whatsapp.net`;
    if (!isBot(jid)) candidates.push(jid);
  }

  const resolved = [];
  for (const jid of [...new Set(candidates)]) {
    const data = await resolveParticipant(sock, from, jid);
    if (data) resolved.push(data);
  }
  return resolved;
}

/**
 * Resolução inteligente de participante combinando quote, menção, targetArg e SQLite.
 * @param {object} sock 
 * @param {object} msg 
 * @param {string} from 
 * @param {string} [targetArg=''] 
 * @returns {Promise<object|null>}
 */
async function resolveTargetSmart(sock, msg, from, targetArg = '') {
  const isBot = createBotChecker(sock);
  const { contextInfo } = extractContextInfo(msg);

  // 0. Ref explícito do histórico ("m123"): resolvido por lookup determinístico no SQLite
  if (typeof targetArg === 'string' && /^m\d{1,9}$/i.test(targetArg.trim())) {
    const refData = memoryEngine.getMessageByRef(from, targetArg.trim());
    const refJid = refData ? cleanJid(refData.participant || refData.sender) : '';
    if (!refJid || isBot(refJid)) return null;
    return await resolveParticipant(sock, from, refJid);
  }

  // 1. Número explícito ou JID passado em targetArg que NÃO seja o próprio bot
  if (targetArg && typeof targetArg === 'string') {
    const numMatch = targetArg.match(/@?(\d{8,15})/);
    if (numMatch && numMatch[1] && !isBot(numMatch[1])) {
      const candidateJid = targetArg.includes('@lid')
        ? `${numMatch[1]}@lid`
        : `${numMatch[1]}@s.whatsapp.net`;
      return await resolveParticipant(sock, from, candidateJid);
    }
  }

  // 2. Menções na mensagem que NÃO sejam o próprio bot (quando targetArg é omitted ou 'mentioned')
  const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  const nonBotMentions = mentions.filter(m => !isBot(m));
  if (nonBotMentions.length > 0 && (!targetArg || targetArg === 'mentioned')) {
    return await resolveParticipant(sock, from, cleanJid(nonBotMentions[0]));
  }

  // 3. Mensagem respondida (Quote), desde que não seja o bot
  const quotedParticipant = contextInfo?.participant || contextInfo?.quotedMessage?.participant;
  if (quotedParticipant && !isBot(quotedParticipant)) {
    return await resolveParticipant(sock, from, cleanJid(quotedParticipant));
  } else if (quotedParticipant && isBot(quotedParticipant)) {
    const rawQuoted = contextInfo?.quotedMessage;
    const unwrapped = rawQuoted?.ephemeralMessage?.message ||
                      rawQuoted?.viewOnceMessage?.message ||
                      rawQuoted?.viewOnceMessageV2?.message ||
                      rawQuoted?.documentWithCaptionMessage?.message ||
                      rawQuoted;
    const botQuotedMentions = Array.isArray(unwrapped?.extendedTextMessage?.contextInfo?.mentionedJid)
      ? unwrapped.extendedTextMessage.contextInfo.mentionedJid
      : [];
    for (const m of botQuotedMentions) {
      if (m && !isBot(m)) {
        return await resolveParticipant(sock, from, cleanJid(m));
      }
    }
    const botText = (unwrapped?.conversation ||
                    unwrapped?.extendedTextMessage?.text ||
                    unwrapped?.imageMessage?.caption ||
                    unwrapped?.videoMessage?.caption || '').trim();
    const textMatches = botText.match(/@(\d{8,15})\b/g) || [];
    for (const tm of textMatches) {
      const rawNum = tm.replace('@', '');
      const jid = `${rawNum}@s.whatsapp.net`;
      if (!isBot(jid)) {
        return await resolveParticipant(sock, from, jid);
      }
    }
  }

  // 4. Busca por nome no histórico de conversas do grupo via SQLite
  if (targetArg && typeof targetArg === 'string') {
    const cleanedArg = targetArg.trim().toLowerCase();
    if (cleanedArg && cleanedArg !== 'quoted' && cleanedArg !== 'mentioned') {
      const jidByName = memoryEngine.findParticipantByName(from, targetArg);
      if (jidByName && !isBot(jidByName)) {
        return await resolveParticipant(sock, from, cleanJid(jidByName));
      }
    }
  }

  // 5. Fallback para menções na mensagem caso targetArg não tenha resolvido alvo específico
  if (nonBotMentions.length > 0) {
    return await resolveParticipant(sock, from, cleanJid(nonBotMentions[0]));
  }

  // 6. Fallback padrão
  return await resolveTarget(sock, msg, from, targetArg);
}

/**
 * Função consolidada de resolução de alvo para ferramentas do bot.
 * Suporta modo estrito (requireExplicit) contra prompt-injection em ban/blacklist
 * e modo estrito por menção (@) (requireExplicitMention) para promoção de administradores.
 * 
 * @param {object} sock Instância do socket Baileys
 * @param {object} msg Mensagem original
 * @param {string} from JID do grupo
 * @param {string} [targetArg=''] Argumento de alvo passado pela IA ou comando
 * @param {object} [options={}]
 * @param {boolean} [options.requireExplicit=false] Exige menção ou reply físico do admin
 * @param {boolean} [options.requireExplicitMention=false] Exige menção expressa com @ (exclui quotes/replies sem menção direta)
 * @param {string} [options.lang='pt'] Idioma para mensagens de erro
 * @returns {Promise<{ success: boolean, targetData?: { phoneJid: string, groupJid: string, displayNum: string }, error?: string }>}
 */
async function resolveActionTarget(sock, msg, from, targetArg = '', { requireExplicit = false, requireExplicitMention = false, lang = 'pt' } = {}) {
  if (requireExplicitMention) {
    const mentioned = await getExplicitMentionTargets(sock, msg, from);
    if (mentioned.length === 0) {
      return { success: false, error: t(lang, 'promote.need_explicit_mention') };
    }

    const arg = String(targetArg || '').trim().toLowerCase();
    if (!arg || arg === 'mentioned') {
      return { success: true, targetData: mentioned[0] };
    }

    const chosen = await resolveTargetSmart(sock, msg, from, targetArg);
    if (!chosen) {
      return { success: false, error: t(lang, 'common.not_found_target') };
    }

    const idsOf = (d) => [d.groupJid, d.phoneJid, d.displayNum].filter(Boolean).map(String);
    const chosenIds = new Set(idsOf(chosen));
    const match = mentioned.find(m => idsOf(m).some(id => chosenIds.has(id)));
    if (!match) {
      return { success: false, error: t(lang, 'promote.need_explicit_mention') };
    }
    return { success: true, targetData: match };
  }

  if (requireExplicit) {
    const explicit = await getExplicitTargets(sock, msg, from);
    if (explicit.length === 0) {
      return { success: false, error: t(lang, 'hermes.need_explicit_target') };
    }

    const arg = String(targetArg || '').trim().toLowerCase();
    if (!arg || arg === 'quoted' || arg === 'mentioned') {
      return { success: true, targetData: explicit[0] };
    }

    const chosen = await resolveTargetSmart(sock, msg, from, targetArg);
    if (!chosen) {
      return { success: false, error: t(lang, 'common.not_found_target') };
    }

    const idsOf = (d) => [d.groupJid, d.phoneJid, d.displayNum].filter(Boolean).map(String);
    const chosenIds = new Set(idsOf(chosen));
    const match = explicit.find(e => idsOf(e).some(id => chosenIds.has(id)));
    if (!match) {
      return { success: false, error: t(lang, 'hermes.need_explicit_target') };
    }
    return { success: true, targetData: match };
  }

  const chosen = await resolveTargetSmart(sock, msg, from, targetArg);
  if (!chosen) {
    return { success: false, error: t(lang, 'common.not_found_target') };
  }
  return { success: true, targetData: chosen };
}

module.exports = {
  resolveActionTarget,
  getExplicitTargets,
  getExplicitMentionTargets,
  resolveTargetSmart
};
