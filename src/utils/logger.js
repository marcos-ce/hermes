const pino = require('pino');
const settings = require('../config/settings');

const logger = pino({
  level: process.env.LOG_LEVEL || settings.logLevel || 'warn',
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: {
    logMethod(inputArgs, method) {
      const msg = typeof inputArgs[1] === 'string' ? inputArgs[1] : (typeof inputArgs[0] === 'string' ? inputArgs[0] : '');
      const firstArg = typeof inputArgs[0] === 'object' && inputArgs[0] !== null ? inputArgs[0] : {};

      // Suprime eventos internos cosméticos e esperados do WhatsApp/Baileys que inflam o contador de erro
      if (
        msg.includes('error in handling message') ||
        msg.includes("unexpected error in 'init queries'") ||
        msg.includes('stream errored out') ||
        msg.includes('failed to decrypt message') ||
        firstArg?.err?.name === 'SessionError' ||
        firstArg?.err?.message?.includes('No session record') ||
        firstArg?.node?.attrs?.category === 'peer' ||
        firstArg?.node?.attrs?.code === '515'
      ) {
        return;
      }
      return method.apply(this, inputArgs);
    }
  }
});

module.exports = logger;
