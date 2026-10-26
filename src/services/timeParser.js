const settings = require('../config/settings');

/**
 * Utilitário de interpretação e conversão de horários relativos e abstratos
 * Estritamente confinado em src/services/
 *
 * Converte expressões como "daqui a meia hora", "em 1 hora", "em 15 minutos",
 * "amanhã às 10h", "meio-dia" em data e hora exatas no fuso horário configurado.
 */

/**
 * Converte número de minutos ou texto relativo em data/hora exata no fuso do servidor
 * @param {string|number} input Minutos (número) ou texto (ex: "daqui a meia hora", "em 1 hora", "15m")
 * @param {Date} [baseDate] Data base (padrão: agora)
 * @returns {{
 *   success: boolean,
 *   targetDate?: Date,
 *   formattedDate?: string, // "DD/MM"
 *   formattedTime?: string, // "HH:MM"
 *   delayMinutes?: number,
 *   delayMs?: number,
 *   humanLabel?: string
 * }}
 */
function parseRelativeTime(input, baseDate = new Date()) {
  if (input === null || input === undefined) return { success: false };

  const tz = settings.timezone || 'America/Sao_Paulo';
  const now = baseDate;

  // 1. Se for número direto (ex: 30 ou 60) -> minutos
  if (typeof input === 'number') {
    const delayMinutes = Math.max(1, Math.round(input));
    const targetMs = now.getTime() + delayMinutes * 60 * 1000;
    const target = new Date(targetMs);
    return formatResult(target, delayMinutes, tz);
  }

  const rawStr = String(input).trim().toLowerCase();
  if (!rawStr) return { success: false };

  // 2. Reconhecimento de padrões em linguagem natural (PT/ES/EN)
  let delayMinutes = null;

  // Meia hora / Uma hora e meia
  if (/(?:daqui\s+a\s+|dq\s+a\s+|daqui\s+|dq\s+|em\s+)?meia\s+hora/i.test(rawStr) || /half\s+an\s+hour/i.test(rawStr) || /media\s+hora/i.test(rawStr)) {
    delayMinutes = 30;
  } else if (/(?:daqui\s+a\s+|dq\s+a\s+|daqui\s+|dq\s+|em\s+)?(?:1|uma|una|one)\s+hora\s+e\s+meia/i.test(rawStr)) {
    delayMinutes = 90;
  }

  // "X horas" ou "Xh" com prefixo relativo ("daqui a", "dq a", "em", "+", "depois de")
  if (delayMinutes === null) {
    const hoursMatch = rawStr.match(/(?:daqui\s+a\s+|dq\s+a\s+|daqui\s+|dq\s+|em\s+|depois\s+de\s+|\+)(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|hs?|h)\b/i);
    if (hoursMatch) {
      const hoursVal = parseFloat(hoursMatch[1].replace(',', '.'));
      if (!isNaN(hoursVal) && hoursVal > 0) {
        delayMinutes = Math.round(hoursVal * 60);
      }
    }
  }

  // "uma hora" por extenso com prefixo relativo
  if (delayMinutes === null && /(?:daqui\s+a\s+|dq\s+a\s+|daqui\s+|dq\s+|em\s+|depois\s+de\s+)(?:uma|una|one)\s+hora\b/i.test(rawStr)) {
    delayMinutes = 60;
  }

  // "X minutos" ou "Xm" / "Xmin" com prefixo relativo
  if (delayMinutes === null) {
    const minsMatch = rawStr.match(/(?:daqui\s+a\s+|dq\s+a\s+|daqui\s+|dq\s+|em\s+|depois\s+de\s+|\+)(\d+)\s*(?:minutos?|mins?|m)\b/i);
    if (minsMatch) {
      const minsVal = parseInt(minsMatch[1], 10);
      if (!isNaN(minsVal) && minsVal > 0) {
        delayMinutes = minsVal;
      }
    }
  }

  // Se foi detectada expressão relativa de minutos:
  if (delayMinutes !== null && delayMinutes > 0) {
    const targetMs = now.getTime() + delayMinutes * 60 * 1000;
    const target = new Date(targetMs);
    return formatResult(target, delayMinutes, tz);
  }

  // 3. Horários fixos ("amanhã às 10h", "hoje às 18:30", "meio-dia", "15:00")
  let isTomorrow = /amanh[aã]|tomorrow|mañana/i.test(rawStr);
  let targetHour = null;
  let targetMin = 0;

  if (rawStr.includes('meio-dia') || rawStr.includes('meiodia') || rawStr.includes('midday') || rawStr.includes('noon')) {
    targetHour = 12;
    targetMin = 0;
  } else if (rawStr.includes('meia-noite') || rawStr.includes('meianoite') || rawStr.includes('midnight')) {
    targetHour = 0;
    targetMin = 0;
  } else {
    // Procura padrão de hora: 14:30 ou 14h30 ou 14h ou 14:00
    const timeMatch = rawStr.match(/(?:[aàá]s\s+)?(\d{1,2})(?:[:hH](\d{1,2})?)?/);
    if (timeMatch) {
      targetHour = parseInt(timeMatch[1], 10);
      targetMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    }
  }

  if (targetHour !== null && targetHour >= 0 && targetHour <= 23 && targetMin >= 0 && targetMin <= 59) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    });
    const parts = formatter.formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const currentHour = parseInt(parts.hour, 10);
    const currentMin = parseInt(parts.minute, 10);

    if (isTomorrow || (targetHour < currentHour || (targetHour === currentHour && targetMin <= currentMin))) {
      isTomorrow = true;
    }

    let diffMinutes = 0;
    if (isTomorrow) {
      diffMinutes = ((24 - currentHour) + targetHour) * 60 + (targetMin - currentMin);
    } else {
      diffMinutes = (targetHour - currentHour) * 60 + (targetMin - currentMin);
    }
    diffMinutes = Math.max(1, diffMinutes);

    const targetDate = new Date(now.getTime() + diffMinutes * 60 * 1000);
    return formatResult(targetDate, diffMinutes, tz);
  }

  return { success: false };
}

function formatResult(targetDate, delayMinutes, tz) {
  let formattedDate = '';
  let formattedTime = '';
  try {
    const dateParts = targetDate.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
    formattedDate = `${dateParts[0].padStart(2, '0')}/${dateParts[1].padStart(2, '0')}`;
    const timeParts = targetDate.toLocaleTimeString('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).split(':');
    formattedTime = `${timeParts[0].padStart(2, '0')}:${(timeParts[1] || '00').padStart(2, '0')}`;
  } catch (_) {
    formattedDate = `${String(targetDate.getDate()).padStart(2, '0')}/${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    formattedTime = `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`;
  }

  let humanLabel = '';
  if (delayMinutes < 60) {
    humanLabel = `daqui a ${delayMinutes} minuto${delayMinutes > 1 ? 's' : ''} (às ${formattedTime})`;
  } else if (delayMinutes === 60) {
    humanLabel = `daqui a 1 hora (às ${formattedTime})`;
  } else if (delayMinutes % 60 === 0) {
    const hrs = delayMinutes / 60;
    humanLabel = `daqui a ${hrs} horas (às ${formattedTime})`;
  } else {
    const hrs = Math.floor(delayMinutes / 60);
    const mins = delayMinutes % 60;
    humanLabel = `daqui a ${hrs}h e ${mins}min (às ${formattedTime})`;
  }

  return {
    success: true,
    targetDate,
    formattedDate,
    formattedTime,
    delayMinutes,
    delayMs: delayMinutes * 60 * 1000,
    humanLabel
  };
}

module.exports = {
  parseRelativeTime
};
