const dotenv = require('dotenv');
const path = require('path');

// Carrega variáveis do arquivo .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

class Settings {
  constructor() {
    this.load();
  }

  load() {
    this.connectionMethod = (process.env.CONNECTION_METHOD || 'qr').toLowerCase();
    this.botNumber = (process.env.BOT_NUMBER || '').replace(/\D/g, '');
    this.ownerNumber = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
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

    // Compara com o OWNER_NUMBER definido no .env
    if (this.ownerNumber) {
      if (cleanNumber === this.ownerNumber) return true;
      // Trata variação de 9º dígito no Brasil se ambos tiverem pelo menos 10 dígitos (DDD + número)
      if (cleanNumber.length >= 10 && this.ownerNumber.length >= 10) {
        const cleanLast8 = cleanNumber.slice(-8);
        const ownerLast8 = this.ownerNumber.slice(-8);
        const cleanDdd = cleanNumber.slice(-10, -8);
        const ownerDdd = this.ownerNumber.slice(-10, -8);
        if (cleanLast8 === ownerLast8 && cleanDdd === ownerDdd) {
          return true;
        }
      }
    }

    // Opcionalmente checa se é o próprio bot logado
    if (sock && sock.user && sock.user.id) {
      const botNum = sock.user.id.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      if (cleanNumber === botNum) {
        return true;
      }
    }

    return false;
  }
}

const settings = new Settings();
module.exports = settings;
