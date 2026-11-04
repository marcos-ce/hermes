'use strict';

/**
 * ============================================================
 *  automsgVariationService — Variação Contextual de AutoMsg via IA
 * ============================================================
 * Recebe o texto original configurado pelo admin e devolve uma
 * reformulação natural da mensagem, preservando:
 *   - URLs/links intactos (sem encurtar, alterar ou remover)
 *   - O significado e a chamada-para-ação essencial
 *   - Emojis presentes no original (se houver)
 *
 * REGRA DE ISOLAMENTO (GEMINI.md):
 *   Chamadas de IA ficam ESTRITAMENTE em src/services/.
 *   O automsg.js apenas importa esta função — nunca acessa a API diretamente.
 *
 * Fallback: retorna null se a IA falhar ou estiver desabilitada.
 * O automsg.js deve usar o texto original quando receber null.
 */

const logger = require('../utils/logger');

/** Extrai todas as URLs presentes no texto para revalidação pós-geração. */
function extractUrls(text) {
  const urlRe = /https?:\/\/[^\s\])"'>]+/gi;
  return text.match(urlRe) || [];
}

/**
 * Verifica que todas as URLs originais continuam presentes no texto gerado.
 * Se alguma URL sumir, o serviço retorna null (usar fallback).
 * @param {string} original
 * @param {string} generated
 * @returns {boolean}
 */
function urlsPreserved(original, generated) {
  const origUrls = extractUrls(original);
  if (origUrls.length === 0) return true; // sem URLs: sem restrição
  return origUrls.every(url => generated.includes(url));
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

  // Lê configuração da API (mesmas vars do aiService.js)
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

  // URLs presentes no original — devem ser mantidas literalmente
  const urls = extractUrls(originalMessage);
  const urlNote = urls.length > 0
    ? `IMPORTANTE: preserve as seguintes URLs exatamente como estão, sem alterar nenhum caractere: ${urls.join(', ')}.`
    : '';

  const systemPrompt = [
    `Você é um redator de comunicados de grupo de WhatsApp. Sua única tarefa é reformular a mensagem abaixo com palavras diferentes, mantendo o mesmo significado e chamada-para-ação.`,
    `Idioma obrigatório: ${langName}.`,
    `Regras estritas:`,
    `- Retorne APENAS o texto final. Zero explicações, zero prefixos como "Resposta:", "Variação:", etc.`,
    `- Mantenha o mesmo número aproximado de linhas e tamanho do original.`,
    `- Varie o início da frase, os verbos e os conectivos — nunca repita a estrutura exata do original.`,
    `- Preserve emojis se existirem no original.`,
    `- NÃO adicione saudações genéricas (Olá!, Oi!, Bom dia!) a menos que já existam no original.`,
    urlNote
  ].filter(Boolean).join('\n');

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Reformule esta mensagem:\n\n${originalMessage}` }
    ],
    max_tokens: 300,
    temperature: 0.9  // alta criatividade para gerar variações reais
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000) // 8s — timeout generoso para o scheduler
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, '[automsgVariation] API retornou erro HTTP');
      return null;
    }

    const data = await response.json();
    const generated = data?.choices?.[0]?.message?.content?.trim();

    if (!generated || generated.length < 5) {
      logger.warn('[automsgVariation] Resposta vazia ou muito curta');
      return null;
    }

    // Validação de integridade: todas as URLs do original devem estar presentes
    if (!urlsPreserved(originalMessage, generated)) {
      logger.warn({ original: originalMessage, generated }, '[automsgVariation] URL perdida na geração — usando fallback');
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

module.exports = { generateAutomsgVariation };
