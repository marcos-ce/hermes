const pino = require('pino');
const settings = require('../config/settings');

const logger = pino({
  level: process.env.LOG_LEVEL || settings.logLevel || 'warn',
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: {
    logMethod(inputArgs, method) {
      // Suprime mensagens internas de sincronização entre dispositivos que o Baileys descarta
      if (inputArgs[1] === 'error in handling message' || inputArgs[0]?.node?.attrs?.category === 'peer') {
        return;
      }
      return method.apply(this, inputArgs);
    }
  }
});

module.exports = logger;
