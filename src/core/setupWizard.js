const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const settings = require('../config/settings');

/**
 * Executa o Wizard interativo no Terminal para configurar o .env no primeiro boot
 * @param {boolean} force Forçar execução mesmo se o .env já existir
 * @returns {Promise<boolean>} Retorna true se configurado com sucesso
 */
async function run(force = false) {
  const envPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(envPath) && !force) {
    return false;
  }

  // Se o ambiente não for interativo (sem TTY), como Discloud, Docker ou PM2 em background:
  if (!process.stdin.isTTY && !force) {
    console.log('⚠️ Ambiente de terminal não-interativo detectado (Discloud/Docker). Pulando setup CLI.');
    const examplePath = path.resolve(process.cwd(), '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      console.log('✅ Arquivo .env inicializado com base no .env.example.');
    } else {
      const defaultEnv = `# ==========================================
# WhatsApp Admin Bot - Configurações Automáticas
# ==========================================

CONNECTION_METHOD=qr
BOT_NUMBER=
OWNER_NUMBER=
DEFAULT_PREFIX=!
DEFAULT_LANG=pt
AUTH_MODE=owner
ALLOW_PRIVATE_CMDS=false
MARK_READ_ON_REPLY=false
LOG_LEVEL=warn
`;
      fs.writeFileSync(envPath, defaultEnv, 'utf-8');
      console.log('✅ Arquivo .env padrão gerado com sucesso.');
    }
    settings.reload();
    return true;
  }

  if (process.stdout.isTTY) console.clear();
  console.log('====================================================');
  console.log('🤖  BEM-VINDO AO ASSISTENTE DE INSTALAÇÃO DO BOT   🤖');
  console.log('====================================================');
  console.log('Vamos configurar o ambiente em poucos passos.\n');

  const rl = readline.createInterface({ input, output });

  try {
    // 1. Método de Conexão
    console.log('Escolha o Método de Conexão:');
    console.log('[1] QR Code no terminal (Recomendado)');
    console.log('[2] Pairing Code (Código de 8 dígitos para celular sem câmera)');
    const connChoice = (await rl.question('Opção [1]: ')).trim() || '1';
    const connectionMethod = connChoice === '2' ? 'code' : 'qr';

    // 2. Número do Bot (se pairing code)
    let botNumber = '';
    if (connectionMethod === 'code') {
      while (!botNumber) {
        const inputNum = await rl.question('Digite o número do CHIP DO BOT (com DDI e DDD, ex: 5511999998888): ');
        botNumber = inputNum.replace(/\D/g, '');
        if (botNumber.length < 10) {
          console.log('⚠️ Número inválido. Digite apenas dígitos com DDI (Ex: 5511...)');
          botNumber = '';
        }
      }
    }

    // 3. Número do Dono
    let ownerNumber = '';
    while (!ownerNumber) {
      const inputOwner = await rl.question('Digite o SEU número de WhatsApp (Dono/Admin Supremo, ex: 5511999998888): ');
      ownerNumber = inputOwner.replace(/\D/g, '');
      if (ownerNumber.length < 10) {
        console.log('⚠️ Número inválido. Digite apenas dígitos com DDI (Ex: 5511...)');
        ownerNumber = '';
      }
    }

    // 4. Prefixo Padrão
    const inputPrefix = await rl.question('Digite o Prefixo padrão dos comandos [!]: ');
    const defaultPrefix = inputPrefix.trim() || '!';

    // 5. Idioma Padrão
    console.log('\nEscolha o Idioma Padrão:');
    console.log('[1] 🇧🇷 Português');
    console.log('[2] 🇪🇸 Español');
    console.log('[3] 🇺🇸 English');
    const langChoice = (await rl.question('Opção [1]: ')).trim() || '1';
    let defaultLang = 'pt';
    if (langChoice === '2') defaultLang = 'es';
    if (langChoice === '3') defaultLang = 'en';

    // 6. Modo de Autorização
    console.log('\nModo de Autorização de Grupos (SaaS):');
    console.log('[1] Apenas o Dono pode ativar grupos com !bot on (Recomendado para SaaS)');
    console.log('[2] Qualquer Administrador do grupo pode ativar');
    const authChoice = (await rl.question('Opção [1]: ')).trim() || '1';
    const authMode = authChoice === '2' ? 'admin' : 'owner';

    // 7. Responder Comandos no Privado / DM (Anti-Ban)
    console.log('\nResponder Comandos no Privado (DM):');
    console.log('[1] Não - Apenas o Dono pode usar no privado (ALTAMENTE RECOMENDADO ANTI-BAN)');
    console.log('[2] Sim - Responder a qualquer pessoa no privado');
    const dmChoice = (await rl.question('Opção [1]: ')).trim() || '1';
    const allowPrivateCmds = dmChoice === '2' ? 'true' : 'false';

    // Montagem do conteúdo do .env
    const envContent = `# ==========================================
# WhatsApp Admin Bot - Configurações Automáticas
# Gerado via Setup Wizard
# ==========================================

CONNECTION_METHOD=${connectionMethod}
BOT_NUMBER=${botNumber}
OWNER_NUMBER=${ownerNumber}
DEFAULT_PREFIX=${defaultPrefix}
DEFAULT_LANG=${defaultLang}
AUTH_MODE=${authMode}
ALLOW_PRIVATE_CMDS=${allowPrivateCmds}
MARK_READ_ON_REPLY=false
LOG_LEVEL=warn
`;

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('\n✅ Arquivo .env gerado com sucesso!');
    
    // Recarrega as configurações em memória
    settings.reload();
    return true;
  } finally {
    rl.close();
  }
}

module.exports = {
  run
};
