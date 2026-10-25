const { sendSafeMessage } = require('../../utils/antiBan');
const pollTracker = require('../../utils/pollTracker');
const logger = require('../../utils/logger');

/**
 * Faz o parse flexível do texto da enquete suportando:
 * 1. Formato com barra pipe (|): "!enquete Pergunta | Opção 1 | Opção 2"
 * 2. Formato em múltiplas linhas: "!enquete Pergunta\n1. Opção 1\n2. Opção 2"
 * 3. Flag de múltipla escolha: "--multi" ou "-m"
 * @param {string} rawText 
 * @returns {{ title: string, options: string[], isMultiple: boolean }}
 */
function parsePollInput(rawText = '') {
  let isMultiple = false;
  let text = (rawText || '').trim();

  // Detecção e remoção da flag de múltipla escolha
  if (/^--multi\b/i.test(text) || /^-m\b/i.test(text)) {
    isMultiple = true;
    text = text.replace(/^(--multi|-m)\s*/i, '').trim();
  }

  let title = '';
  let options = [];

  // 1. Formato delimitado por Pipe (|)
  if (text.includes('|')) {
    const parts = text.split('|').map(s => s.trim()).filter(Boolean);
    title = parts[0] || '';
    options = parts.slice(1);
  }
  // 2. Formato por quebras de linha
  else if (text.includes('\n')) {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    title = lines[0] || '';
    options = lines.slice(1).map(opt => {
      // Remove marcadores comuns no início (ex: "1.", "1 -", "-", "•", "*")
      return opt.replace(/^([0-9]{1,2}[.\-)]\s*|[-*•]\s*)/, '').trim();
    }).filter(Boolean);
  }

  // Deduplicação e corte de tamanho para os limites oficiais do WhatsApp
  const uniqueOptions = [];
  const seen = new Set();
  for (const opt of options) {
    const cleanOpt = opt.slice(0, 100).trim();
    const lower = cleanOpt.toLowerCase();
    if (cleanOpt.length > 0 && !seen.has(lower)) {
      seen.add(lower);
      uniqueOptions.push(cleanOpt);
    }
  }

  return {
    title: title.slice(0, 255).trim(),
    options: uniqueOptions,
    isMultiple
  };
}

module.exports = {
  name: 'poll',
  cmdNumber: 27,
  aliases: ['poll', 'enquete', 'votacao', 'votação', 'votacion', 'votación'],
  usage: 'enquete [--multi] Pergunta | Opção 1 | Opção 2 [...]',
  description: {
    pt: 'Cria uma enquete oficial interativa no grupo',
    es: 'Crea una encuesta oficial interactiva en el grupo',
    en: 'Creates an official interactive poll in the group'
  },
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  parsePollInput,

  async execute({ sock, from, text, reply, t, prefix, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const parsed = parsePollInput(text);

    // Se não forneceu pergunta ou não tem pelo menos 2 opções válidas, exibe guia com exemplos
    if (!parsed.title || parsed.options.length < 2) {
      return reply(t('poll.usage', { prefix: prefix || '!' }));
    }

    // WhatsApp permite no máximo 12 opções por enquete
    const finalOptions = parsed.options.slice(0, 12);
    const selectableCount = parsed.isMultiple ? 0 : 1;

    try {
      const sent = await sendSafeMessage(sock, from, {
        poll: {
          name: parsed.title,
          values: finalOptions,
          selectableCount
        }
      });
      if (sent?.key?.id) {
        pollTracker.savePoll(from, sent);
      }
    } catch (err) {
      logger.error({ err, from, title: parsed.title }, 'Erro ao criar enquete via comando');
      return reply(t('poll.error'));
    }
  }
};
