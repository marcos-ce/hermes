const fs = require('fs');
const path = require('path');

// Silencia logs de ratchet do libsignal que poluem o console com centenas de "Closing session"
const originalConsoleInfo = console.info;
console.info = function (...args) {
  if (
    typeof args[0] === 'string' &&
    (args[0].startsWith('Closing session') || args[0].startsWith('Closing open session'))
  ) {
    return;
  }
  return originalConsoleInfo.apply(console, args);
};

const setupWizard = require('./src/core/setupWizard');
const configManager = require('./src/core/configManager');
const pluginLoader = require('./src/core/pluginLoader');
const { connectBot } = require('./src/core/connection');
const scheduler = require('./src/core/scheduler');
const logger = require('./src/utils/logger');

// ==========================================
// Graceful Shutdown & Persistência Atômica
// ==========================================
let isShuttingDown = false;

function handleExit(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Recebido sinal de finalização (${signal}). Salvando dados com segurança...`);
  try {
    configManager.flushSync();
    console.log('💾 Dados persistidos com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao salvar dados no encerramento:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));
process.on('exit', () => {
  try {
    configManager.flushSync();
  } catch (_) {}
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Exceção não tratada detectada');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Rejeição de promessa não tratada');
});

// ==========================================
// Inicialização do Bot
// ==========================================
async function main() {
  const isSetupForced = process.argv.includes('--setup');
  const envExists = fs.existsSync(path.resolve(process.cwd(), '.env'));

  // 1. Executa o Setup Wizard de terminal no primeiro boot ou se forçado
  if (!envExists || isSetupForced) {
    await setupWizard.run(isSetupForced);
  }

  // 2. Inicializa o Gerenciador de Configurações Atômicas em RAM
  configManager.init();

  // 3. Inicializa o Carregador Dinâmico de Plugins e Schemas
  pluginLoader.init();

  // 4. Inicia a Conexão com o WhatsApp via Baileys
  const sock = await connectBot();

  // 5. Inicializa o Scheduler de tarefas periódicas escalonadas
  scheduler.init(sock);
}

main().catch((err) => {
  logger.fatal({ err }, 'Falha crítica na inicialização do bot');
  process.exit(1);
});
