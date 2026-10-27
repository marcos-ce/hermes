/**
 * Motor de Humanização Textual para Respostas de Inteligência Artificial
 * Estritamente confinado em src/services/
 *
 * Elimina vícios sintáticos de IA (travessões —, preâmbulos artificiais,
 * fórmulas de assistente virtual, clichês e excesso de emojis)
 * para garantir tom de conversa natural e humano no WhatsApp.
 */

/**
 * Humaniza o texto gerado por IA para o estilo de conversa real de WhatsApp (PT-BR)
 * @param {string} rawText Texto bruto retornado pelo modelo de linguagem
 * @returns {string} Texto formatado, humano, fluido e sem marcas de IA
 */
function humanizeAIText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  // 0. Remove tags de thinking explícitas de modelos de raciocínio (<think>...</think> ou <thought>...</thought>)
  text = text.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '').trim();

  // 0.1 Remove blocos de monólogo interno / scratchpad que o modelo rascunha para si mesmo:
  // Ex: [Contexto] ... Resposta curta: ... Melhor: ... Sem emoji. ...
  text = text.replace(/(?:^|\n)Sem emojis?\.?\s*/gi, '\n').trim();

  const rawLines = text.split('\n');
  const filteredLines = [];
  let inScratchpad = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Início de bloco de metadados / raciocínio
    if (/^\[(?:Contexto|Racioc[ií]nio|Pensamento|Thought|Reasoning|An[aá]lise|Inten[cç][aã]o)\]/i.test(line)) {
      inScratchpad = true;
      continue;
    }

    // Linha de rascunhos intermediários (ex: "Resposta curta: ...", "Rascunho:", "Opção 1:")
    if (/^(?:Resposta curta|Rascunho|Primeira tentativa|Tentativa|Op[cç][aã]o \d+):\s*/i.test(line)) {
      inScratchpad = true;
      continue;
    }

    // Linha de "Melhor: ..."
    if (/^Melhor:\s*/i.test(line)) {
      inScratchpad = true;
      continue;
    }

    // Se estiver em scratchpad
    if (inScratchpad) {
      if (line.length === 0) continue;
      // Frases típicas de monólogo
      if (/^(?:Devo responder|N[aã]o existe ferramenta|Vou responder|Vou dizer|Explico rapidamente)/i.test(line)) {
        continue;
      }
      // Saiu do scratchpad, encontrou conteúdo real
      inScratchpad = false;
    }

    if (line.length > 0) {
      filteredLines.push(rawLines[i]);
    }
  }

  text = filteredLines.join('\n').trim();

  // Remove aspas de fechamento soltas no final de rascunhos
  if (text.startsWith('"') && text.endsWith('"') && text.indexOf('"', 1) === text.length - 1) {
    text = text.slice(1, -1).trim();
  } else if (text.endsWith('"') && !text.includes('"', 0)) {
    text = text.slice(0, -1).trim();
  }

  // 1. Remove emojis típicos de robô/IA
  text = text.replace(/[\u{1F916}\u{1F47E}]/gu, '').trim(); // 🤖 👾

  // 2. Remove preâmbulos, saudações robóticas e clichês de IA de início de frase iterativamente
  let prev;
  do {
    prev = text;
    text = text
      .replace(/^(?:Claro|Com certeza|Entendido|Perfeito|Certamente)[!.,]?\s*/i, '')
      .replace(/^(?:Como (?:um )?assistente(?: de IA| virtual)?|Como uma inteligência artificial|Como modelo de linguagem)[^.,!\n]*[.,!\n]?\s*/i, '')
      .replace(/^(?:Olá[!.,]?|Oi[!.,]?)\s*(?:Como posso (?:te |lhe )?ajudar\??|Tudo bem\??)\s*/i, '')
      .replace(/^Estou aqui para ajudar[.,!\n]?\s*/i, '')
      .replace(/^Estou à disposição[.,!\n]?\s*/i, '')
      .trim();
  } while (text !== prev && text.length > 0);

  // 3. Substitui travessões (em-dash "—" e en-dash "–") por pontuação natural humana
  // No WhatsApp nenhum brasileiro digita travessão; usamos vírgula, ponto ou traço comum
  text = text.replace(/\s*[—–]\s*/g, (match, offset, fullStr) => {
    const before = fullStr.slice(0, offset).trim();
    const after = fullStr.slice(offset + match.length).trim();
    if (!before) return '';
    if (!after) return '.';
    if (/^[a-zà-ÿ]/i.test(after)) {
      return ', ';
    }
    return '. ';
  });

  // Qualquer travessão residual isolado vira traço comum
  text = text.replace(/[—–]/g, '-');

  // 4. Limita a no máximo 1 emoji por resposta inteira (combate "emojificação" excessiva)
  let emojiCount = 0;
  text = text.replace(/\p{Extended_Pictographic}/gu, (match) => {
    emojiCount++;
    return emojiCount <= 1 ? match : '';
  });

  // 5. Suaviza fórmulas e clichês de assistente virtual no corpo da mensagem
  text = text
    .replace(/\bdeseja que eu execute\b/gi, 'quer que eu faça')
    .replace(/\bdeseja que eu realize\b/gi, 'quer que eu faça')
    .replace(/\bposso te ajudar em algo mais\??/gi, '')
    .replace(/\bqualquer dúvida estou à disposição\.?/gi, '')
    .replace(/\s*,\s*,+/g, ',')
    .replace(/\s*\.\s*\.+/g, '.')
    .replace(/,\s*([.?!])/g, '$1')
    .replace(/\s+([,.:?!])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Garante primeira letra maiúscula após cortes de prefixos
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

module.exports = {
  humanizeAIText
};
