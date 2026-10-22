const pino = require('pino');
const settings = require('../config/settings');

const logger = pino({
  level: process.env.LOG_LEVEL || settings.logLevel || 'warn',
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
