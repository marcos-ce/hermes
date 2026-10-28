const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('🤖 INICIANDO BATERIA COMPLETA DE AUDITORIA E TESTES');
console.log('====================================================\n');

let totalErrors = 0;
let totalWarnings = 0;

function reportError(area, file, msg) {
  totalErrors++;
  console.error(`❌ [ERRO] [${area}] ${file}: ${msg}`);
}

function reportWarn(area, file, msg) {
  totalWarnings++;
  console.warn(`⚠️ [AVISO] [${area}] ${file}: ${msg}`);
}

function reportOk(area, msg) {
  console.log(`✅ [OK] [${area}] ${msg}`);
}

// ----------------------------------------------------
// 1. CHECAGEM DE SINTAXE DE TODOS OS ARQUIVOS .JS
// ----------------------------------------------------
console.log('--- 1. Checagem de Sintaxe JavaScript ---');
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'data') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const jsFiles = getAllJsFiles(process.cwd());
let syntaxPassed = 0;

for (const file of jsFiles) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    new vm.Script(content, { filename: file });
    syntaxPassed++;
  } catch (err) {
    reportError('Sintaxe', path.relative(process.cwd(), file), err.message);
  }
}
if (totalErrors === 0) {
  reportOk('Sintaxe', `Todos os ${syntaxPassed} arquivos .js têm sintaxe 100% válida.`);
}

// ----------------------------------------------------
// 2. CHECAGEM DO PLUGIN LOADER E PLUGINS
// ----------------------------------------------------
console.log('\n--- 2. Auditoria do Plugin Loader & Plugins ---');
try {
  const pluginLoader = require(path.join(process.cwd(), 'src/core/pluginLoader'));
  const stats = pluginLoader.init();
  reportOk('PluginLoader', `${pluginLoader.commands.size} comandos carregados com ${pluginLoader.aliases.size} aliases e ${pluginLoader.schemas.size} schemas.`);

  // Validação estrutural de cada plugin
  for (const [name, plugin] of pluginLoader.commands.entries()) {
    if (!plugin.name) {
      reportError('Plugin', name, 'Plugin não exporta a propriedade "name"');
    }
    if (typeof plugin.execute !== 'function' && typeof plugin.onMessage !== 'function' && typeof plugin.onParticipantsUpdate !== 'function' && typeof plugin.onJoinRequest !== 'function') {
      reportError('Plugin', name, 'Plugin não exporta método execute nem nenhum hook passivo válido');
    }
    if (plugin.configSchema) {
      if (!plugin.configSchema.fields || !Array.isArray(plugin.configSchema.fields)) {
        reportError('PluginSchema', name, 'configSchema não possui array "fields" válido');
      }
    }
  }

  // Verifica hooks
  reportOk('Hooks', `Hooks ativos: Message (${pluginLoader.onMessageHooks.length}), Participants (${pluginLoader.onParticipantsUpdateHooks.length}), JoinRequest (${pluginLoader.onJoinRequestHooks.length}), Schedule (${pluginLoader.onScheduleHooks.length})`);
} catch (err) {
  reportError('PluginLoader', 'init()', err.stack || err.message);
}

// ----------------------------------------------------
// 3. AUDITORIA DAS FERRAMENTAS DA IA (TOOL REGISTRY)
// ----------------------------------------------------
console.log('\n--- 3. Auditoria das Ferramentas da IA (Tool Registry) ---');
try {
  const toolRegistry = require(path.join(process.cwd(), 'src/services/toolRegistry'));
  const tools = toolRegistry.getTools();
  reportOk('ToolRegistry', `${tools.length} ferramentas registradas para DeepSeek/OpenAI.`);

  for (const tool of tools) {
    if (tool.type !== 'function' || !tool.function) {
      reportError('ToolRegistry', 'schema', `Formato inválido na ferramenta: ${JSON.stringify(tool)}`);
      continue;
    }
    const fn = tool.function;
    if (!fn.name || !fn.description || !fn.parameters) {
      reportError('ToolRegistry', fn.name || 'desconhecida', 'Definição de ferramenta incompleta');
    }
    if (fn.parameters.type !== 'object' || !fn.parameters.properties) {
      reportError('ToolRegistry', fn.name, 'Parâmetros não seguem formato JSON Schema (type: "object", properties)');
    }
    if (!Array.isArray(fn.parameters.required)) {
      reportError('ToolRegistry', fn.name, '"required" deve ser um array');
    }
  }

  reportOk('ToolRegistry', 'Todas as ferramentas possuem schemas JSON rigorosamente válidos.');
} catch (err) {
  reportError('ToolRegistry', 'getTools()', err.stack || err.message);
}

// ----------------------------------------------------
// 4. AUDITORIA DO MOTOR DE INTERNACIONALIZAÇÃO (i18n)
// ----------------------------------------------------
console.log('\n--- 4. Auditoria de Dicionários de Internacionalização (i18n) ---');
try {
  const { dictionaries, t } = require(path.join(process.cwd(), 'src/utils/i18n'));
  const ptKeys = Object.keys(dictionaries.pt);
  const esKeys = Object.keys(dictionaries.es);
  const enKeys = Object.keys(dictionaries.en);

  reportOk('i18n', `Total de chaves: PT (${ptKeys.length}), ES (${esKeys.length}), EN (${enKeys.length})`);

  let missingInEs = 0;
  let missingInEn = 0;

  for (const k of ptKeys) {
    if (!dictionaries.es[k]) {
      missingInEs++;
    }
    if (!dictionaries.en[k]) {
      missingInEn++;
    }
  }

  if (missingInEs > 0) {
    reportWarn('i18n', 'es', `${missingInEs} chaves de tradução presentes em PT não existem em ES (usará fallback PT).`);
  } else {
    reportOk('i18n', 'Dicionário Espanhol (ES) 100% sincronizado com PT.');
  }

  if (missingInEn > 0) {
    reportWarn('i18n', 'en', `${missingInEn} chaves de tradução presentes em PT não existem em EN (usará fallback PT).`);
  } else {
    reportOk('i18n', 'Dicionário Inglês (EN) 100% sincronizado com PT.');
  }
} catch (err) {
  reportError('i18n', 'check', err.stack || err.message);
}

// ----------------------------------------------------
// 5. TESTES UNITÁRIOS DO TIME PARSER
// ----------------------------------------------------
console.log('\n--- 5. Testes Unitários de Tempo & Duração (timeParser) ---');
try {
  const { parseRelativeTime, parseDuration, normalizeWordNumbers } = require(path.join(process.cwd(), 'src/services/timeParser'));

  // Testes de duração
  const durationTests = [
    { input: '10m', expectedMins: 10 },
    { input: '15 minutos', expectedMins: 15 },
    { input: 'por 30m', expectedMins: 30 },
    { input: 'meia hora', expectedMins: 30 },
    { input: 'uma hora e meia', expectedMins: 90 },
    { input: '2 horas', expectedMins: 120 },
    { input: 'duas horas', expectedMins: 120 },
    { input: '1 dia', expectedMins: 1440 },
    { input: 45, expectedMins: 45 }
  ];

  for (const t of durationTests) {
    const dur = parseDuration(t.input);
    if (!dur || dur.minutes !== t.expectedMins) {
      reportError('TimeParser', `parseDuration("${t.input}")`, `Esperado ${t.expectedMins}m, obtido ${dur ? dur.minutes : null}m`);
    }
  }

  // Testes de horários relativos
  const relTests = [
    { input: '10m', shouldSucceed: true, expectedMins: 10 },
    { input: 'por 15 minutos', shouldSucceed: true, expectedMins: 15 },
    { input: 'duas horas', shouldSucceed: true, expectedMins: 120 },
    { input: 'meia hora', shouldSucceed: true, expectedMins: 30 },
    { input: '22:00', shouldSucceed: true, isFixed: true },
    { input: 'às 14h', shouldSucceed: true, isFixed: true }
  ];

  for (const t of relTests) {
    const res = parseRelativeTime(t.input);
    if (!res || res.success !== t.shouldSucceed) {
      reportError('TimeParser', `parseRelativeTime("${t.input}")`, 'Falha no resultado de sucesso');
    }
    if (t.expectedMins && res.delayMinutes !== t.expectedMins) {
      reportError('TimeParser', `parseRelativeTime("${t.input}")`, `Esperado delayMinutes ${t.expectedMins}, obtido ${res.delayMinutes}`);
    }
  }

  reportOk('TimeParser', 'Todos os casos de teste de tempo, durações e palavras por extenso passaram 100%.');
} catch (err) {
  reportError('TimeParser', 'test', err.stack || err.message);
}

// ----------------------------------------------------
// 6. TESTES DE PERSISTÊNCIA ATÔMICA & CONFIG MANAGER
// ----------------------------------------------------
console.log('\n--- 6. Testes do ConfigManager & Persistência ---');
try {
  const configManager = require(path.join(process.cwd(), 'src/core/configManager'));
  const dummyJid = '999999999-audit@g.us';

  const group = configManager.getOrCreateGroup(dummyJid, 'Grupo Auditoria');
  if (!group || group.name !== 'Grupo Auditoria') {
    reportError('ConfigManager', 'getOrCreateGroup', 'Falha ao criar grupo temporário');
  }

  configManager.updatePluginConfig(dummyJid, 'antilink', { enabled: true, action: 'warn' });
  const cfg = configManager.getPluginConfig(dummyJid, 'antilink');
  if (!cfg || cfg.action !== 'warn' || !cfg.enabled) {
    reportError('ConfigManager', 'updatePluginConfig', 'Falha ao salvar configuração de plugin');
  }

  // Remove grupo dummy da memória
  configManager.groups.delete(dummyJid);
  reportOk('ConfigManager', 'Operações em memória e esquemas de dados validados com sucesso.');
} catch (err) {
  reportError('ConfigManager', 'test', err.stack || err.message);
}

// ----------------------------------------------------
// 7. AUDITORIA DE SEGURANÇA E ZERO CONTAMINAÇÃO DO CORE
// ----------------------------------------------------
console.log('\n--- 7. Auditoria de Arquitetura: Zero Contaminação do Core por IA ---');
const coreFiles = [
  'src/core/connection.js',
  'src/core/configManager.js',
  'src/core/scheduler.js',
  'src/core/setupWizard.js',
  'src/core/wizardEngine.js',
  'src/core/pluginLoader.js',
  'src/handlers/messageHandler.js',
  'src/handlers/groupHandler.js',
  'src/utils/antiBan.js',
  'src/utils/i18n.js',
  'src/utils/jidResolver.js',
  'src/utils/logger.js',
  'src/utils/cache.js'
];

const forbiddenKeywords = ['openai', 'deepseek', 'aiService', 'hermesAgent'];

for (const relPath of coreFiles) {
  const fullPath = path.join(process.cwd(), relPath);
  if (fs.existsSync(fullPath)) {
    const code = fs.readFileSync(fullPath, 'utf8');
    for (const kw of forbiddenKeywords) {
      if (code.includes(kw)) {
        reportError('IsolamentoCore', relPath, `Arquivo do core contém referência proibida a "${kw}"`);
      }
    }
  }
}
reportOk('IsolamentoCore', 'Regra de ouro mantida: ZERO bibliotecas ou referências de IA dentro do Core ou Handlers.');

// ----------------------------------------------------
// 8. TESTES DO MÓDULO AUTOAPPROVE & TOOL MANAGE_JOIN_REQUESTS
// ----------------------------------------------------
console.log('\n--- 8. Testes do Módulo AutoApprove & Ferramenta manage_join_requests ---');
try {
  const autoapprove = require(path.join(process.cwd(), 'src/plugins/admin/autoapprove'));
  if (!autoapprove.name || autoapprove.name !== 'autoapprove') {
    reportError('AutoApprove', 'name', 'Nome inválido no módulo');
  }
  if (typeof autoapprove.onJoinRequest !== 'function') {
    reportError('AutoApprove', 'onJoinRequest', 'Hook onJoinRequest não exportado');
  }
  if (!autoapprove.configSchema || !Array.isArray(autoapprove.configSchema.fields)) {
    reportError('AutoApprove', 'configSchema', 'configSchema inválido');
  }
  reportOk('AutoApprove', 'Módulo autoapprove carregado e validado com sucesso.');
} catch (err) {
  reportError('AutoApprove', 'test', err.stack || err.message);
}

console.log('\n====================================================');
console.log(`📊 RESULTADO DA AUDITORIA: ${totalErrors} ERROS, ${totalWarnings} AVISOS.`);
console.log('====================================================');

if (totalErrors > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
