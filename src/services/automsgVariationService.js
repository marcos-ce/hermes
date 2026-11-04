'use strict';

/**
 * ============================================================
 *  automsgVariationService — Variação Contextual de AutoMsg via IA
 * ============================================================
 * Recebe o texto original configurado pelo admin e devolve uma
 * reformulação natural da mensagem, preservando:
 *   - URLs/links intactos (incluindo www., wa.me, t.me, encurtadores)
 *   - Regras, proibições e avisos sem distorção nem suavização
 *   - Proporção de tamanho (se o aviso tem 1 linha, a variação tem 1 linha)
 *   - Tags e placeholders ({user}, {group}, etc.)
 *   - Formatação nativa do WhatsApp (*negrito*, não **negrito**)
 *
 * REGRA DE ISOLAMENTO (GEMINI.md):
 *   Chamadas de IA ficam ESTRITAMENTE em src/services/.
 *   O automsg.js apenas importa esta função — nunca acessa a API diretamente.
 *
 * Fallback: retorna null se a IA falhar ou estiver desabilitada.
 * O automsg.js deve usar o texto original quando receber null.
 */

const logger = require('../utils/logger');

// Regex que captura URLs completas, www. e encurtadores comuns
const URL_REGEX = /(?:https?:\/\/|www\.|(?:\b(?:wa\.me|t\.me|bit\.ly|youtu\.be)\/))[^\s\])"'>]+/gi;

/** Extrai links e endereços web presentes no texto */
function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(URL_REGEX) || [];
}

/** Normaliza URL para comparação (ignora protocolo e barras finais) */
function cleanUrl(u) {
  return String(u || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Verifica que todos os links originais continuam presentes no texto gerado.
 * Se algum link for omitido ou corrompido, o serviço descarta a variação.
 * @param {string} original
 * @param {string} generated
 * @returns {boolean}
 */
function urlsPreserved(original, generated) {
  const origUrls = extractUrls(original);
  if (origUrls.length === 0) return true; // sem URLs: sem restrição

  const genUrls = extractUrls(generated).map(cleanUrl);

  return origUrls.every(u => {
    const cleaned = cleanUrl(u);
    return genUrls.some(gu => gu.includes(cleaned) || cleaned.includes(gu));
  });
}

/**
 * Verifica se placeholders no formato {tag} foram preservados
 * @param {string} original
 * @param {string} generated
 * @returns {boolean}
 */
function placeholdersPreserved(original, generated) {
  const tags = original.match(/\{[a-zA-Z0-9_-]+\}/g) || [];
  if (tags.length === 0) return true;
  return tags.every(tag => generated.includes(tag));
}

/**
 * Sanitiza a saída para garantir compatibilidade com WhatsApp
 * - Converte **negrito** (Markdown padrão) para *negrito* (WhatsApp)
 * - Remove hashtags tipo ## Título
 */
function sanitizeWhatsAppMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // **texto** -> *texto*
    .replace(/^#{1,6}\s+/gm, '*');      // ## Título -> *Título
}

/**
 * Gera uma variação reformulada do texto de automsg via DeepSeek.
 *
 * @param {string} originalMessage - Texto configurado pelo admin
 * @param {string} [lang='pt']     - Idioma do grupo ('pt' | 'es' | 'en')
 * @returns {Promise<string|null>} - Texto reformulado ou null em caso de falha
 */
async function generateAutomsgVariation(originalMessage, lang = 'pt') {
  if (!originalMessage || !originalMessage.trim()) return null;

  // Lê configuração da API (mesmas variáveis do aiService.js)
  const enabled = (process.env.AI_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return null;

  const apiKey = (process.env.AI_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model   = process.env.AI_MODEL || 'deepseek-chat';
  const endpoint = `${baseUrl}/chat/completions`;

  const langMap = {
    pt: 'Português do Brasil',
    es: 'Español',
    en: 'English'
  };
  const langName = langMap[lang] || 'Português do Brasil';

  // Links que devem ser preservados
  const urls = extractUrls(originalMessage);
  const urlInstruction = urls.length > 0
    ? `MANDATÓRIO: Preserve EXATAMENTE estes links sem alterar, omitir ou encurtar: ${urls.join(', ')}.`
    : '';

  // Detecta se a mensagem é um aviso curto
  const lineCount = originalMessage.trim().split(/\r\n|\r|\n/).length;
  const isShortNotice = originalMessage.length < 120 && lineCount <= 2;

  const systemPrompt = [
    `Você é um redator profissional de avisos e comunicados para grupos de WhatsApp.`,
    `Sua função é REESCREVER a mensagem fornecida com palavras diferentes (anti-spam de mensagens idênticas), mantendo EXATAMENTE o mesmo sentido, tom e intenção.`,
    `Idioma obrigatório: ${langName}.`,
    ``,
    `REGRAS ESTRITAS DE PRESERVAÇÃO DE CONTEXTO:`,
    `1. ZERO ALUCINAÇÃO / SEM INVENÇÃO:`,
    `   - NUNCA invente regras, informações, horários, canais ou consequências que não existem no original.`,
    `   - Se for um AVISO OU REGRA (ex: "leiam as regras", "proibido links"): mantenha a mesma seriedade e firmeza. NUNCA suavize ordens (se diz "proibido", NÃO transforme em "evitem" ou "pedimos por favor").`,
    `   - Se a mensagem original for curta (1 ou 2 linhas), a sua resposta DEVE ser curta e direta (1 ou 2 linhas). Proibido criar redação longa para aviso curto.`,
    `2. PRESERVAÇÃO TÉCNICA:`,
    `   - Preserve todas as tags no formato {tag} (ex: {group}, {user}).`,
    `   - Formatação WhatsApp: use apenas um asterisco para negrito (*palavra*). NUNCA use asterisco duplo (**palavra**).`,
    `   - Mantenha emojis coerentes com o original.`,
    `3. RESPOSTA DIRETA:`,
    `   - Retorne APENAS o texto pronto para envio. Zero explicações, zero rascunhos, zero prefixos como "Variação:" ou "Opção:".`,
    urlInstruction
  ].filter(Boolean).join('\n');

  const maxTokens = Math.min(800, Math.max(300, Math.ceil(originalMessage.length * 2.5)));

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Reescreva mantendo estritamente o sentido original:\n\n${originalMessage}` }
    ],
    max_tokens: maxTokens,
    // 0.6 = Variação lexical natural sem alucinação nem perda de sentido
    temperature: 0.6
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000) // 8s timeout seguro
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, '[automsgVariation] API retornou erro HTTP');
      return null;
    }

    const data = await response.json();
    let generated = data?.choices?.[0]?.message?.content?.trim();

    if (!generated || generated.length < 4) {
      logger.warn('[automsgVariation] Resposta vazia ou curta demais');
      return null;
    }

    // Se o modelo cortou por limite de tokens, descarta e usa original
    if (data?.choices?.[0]?.finish_reason === 'length') {
      logger.warn('[automsgVariation] Resposta truncada por tamanho — usando fallback');
      return null;
    }

    // Sanitiza formatação para WhatsApp
    generated = sanitizeWhatsAppMarkdown(generated);

    // Validação 1: Links originais preservados
    if (!urlsPreserved(originalMessage, generated)) {
      logger.warn({ original: originalMessage, generated }, '[automsgVariation] URL ausente ou corrompida — usando fallback');
      return null;
    }

    // Validação 2: Placeholders {tags} preservados
    if (!placeholdersPreserved(originalMessage, generated)) {
      logger.warn({ original: originalMessage, generated }, '[automsgVariation] Placeholder {tag} ausente — usando fallback');
      return null;
    }

    // Validação 3: Proteção contra expansão absurda em avisos curtos
    if (isShortNotice && generated.length > originalMessage.length * 3.5) {
      logger.warn({ original: originalMessage, generated }, '[automsgVariation] Modelo expandiu aviso curto excessivamente — usando fallback');
      return null;
    }

    return generated;

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      logger.warn('[automsgVariation] Timeout na API DeepSeek — usando texto original');
    } else {
      logger.warn({ err: err.message }, '[automsgVariation] Erro ao chamar API — usando texto original');
    }
    return null;
  }
}

module.exports = {
  generateAutomsgVariation,
  extractUrls,
  urlsPreserved,
  placeholdersPreserved,
  sanitizeWhatsAppMarkdown
};
