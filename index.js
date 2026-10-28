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
const pollTracker = require('./src/utils/pollTracker');
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
    pollTracker.flushSync();
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
    pollTracker.flushSync();
  } catch (_) {}
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exceção não tratada fatal detectada. Salvando estado e reiniciando...');
  try {
    configManager.flushSync();
    pollTracker.flushSync();
  } catch (_) {}
  process.exit(1);
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

  const authDir = path.resolve(process.cwd(), 'src', 'auth');
  const resetTriggerPath = path.resolve(process.cwd(), 'RESET_AUTH');
  const hasResetTrigger = fs.existsSync(resetTriggerPath);

  // Suporte a reset completo da pasta de autenticação (--reset-auth, env RESET_AUTH ou arquivo RESET_AUTH)
  const shouldFullResetAuth =
    hasResetTrigger ||
    process.argv.includes('--reset-auth') ||
    process.argv.includes('--clear-auth') ||
    process.env.RESET_AUTH === 'true' ||
    process.env.CLEAR_AUTH === 'true';

  if (shouldFullResetAuth) {
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('🧹 [Reset Auth] Pasta src/auth removida com sucesso para novo pareamento limpo.');
      } catch (err) {
        console.error('❌ [Reset Auth] Erro ao remover src/auth:', err.message);
      }
    }
    if (hasResetTrigger) {
      try {
        fs.unlinkSync(resetTriggerPath);
        console.log('🗑️ [Reset Auth] Gatilho RESET_AUTH consumido e removido.');
      } catch (_) {}
    }
  }

  // Auto-cura preventiva: se creds.json estiver corrompido ou vazio (0 bytes), limpa src/auth
  const credsPath = path.join(authDir, 'creds.json');
  if (fs.existsSync(credsPath)) {
    try {
      const rawCreds = fs.readFileSync(credsPath, 'utf-8');
      if (!rawCreds || !rawCreds.trim()) {
        throw new Error('creds.json vazio (0 bytes)');
      }
      JSON.parse(rawCreds);
    } catch (err) {
      console.log(`⚠️ [Auto-Healing] creds.json corrompido detectado (${err.message}). Limpando pasta src/auth...`);
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // Suporte a comando de reparo de sessões corrompidas (--fix-sessions ou env FIX_SESSIONS)
  if (process.argv.includes('--fix-sessions') || process.env.FIX_SESSIONS === 'true') {
    if (fs.existsSync(authDir)) {
      const files = fs.readdirSync(authDir);
      let count = 0;
      for (const f of files) {
        if (f !== 'creds.json' && (f.startsWith('session-') || f.startsWith('sender-key-') || f.startsWith('pre-key-'))) {
          try {
            fs.unlinkSync(path.join(authDir, f));
            count++;
          } catch (_) {}
        }
      }
      console.log(`🧹 [Auto-Healing] ${count} arquivos de sessão corrompidos removidos com sucesso.`);
      console.log('🔒 creds.json preservado intacto. O bot irá reconectar com novas chaves limpas.\n');
    }
  }

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
