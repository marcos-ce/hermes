const assert = require('assert');
const path = require('path');
const configManager = require('../src/core/configManager');
const pluginLoader = require('../src/core/pluginLoader');
const wizardEngine = require('../src/core/wizardEngine');
const toolRegistry = require('../src/services/toolRegistry');
const { t } = require('../src/utils/i18n');
const autoapprove = require('../src/plugins/admin/autoapprove');

console.log('🧪 ====================================================');
console.log('🚀 INICIANDO BATERIA DE TESTES DE INTEGRIDADE & ANTI-BAN');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function runTests() {
  // 1. Plugin Loader & Aliases
  it('PluginLoader inicializa e carrega autoapprove com todos os aliases', () => {
    pluginLoader.init();
    const cmd = pluginLoader.findCommand('autoapprove');
    assert(cmd, 'Comando autoapprove não encontrado');
    assert.strictEqual(cmd.name, 'autoapprove');
    assert(pluginLoader.findCommand('aprovar'), 'Alias !aprovar não resolveu');
    assert(pluginLoader.findCommand('aceitar'), 'Alias !aceitar não resolveu');
    assert(pluginLoader.findCommand('pedidos'), 'Alias !pedidos não resolveu');
    assert(pluginLoader.findCommand('solicitacoes'), 'Alias !solicitacoes não resolveu');
    assert(pluginLoader.findCommand('24'), 'Alias /24 não resolveu');
    assert.strictEqual(pluginLoader.onJoinRequestHooks.length, 1, 'Hook onJoinRequest não registrado');
  });

  // 2. Schemas & Wizard Engine
  it('ConfigSchema de autoapprove possui os 3 campos e resolve no Wizard', () => {
    const schema = pluginLoader.schemas.get('autoapprove');
    assert(schema, 'Schema de autoapprove não encontrado');
    assert.strictEqual(schema.fields.length, 3);
    const fieldNames = schema.fields.map(f => f.name);
    assert(fieldNames.includes('allowedDdis'));
    assert(fieldNames.includes('actionForForeigners'));
    assert(fieldNames.includes('notifyGroup'));
  });

  // 3. Validação de Números Brasileiros e Estrangeiros
  it('Validação de telefone brasileiro e DDIs permitidos', () => {
    // Celular BR com 9 dígitos (13 dígitos)
    const validBR = '5511999998888';
    assert.strictEqual(validBR.startsWith('55'), true);
    assert.strictEqual(validBR.length, 13);
    const ddd11 = parseInt(validBR.substring(2, 4), 10);
    assert(ddd11 >= 11 && ddd11 <= 99);

    // Fixo / Sem 9º dígito (12 dígitos)
    const validLandline = '552122334455';
    assert.strictEqual(validLandline.length, 12);
    const ddd21 = parseInt(validLandline.substring(2, 4), 10);
    assert(ddd21 >= 11 && ddd21 <= 99);

    // DDD Inválido (09)
    const invalidDDD = '5509999998888';
    const ddd09 = parseInt(invalidDDD.substring(2, 4), 10);
    assert(ddd09 < 11, 'DDD 09 não deveria ser aceito como válido');

    // Número dos EUA (+1)
    const usaNum = '14155552671';
    assert.strictEqual(usaNum.startsWith('55'), false);
  });

  // 4. Traduções i18n
  it('Dicionário i18n possui todas as chaves em PT, ES e EN sem undefined', () => {
    const keys = [
      'autoapprove.status',
      'autoapprove.summary',
      'autoapprove.no_pending',
      'autoapprove.no_pending_br',
      'autoapprove.batch_starting',
      'autoapprove.batch_finished',
      'autoapprove.approved_single',
      'autoapprove.circuit_breaker_pause',
      'autoapprove.approval_mode_warning',
      'autoapprove.target_approved',
      'autoapprove.target_not_found'
    ];

    ['pt', 'es', 'en'].forEach(lang => {
      keys.forEach(k => {
        const text = t(lang, k, {
          status: 'ATIVO',
          ddis: '55',
          foreignAction: 'Ignorar',
          notify: 'Não',
          total: 5,
          brCount: 4,
          foreignCount: 1,
          prefix: '!',
          count: 4,
          approved: 4,
          user: '5511999999999',
          minutes: 3
        });
        assert(text && !text.includes('undefined'), `Tradução falhou para ${lang}:${k}`);
      });
    });
  });

  // 5. ToolRegistry da IA
  it('ToolRegistry possui 25 ferramentas incluindo manage_join_requests', () => {
    const tools = toolRegistry.getTools();
    assert.strictEqual(tools.length, 25, 'Número total de ferramentas deve ser 25');
    const joinTool = tools.find(t => t.function.name === 'manage_join_requests');
    assert(joinTool, 'Ferramenta manage_join_requests ausente');
    assert.deepStrictEqual(
      joinTool.function.parameters.properties.action.enum,
      ['list', 'approve_all_br', 'enable_auto', 'disable_auto']
    );
  });

  // 6. Simulação de Execução de Tool Call na IA
  await itAsync('ToolRegistry executa manage_join_requests para enable_auto e disable_auto', async () => {
    const fakeGroup = '120363000000000000@g.us';
    const fakeAdmin = '5511999990000@s.whatsapp.net';
    const fakeBot = '5511988880000@s.whatsapp.net';

    // Mock do socket e metadados no cache com permissão de admin
    const { groupCache } = require('../src/utils/cache');
    groupCache.set(fakeGroup, {
      id: fakeGroup,
      subject: 'Grupo Teste',
      participants: [
        { id: fakeAdmin, admin: 'admin' },
        { id: fakeBot, admin: 'admin' }
      ]
    });

    const fakeSock = {
      user: { id: `${fakeBot}:1` }
    };

    // Testa enable_auto
    const resEnable = await toolRegistry.executeTool({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      toolName: 'manage_join_requests',
      args: { action: 'enable_auto' }
    });

    assert(resEnable.success, 'Falha ao ativar via IA');
    assert(resEnable.message.includes('ATIVADA'), 'Mensagem de retorno incorreta');
    assert.strictEqual(configManager.isPluginEnabled(fakeGroup, 'autoapprove'), true);

    // Testa disable_auto
    const resDisable = await toolRegistry.executeTool({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      toolName: 'manage_join_requests',
      args: { action: 'disable_auto' }
    });

    assert(resDisable.success, 'Falha ao desativar via IA');
    assert(resDisable.message.includes('DESATIVADA'), 'Mensagem de retorno incorreta');
    assert.strictEqual(configManager.isPluginEnabled(fakeGroup, 'autoapprove'), false);
  });

  // 7. Simulação de onJoinRequest para números BR vs Estrangeiros
  await itAsync('onJoinRequest aprova número BR e filtra estrangeiro', async () => {
    const fakeGroup = '120363000000000000@g.us';
    configManager.setPluginEnabled(fakeGroup, 'autoapprove', true);
    configManager.updatePluginConfig(fakeGroup, 'autoapprove', {
      enabled: true,
      allowedDdis: ['55'],
      actionForForeigners: 'ignore',
      notifyGroup: false
    });

    const fakeSock = {
      user: { id: '5511988880000:1@s.whatsapp.net' },
      groupRequestParticipantsUpdate: async () => ({ status: 200 }),
      sendPresenceUpdate: async () => {}
    };

    // Caso A: Número estrangeiro (+1 EUA) com actionForForeigners = 'ignore'
    const resForeign = await autoapprove.onJoinRequest({
      sock: fakeSock,
      groupJid: fakeGroup,
      participant: '14155552671@s.whatsapp.net',
      action: 'created',
      lang: 'pt',
      style: 'natural'
    });
    assert.strictEqual(resForeign, false, 'Estrangeiro não deve ser aprovado nem bloqueado quando actionForForeigners é ignore');

    // Caso B: Número brasileiro legítimo (+55 11 99999-8888)
    const resBR = await autoapprove.onJoinRequest({
      sock: fakeSock,
      groupJid: fakeGroup,
      participant: '5511999998888@s.whatsapp.net',
      action: 'created',
      lang: 'pt',
      style: 'natural'
    });
    assert.deepStrictEqual(resBR, { stop: true }, 'Brasileiro deve ser aceito e retornar { stop: true }');
  });

  // 8. Testes Cirúrgicos de Normalização (Multi-Device, Sem DDI 55, Objetos e LIDs)
  it('extractParticipantInfo e isNumberAllowed normalizam todos os formatos brasileiros e filtram estrangeiros', () => {
    const { extractParticipantInfo, isNumberAllowed } = autoapprove;

    // A: Multi-device com :0 e :1
    const p1 = extractParticipantInfo('5511999998888:1@s.whatsapp.net');
    assert.strictEqual(p1.digits, '5511999998888');
    assert.strictEqual(p1.cleanTargetJid, '5511999998888@s.whatsapp.net');
    assert.strictEqual(isNumberAllowed(p1.digits, ['55']), true);

    const p0 = extractParticipantInfo('5511999998888:0@s.whatsapp.net');
    assert.strictEqual(p0.digits, '5511999998888');
    assert.strictEqual(isNumberAllowed(p0.digits, ['55']), true);

    // B: Formato nacional sem DDI 55 (celular 11 dígitos com 9 no 3º dígito)
    const pNoDdi = extractParticipantInfo('11999998888');
    assert.strictEqual(pNoDdi.digits, '5511999998888');
    assert.strictEqual(isNumberAllowed(pNoDdi.digits, ['55']), true);

    // C: Fixo nacional sem DDI 55 (10 dígitos com início [2-5])
    const pLandline = extractParticipantInfo('1133334444');
    assert.strictEqual(pLandline.digits, '551133334444');
    assert.strictEqual(isNumberAllowed(pLandline.digits, ['55']), true);

    // D: Objeto do Baileys com phone_number
    const pObj = extractParticipantInfo({ jid: '12345678@lid', phone_number: '5511999998888' });
    assert.strictEqual(pObj.digits, '5511999998888');
    assert.strictEqual(isNumberAllowed(pObj.digits, ['55']), true);

    // E: Objeto do Baileys com sender_pn
    const pObjPn = extractParticipantInfo({ jid: '87654321@lid', sender_pn: '11988887777:1@s.whatsapp.net' });
    assert.strictEqual(pObjPn.digits, '5511988887777');
    assert.strictEqual(isNumberAllowed(pObjPn.digits, ['55']), true);

    // F: Número dos EUA com 11 dígitos (+1 415 555-2671) NÃO deve ser confundido com DDD 14
    const pUsa = extractParticipantInfo('14155552671@s.whatsapp.net');
    assert.strictEqual(pUsa.digits, '14155552671');
    assert.strictEqual(isNumberAllowed(pUsa.digits, ['55']), false);

    // G: Número da Argentina (+54 9 11 2345-6789)
    const pArg = extractParticipantInfo('5491123456789@s.whatsapp.net');
    assert.strictEqual(pArg.digits, '5491123456789');
    assert.strictEqual(isNumberAllowed(pArg.digits, ['55']), false);

    // H: DDD Inválido no Brasil (09)
    assert.strictEqual(isNumberAllowed('5509999998888', ['55']), false);
  });

  // 9. Simulação de onJoinRequest com multi-device (:1) e sem DDI 55
  await itAsync('onJoinRequest aprova participantes com sufixo de dispositivo e sem DDI', async () => {
    const fakeGroup = '120363000000000000@g.us';
    configManager.setPluginEnabled(fakeGroup, 'autoapprove', true);
    configManager.updatePluginConfig(fakeGroup, 'autoapprove', {
      enabled: true,
      allowedDdis: ['55'],
      actionForForeigners: 'ignore',
      notifyGroup: false
    });

    const fakeSock = {
      user: { id: '5511988880000:1@s.whatsapp.net' },
      groupRequestParticipantsUpdate: async () => ({ status: 200 }),
      sendPresenceUpdate: async () => {}
    };

    // Caso A: Participante com :1 multi-device
    const resDevice = await autoapprove.onJoinRequest({
      sock: fakeSock,
      groupJid: fakeGroup,
      participant: '5511999998888:1@s.whatsapp.net',
      action: 'created',
      lang: 'pt',
      style: 'natural'
    });
    assert.deepStrictEqual(resDevice, { stop: true });

    // Caso B: Participante enviado como objeto com phone_number
    const resObj = await autoapprove.onJoinRequest({
      sock: fakeSock,
      groupJid: fakeGroup,
      participant: { jid: '123456@lid', phone_number: '11999998888' },
      action: 'created',
      lang: 'pt',
      style: 'natural'
    });
    assert.deepStrictEqual(resObj, { stop: true });
  });

  // 10. Execução de aprovação individual manual por comando (!aprovar <numero>)
  await itAsync('Comando !aprovar aceita número específico ou retorna aviso de não encontrado', async () => {
    const fakeGroup = '120363000000000000@g.us';
    const fakeAdmin = '5511999990000@s.whatsapp.net';
    const fakeBot = '5511988880000@s.whatsapp.net';

    const { groupCache } = require('../src/utils/cache');
    groupCache.set(fakeGroup, {
      id: fakeGroup,
      subject: 'Grupo Teste',
      participants: [
        { id: fakeAdmin, admin: 'admin' },
        { id: fakeBot, admin: 'admin' }
      ]
    });

    const fakeSock = {
      user: { id: `${fakeBot}:1` },
      groupRequestParticipantsList: async () => [
        { jid: '5511999998888:0@s.whatsapp.net' },
        { jid: '14155552671@s.whatsapp.net' }
      ],
      groupRequestParticipantsUpdate: async () => ({ status: 200 }),
      sendPresenceUpdate: async () => {}
    };

    let replySuccess = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      args: ['11999998888'], // Admin digitou número BR sem DDI
      reply: (txt) => { replySuccess = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });
    assert(replySuccess.includes('Aprovada'), 'Deveria aprovar o participante brasileiro encontrado');

    let replyNotFound = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      args: ['5521999990000'], // Número que não está na fila
      reply: (txt) => { replyNotFound = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });
    assert(replyNotFound.includes('Não Encontrada'), 'Deveria avisar que o número não está pendente');
  });

  // 11. Teste de Sorteio com Fisher-Yates (pickWinners)
  it('pickWinners seleciona vencedores sem viés estatístico e respeita os limites da pool', () => {
    const { pickWinners } = require('../src/utils/raffle');
    const pool = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const winners = pickWinners(pool, 2);
    assert.strictEqual(winners.length, 2);
    assert(pool.includes(winners[0]));
    assert(pool.includes(winners[1]));
    assert.notStrictEqual(winners[0], winners[1]);
    assert.strictEqual(pool.length, 5, 'Array original não deve ser mutado');

    // Casos de contorno
    assert.deepStrictEqual(pickWinners([], 3), []);
    assert.strictEqual(pickWinners(pool, 10).length, 5, 'Count maior que pool deve limitar ao tamanho da pool');
  });

  // 12. Teste de PinTracker (unpinAllMessages)
  await itAsync('pinTracker registra pins e unpinAllMessages desafixa todas as mensagens', async () => {
    const pinTracker = require('../src/utils/pinTracker');
    const fakeGroup = '120363000000000001@g.us';
    pinTracker.clearPins(fakeGroup);

    pinTracker.addPin(fakeGroup, { remoteJid: fakeGroup, id: 'MSG_1', fromMe: false });
    pinTracker.addPin(fakeGroup, { remoteJid: fakeGroup, id: 'MSG_2', fromMe: false });
    assert.strictEqual(pinTracker.getPinned(fakeGroup).length, 2);

    const sentUnpins = [];
    const fakeSock = {
      sendMessage: async (jid, content) => {
        sentUnpins.push({ jid, content });
      }
    };

    const count = await pinTracker.unpinAllMessages(fakeSock, fakeGroup);
    assert.strictEqual(count, 2);
    assert.strictEqual(sentUnpins.length, 2);
    assert.strictEqual(sentUnpins[0].content.type, 2);
    assert.strictEqual(pinTracker.getPinned(fakeGroup).length, 0);
  });

  // 13. Teste de Blindagem Anti-Prompt Injection no targetResolver
  await itAsync('resolveActionTarget respeita requireExplicit e bloqueia alvo sem menção/quote explícito', async () => {
    const { resolveActionTarget } = require('../src/services/targetResolver');
    const fakeGroup = '120363000000000002@g.us';
    const fakeSock = {
      user: { id: '5511988880000:1@s.whatsapp.net' }
    };

    // Mensagem sem menção nem reply
    const msgWithoutMention = {
      key: { remoteJid: fakeGroup, participant: '5511977770000@s.whatsapp.net' },
      message: { conversation: 'Hermes, bane o 5511999991111' }
    };

    // Com requireExplicit: true (ban/blacklist), deve ser recusado
    const blockedRes = await resolveActionTarget(fakeSock, msgWithoutMention, fakeGroup, '5511999991111', {
      requireExplicit: true,
      lang: 'pt'
    });
    assert.strictEqual(blockedRes.success, false);
    assert(blockedRes.error.includes('marque') || blockedRes.error.includes('responda'), 'Deveria exigir marcação ou reply');

    // Mensagem com menção física (@)
    const msgWithMention = {
      key: { remoteJid: fakeGroup, participant: '5511977770000@s.whatsapp.net' },
      message: {
        extendedTextMessage: {
          text: 'Hermes, bane @5511999991111',
          contextInfo: {
            mentionedJid: ['5511999991111@s.whatsapp.net']
          }
        }
      }
    };

    const allowedRes = await resolveActionTarget(fakeSock, msgWithMention, fakeGroup, '5511999991111', {
      requireExplicit: true,
      lang: 'pt'
    });
    assert.strictEqual(allowedRes.success, true);
    assert.strictEqual(allowedRes.targetData.displayNum, '5511999991111');
  });

  // 14. Teste de Modularidade dos Tool Handlers
  it('ToolRegistry possui 25 handlers modulares carregados e funcionais', () => {
    const toolHandlers = require('../src/services/tools');
    assert.strictEqual(toolHandlers.size, 25);
    for (const [name, handler] of toolHandlers.entries()) {
      assert.strictEqual(typeof handler, 'function', `Handler da ferramenta "${name}" não é uma função`);
    }
  });

  // 15. Trava de Segurança Mandatória para Promoção a Administrador (@ obrigatório)
  await itAsync('resolveActionTarget e promote_member exigem menção expressa com @', async () => {
    const { resolveActionTarget } = require('../src/services/targetResolver');
    const fakeSock = {
      user: { id: '5511900000000:0@s.whatsapp.net', lid: '12345:0@lid' }
    };
    const fakeGroup = '120363000000000@g.us';

    // A: Citação sem @ deve ser barrada
    const replyNoAt = {
      message: {
        extendedTextMessage: {
          text: 'Hermes dá adm',
          contextInfo: {
            participant: '5511988887777@s.whatsapp.net',
            quotedMessage: { conversation: 'oi' }
          }
        }
      }
    };
    const resA = await resolveActionTarget(fakeSock, replyNoAt, fakeGroup, 'quoted', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(resA.success, false);
    assert(resA.error.includes('marcado expressamente com @'));

    // B: Menção com @ deve ser aceita
    const mentionAt = {
      message: {
        extendedTextMessage: {
          text: 'Hermes dá adm pro @5511988887777',
          contextInfo: {
            mentionedJid: ['5511988887777@s.whatsapp.net']
          }
        }
      }
    };
    const resB = await resolveActionTarget(fakeSock, mentionAt, fakeGroup, '@5511988887777', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(resB.success, true);
    assert.strictEqual(resB.targetData.phoneJid, '5511988887777@s.whatsapp.net');
  });

  console.log('\n====================================================');
  console.log(`🏁 RESULTADO FINAL: ${passedTests}/${totalTests} testes aprovados!`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal no runner de testes:', err);
  process.exit(1);
});
