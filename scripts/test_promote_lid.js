const assert = require('assert');
const promotePlugin = require('../src/plugins/admin/promote');
const promoteMember = require('../src/services/tools/promote_member');
const { groupCache } = require('../src/utils/cache');
const { lidToPhoneMap, phoneToLidMap, participantNameMap, resolveSender } = require('../src/utils/jidResolver');
const { t } = require('../src/utils/i18n');

console.log('====================================================');
console.log('🧪 BATERIA DE TESTES: PROMOÇÃO COM @lid E @NOME');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

const GROUP = '120363777777777@g.us';
const BOT_PN = '554598045915@s.whatsapp.net';
const BOT_LID = '109780135854259@lid';
const BOB_PN = '5511922222222@s.whatsapp.net';
const BOB_LID = '111122223333444@lid';
const ALICE_PN = '5511933333333@s.whatsapp.net';
const ALICE_LID = '555666777888999@lid';
const CARLOS_PN = '5511944444444@s.whatsapp.net';
const CARLOS_LID = '999888777666555@lid';
const UNKNOWN_LID = '987654321012345@lid';

function digits(jid) {
  return String(jid).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
}

function resetState() {
  groupCache.flushAll();
  lidToPhoneMap.clear();
  phoneToLidMap.clear();
  participantNameMap.clear();
}

function makeParticipants(extra = []) {
  return [
    { id: BOT_LID, jid: BOT_PN, lid: BOT_LID, admin: 'superadmin', notify: 'Hermes' },
    { id: BOB_LID, jid: BOB_PN, lid: BOB_LID, admin: null, notify: 'Fulano' },
    { id: ALICE_LID, jid: ALICE_PN, lid: ALICE_LID, admin: 'admin', notify: 'Alice' },
    ...extra
  ];
}

function makeMeta(participants) {
  return { id: GROUP, participants };
}

function createSock(metaProvider = () => makeMeta(makeParticipants())) {
  const sock = {
    user: { id: '554598045915:23@s.whatsapp.net', lid: '109780135854259:23@lid' },
    metadataCalls: 0,
    updates: [],
    updateResult: null,
    async groupMetadata(groupJid) {
      sock.metadataCalls++;
      return metaProvider(groupJid, sock.metadataCalls);
    },
    async groupParticipantsUpdate(groupJid, jids, action) {
      sock.updates.push({ groupJid, jids, action });
      return sock.updateResult || [{ status: '200', jid: jids[0] }];
    }
  };
  return sock;
}

function mentionMessage(text, mentionedJid) {
  return {
    message: {
      extendedTextMessage: {
        text,
        contextInfo: { mentionedJid }
      }
    }
  };
}

function textMessage(text) {
  return { message: { conversation: text } };
}

async function runPlugin(sock, msg, text = '') {
  let output = '';
  let options = null;
  await promotePlugin.execute({
    sock,
    msg,
    from: GROUP,
    text,
    reply: (txt, opts) => {
      output = txt;
      options = opts;
    },
    t: (key, vars) => t('pt', key, vars),
    isGroup: true
  });
  return { output, options };
}

async function main() {
  await runTest('1. menção real @lid com metadados completos promove pelo JID do grupo', async () => {
    resetState();
    const sock = createSock();
    const msg = mentionMessage('!adm @Fulano', [BOB_LID]);

    const { output } = await runPlugin(sock, msg, '@Fulano');

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.strictEqual(sock.updates.length, 1);
    assert.strictEqual(sock.updates[0].action, 'promote');
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('2. texto @<lid> sem mentionedJid é reconhecido e promove', async () => {
    resetState();
    const sock = createSock();
    const msg = textMessage(`!adm @${digits(BOB_LID)}`);

    const { output } = await runPlugin(sock, msg, `@${digits(BOB_LID)}`);

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('3. cache antigo sem LID é atualizado antes de desistir do alvo', async () => {
    resetState();
    const stale = makeMeta([
      { id: BOT_PN, admin: 'superadmin' },
      { id: BOB_PN, admin: null },
      { id: ALICE_PN, admin: 'admin' }
    ]);
    groupCache.set(GROUP, stale);

    const sock = createSock();
    const msg = mentionMessage('!adm @Fulano', [BOB_LID]);

    const { output } = await runPlugin(sock, msg, '@Fulano');

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.strictEqual(sock.metadataCalls, 1, 'Deve forçar exatamente uma atualização dos metadados');
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('4. status diferente de 200 do WhatsApp vira erro, não sucesso', async () => {
    resetState();
    const sock = createSock();
    sock.updateResult = [{ status: '403', jid: BOB_LID, content: 'not-authorized' }];
    const msg = mentionMessage('!adm @Fulano', [BOB_LID]);

    const { output } = await runPlugin(sock, msg, '@Fulano');

    assert.strictEqual(output, t('pt', 'common.error'));
    assert.strictEqual(sock.updates.length, 1);
  });

  await runTest('5. nome literal @FULANO promove quando existe um único membro com esse nome', async () => {
    resetState();
    const sock = createSock();
    const msg = textMessage('!adm @FULANO');

    const { output } = await runPlugin(sock, msg, '@FULANO');

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('6. nome literal ambíguo é bloqueado sem promover ninguém', async () => {
    resetState();
    const sock = createSock(() => makeMeta(makeParticipants([
      { id: CARLOS_LID, jid: CARLOS_PN, lid: CARLOS_LID, admin: null, notify: 'Fulano' }
    ])));
    const msg = textMessage('!adm @Fulano');

    const { output } = await runPlugin(sock, msg, '@Fulano');

    assert.strictEqual(output, t('pt', 'common.not_found_target'));
    assert.strictEqual(sock.updates.length, 0);
  });

  await runTest('7. comando sem @ continua bloqueado pela trava de segurança', async () => {
    resetState();
    const sock = createSock();
    const msg = textMessage('!adm Fulano');

    const { output } = await runPlugin(sock, msg, 'Fulano');

    assert.strictEqual(output, t('pt', 'promote.need_explicit_mention'));
    assert.strictEqual(sock.updates.length, 0);
  });

  await runTest('8. menção @lid desconhecida responde "não encontrado" e não chama o WhatsApp', async () => {
    resetState();
    const sock = createSock();
    const msg = mentionMessage('!adm @Desconhecido', [UNKNOWN_LID]);

    const { output } = await runPlugin(sock, msg, '@Desconhecido');

    assert.strictEqual(output, t('pt', 'common.not_found_target'));
    assert.strictEqual(sock.updates.length, 0);
  });

  await runTest('9. metadados com id telefone + campo lid também aceitam menção @lid', async () => {
    resetState();
    const sock = createSock(() => makeMeta([
      { id: BOT_LID, jid: BOT_PN, lid: BOT_LID, admin: 'superadmin', notify: 'Hermes' },
      { id: BOB_PN, jid: BOB_PN, lid: BOB_LID, admin: null, notify: 'Fulano' }
    ]));
    const msg = mentionMessage('!adm @Fulano', [BOB_LID]);

    const { output } = await runPlugin(sock, msg, '@Fulano');

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_PN]);
  });

  await runTest('10. ferramenta da IA promove menção @lid resolvida', async () => {
    resetState();
    const sock = createSock();
    const msg = mentionMessage('Hermes, dá adm pro @Fulano', [BOB_LID]);

    const res = await promoteMember({
      sock,
      msg,
      from: GROUP,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: '@Fulano' }
    });

    assert.strictEqual(res.success, true, res.error);
    assert(res.message.includes('Administrador'));
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('11. ferramenta da IA aceita @FULANO literal sem mentionedJid', async () => {
    resetState();
    const sock = createSock();
    const msg = textMessage('Hermes, dá adm pro @FULANO');

    const res = await promoteMember({
      sock,
      msg,
      from: GROUP,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: '@FULANO' }
    });

    assert.strictEqual(res.success, true, res.error);
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('12. nome @FULANO usa pushName visto em mensagem anterior do membro', async () => {
    resetState();
    const sock = createSock(() => makeMeta([
      { id: BOT_LID, jid: BOT_PN, lid: BOT_LID, admin: 'superadmin' },
      { id: BOB_LID, jid: BOB_PN, lid: BOB_LID, admin: null },
      { id: ALICE_LID, jid: ALICE_PN, lid: ALICE_LID, admin: 'admin' }
    ]));

    // Simula uma mensagem anterior do Fulano, registrando o pushName no cache.
    await resolveSender(sock, {
      key: { remoteJid: GROUP, participant: BOB_LID },
      pushName: 'Fulano',
      message: { conversation: 'mensagem anterior' }
    });

    const msg = textMessage('!adm @FULANO');
    const { output } = await runPlugin(sock, msg, '@FULANO');

    assert(output.includes('Administrador'), `Saída inesperada: ${output}`);
    assert.deepStrictEqual(sock.updates[0].jids, [BOB_LID]);
  });

  await runTest('13. ferramenta da IA devolve erro quando o WhatsApp recusa a promoção', async () => {
    resetState();
    const sock = createSock();
    sock.updateResult = [{ status: '403', jid: BOB_LID }];
    const msg = mentionMessage('Hermes, dá adm pro @Fulano', [BOB_LID]);

    const res = await promoteMember({
      sock,
      msg,
      from: GROUP,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: '@Fulano' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'common.error'));
    assert.strictEqual(sock.updates.length, 1);
  });

  console.log('\n====================================================');
  console.log(`🏁 RESULTADO DA BATERIA: ${passedTests}/${totalTests} testes aprovados!`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
