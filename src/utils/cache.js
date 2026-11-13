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

// Cache anti-duplicação de mensagens recebidas (evita reprocessamento de comandos em retentativas/reconexão) - TTL 5 minutos
const processedMsgCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

// Cache de metadados públicos de convites (evita repetição de sock.groupGetInviteInfo) - TTL 10 minutos
const inviteInfoCache = new NodeCache({
  stdTTL: 600,
  checkperiod: 120,
  useClones: false
});

// Cache de URL de foto de perfil de grupos (evita spam de sock.profilePictureUrl no welcome) - TTL 30 minutos
const profilePicCache = new NodeCache({
  stdTTL: 1800,
  checkperiod: 300,
  useClones: false
});

// Trava anti-duplicação de entrada do bot (evita corrida entre groups.upsert e group-participants.update) - TTL 2 minutos
const entryGuardCache = new NodeCache({
  stdTTL: 120,
  checkperiod: 30,
  useClones: false
});

// Cooldown de refresh forçado de groupMetadata por grupo (evita enxurrada de consultas IQ) - TTL 60 segundos
const metadataRefreshCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 20,
  useClones: false
});

module.exports = {
  groupCache,
  wizardCache,
  floodCache,
  cooldownCache,
  processedMsgCache,
  inviteInfoCache,
  profilePicCache,
  entryGuardCache,
  metadataRefreshCache
};
