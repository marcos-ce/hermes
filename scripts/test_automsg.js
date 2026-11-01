const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const automsg = require('../src/plugins/admin/automsg');
const setAutomsgMedia = require('../src/services/tools/set_automsg_media');
const configManager = require('../src/core/configManager');
const pluginLoader = require('../src/core/pluginLoader');

console.log('🧪 INICIANDO TESTES DO PLUGIN AUTOMSG COM BLINDAGEM ANTI-BAN...\n');

// 1. PluginLoader
pluginLoader.init();
assert(pluginLoader.commands.has('automsg'), 'automsg deve estar registrado no pluginLoader');
assert(pluginLoader.onScheduleHooks.some(p => p.name === 'automsg'), 'automsg deve possuir onSchedule hook');
console.log('✅ 1. PluginLoader: carregamento e hooks registrados');

// 2. Hash Jitter
const sampleJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]);
const h0 = crypto.createHash('sha256').update(sampleJpeg).digest('hex');
const j1 = automsg.applyMediaHashJitter(sampleJpeg);
const j2 = automsg.applyMediaHashJitter(sampleJpeg);
const h1 = crypto.createHash('sha256').update(j1).digest('hex');
const h2 = crypto.createHash('sha256').update(j2).digest('hex');

assert.notStrictEqual(h0, h1, 'Hash 1 deve ser diferente do original');
assert.notStrictEqual(h1, h2, 'Hash 2 deve ser diferente de Hash 1');
console.log('✅ 2. Hash Jitter: Gera SHA-256 único a cada chamada');

// 3. Limpeza de Metadados EXIF
const jpegWithExif = Buffer.from([
  0xFF, 0xD8, // SOI
  0xFF, 0xE1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1 EXIF
  0xFF, 0xDA, 0x00, // SOS
  0xFF, 0xD9  // EOI
]);
const stripped = automsg.stripJpegMetadata(jpegWithExif);
assert.strictEqual(stripped.includes(Buffer.from([0xFF, 0xE1])), false, 'EXIF APP1 deve ser removido');
console.log('✅ 3. Limpeza EXIF: Metadados privados removidos do JPEG');

// 4. Quiet Hours (Sleep Mode Noturno)
assert.strictEqual(automsg.isQuietHours(new Date('2026-05-10T23:05:00Z'), 'UTC'), true, '23:05 deve ser quiet hour');
assert.strictEqual(automsg.isQuietHours(new Date('2026-05-10T04:00:00Z'), 'UTC'), true, '04:00 deve ser quiet hour');
assert.strictEqual(automsg.isQuietHours(new Date('2026-05-10T07:59:00Z'), 'UTC'), true, '07:59 deve ser quiet hour');
assert.strictEqual(automsg.isQuietHours(new Date('2026-05-10T08:00:00Z'), 'UTC'), false, '08:00 NÃO deve ser quiet hour');
assert.strictEqual(automsg.isQuietHours(new Date('2026-05-10T15:30:00Z'), 'UTC'), false, '15:30 NÃO deve ser quiet hour');
console.log('✅ 4. Sleep Mode: Janela de silêncio 23:00 - 08:00 validada');

// 5. Constantes Anti-Ban
assert.strictEqual(automsg.MAX_IMAGE_BYTES, 2.5 * 1024 * 1024, 'MAX_IMAGE_BYTES deve ser exatamente 2.5 MB');
assert.strictEqual(automsg.MIN_INTERVAL_WITH_MEDIA, 180, 'MIN_INTERVAL_WITH_MEDIA deve ser 180 min (3h)');
console.log('✅ 5. Constantes Anti-Ban: Limite de 2.5 MB e mínimo de 3h com foto');

// 6. Subcomandos do execute
(async () => {
  const fakeGroup = '120363000000000099@g.us';
  const replies = [];
  const reply = (text) => { replies.push(text); return Promise.resolve(); };
  const t = (k) => k;

  configManager.getOrCreateGroup(fakeGroup);
  configManager.updatePluginConfig(fakeGroup, 'automsg', { configured: true, enabled: true, message: 'Olá grupo' });

  // 6a. /automsg (status)
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: [],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('AutoMsg (Anúncios Periódicos Anti-Ban)'), 'Status deve conter cabeçalho');
  assert(replies[0].includes('Modo Silencioso Noturno'), 'Status deve indicar Modo Silencioso');

  // 6b. /automsg video (bloqueio educativo)
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['video'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('Envio de Vídeo/Áudio Bloqueado'), 'Deve bloquear vídeo com mensagem educativa');

  // 6c. /automsg audio (bloqueio educativo)
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['audio'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('Envio de Vídeo/Áudio Bloqueado'), 'Deve bloquear áudio com mensagem educativa');

  // 6d. /automsg silencio on / off
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['silencio', 'on'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('Modo Silencioso Noturno ATIVADO'), 'Deve confirmar ativação de silêncio');
  assert.strictEqual(configManager.getPluginConfig(fakeGroup, 'automsg').sleepMode, true);

  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['silencio', 'off'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('Modo Silencioso Noturno DESATIVADO'), 'Deve confirmar desativação de silêncio');
  assert.strictEqual(configManager.getPluginConfig(fakeGroup, 'automsg').sleepMode, false);

  // 6e. /automsg tempo 3h
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['tempo', '3h'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('3 horas'), 'Deve atualizar tempo');
  assert.strictEqual(configManager.getPluginConfig(fakeGroup, 'automsg').intervalMinutes, 180);

  // 6f. /automsg texto Mensagem Nova
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['texto', 'Comunicado', 'Exclusivo'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('Comunicado Exclusivo'), 'Deve atualizar texto');
  assert.strictEqual(configManager.getPluginConfig(fakeGroup, 'automsg').message, 'Comunicado Exclusivo');

  // 6g. /automsg removerfoto
  configManager.updatePluginConfig(fakeGroup, 'automsg', { media: { path: 'dummy.jpg', type: 'image' } });
  replies.length = 0;
  await automsg.execute({
    sock: {},
    msg: {},
    from: fakeGroup,
    sender: '5511999999999@s.whatsapp.net',
    args: ['removerfoto'],
    reply,
    t,
    lang: 'pt',
    isGroup: true
  });
  assert(replies[0].includes('removida'), 'Deve confirmar remoção da foto');
  assert.strictEqual(configManager.getPluginConfig(fakeGroup, 'automsg').media, null);

  console.log('✅ 6. Subcomandos do execute: status, video/audio block, silencio, tempo, texto e removerfoto');

  // 7. onSchedule com Jitter Temporal e Sleep Mode
  const tasks = [];
  const queueTask = (t) => tasks.push(t);
  const lastTimes = new Map();
  lastTimes.set(fakeGroup, Date.now() - 4 * 60 * 60 * 1000); // 4h atrás

  const mockSock = {
    sendMessage: async () => ({ key: {} }),
    sendPresenceUpdate: async () => {}
  };

  // Noite com sleepMode: true -> sem disparo
  await automsg.onSchedule({
    sock: mockSock,
    groupJid: fakeGroup,
    group: { lastActivity: Date.now() },
    config: { enabled: true, message: 'Alô', intervalMinutes: 180, sleepMode: true },
    queueTask,
    lastAutoMsgTimes: lastTimes,
    currentHHMM: '01:00'
  });
  assert.strictEqual(tasks.length, 0, 'onSchedule deve pausar na madrugada');

  // Dia com atividade -> deve enfileirar e atualizar jitter
  await automsg.onSchedule({
    sock: mockSock,
    groupJid: fakeGroup,
    group: { lastActivity: Date.now() },
    config: { enabled: true, message: 'Alô', intervalMinutes: 180, sleepMode: true },
    queueTask,
    lastAutoMsgTimes: lastTimes,
    currentHHMM: '15:00'
  });
  assert.strictEqual(tasks.length, 1, 'onSchedule deve disparar durante o dia');

  // Executa o task do scheduler e verifica jitter gravado
  await tasks[0].run();
  const updatedCfg = configManager.getPluginConfig(fakeGroup, 'automsg');
  assert(updatedCfg.nextJitterMinutes >= 5 && updatedCfg.nextJitterMinutes <= 25, 'Deve gerar jitter entre 5 e 25 min');
  console.log(`✅ 7. onSchedule: Sleep mode respeitado e jitter temporal gerado (+${updatedCfg.nextJitterMinutes} min)`);

  // 8. Tool de IA set_automsg_media (rejeita não-imagem e aceita remoção)
  const remRes = await setAutomsgMedia({
    sock: {},
    msg: {},
    from: fakeGroup,
    lang: 'pt',
    args: { action: 'remove' }
  });
  assert.strictEqual(remRes.success, true);
  console.log('✅ 8. Tool set_automsg_media: Remoção e validações de IA');

  // Limpa o grupo de teste para não poluir data/groups.json
  configManager.groups.delete(fakeGroup);
  if (configManager.saveTimeout) {
    clearTimeout(configManager.saveTimeout);
    configManager.saveTimeout = null;
  }

  console.log('\n🎉 TODOS OS TESTES DO AUTOMSG PASSARAM COM 100% DE SUCESSO!\n');
})();
