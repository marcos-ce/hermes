const { resolveTarget, resolveParticipant, cleanJid, getBotIdentity, getGroupMetadata, findParticipantJidsByName, setLidMapping, digitsOf, getBr } = require('../utils/jidResolver');
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

// Palavras usadas como menção coletiva/genérica que não representam um membro.
const RESERVED_MENTION_TOKENS = new Set([
  'todos', 'todas', 'all', 'everyone', 'here', 'aqui', 'geral', 'grupo',
  'admin', 'admins', 'administrador', 'administradores', 'administrator', 'administrators'
]);

/**
 * Normaliza nomes para comparação (sem acentos, caixa ou espaços duplicados).
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extrai o texto legível da mensagem real (texto, legenda de imagem/vídeo).
 * @param {object|null} realMsg
 * @returns {string}
 */
function getMessageText(realMsg) {
  return (realMsg?.conversation ||
          realMsg?.extendedTextMessage?.text ||
          realMsg?.imageMessage?.caption ||
          realMsg?.videoMessage?.caption || '').trim();
}

/**
 * Extrai tokens literais marcados com @ (ex: "@Fulano" -> "Fulano").
 * Evita casar e-mails (foo@bar.com) e remove pontuação final.
 * @param {string} text
 * @returns {string[]}
 */
function extractAtTokens(text) {
  if (!text || typeof text !== 'string') return [];

  const tokens = [];
  const regex = /(?:^|\s)@([^\s@]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = String(match[1] || '')
      .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
      .replace(/[.,!?;:)\]}'"»”’]+$/g, '')
      .trim();
    if (token) tokens.push(token);
  }
  return [...new Set(tokens)];
}

/**
 * Tokens numéricos de menção (@5511... ou @<lid>), sem o @.
 * @param {string} text
 * @returns {string[]}
 */
function extractNumericMentionTokens(text) {
  return extractAtTokens(text)
    .map(token => token.replace(/^\+/, ''))
    .filter(token => /^\d{8,20}$/.test(token));
}

/**
 * Tokens de menção por nome literal (@Fulano), ignorando números e coletivos.
 * @param {string} text
 * @returns {string[]}
 */
function extractNameMentionTokens(text) {
  return extractAtTokens(text).filter(token => {
    const numeric = token.replace(/^\+/, '');
    if (/^\d{8,20}$/.test(numeric)) return false;
    const normalized = normalizeName(token);
    if (!normalized || RESERVED_MENTION_TOKENS.has(normalized)) return false;
    if (normalized === 'hermes' || normalized === 'bot') return false;
    return true;
  });
}

/**
 * Verifica se um nome de participante corresponde ao token @Nome.
 * Aceita nome completo exato ou o primeiro nome (ex: "@Fulano" -> "Fulano Silva").
 * @param {string} name
 * @param {string} token
 * @returns {boolean}
 */
function nameMatchesToken(name, token) {
  const normalizedName = normalizeName(name);
  const normalizedToken = normalizeName(String(token || '').replace(/^@/, ''));
  if (!normalizedName || !normalizedToken) return false;
  if (normalizedName === normalizedToken) return true;
  return normalizedName.split(' ')[0] === normalizedToken;
}

/**
 * Resolve uma lista de JIDs/números e remove duplicatas do mesmo participante.
 * @param {object} sock
 * @param {string} from
 * @param {string[]} candidates
 * @param {(jidOrNum: string) => boolean} isBot
 * @returns {Promise<Array<object>>}
 */
async function resolveCandidateData(sock, from, candidates, isBot) {
  const result = [];
  const seen = new Set();

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate || isBot(candidate)) continue;

    const data = await resolveParticipant(sock, from, candidate);
    if (!data) continue;

    const key = cleanJid(data.groupJid || data.phoneJid || '') || data.displayNum;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(data);
  }

  return result;
}

/**
 * Resolve menções literais por nome (@Fulano) somente quando não há JID/número
 * explícito. Exige correspondência estrita e única para evitar promover a pessoa errada.
 * @param {object} sock
 * @param {string} from
 * @param {string[]} tokens
 * @param {(jidOrNum: string) => boolean} isBot
 * @returns {Promise<Array<object>>}
 */
async function resolveNameMentionTargets(sock, from, tokens, isBot) {
  if (!tokens.length || !from) return [];

  const collectFromMetadata = (metadata) => {
    const candidates = new Set();
    if (!metadata || !Array.isArray(metadata.participants)) return candidates;

    for (const token of tokens) {
      for (const participant of metadata.participants) {
        const names = [participant.notify, participant.name, participant.verifiedName].filter(Boolean);
        if (!names.some(name => nameMatchesToken(name, token))) continue;

        for (const id of [participant.jid, participant.id, participant.lid]) {
          const jid = cleanJid(id);
          if (jid) candidates.add(jid);
        }
      }
    }

    return candidates;
  };

  let metadata = await getGroupMetadata(sock, from);
  let metadataCandidates = collectFromMetadata(metadata);

  // Metadados em cache podem ser anteriores à entrada/renomeação do membro.
  if (metadataCandidates.size === 0) {
    metadata = await getGroupMetadata(sock, from, { refresh: true });
    metadataCandidates = collectFromMetadata(metadata);
  }

  if (metadataCandidates.size > 0) {
    const resolved = (await resolveCandidateData(sock, from, [...metadataCandidates], isBot))
      .filter(data => data.resolved !== false);
    return resolved.length === 1 ? resolved : [];
  }

  // Fallback para pushNames vistos em mensagens do grupo (cache em RAM).
  const cachedCandidates = new Set();
  for (const token of tokens) {
    for (const jid of findParticipantJidsByName(from, token)) {
      cachedCandidates.add(jid);
    }
  }

  if (cachedCandidates.size > 0) {
    const resolved = (await resolveCandidateData(sock, from, [...cachedCandidates], isBot))
      .filter(data => data.resolved !== false);
    if (resolved.length === 1) return resolved;
    if (resolved.length > 1) return [];
    // Se o cache não resolveu (membro saiu), tenta o histórico persistido.
  }

  // Fallback para nomes vistos no histórico recente do grupo (SQLite).
  const memoryCandidates = new Set();
  const recent = memoryEngine.getRecentMessages(from, 100);
  for (const token of tokens) {
    for (const message of recent) {
      if (!message.sender || message.sender === 'hermes@bot' || isBot(message.sender)) continue;
      if (!nameMatchesToken(message.name, token)) continue;

      const jid = cleanJid(message.participant || message.sender);
      if (jid) memoryCandidates.add(jid);
    }
  }

  if (memoryCandidates.size === 0) return [];

  const resolved = (await resolveCandidateData(sock, from, [...memoryCandidates], isBot))
    .filter(data => data.resolved !== false);
  return resolved.length === 1 ? resolved : [];
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
    const textMatches = botText.match(/@(\d{8,20})\b/g) || [];
    for (const tm of textMatches) {
      const rawNum = tm.replace('@', '');
      if (!isBot(rawNum)) candidates.push(rawNum);
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

  const mentionCandidates = [];
  const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  for (const m of mentions) {
    if (m && !isBot(m)) mentionCandidates.push(cleanJid(m));
  }

  const text = getMessageText(realMsg);
  const numericCandidates = extractNumericMentionTokens(text).filter(token => !isBot(token));

  // 1. Menções reais (@lid/@s.whatsapp.net) e números digitados com @.
  //    O texto numérico é passado sem domínio para o resolver decidir se é PN ou LID.
  const explicit = await resolveCandidateData(
    sock,
    from,
    [...mentionCandidates, ...numericCandidates],
    isBot
  );

  // Se as menções diretas resolveram participantes confirmados nos metadados do grupo:
  const confirmed = explicit.filter(data => data && data.resolved !== false);
  if (confirmed.length > 0) return confirmed;

  // 2. Se as menções diretas não resolveram membro confirmado nos metadados (ex: @lid sem mapeamento PN),
  // ou se não há menções JID/número: aceita @Fulano digitado literalmente ou resolve por nome:
  const nameTokens = extractNameMentionTokens(text);
  if (nameTokens.length > 0) {
    const byName = await resolveNameMentionTargets(sock, from, nameTokens, isBot);
    if (byName.length > 0) {
      // Se havia um LID não mapeado nas menções e exatamente um membro resolvido por nome,
      // aprende o mapeamento LID <-> Phone imediatamente:
      if (explicit.length === 1 && byName.length === 1 && explicit[0].groupJid?.endsWith('@lid')) {
        const pn = byName[0].phoneJid || byName[0].groupJid;
        if (pn && !pn.endsWith('@lid')) {
          setLidMapping(explicit[0].groupJid, pn);
        }
      }
      return byName;
    }
  }

  return explicit;
}

/**
 * Indica se a mensagem contém alguma sintaxe explícita de @ (JID, número ou nome).
 * Usado para diferenciar "faltou @" de "marcou alguém que não foi encontrado".
 * @param {object} sock
 * @param {object} msg
 * @returns {boolean}
 */
function hasExplicitMentionSyntax(sock, msg) {
  const isBot = createBotChecker(sock);
  const { realMsg, contextInfo } = extractContextInfo(msg);

  const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
  if (mentions.some(m => m && !isBot(m))) return true;

  const { botNum, botLidNum } = getBotIdentity(sock);
  const textTokens = extractAtTokens(getMessageText(realMsg)).filter(token => {
    const numeric = token.replace(/^\+/, '');
    if (/^\d{8,20}$/.test(numeric)) return !isBot(numeric) && numeric !== botNum && numeric !== botLidNum;
    const normalized = normalizeName(token);
    return Boolean(normalized) && normalized !== 'hermes' && normalized !== 'bot';
  });

  return textTokens.length > 0;
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
    const numMatch = targetArg.match(/@?(\d{8,20})/);
    if (numMatch && numMatch[1] && !isBot(numMatch[1])) {
      const rawNum = numMatch[1];
      // Sem domínio, deixa o resolver testar PN e LID (o texto pode ser um @lid).
      const candidateJid = targetArg.includes('@lid')
        ? `${rawNum}@lid`
        : (targetArg.includes('@') ? `${rawNum}@s.whatsapp.net` : rawNum);
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
    const textMatches = botText.match(/@(\d{8,20})\b/g) || [];
    for (const tm of textMatches) {
      const rawNum = tm.replace('@', '');
      if (!isBot(rawNum)) {
        return await resolveParticipant(sock, from, rawNum);
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
  const { realMsg } = extractContextInfo(msg);
  if (requireExplicitMention) {
    const mentioned = await getExplicitMentionTargets(sock, msg, from);
    if (mentioned.length === 0) {
      const errorKey = hasExplicitMentionSyntax(sock, msg)
        ? 'common.not_found_target'
        : 'promote.need_explicit_mention';
      return { success: false, error: t(lang, errorKey) };
    }

    const singleMention = mentioned.find(data => data.resolved !== false) || mentioned[0];

    // Se há exatamente 1 alvo marcado com @ na mensagem:
    // O requisito mandatório de segurança está 100% satisfeito se targetArg corresponder
    // ao alvo marcado ou se targetArg for genérico ("mentioned", vazio, ou o token marcado no texto).
    if (mentioned.length === 1 && singleMention) {
      const arg = String(targetArg || '').trim().toLowerCase();
      const cleanArg = arg.replace(/^@/, '');

      // 1. Argumento genérico ou omitido -> aceita o único mencionado
      if (!arg || arg === 'mentioned' || arg === 'quoted') {
        return { success: true, targetData: singleMention };
      }

      // 2. Se targetArg for número explícito (ou JID), verifica se bate com o singleMention
      const numMatch = targetArg.match(/@?(\d{8,20})/);
      if (numMatch && numMatch[1]) {
        const rawDigits = numMatch[1];
        const singleDigits = [
          singleMention.displayNum,
          digitsOf(singleMention.groupJid),
          digitsOf(singleMention.phoneJid)
        ].filter(Boolean);

        const matchesDigits = singleDigits.some(d =>
          d === rawDigits || (getBr(d).last8 && getBr(d).last8 === getBr(rawDigits).last8)
        );

        if (matchesDigits) {
          return { success: true, targetData: singleMention };
        }
        // É um número explícito de outra pessoa (alucinação do modelo / prompt injection)!
        return { success: false, error: t(lang, 'promote.need_explicit_mention') };
      }

      // 3. Se targetArg for nome, verifica se bate com o singleMention ou com tokens marcados na mensagem
      const nameTokens = extractNameMentionTokens(getMessageText(realMsg)).map(normalizeName);
      const matchesName = (singleMention.name && nameMatchesToken(singleMention.name, cleanArg)) ||
                          nameTokens.includes(normalizeName(cleanArg));

      if (matchesName) {
        return { success: true, targetData: singleMention };
      }

      // Se o targetArg apontar para outro membro diferente (ex: "Pedro" quando marcou "Bob"):
      return { success: false, error: t(lang, 'promote.need_explicit_mention') };
    }

    const arg = String(targetArg || '').trim().toLowerCase();
    if (!arg || arg === 'mentioned') {
      // Prefere um alvo confirmado nos metadados do grupo; mantém o primeiro
      // como fallback para sockets que ainda não expõem groupMetadata.
      return {
        success: true,
        targetData: singleMention
      };
    }

    // Alvos resolvidos por nome literal (@Fulano) podem não existir no histórico
    // do SQLite; nesse caso, valida o argumento diretamente contra o nome do membro marcado.
    const findMentionByName = () => {
      const matches = mentioned.filter(m => m.name && nameMatchesToken(m.name, targetArg));
      return matches.length === 1 ? matches[0] : null;
    };

    const chosen = await resolveTargetSmart(sock, msg, from, targetArg);
    if (!chosen) {
      const byName = findMentionByName();
      if (byName) return { success: true, targetData: byName };
      return { success: false, error: t(lang, 'common.not_found_target') };
    }

    const idsOf = (d) => [d.groupJid, d.phoneJid, d.displayNum].filter(Boolean).map(String);
    const chosenIds = new Set(idsOf(chosen));
    const match = mentioned.find(m => idsOf(m).some(id => chosenIds.has(id)));
    if (!match) {
      const byName = findMentionByName();
      if (byName) return { success: true, targetData: byName };
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
  hasExplicitMentionSyntax,
  resolveTargetSmart
};
