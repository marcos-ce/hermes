const memoryEngine = require('./memoryEngine');

/**
 * Normaliza horário no formato HH:MM ou '0' para desativado
 * @param {string} raw 
 * @returns {string|null}
 */
function normalizeTime(raw) {
  if (!raw) return null;
  raw = String(raw).trim().toLowerCase();
  if (raw === '0' || raw === 'off' || raw === 'nenhum' || raw === 'desativar') return '0';

  const matchHHMM = raw.match(/^([0-1]?[0-9]|2[0-3])[:h]([0-5][0-9])?$/);
  if (matchHHMM) {
    const hh = matchHHMM[1].padStart(2, '0');
    const mm = (matchHHMM[2] || '00').padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return null;
}

/**
 * Formata a exibição do usuário com menção @número e nome entre parênteses, se disponível
 * Ex: "559899944034 (Mello)" ou apenas "559899944034"
 * @param {string} from JID do grupo
 * @param {object} targetData Dados resolvidos do alvo
 * @returns {string}
 */
function formatUserDisplay(from, targetData) {
  if (!targetData) return '';
  const num = targetData.displayNum || '';
  const knownName = targetData.name ||
                    (memoryEngine ? (memoryEngine.getParticipantName(from, targetData.phoneJid) || memoryEngine.getParticipantName(from, targetData.groupJid)) : null);
  if (knownName && String(knownName).trim() && !/^\d{8,15}$/.test(String(knownName).trim())) {
    return `${num} (${String(knownName).trim()})`;
  }
  return num;
}

module.exports = {
  normalizeTime,
  formatUserDisplay
};
