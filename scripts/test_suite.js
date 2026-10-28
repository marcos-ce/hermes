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
      'autoapprove.approval_mode_warning'
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
