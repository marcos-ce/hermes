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
    
    // Compara com o OWNER_NUMBER definido no .env
    if (this.ownerNumber && (cleanNumber === this.ownerNumber || cleanNumber.endsWith(this.ownerNumber) || this.ownerNumber.endsWith(cleanNumber))) {
      return true;
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
