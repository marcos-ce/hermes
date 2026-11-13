'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cache = require('../src/utils/cache');
const { t } = require('../src/utils/i18n');
const antiBan = require('../src/utils/antiBan');
const connection = require('../src/core/connection');
const configManager = require('../src/core/configManager');
const scheduler = require('../src/core/scheduler');
const { handleParticipantsUpdate } = require('../src/handlers/groupHandler');
const { handleMessage } = require('../src/handlers/messageHandler');
const { getGroupMetadata } = require('../src/utils/jidResolver');
const welcomePlugin = require('../src/plugins/admin/welcome');
const antistatusPlugin = require('../src/plugins/admin/antistatus');
const settings = require('../src/config/settings');

async function runTests() {
  let passed = 0;
  const results = [];

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      results.push({ name, ok: true });
      console.log(`✅ PASS: ${name}`);
    } catch (err) {
      results.push({ name, ok: false, error: err });
      console.error(`❌ FAIL: ${name}\n   ${err.stack || err.message}`);
    }
  }

  // Snapshot data/groups.json existence so test cleanup never leaves dirty test entries
  const groupsFile = path.resolve(process.cwd(), 'data', 'groups.json');
  const groupsBakFile = path.resolve(process.cwd(), 'data', 'groups.json.bak');
  const hadGroupsFile = fs.existsSync(groupsFile);
  const originalGroupsRaw = hadGroupsFile ? fs.readFileSync(groupsFile, 'utf8') : null;
  const hadGroupsBak = fs.existsSync(groupsBakFile);
  const originalGroupsBakRaw = hadGroupsBak ? fs.readFileSync(groupsBakFile, 'utf8') : null;

  try {
    // 1. Mensagens de fim de trial são texto puro em PT, ES e EN
    await test('1. i18n trial end keys contain plain text only (no links, no {url}, no @mentions)', async () => {
      for (const lang of ['pt', 'es', 'en']) {
        for (const key of ['saas.trial_leaving', 'saas.trial_already_consumed']) {
          const msg = t(lang, key, { url: 'https://should-not-appear.test', admins: '@123456' });
          assert.ok(msg && msg.length > 20, `Empty translation for ${lang}:${key}`);
          assert.ok(!/https?:\/\//i.test(msg), `URL leaked into ${lang}:${key}: ${msg}`);
          assert.ok(!/\{url\}|\{admins\}/i.test(msg), `Placeholder leaked into ${lang}:${key}: ${msg}`);
          assert.ok(!msg.includes('@'), `Mention leaked into ${lang}:${key}: ${msg}`);
        }
      }
    });

    // 2. Novos caches delimitados exportados
    await test('2. Bounded caches exported and functional in utils/cache.js', async () => {
      for (const name of ['inviteInfoCache', 'profilePicCache', 'entryGuardCache', 'metadataRefreshCache']) {
        assert.ok(cache[name], `Missing cache.${name}`);
        cache[name].set('__test_key__', { ok: true }, 5);
        assert.deepStrictEqual(cache[name].get('__test_key__'), { ok: true });
        cache[name].del('__test_key__');
      }
    });

    // 3. Serialização OutboundQueue + ausência de presence unavailable global + storeMsgForRetry
    await test('3. sendSafeMessage serializes concurrently, avoids global unavailable presence, and populates sentMsgStore', async () => {
      const events = [];
      let inFlight = 0;
      let maxConcurrent = 0;

      const mockSock = {
        user: { id: '551100000000@s.whatsapp.net' },
        readMessages: async () => {},
        sendPresenceUpdate: async (state, jid) => {
          events.push({ type: 'presence', state, jid: jid || null });
        },
        sendMessage: async (jid, payload) => {
          inFlight++;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          events.push({ type: 'send_start', jid, text: payload.text });
          await antiBan.sleep(40);
          events.push({ type: 'send_end', jid, text: payload.text });
          inFlight--;
          return { key: { id: `id-${payload.text}`, fromMe: true } }; // sem payload.message para testar fallback
        }
      };

      await Promise.all([
        antiBan.sendSafeMessage(mockSock, '120363000000000001@g.us', 'Msg1', { fast: true }),
        antiBan.sendSafeMessage(mockSock, '120363000000000002@g.us', 'Msg2', { fast: true })
      ]);

      assert.strictEqual(maxConcurrent, 1, 'sendSafeMessage overlapped across queue');
      const globalUnavailable = events.filter(e => e.type === 'presence' && e.state === 'unavailable' && !e.jid);
      assert.strictEqual(globalUnavailable.length, 0, 'Global unavailable presence was still called');
      assert.strictEqual(events.filter(e => e.type === 'send_end').length, 2);

      // Verifica se fallback de texto foi salvo no sentMsgStore para getMessage/retry
      assert.deepStrictEqual(connection.sentMsgStore.get('id-Msg1'), { conversation: 'Msg1' });
      assert.deepStrictEqual(connection.sentMsgStore.get('id-Msg2'), { conversation: 'Msg2' });
      connection.revokeMsgFromStore('id-Msg1');
      connection.revokeMsgFromStore('id-Msg2');
    });

    // 4. sentMsgStore não sofre eviction com 1500+ mensagens recebidas
    await test('4. sentMsgStore isolates bot replies from noisy incoming msgStore eviction', async () => {
      connection.storeMsgForRetry({
        key: { id: 'bot-important-reply', fromMe: true },
        message: { conversation: 'Bot reply' }
      });
      for (let i = 0; i < 1600; i++) {
        connection.storeMsgForRetry({
          key: { id: `incoming-${i}`, fromMe: false },
          message: { conversation: `hi ${i}` }
        });
      }
      assert.deepStrictEqual(connection.sentMsgStore.get('bot-important-reply'), { conversation: 'Bot reply' });
      connection.revokeMsgFromStore('bot-important-reply');
      connection.msgStore.clear();
    });

    // 5. healBrokenSession cirúrgico
    await test('5. healBrokenSession removes only target participant keys and preserves creds & peers', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-heal-'));
      try {
        const filesToCreate = [
          'creds.json',
          'sender-key-120363111111111111--5511999990001--0.json',
          'sender-key-120363111111111111--5511888880002--0.json',
          'session-5511999990001.0.json',
          'session-5511888880002.0.json'
        ];
        for (const f of filesToCreate) {
          fs.writeFileSync(path.join(tmpDir, f), '{}');
        }

        // Sem participant em grupo não deve apagar nada
        const removedNoPart = await connection.healBrokenSession({
          key: { remoteJid: '120363111111111111@g.us' }
        }, tmpDir);
        assert.strictEqual(removedNoPart, 0);

        // Com participant específico remove apenas arquivos desse participant
        const removed = await connection.healBrokenSession({
          key: {
            remoteJid: '120363111111111111@g.us',
            participant: '5511999990001:1@s.whatsapp.net'
          }
        }, tmpDir);
        assert.strictEqual(removed, 2);
        assert.ok(fs.existsSync(path.join(tmpDir, 'creds.json')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'sender-key-120363111111111111--5511888880002--0.json')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'session-5511888880002.0.json')));
        assert.ok(!fs.existsSync(path.join(tmpDir, 'sender-key-120363111111111111--5511999990001--0.json')));
        assert.ok(!fs.existsSync(path.join(tmpDir, 'session-5511999990001.0.json')));

        // Segunda chamada imediata dentro da janela de 60s é bloqueada por cooldown
        fs.writeFileSync(path.join(tmpDir, 'session-5511999990001.0.json'), '{}');
        const removedCooldown = await connection.healBrokenSession({
          key: {
            remoteJid: '120363111111111111@g.us',
            participant: '5511999990001:1@s.whatsapp.net'
          }
        }, tmpDir);
        assert.strictEqual(removedCooldown, 0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // 6. evaluateDisconnectPolicy (440 / 403 / 401 pairing & loop guard / max attempts / backoff)
    await test('6. evaluateDisconnectPolicy stops safely on 440, 403, pairing 401, 401 loop, max attempts & scales backoff', async () => {
      const p440 = connection.evaluateDisconnectPolicy({ statusCode: 440 });
      assert.strictEqual(p440.action, 'stop');
      assert.strictEqual(p440.notifyOwner, true);

      const p403 = connection.evaluateDisconnectPolicy({ statusCode: 403 });
      assert.strictEqual(p403.action, 'stop');

      const pPair401 = connection.evaluateDisconnectPolicy({ statusCode: 401, isPairingCode: true });
      assert.strictEqual(pPair401.action, 'stop');
      assert.strictEqual(pPair401.clearAuth, false);

      const now = Date.now();
      const pLoop401 = connection.evaluateDisconnectPolicy({
        statusCode: 401,
        isPairingCode: false,
        recentLogouts: [now - 5000, now - 2000],
        now
      });
      assert.strictEqual(pLoop401.action, 'stop');
      assert.strictEqual(pLoop401.reason, 'logged_out_loop_guard');

      const pMax = connection.evaluateDisconnectPolicy({ statusCode: 408, attempts: 15 });
      assert.strictEqual(pMax.action, 'stop');

      const pBackoffHigh = connection.evaluateDisconnectPolicy({ statusCode: 408, attempts: 12, jitterMs: 1000 });
      assert.strictEqual(pBackoffHigh.action, 'reconnect');
      assert.strictEqual(pBackoffHigh.delayMs, 5 * 60 * 1000 + 1000);
    });

    // 7. scheduler + messageHandler no fim do trial: só texto, sem inviteCode, sem link, sem spam
    await test('7. Trial end notifications emit plain text once without groupInviteCode, URL, or admin mentions', async () => {
      const gid1 = '120363999000000001@g.us';
      const gid2 = '120363999000000002@g.us';

      const g1 = configManager.getOrCreateGroup(gid1, 'Trial Sched');
      g1.enabled = true;
      g1.plan = 'teste';
      g1.isTrial = true;
      g1.trialUsed = true;
      g1.autoLeave = true;
      g1.leftAt = null;
      g1.expiryNotified = false;
      g1.expiresAt = Date.now() - 10_000;

      const sentPayloads = [];
      let inviteCalls = 0;
      let metadataCalls = 0;
      let leftCalls = 0;

      const mockSock = {
        user: { id: '551100000000@s.whatsapp.net' },
        groupInviteCode: async () => { inviteCalls++; return 'ABC'; },
        groupMetadata: async () => { metadataCalls++; return { id: gid1, participants: [] }; },
        sendPresenceUpdate: async () => {},
        sendMessage: async (jid, payload) => {
          sentPayloads.push({ jid, payload });
          return { key: { id: `m-${sentPayloads.length}`, fromMe: true } };
        },
        groupLeave: async () => { leftCalls++; }
      };

      scheduler.updateSocket(mockSock);
      const q = [];
      scheduler._licenseLifecycle(gid1, g1, q);
      assert.strictEqual(q.length, 1);
      await q[0].run();

      assert.strictEqual(inviteCalls, 0, 'Scheduler should not call groupInviteCode on trial end');
      assert.strictEqual(metadataCalls, 0, 'Scheduler should not fetch groupMetadata for mentions on trial end');
      assert.strictEqual(sentPayloads.length, 1);
      assert.ok(!/https?:\/\//i.test(sentPayloads[0].payload.text), 'URL found in scheduler trial_leaving');
      assert.ok(!sentPayloads[0].payload.mentions, 'Admin mentions found in scheduler trial_leaving');
      assert.strictEqual(leftCalls, 1);

      // Agora testa messageHandler em outro grupo trial expirado recebendo 3 mensagens seguidas
      const g2 = configManager.getOrCreateGroup(gid2, 'Trial Msg');
      g2.enabled = false;
      g2.plan = 'teste';
      g2.isTrial = true;
      g2.trialUsed = true;
      g2.leftAt = null;
      g2.expiryNotified = false;
      g2.expiresAt = Date.now() - 10_000;

      const msgPayloads = [];
      let msgLeftCalls = 0;
      const mockSock2 = {
        user: { id: '551100000000@s.whatsapp.net' },
        groupInviteCode: async () => { inviteCalls++; return 'XYZ'; },
        sendPresenceUpdate: async () => {},
        sendMessage: async (jid, payload) => {
          msgPayloads.push({ jid, payload });
          return { key: { id: `mm-${msgPayloads.length}`, fromMe: true } };
        },
        groupLeave: async () => { msgLeftCalls++; }
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const fakeUpsert = {
        type: 'notify',
        messages: [{
          key: { remoteJid: gid2, fromMe: false, id: 'u1', participant: '551177777777@s.whatsapp.net' },
          messageTimestamp: nowSec,
          message: { conversation: 'oi pessoal' }
        }]
      };
      await handleMessage(mockSock2, fakeUpsert);
      await handleMessage(mockSock2, {
        type: 'notify',
        messages: [{
          key: { remoteJid: gid2, fromMe: false, id: 'u2', participant: '551177777778@s.whatsapp.net' },
          messageTimestamp: nowSec,
          message: { conversation: 'tudo bem?' }
        }]
      });

      assert.strictEqual(inviteCalls, 0, 'messageHandler should not call groupInviteCode on trial end');
      assert.strictEqual(msgPayloads.length, 1, 'messageHandler should send trial end message at most once');
      assert.ok(!/https?:\/\//i.test(msgPayloads[0].payload.text));
      assert.ok(!msgPayloads[0].payload.mentions);
      assert.ok(msgLeftCalls >= 1);

      configManager.groups.delete(gid1);
      configManager.groups.delete(gid2);
      antiBan.clearGroupLeavingState(gid1);
      antiBan.clearGroupLeavingState(gid2);
    });

    // 8. groupHandler patch incremental + entryGuardCache dedupe
    await test('8. groupHandler patches groupCache incrementally and dedupes bot_trial_exit', async () => {
      const gid = '120363999000000003@g.us';
      cache.groupCache.set(gid, {
        id: gid,
        subject: 'Incremental',
        participants: [
          { id: '5511111111111@s.whatsapp.net', admin: null },
          { id: '5511222222222@s.whatsapp.net', admin: null }
        ]
      });

      const grp = configManager.getOrCreateGroup(gid, 'Incremental');
      grp.enabled = false;
      grp.banned = false;

      const mockSock = { user: { id: '5511000000000@s.whatsapp.net' } };
      await handleParticipantsUpdate(mockSock, {
        id: gid,
        action: 'promote',
        participants: ['5511111111111@s.whatsapp.net']
      });
      let cached = cache.groupCache.get(gid);
      assert.ok(cached, 'groupCache should remain warm after promote');
      assert.strictEqual(cached.participants.find(p => p.id.startsWith('5511111')).admin, 'admin');

      await handleParticipantsUpdate(mockSock, {
        id: gid,
        action: 'remove',
        participants: ['5511222222222@s.whatsapp.net']
      });
      cached = cache.groupCache.get(gid);
      assert.strictEqual(cached.participants.length, 1);

      // Dedupe entry trial_already_consumed
      grp.trialUsed = true;
      grp.leftAt = Date.now();
      let sentCount = 0;
      let leaveCount = 0;
      const exitSock = {
        user: { id: '5511000000000@s.whatsapp.net' },
        sendPresenceUpdate: async () => {},
        sendMessage: async () => { sentCount++; return { key: { id: 'x1', fromMe: true } }; },
        groupLeave: async () => { leaveCount++; }
      };

      await handleParticipantsUpdate(exitSock, {
        id: gid,
        action: 'add',
        participants: ['5511000000000@s.whatsapp.net']
      });
      await handleParticipantsUpdate(exitSock, {
        id: gid,
        action: 'add',
        participants: ['5511000000000@s.whatsapp.net']
      });

      assert.strictEqual(sentCount, 1, 'Duplicate trial_already_consumed notice was not deduped');
      assert.strictEqual(leaveCount, 1, 'Duplicate groupLeave was not deduped');

      cache.groupCache.del(gid);
      cache.entryGuardCache.del(`bot_trial_exit:${gid}`);
      antiBan.clearGroupLeavingState(gid);
      configManager.groups.delete(gid);
    });

    // 9. getGroupMetadata refresh cooldown + profilePicCache + antistatus safeDelete signature
    await test('9. Metadata refresh cooldown, welcome profilePicCache, and antistatus safeDelete signature work', async () => {
      const gid = '120363999000000004@g.us';
      let metaFetches = 0;
      let ppFetches = 0;
      let deletedKeys = [];

      const mockSock = {
        user: { id: '5511000000000@s.whatsapp.net' },
        groupMetadata: async () => {
          metaFetches++;
          return { id: gid, subject: 'Cool', participants: [{ id: '5511000000000@s.whatsapp.net', admin: 'admin' }] };
        },
        profilePictureUrl: async () => {
          ppFetches++;
          return 'https://example.com/group.jpg';
        },
        sendPresenceUpdate: async () => {},
        sendMessage: async (targetJid, payload) => {
          if (payload.delete) {
            deletedKeys.push({ targetJid, deleteKey: payload.delete });
          }
          return { key: { id: 'w1', fromMe: true } };
        }
      };

      cache.groupCache.del(gid);
      cache.metadataRefreshCache.del(gid);
      cache.profilePicCache.del(gid);

      await getGroupMetadata(mockSock, gid, { refresh: true });
      await getGroupMetadata(mockSock, gid, { refresh: true });
      assert.strictEqual(metaFetches, 1, 'metadataRefreshCache should throttle repeated refresh:true calls within 60s');

      const gCfg = configManager.getOrCreateGroup(gid, 'Cool');
      gCfg.enabled = true;
      configManager.updatePluginConfig(gid, 'welcome', { enabled: true, message: 'Oi {user}', autoDeleteSeconds: 0 });
      configManager.updatePluginConfig(gid, 'antistatus', { enabled: true, warn: false });

      await welcomePlugin.onParticipantsUpdate({
        sock: mockSock,
        groupJid: gid,
        targetPhoneJid: '5511444444444@s.whatsapp.net',
        targetGroupJid: '5511444444444@s.whatsapp.net',
        participantNumber: '5511444444444',
        lang: 'pt',
        action: 'add'
      });
      await welcomePlugin.onParticipantsUpdate({
        sock: mockSock,
        groupJid: gid,
        targetPhoneJid: '5511555555555@s.whatsapp.net',
        targetGroupJid: '5511555555555@s.whatsapp.net',
        participantNumber: '5511555555555',
        lang: 'pt',
        action: 'add'
      });
      assert.strictEqual(ppFetches, 1, 'profilePictureUrl should be cached after first fetch');

      await antistatusPlugin.onMessage({
        sock: mockSock,
        msg: {
          key: { remoteJid: gid, id: 'status-spam-1', fromMe: false, participant: '5511444444444@s.whatsapp.net' },
          message: { extendedTextMessage: { text: '@status oi', contextInfo: { mentionedJid: ['status@broadcast'] } } }
        },
        from: gid,
        sender: '5511444444444@s.whatsapp.net',
        text: '@status oi',
        isBotAdmin: true,
        isAdmin: false,
        isOwner: false,
        lang: 'pt'
      });

      assert.strictEqual(deletedKeys.length, 1, 'antistatus should delete offending message cleanly');
      assert.strictEqual(deletedKeys[0].targetJid, gid);
      assert.strictEqual(deletedKeys[0].deleteKey.id, 'status-spam-1');

      cache.groupCache.del(gid);
      cache.metadataRefreshCache.del(gid);
      cache.profilePicCache.del(gid);
      configManager.groups.delete(gid);
    });

    // 10. safeGroupAction, safeDelete fallback jitter, e safeKick fallback jitter
    await test('10. safeGroupAction serializes mutations and safeDelete/safeKick add fallback jitter', async () => {
      const order = [];
      let deleteCalls = 0;
      let kickCalls = 0;

      const mockSock = {
        user: { id: '551100000000@s.whatsapp.net' },
        groupSettingUpdate: async (gid, setting) => {
          order.push(`start:${setting}`);
          await antiBan.sleep(30);
          order.push(`end:${setting}`);
          return true;
        },
        sendMessage: async () => {
          deleteCalls++;
          if (deleteCalls === 1) throw new Error('first candidate fails');
          return { key: { id: 'del-ok' } };
        },
        groupParticipantsUpdate: async (gid, list) => {
          kickCalls++;
          if (list[0] === 'primary@lid') return [{ status: '404' }];
          return [{ status: '200' }];
        }
      };

      const prevIsOwner = settings.isOwner;
      assert.strictEqual(typeof prevIsOwner, 'function');

      await Promise.all([
        antiBan.safeGroupAction(mockSock, '120363999000000005@g.us', (s, id) => s.groupSettingUpdate(id, 'announcement'), { minDelayMs: 10, maxDelayMs: 20 }),
        antiBan.safeGroupAction(mockSock, '120363999000000005@g.us', (s, id) => s.groupSettingUpdate(id, 'not_announcement'), { minDelayMs: 10, maxDelayMs: 20 })
      ]);

      assert.deepStrictEqual(order, [
        'start:announcement',
        'end:announcement',
        'start:not_announcement',
        'end:not_announcement'
      ]);

      const tDelStart = Date.now();
      const delOk = await antiBan.safeDelete(
        mockSock,
        '120363999000000005@g.us',
        { id: 'msg-del-1', fromMe: false, participant: '5511111111111:1@s.whatsapp.net' },
        ['5511111111111@s.whatsapp.net']
      );
      assert.strictEqual(delOk, true);
      assert.ok(Date.now() - tDelStart >= 140, 'safeDelete should delay before fallback candidate');

      const tKickStart = Date.now();
      const kickOk = await antiBan.safeKick(
        mockSock,
        '120363999000000005@g.us',
        'primary@lid',
        ['fallback@s.whatsapp.net']
      );
      assert.strictEqual(kickOk, true);
      assert.strictEqual(kickCalls, 2);
      assert.ok(Date.now() - tKickStart >= 240, 'safeKick should delay before fallback JID');
    });
  } finally {
    // Restore original data/groups.json state
    if (hadGroupsFile) {
      fs.writeFileSync(groupsFile, originalGroupsRaw, 'utf8');
    } else if (fs.existsSync(groupsFile)) {
      fs.unlinkSync(groupsFile);
    }
    if (hadGroupsBak) {
      fs.writeFileSync(groupsBakFile, originalGroupsBakRaw, 'utf8');
    } else if (fs.existsSync(groupsBakFile)) {
      fs.unlinkSync(groupsBakFile);
    }
    configManager.isDirty = false;
  }

  console.log(`\nResumo Anti-Ban Hardening Tests: ${passed}/${results.length} passaram.`);
  if (passed < results.length) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
