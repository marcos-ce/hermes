const NodeCache = require('node-cache');

// Metadados de grupos (participantes, admin status) - TTL 5 minutos
const groupCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

// Sessões ativas de Wizard por Admin (${from}:${sender}) - TTL 3 minutos
const wizardCache = new NodeCache({
  stdTTL: 180,
  checkperiod: 30,
  useClones: false
});

// Controle de mensagens para anti-flood - TTL 10 segundos
const floodCache = new NodeCache({
  stdTTL: 10,
  checkperiod: 5,
  useClones: false
});

// Cooldown de comandos anti-spam por usuário - TTL 5 segundos
const cooldownCache = new NodeCache({
  stdTTL: 5,
  checkperiod: 2,
  useClones: false
});

module.exports = {
  groupCache,
  wizardCache,
  floodCache,
  cooldownCache
};
