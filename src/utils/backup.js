const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');
const logger = require('./logger');

/**
 * Backup Automático Offsite via Telegram (Bot API).
 * Envia data/groups.json e data/polls.json como documentos 1x por dia.
 * Zero dependências novas: usa fetch / FormData / Blob nativos do Node 22.
 */

const DATA_DIR = path.resolve(process.cwd(), 'data');

/** Retorna true se as variáveis do Telegram estão configuradas. */
function isConfigured() {
  return Boolean(settings.backupTelegramToken && settings.backupTelegramChatId);
}

/**
 * Envia um arquivo como documento para o chat configurado no Telegram.
 * @param {string} filename
 * @param {Buffer} buffer
 * @param {string} caption
 */
async function sendTelegramDocument(filename, buffer, caption) {
  const url = `https://api.telegram.org/bot${settings.backupTelegramToken}/sendDocument`;
  const form = new FormData();
  form.append('chat_id', settings.backupTelegramChatId);
  form.append('caption', caption);
  form.append('document', new Blob([buffer], { type: 'application/json' }), filename);

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Executa o backup agora: envia groups.json e polls.json para o Telegram.
 * @returns {Promise<boolean>}
 */
async function performBackup() {
  if (!isConfigured()) {
    logger.warn('[backup] Telegram não configurado (BACKUP_TELEGRAM_TOKEN / BACKUP_TELEGRAM_CHAT_ID). Backup ignorado.');
    return false;
  }

  try {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const files = ['groups.json', 'polls.json'];

    for (const name of files) {
      const filePath = path.join(DATA_DIR, name);
      if (!fs.existsSync(filePath)) continue;

      const buffer = fs.readFileSync(filePath);
      let extra = '';
      if (name === 'groups.json') {
        try {
          const data = JSON.parse(buffer.toString('utf-8'));
          const count = Object.keys(data).filter((k) => k !== '_global').length;
          extra = ` · ${count} grupo(s)`;
        } catch (_) {}
      }

      await sendTelegramDocument(
        `${dateStr}_${name}`,
        buffer,
        `📦 Backup diário · ${name}${extra} · ${(buffer.length / 1024).toFixed(1)} KB`
      );
    }

    logger.info('[backup] Backup diário enviado para o Telegram com sucesso.');
    return true;
  } catch (err) {
    logger.error({ err: err.message }, '[backup] Falha ao enviar backup para o Telegram');
    return false;
  }
}

/** Calcula quantos ms faltam para a próxima ocorrência de HH:MM (hora do servidor). */
function msUntilNext(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

/** Agenda o backup diário auto-corretivo (recalcula o próximo disparo a cada ciclo). */
function scheduleDaily() {
  const delay = msUntilNext(settings.backupHour, settings.backupMinute);

  const t = setTimeout(async () => {
    await performBackup();
    scheduleDaily(); // re-agenda para o próximo dia, corrigindo qualquer drift
  }, delay);

  if (typeof t.unref === 'function') t.unref();
}

/**
 * Inicializa o serviço de backup (chamado no boot em index.js).
 * @returns {boolean}
 */
function init() {
  if (!isConfigured()) {
    logger.info('[backup] Backup automático offsite DESATIVADO (variáveis do Telegram não configuradas).');
    return false;
  }
  const hh = String(settings.backupHour).padStart(2, '0');
  const mm = String(settings.backupMinute).padStart(2, '0');
  logger.info(`[backup] Backup automático diário agendado para ${hh}:${mm} (hora do servidor).`);
  scheduleDaily();
  return true;
}

module.exports = {
  init,
  performBackup,
  backupNow: performBackup,
  isConfigured
};
