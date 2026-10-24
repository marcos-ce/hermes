const dotenv = require('dotenv');
const path = require('path');

// Carrega variáveis do arquivo .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Extrai DDD e últimos 8 dígitos para comparação de números brasileiros com/sem 9º dígito
 */
function getBr(num) {
  const c = (num || '').replace(/\D/g, '');
  if (c.startsWith('55') && c.length >= 12) {
    return { ddd: c.slice(2, 4), last8: c.slice(-8) };
  }
  if (c.length === 10 || c.length === 11) {
    return { ddd: c.slice(0, 2), last8: c.slice(-8) };
  }
  return { ddd: '', last8: c.slice(-8) };
}

class Settings {
  constructor() {
    this.load();
  }

  load() {
    this.connectionMethod = (process.env.CONNECTION_METHOD || 'qr').toLowerCase();
    this.botNumber = (process.env.BOT_NUMBER || '').replace(/\D/g, '');
    this.ownerNumber = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
    this.ownerLid = (process.env.OWNER_LID || '').replace(/\D/g, '');
    this.defaultPrefix = process.env.DEFAULT_PREFIX || '!';
    this.defaultLang = (process.env.DEFAULT_LANG || 'pt').toLowerCase();
    this.authMode = (process.env.AUTH_MODE || 'owner').toLowerCase();
    this.allowPrivateCmds = process.env.ALLOW_PRIVATE_CMDS === 'true';
    this.timezone = process.env.TIMEZONE || 'America/Sao_Paulo';
    this.logLevel = process.env.LOG_LEVEL || 'warn';
  }

  reload() {
    dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
    this.load();
  }

  getOwnerJid() {
    if (!this.ownerNumber) return null;
    return `${this.ownerNumber}@s.whatsapp.net`;
  }

  isOwner(jid, sock = null) {
    if (!jid) return false;
    const cleanNumber = jid.replace(/@.*$/, '').replace(/\D/g, '');
    if (!cleanNumber) return false;

    // 1. Checagem direta com OWNER_LID se configurado
    if (this.ownerLid && (cleanNumber === this.ownerLid || jid.includes(this.ownerLid))) {
      return true;
    }

    // 2. Compara com o OWNER_NUMBER definido no .env
    if (this.ownerNumber) {
      if (cleanNumber === this.ownerNumber || jid.includes(this.ownerNumber)) return true;

      // Trata variação de 9º dígito no Brasil com extração exata de DDD e últimos 8 dígitos
      const userBr = getBr(cleanNumber);
      const ownerBr = getBr(this.ownerNumber);

      if (userBr.ddd && ownerBr.ddd && userBr.ddd === ownerBr.ddd && userBr.last8 === ownerBr.last8) {
        return true;
      }
    }

    // Opcionalmente checa se é o próprio bot logado
    if (sock && sock.user) {
      const botNum = (sock.user.id || '').replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      const botLidNum = (sock.user.lid || '').replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      if (cleanNumber === botNum || (botLidNum && cleanNumber === botLidNum)) {
        return true;
      }
    }

    return false;
  }
}

const settings = new Settings();
settings.getBr = getBr;
module.exports = settings;
