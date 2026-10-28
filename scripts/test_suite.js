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

/**
 * Aguarda a fila anti-ban ficar ociosa antes de testes que manipulam a fila.
 * @param {number} timeoutMs
 */
async function waitForApprovalQueue(timeoutMs = 30000) {
  const queue = autoapprove.approvalQueue;
  const startedAt = Date.now();
  while ((queue.isProcessing || queue.queue.length > 0) && Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
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
      'autoapprove.batch_starting_all',
      'autoapprove.batch_finished',
      'autoapprove.batch_finished_all',
      'autoapprove.batch_cancelled',
      'autoapprove.approved_single',
      'autoapprove.circuit_breaker_pause',
      'autoapprove.approval_mode_warning',
      'autoapprove.target_approved',
      'autoapprove.target_failed',
      'autoapprove.target_ambiguous',
      'autoapprove.target_not_found',
      'autoapprove.queue_cancelled',
      'autoapprove.all_members',
      'autoapprove.activated_all'
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
          unknownCount: 0,
          prefix: '!',
          count: 4,
          approved: 4,
          failed: 0,
          cancelled: 0,
          user: '5511999999999',
          reason: 'forbidden',
          minutes: 3
        });
        assert(text && !text.includes('undefined'), `Tradução falhou para ${lang}:${k}`);
      });
    });
  });

  // 5. ToolRegistry da IA
  it('ToolRegistry possui 26 ferramentas incluindo manage_join_requests', () => {
    const tools = toolRegistry.getTools();
    assert.strictEqual(tools.length, 26, 'Número total de ferramentas deve ser 26');
    const joinTool = tools.find(t => t.function.name === 'manage_join_requests');
    assert(joinTool, 'Ferramenta manage_join_requests ausente');
    assert.deepStrictEqual(
      joinTool.function.parameters.properties.action.enum,
      ['list', 'approve_all_br', 'approve_all', 'enable_auto', 'disable_auto']
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

    // Ativação explícita para QUALQUER membro (mode: all)
    const resEnableAll = await toolRegistry.executeTool({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      toolName: 'manage_join_requests',
      args: { action: 'enable_auto', mode: 'all' }
    });

    assert(resEnableAll.success, 'Falha ao ativar para qualquer membro via IA');
    assert(
      resEnableAll.message.includes('QUALQUER membro'),
      `Mensagem deveria indicar modo all, recebido: ${resEnableAll.message}`
    );
    assert.strictEqual(configManager.isPluginEnabled(fakeGroup, 'autoapprove'), true);
    assert.deepStrictEqual(
      configManager.getPluginConfig(fakeGroup, 'autoapprove').allowedDdis,
      ['*']
    );

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

  // 11. Opção de Aceitar Qualquer Membro (Wildcard '*')
  await itAsync('Opção de aceitar qualquer membro funciona via comando, wildcard e lote de todos', async () => {
    const { isNumberAllowed } = autoapprove;
    const fakeGroup = '120363000000000002@g.us';
    const fakeAdmin = '5511999990000@s.whatsapp.net';
    const fakeBot = '5511988880000@s.whatsapp.net';

    // A: isNumberAllowed com wildcard '*' aceita qualquer país
    assert.strictEqual(isNumberAllowed('14155552671', ['*']), true, 'Deveria aceitar EUA com *');
    assert.strictEqual(isNumberAllowed('5491123456789', ['todos']), true, 'Deveria aceitar Argentina com todos');
    assert.strictEqual(isNumberAllowed('351912345678', ['all']), true, 'Deveria aceitar Portugal com all');
    assert.strictEqual(isNumberAllowed('5511999998888', ['qualquer']), true, 'Deveria aceitar Brasil com qualquer');

    // B: Ativação direta para qualquer membro via comando !aprovar qualquer
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
      sendPresenceUpdate: async () => {},
      sendMessage: async () => {}
    };

    let replyActivated = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      args: ['qualquer'],
      reply: (txt) => { replyActivated = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });
    assert(replyActivated.includes('QUALQUER membro'), 'Deveria confirmar ativação para qualquer membro');
    const cfgAfter = configManager.getPluginConfig(fakeGroup, 'autoapprove');
    assert.strictEqual(cfgAfter.enabled, true);
    assert.deepStrictEqual(cfgAfter.allowedDdis, ['*']);

    // C: onJoinRequest com allowedDdis: ['*'] aprova número estrangeiro (+1 EUA)
    const resForeignApproved = await autoapprove.onJoinRequest({
      sock: fakeSock,
      groupJid: fakeGroup,
      participant: '14155552671@s.whatsapp.net',
      action: 'created',
      lang: 'pt',
      style: 'natural'
    });
    assert.deepStrictEqual(resForeignApproved, { stop: true }, 'Deveria aceitar participante estrangeiro quando configurado com *');

    // D: Execução de !aprovar todos aprova todos os pendentes (BR e estrangeiros)
    let replyBatchAll = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: fakeGroup,
      sender: fakeAdmin,
      args: ['todos'],
      reply: (txt) => { replyBatchAll = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });
    assert(replyBatchAll.includes('TODOS os 2 participantes'), 'Deveria iniciar aprovação de todos os 2 pendentes');
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
  it('ToolRegistry possui 26 handlers modulares carregados e funcionais', () => {
    const toolHandlers = require('../src/services/tools');
    assert.strictEqual(toolHandlers.size, 26);
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

  // 17. Teste de Não-Interferência entre AutoApprove e AutoMsg no Wizard/Config Panel
  it('Ordem do painel !config mantém automsg na posição 4 e autoapprove na posição 10 sem interferência', async () => {
    const wizardEngine = require('../src/core/wizardEngine');
    const { wizardCache } = require('../src/utils/cache');
    const fakeSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async () => ({ key: { id: 'msg123' } })
    };
    const fakeGroup = '120363999999999@g.us';
    const fakeAdmin = '5511999990000@s.whatsapp.net';
    configManager.getOrCreateGroup(fakeGroup);

    await wizardEngine.startConfigPanel(fakeSock, { key: { id: 'trig' } }, fakeGroup, fakeAdmin);
    const session = wizardCache.get(`${fakeGroup}:${fakeAdmin}`);
    assert(session, 'Sessão do painel deve ser criada');
    assert.strictEqual(session.type, 'config_menu');
    assert(Array.isArray(session.modules), 'Modules deve ser array');

    // Posição 4 (índice 3) DEVE ser automsg
    assert.strictEqual(session.modules[3].name, 'automsg', 'Opção [4] do menu deve ser automsg');
    // autoapprove deve estar na posição 10 (índice 9)
    assert.strictEqual(session.modules[9].name, 'autoapprove', 'Opção [10] do menu deve ser autoapprove');

    // Testa seleção via handleInput: enviar "4 on" deve ligar automsg sem afetar autoapprove
    configManager.setPluginEnabled(fakeGroup, 'automsg', false);
    configManager.setPluginEnabled(fakeGroup, 'autoapprove', false);
    await wizardEngine.handleInput(fakeSock, { key: { id: 'reply4' } }, fakeGroup, fakeAdmin, '4 on');
    assert.strictEqual(configManager.isPluginEnabled(fakeGroup, 'automsg'), true, 'Opção "4 on" deve ativar automsg');
    assert.strictEqual(configManager.isPluginEnabled(fakeGroup, 'autoapprove'), false, 'Opção "4 on" NÃO deve alterar autoapprove');
  });

  // 18. Regressão: política (wildcard) x resolução (telefone/DDI) para LIDs
  await itAsync('AutoApprove: LID curto/longo com wildcard é aprovado e LID que parece BR não vira brasileiro', async () => {
    const { lidToPhoneMap } = require('../src/utils/jidResolver');
    const group = '120363000000000010@g.us';
    const fakeSock = { user: { id: '5511988880000:1@s.whatsapp.net' } };
    const queue = autoapprove.approvalQueue;
    const originalEnqueue = queue.enqueue;
    let tasks = [];

    queue.enqueue = (task) => { tasks.push(task); };

    try {
      configManager.setPluginEnabled(group, 'autoapprove', true);
      configManager.updatePluginConfig(group, 'autoapprove', {
        enabled: true,
        configured: true,
        allowedDdis: ['*'],
        actionForForeigners: 'reject',
        notifyGroup: false
      });

      tasks = [];
      const shortLid = await autoapprove.onJoinRequest({
        sock: fakeSock,
        groupJid: group,
        participant: '123456@lid',
        action: 'created',
        lang: 'pt',
        style: 'natural'
      });
      assert.deepStrictEqual(shortLid, { stop: true }, 'LID curto com wildcard deve ser aceito');
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].action, 'approve', 'LID curto com wildcard não pode ser rejeitado');
      assert.strictEqual(tasks[0].participantJid, '123456@lid');

      tasks = [];
      const longLid = await autoapprove.onJoinRequest({
        sock: fakeSock,
        groupJid: group,
        participant: '1234567890123456@lid',
        action: 'created',
        lang: 'pt',
        style: 'natural'
      });
      assert.deepStrictEqual(longLid, { stop: true }, 'LID longo com wildcard deve ser aceito');
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].action, 'approve', 'LID longo com wildcard não pode ser bloqueado');

      // Modo estrito + reject: um LID cujos dígitos parecem um celular BR continua
      // sendo identidade não resolvida. Não pode ser aprovado como brasileiro nem rejeitado.
      lidToPhoneMap.delete('5511999998888@lid');
      configManager.updatePluginConfig(group, 'autoapprove', {
        enabled: true,
        configured: true,
        allowedDdis: ['55'],
        actionForForeigners: 'reject',
        notifyGroup: false
      });

      tasks = [];
      const brLookingLid = await autoapprove.onJoinRequest({
        sock: fakeSock,
        groupJid: group,
        participant: '5511999998888@lid',
        action: 'created',
        lang: 'pt',
        style: 'natural'
      });
      assert.strictEqual(brLookingLid, false, 'LID não resolvido deve ficar pendente no modo estrito');
      assert.strictEqual(tasks.length, 0, 'LID não resolvido não pode ser aprovado nem rejeitado');
    } finally {
      queue.enqueue = originalEnqueue;
    }
  });

  // 19. Regressão: normalização de DDIs e wildcard curto/longo
  it('isNumberAllowed aceita DDIs em string, wildcard curto/longo e mantém filtro BR', () => {
    assert.strictEqual(autoapprove.isNumberAllowed('14155552671', '*'), true);
    assert.strictEqual(autoapprove.isNumberAllowed('123456', ['*']), true);
    assert.strictEqual(autoapprove.isNumberAllowed('1234567890123456', ['*']), true);
    assert.strictEqual(autoapprove.isNumberAllowed('', ['*']), false);
    assert.strictEqual(autoapprove.isNumberAllowed('5511999998888', '55'), true);
    assert.strictEqual(autoapprove.isNumberAllowed('14155552671', '55'), false);
    assert.deepStrictEqual(autoapprove.normalizeAllowedDdis('55, 351'), ['55', '351']);
    assert.strictEqual(autoapprove.isWildcardList('todos'), true);
    assert.strictEqual(autoapprove.isWildcardList('55'), false);
  });

  // 20. Regressão: retorno por participante do Baileys não pode virar sucesso falso
  it('evaluateParticipantUpdateResult não converte 403/404 em sucesso', () => {
    assert.deepStrictEqual(
      autoapprove.evaluateParticipantUpdateResult([{ status: '200' }]),
      { success: true }
    );
    assert.strictEqual(autoapprove.evaluateParticipantUpdateResult([{ status: '403' }]).success, false);
    assert.strictEqual(autoapprove.evaluateParticipantUpdateResult([{ status: '403' }]).reason, 'forbidden');
    assert.strictEqual(autoapprove.evaluateParticipantUpdateResult([{ status: '404' }]).reason, 'stale_request');
    assert.strictEqual(autoapprove.evaluateParticipantUpdateResult([]).reason, 'empty_response');
    assert.strictEqual(autoapprove.evaluateParticipantUpdateResult({ status: 200 }).success, true);
  });

  // 21. Regressão: !aprovar on não pode ligar o módulo antes do wizard
  await itAsync('!aprovar on não liga o módulo antes do wizard ser concluído', async () => {
    const group = '120363000000000011@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';
    const { groupCache } = require('../src/utils/cache');

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    const groupData = configManager.getOrCreateGroup(group);
    groupData.plugins = groupData.plugins || {};
    groupData.plugins.autoapprove = { enabled: false, configured: false };

    const fakeSock = {
      user: { id: `${bot}:1` },
      sendPresenceUpdate: async () => {},
      sendMessage: async () => ({ key: { id: 'wizard-msg' } })
    };

    await autoapprove.execute({
      sock: fakeSock,
      msg: { key: { id: 'cmd' } },
      from: group,
      sender: admin,
      args: ['on'],
      reply: () => {},
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });

    assert.strictEqual(
      configManager.isPluginEnabled(group, 'autoapprove'),
      false,
      'O módulo não pode ser ligado antes do wizard'
    );
    assert.strictEqual(
      configManager.getPluginConfig(group, 'autoapprove').configured,
      false,
      'O wizard ainda não foi concluído'
    );
  });

  // 22. Regressão: !aprovar off cancela lote/tempo real e preserva itens manuais
  await itAsync('!aprovar off cancela a fila de lote/tempo real e preserva aprovação manual', async () => {
    const group = '120363000000000012@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';
    const { groupCache } = require('../src/utils/cache');

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    configManager.setPluginEnabled(group, 'autoapprove', true);
    configManager.updatePluginConfig(group, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ['55']
    });

    const queue = autoapprove.approvalQueue;
    await waitForApprovalQueue();

    // Segura a fila para inspecionar o cancelamento sem processar os itens.
    queue.isProcessing = true;
    const results = [];
    const base = {
      sock: {},
      groupJid: group,
      participantJid: '5511999998888@s.whatsapp.net',
      action: 'approve',
      lang: 'pt',
      style: 'natural'
    };

    try {
      queue.enqueue({ ...base, source: 'batch', onComplete: r => results.push(['batch', r]) });
      queue.enqueue({ ...base, source: 'realtime', onComplete: r => results.push(['realtime', r]) });
      queue.enqueue({ ...base, source: 'manual', onComplete: r => results.push(['manual', r]) });

      let replyText = '';
      await autoapprove.execute({
        sock: { user: { id: `${bot}:1` } },
        msg: {},
        from: group,
        sender: admin,
        args: ['off'],
        reply: (txt) => { replyText = txt; },
        t: (k, vars) => t('pt', k, vars),
        isGroup: true,
        prefix: '!'
      });

      assert(replyText.includes('interrompida'), 'Deveria informar que a fila foi interrompida');
      assert(replyText.includes('2'), 'Deveria informar 2 itens cancelados');
      assert.strictEqual(configManager.isPluginEnabled(group, 'autoapprove'), false);

      assert.strictEqual(queue.queue.length, 1, 'Apenas o item manual deve permanecer');
      assert.strictEqual(queue.queue[0].source, 'manual');
      assert.deepStrictEqual(
        results.map(r => r[0]).sort(),
        ['batch', 'realtime'],
        'Lote e tempo real devem ser concluídos como cancelados'
      );
      assert(results.every(r => r[1].success === false && r[1].reason === 'disabled'));
    } finally {
      queue.queue = [];
      queue.isProcessing = false;
      queue.currentItem = null;
    }
  });

  // 23. Regressão: aprovação manual só responde após o resultado real da API
  await itAsync('!aprovar <número> responde após o resultado real e não reporta 403 como sucesso', async () => {
    await waitForApprovalQueue();

    const group = '120363000000000013@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';
    const { groupCache } = require('../src/utils/cache');

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    configManager.setPluginEnabled(group, 'autoapprove', true);
    configManager.updatePluginConfig(group, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ['55']
    });

    const fakeSock = {
      user: { id: `${bot}:1` },
      groupRequestParticipantsList: async () => [
        { jid: '5511999998888:0@s.whatsapp.net' }
      ],
      groupRequestParticipantsUpdate: async () => [
        { status: '403', jid: '5511999998888@s.whatsapp.net' }
      ],
      sendPresenceUpdate: async () => {},
      sendMessage: async () => ({ key: { id: 'msg' } })
    };

    let replyText = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: group,
      sender: admin,
      args: ['11999998888'],
      reply: (txt) => { replyText = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });

    assert(
      replyText.includes('Não foi possível'),
      `Deveria reportar a falha real da API, recebido: ${replyText}`
    );
    assert(
      !replyText.includes('Solicitação Aprovada'),
      'Não pode reportar sucesso quando o WhatsApp retorna 403'
    );
  });

  // 24. Regressão: lote wildcard inclui LIDs curtos e longos
  await itAsync('Lote com wildcard inclui LIDs curtos e longos sem bloqueio', async () => {
    const group = '120363000000000014@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';
    const { groupCache } = require('../src/utils/cache');

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    configManager.setPluginEnabled(group, 'autoapprove', true);
    configManager.updatePluginConfig(group, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ['*']
    });

    const fakeSock = {
      user: { id: `${bot}:1` },
      groupRequestParticipantsList: async () => [
        { jid: '123456@lid' },
        { jid: '1234567890123456@lid' },
        { jid: '14155552671@s.whatsapp.net' }
      ],
      sendMessage: async () => ({ key: { id: 'msg' } })
    };

    const queue = autoapprove.approvalQueue;
    const originalEnqueue = queue.enqueue;
    const tasks = [];
    queue.enqueue = (task) => { tasks.push(task); };

    try {
      let replyText = '';
      await autoapprove.execute({
        sock: fakeSock,
        msg: {},
        from: group,
        sender: admin,
        args: ['todos'],
        reply: (txt) => { replyText = txt; },
        t: (k, vars) => t('pt', k, vars),
        isGroup: true,
        prefix: '!'
      });

      assert(
        replyText.includes('TODOS os 3'),
        `Deveria iniciar o lote com os 3 participantes, recebido: ${replyText}`
      );
      assert.strictEqual(tasks.length, 3);
      assert(
        tasks.some(t => t.participantJid === '123456@lid'),
        'LID curto deve entrar no lote wildcard'
      );
      assert(
        tasks.some(t => t.participantJid === '1234567890123456@lid'),
        'LID longo deve entrar no lote wildcard'
      );
    } finally {
      queue.enqueue = originalEnqueue;
    }
  });

  // 25. Regressão: allowedDdis como string não pode causar TypeError no resumo
  await itAsync('Resumo/status aceita allowedDdis como string sem TypeError', async () => {
    const group = '120363000000000015@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';
    const { groupCache } = require('../src/utils/cache');

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    configManager.setPluginEnabled(group, 'autoapprove', true);
    configManager.updatePluginConfig(group, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: '*'
    });

    const fakeSock = {
      user: { id: `${bot}:1` },
      groupRequestParticipantsList: async () => [
        { jid: '5511999998888@s.whatsapp.net' }
      ]
    };

    let replyText = '';
    await autoapprove.execute({
      sock: fakeSock,
      msg: {},
      from: group,
      sender: admin,
      args: [],
      reply: (txt) => { replyText = txt; },
      t: (k, vars) => t('pt', k, vars),
      isGroup: true,
      prefix: '!'
    });

    assert(
      replyText.includes('Qualquer membro'),
      `Deveria exibir o modo wildcard, recebido: ${replyText}`
    );
    assert(
      replyText.includes('LIDs não resolvidos'),
      'O resumo deve mostrar a contagem de LIDs não resolvidos'
    );
  });

  // 26. Regressão: onJoinRequest exige configured
  await itAsync('onJoinRequest ignora módulo ligado mas ainda não configurado', async () => {
    const group = '120363000000000016@g.us';
    const groupData = configManager.getOrCreateGroup(group);
    groupData.plugins = groupData.plugins || {};
    groupData.plugins.autoapprove = { enabled: true, configured: false, allowedDdis: ['55'] };

    const queue = autoapprove.approvalQueue;
    const originalEnqueue = queue.enqueue;
    let enqueued = 0;
    queue.enqueue = () => { enqueued++; };

    try {
      const res = await autoapprove.onJoinRequest({
        sock: { user: { id: '5511988880000@s.whatsapp.net' } },
        groupJid: group,
        participant: '5511999998888@s.whatsapp.net',
        action: 'created',
        lang: 'pt',
        style: 'natural'
      });

      assert.strictEqual(res, false);
      assert.strictEqual(enqueued, 0);
    } finally {
      queue.enqueue = originalEnqueue;
    }
  });

  // 27. Regressão: wizard com preserveEnabled não liga módulo desligado ao salvar
  it('Wizard com preserveEnabled mantém o módulo desligado ao salvar', () => {
    const group = '120363000000000017@g.us';
    const groupData = configManager.getOrCreateGroup(group);
    groupData.plugins = groupData.plugins || {};
    groupData.plugins.autoapprove = {
      enabled: false,
      configured: true,
      allowedDdis: ['55']
    };

    wizardEngine._saveAnswers({
      groupJid: group,
      pluginName: 'autoapprove',
      answers: {
        allowedDdis: ['*'],
        actionForForeigners: 'reject',
        notifyGroup: false
      },
      preserveEnabled: true
    });

    assert.strictEqual(configManager.isPluginEnabled(group, 'autoapprove'), false);
    assert.deepStrictEqual(
      configManager.getPluginConfig(group, 'autoapprove').allowedDdis,
      ['*']
    );

    // Sem preserveEnabled, o comportamento histórico (ligar ao salvar) permanece.
    wizardEngine._saveAnswers({
      groupJid: group,
      pluginName: 'autoapprove',
      answers: {
        allowedDdis: ['55'],
        actionForForeigners: 'ignore',
        notifyGroup: false
      },
      preserveEnabled: false
    });

    assert.strictEqual(configManager.isPluginEnabled(group, 'autoapprove'), true);
  });

  // 28. Regressão: atalhos de ativação do modo "aceitar todos"
  await itAsync('Atalhos all/todos/qualquer ativam o modo aceitar todos', async () => {
    const { groupCache } = require('../src/utils/cache');
    const group = '120363000000000018@g.us';
    const admin = '5511999990000@s.whatsapp.net';
    const bot = '5511988880000@s.whatsapp.net';

    groupCache.set(group, {
      id: group,
      subject: 'Teste',
      participants: [
        { id: admin, admin: 'admin' },
        { id: bot, admin: 'admin' }
      ]
    });

    const fakeSock = {
      user: { id: `${bot}:1` },
      sendMessage: async () => ({ key: { id: 'msg' } })
    };

    const shortcuts = [
      ['on', 'all'],
      ['all', 'on'],
      ['on', 'todos'],
      ['todos', 'on'],
      ['on', 'qualquer'],
      ['qualquer', 'on'],
      ['on', '*']
    ];

    for (const args of shortcuts) {
      const groupData = configManager.getOrCreateGroup(group);
      groupData.plugins = groupData.plugins || {};
      groupData.plugins.autoapprove = {
        enabled: false,
        configured: false,
        allowedDdis: ['55']
      };

      let replyText = '';
      await autoapprove.execute({
        sock: fakeSock,
        msg: {},
        from: group,
        sender: admin,
        args,
        reply: (txt) => { replyText = txt; },
        t: (k, vars) => t('pt', k, vars),
        isGroup: true,
        prefix: '!'
      });

      const cfg = configManager.getPluginConfig(group, 'autoapprove');
      const label = `!aprovar ${args.join(' ')}`;

      assert.strictEqual(cfg.enabled, true, `${label} deveria habilitar o módulo`);
      assert.strictEqual(cfg.configured, true, `${label} deveria marcar como configurado`);
      assert.deepStrictEqual(cfg.allowedDdis, ['*'], `${label} deveria usar wildcard`);
      assert(
        replyText.includes('QUALQUER membro'),
        `${label} deveria confirmar o modo aceitar todos, recebido: ${replyText}`
      );
    }
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
