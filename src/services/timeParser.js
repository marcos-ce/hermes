const settings = require('../config/settings');

/**
 * Utilitário de interpretação e conversão de horários relativos, durações e horários fixos
 * Estritamente confinado em src/services/
 *
 * Converte expressões como "daqui a meia hora", "em 1 hora", "em 15 minutos",
 * "10m", "10 minutos", "por 15 minutos", "duas horas", "amanhã às 10h", "meio-dia"
 * em data e hora exatas no fuso horário configurado.
 */

const WORD_NUMBERS = {
  'zero': 0,
  'um': 1, 'uma': 1, 'one': 1,
  'dois': 2, 'duas': 2, 'two': 2,
  'tres': 3, 'três': 3, 'three': 3,
  'quatro': 4, 'four': 4,
  'cinco': 5, 'five': 5,
  'seis': 6, 'six': 6,
  'sete': 7, 'seven': 7,
  'oito': 8, 'eight': 8,
  'nove': 9, 'nine': 9,
  'dez': 10, 'ten': 10,
  'onze': 11, 'eleven': 11,
  'doze': 12, 'twelve': 12,
  'treze': 13, 'thirteen': 13,
  'quatorze': 14, 'catorze': 14, 'fourteen': 14,
  'quinze': 15, 'fifteen': 15,
  'dezesseis': 16, 'sixteen': 16,
  'dezessete': 17, 'seventeen': 17,
  'dezoito': 18, 'eighteen': 18,
  'dezenove': 19, 'nineteen': 19,
  'vinte': 20, 'twenty': 20,
  'trinta': 30, 'thirty': 30,
  'quarenta': 40, 'forty': 40,
  'cinquenta': 50, 'fifty': 50,
  'sessenta': 60, 'sixty': 60
};

/**
 * Normaliza números por extenso em dígitos numéricos na string (ex: "duas horas" -> "2 horas", "quinze minutos" -> "15 minutos")
 * @param {string} str
 * @returns {string}
 */
function normalizeWordNumbers(str) {
  let s = str.toLowerCase();

  // Combinações compostas comuns primeiro
  s = s.replace(/\b(?:uma|1)\s+hora\s+e\s+(?:meia|30(?:\s*minutos?)?)\b/gi, '90 minutos');
  s = s.replace(/\b(?:duas|2)\s+horas\s+e\s+(?:meia|30(?:\s*minutos?)?)\b/gi, '150 minutos');
  s = s.replace(/\b(?:tres|três|3)\s+horas\s+e\s+(?:meia|30(?:\s*minutos?)?)\b/gi, '210 minutos');
  s = s.replace(/\bvinte\s+e\s+cinco\b/gi, '25');
  s = s.replace(/\btrinta\s+e\s+cinco\b/gi, '35');
  s = s.replace(/\bquarenta\s+e\s+cinco\b/gi, '45');
  s = s.replace(/\bcinquenta\s+e\s+cinco\b/gi, '55');

  // Substituição de números por extenso individuais
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    s = s.replace(regex, String(num));
  }
  return s;
}

/**
 * Interpreta uma duração temporal pura (ex: "10m", "10 minutos", "por 15 minutos", "duas horas", "1h30")
 * @param {string|number} input
 * @returns {{ minutes: number, ms: number, formatted: string } | null}
 */
function parseDuration(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    const mins = Math.max(1, Math.round(input));
    return formatDurationResult(mins);
  }

  const rawStr = String(input).trim();
  if (!rawStr) return null;

  const normalized = normalizeWordNumbers(rawStr);

  // 1. Meia hora
  if (/(?:por\s+|durante\s+|daqui\s+a\s+|dq\s+a\s+|em\s+)?meia\s+hora/i.test(normalized) || /half\s+an\s+hour/i.test(normalized) || /media\s+hora/i.test(normalized)) {
    return formatDurationResult(30);
  }

  // 2. Horas e minutos combinados (ex: "1h30", "1h30m", "2h15min", "1 hora e 20 minutos")
  const hAndM = normalized.match(/(?:por\s+|durante\s+|daqui\s+a\s+|dq\s+a\s+|em\s+)?(\d+)\s*h(?:oras?)?\s*(?:e\s+)?(\d+)\s*(?:m|min|mins|minutos?)?/i);
  if (hAndM && hAndM[1] && hAndM[2]) {
    const mins = parseInt(hAndM[1], 10) * 60 + parseInt(hAndM[2], 10);
    if (mins > 0) return formatDurationResult(mins);
  }

  // 3. Dias (ex: "1 dia", "2 dias", "7d", "por 3 dias")
  const daysMatch = normalized.match(/(?:por\s+|durante\s+|daqui\s+a\s+|dq\s+a\s+|em\s+)?(\d+)\s*(?:dias?|days?|d)\b/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days > 0) return formatDurationResult(days * 1440);
  }

  // 4. Minutos explícitos (ex: "10m", "10 min", "10 minutos", "por 15 mins", "daqui a 30m")
  const minsMatch = normalized.match(/(?:por\s+|durante\s+|daqui\s+a\s+|dq\s+a\s+|em\s+|depois\s+de\s+|\+)?(\d+)\s*(?:minutos?|mins?|m)\b/i);
  if (minsMatch) {
    const mins = parseInt(minsMatch[1], 10);
    if (!isNaN(mins) && mins > 0) return formatDurationResult(mins);
  }

  // 5. Horas explícitas (ex: "2 horas", "2h", "1 hora", "por 3 horas", "1.5h")
  const hoursMatch = normalized.match(/(?:por\s+|durante\s+|daqui\s+a\s+|dq\s+a\s+|em\s+|depois\s+de\s+|\+)?(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|hs?|h)\b/i);
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1].replace(',', '.'));
    if (!isNaN(hours) && hours > 0) {
      return formatDurationResult(Math.round(hours * 60));
    }
  }

  // 6. Segundos (ex: "30s", "45 segundos")
  const secsMatch = normalized.match(/(?:por\s+|durante\s+)?(\d+)\s*(?:segundos?|segs?|s)\b/i);
  if (secsMatch) {
    const secs = parseInt(secsMatch[1], 10);
    if (!isNaN(secs) && secs > 0) {
      const mins = Math.max(1, Math.round(secs / 60));
      return {
        minutes: mins,
        ms: secs * 1000,
        formatted: `${secs}s`
      };
    }
  }

  // 7. Apenas número puro (ex: "15" ou "30") -> assume minutos
  if (/^\d+$/.test(normalized)) {
    const mins = parseInt(normalized, 10);
    if (mins > 0) return formatDurationResult(mins);
  }

  return null;
}

function formatDurationResult(minutes) {
  const capped = Math.min(Math.max(1, minutes), 43200); // máx 30 dias
  let formatted = '';
  if (capped >= 1440) {
    const days = Math.floor(capped / 1440);
    const remMins = capped % 1440;
    formatted = remMins > 0 ? `${days}d${Math.floor(remMins / 60)}h` : `${days}d`;
  } else if (capped >= 60) {
    const hrs = Math.floor(capped / 60);
    const mins = capped % 60;
    formatted = mins > 0 ? `${hrs}h${mins}m` : `${hrs}h`;
  } else {
    formatted = `${capped}m`;
  }
  return {
    minutes: capped,
    ms: capped * 60 * 1000,
    formatted
  };
}

/**
 * Converte número de minutos, texto relativo ou horário fixo em data/hora exata no fuso do servidor
 * @param {string|number} input Minutos (número), texto relativo ("daqui a meia hora", "10m", "duas horas") ou horário ("22:00", "amanhã às 10h")
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

  const rawStr = String(input).trim();
  if (!rawStr) return { success: false };

  const normalized = normalizeWordNumbers(rawStr);

  // 2. Verifica se é claramente um horário fixo de relógio:
  // - Tem "às" / "as" / "at" (ex: "às 22h", "as 14:00")
  // - Tem "amanhã" / "tomorrow" / "mañana" / "hoje às"
  // - É formato de relógio HH:MM (ex: "22:00", "08:30")
  // - É meio-dia ou meia-noite
  const isExplicitFixedClock =
    /(?:[aàá]s|at)\s+\d+/i.test(normalized) ||
    /amanh[aã]|tomorrow|mañana/i.test(normalized) ||
    /hoje\s+[aàá]s/i.test(normalized) ||
    /^\s*\d{1,2}:\d{2}\s*$/.test(normalized) ||
    /meio-?dia|midday|noon|meia-?noite|midnight/i.test(normalized);

  // Se NÃO for explicitamente horário fixo, tenta interpretar como DURAÇÃO primeiro:
  // Isso garante que "10m", "10 minutos", "por 15 minutos", "2 horas", "duas horas" sejam durações e NÃO 10:00 da manhã!
  if (!isExplicitFixedClock) {
    const dur = parseDuration(normalized);
    if (dur && dur.minutes > 0) {
      const targetMs = now.getTime() + dur.ms;
      const target = new Date(targetMs);
      return formatResult(target, dur.minutes, tz);
    }
  }

  // 3. Horários fixos de relógio ("amanhã às 10h", "hoje às 18:30", "meio-dia", "22:00", "às 14h")
  let isTomorrow = /amanh[aã]|tomorrow|mañana/i.test(normalized);
  let targetHour = null;
  let targetMin = 0;

  if (normalized.includes('meio-dia') || normalized.includes('meiodia') || normalized.includes('midday') || normalized.includes('noon')) {
    targetHour = 12;
    targetMin = 0;
  } else if (normalized.includes('meia-noite') || normalized.includes('meianoite') || normalized.includes('midnight')) {
    targetHour = 0;
    targetMin = 0;
  } else {
    // Procura padrão de hora: 14:30 ou 14h30 ou 14h ou 14:00 ou às 14
    const timeMatch = normalized.match(/(?:[aàá]s\s+)?(\d{1,2})(?:[:hH](\d{1,2})?)?/);
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
  parseRelativeTime,
  parseDuration,
  normalizeWordNumbers
};
