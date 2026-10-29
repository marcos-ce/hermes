const fs = require('fs');
const path = require('path');
const configManager = require('../src/core/configManager');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 ====================================================');
  console.log('🚀 INICIANDO TESTES DE SINCRONIZAÇÃO & PERSISTÊNCIA (DISCLOUD)');
  console.log('====================================================\n');

  const testGroupJid = '120363999999999999@g.us';
  const filePath = path.join(process.cwd(), 'data', 'groups.json');
  const backupOriginal = fs.readFileSync(filePath, 'utf-8');

  try {
    // ------------------------------------------------------------------
    // TESTE 1: Cliente altera via Chat -> Salva no disco automaticamente
    // ------------------------------------------------------------------
    console.log('▶️ Teste 1: Cliente configura pelo chat (ex: !antilink on)');
    configManager.setPluginEnabled(testGroupJid, 'antilink', true);
    configManager.updatePluginConfig(testGroupJid, 'antilink', {
      action: 'warn',
      allowedDomains: ['test.com']
    });

    if (configManager.isDirty !== true) {
      throw new Error('Falha: isDirty deveria ser true após configuração pelo chat');
    }
    console.log('  ↳ Memória marcada como dirty (pendente de gravação). Aguardando debounce de 1000ms...');

    await sleep(1200);

    const onDiskRaw1 = fs.readFileSync(filePath, 'utf-8');
    const onDisk1 = JSON.parse(onDiskRaw1);
    const groupOnDisk1 = onDisk1[testGroupJid];

    if (!groupOnDisk1 || groupOnDisk1.plugins?.antilink?.action !== 'warn') {
      throw new Error('Falha: Configuração feita pelo chat não foi salva no disco após o debounce');
    }
    console.log('  ✅ [PASS] Configuração do chat gravada com sucesso em data/groups.json no disco');

    // ------------------------------------------------------------------
    // TESTE 2: Desligamento rápido enquanto há alteração pendente (flushSync com isDirty: true)
    // ------------------------------------------------------------------
    console.log('\n▶️ Teste 2: Bot reiniciado logo após comando do chat (flushSync com isDirty)');
    configManager.updatePluginConfig(testGroupJid, 'warn', { maxWarns: 5 });
    // Sem esperar o debounce, força o flushSync que ocorre no desligamento
    configManager.flushSync();

    const onDiskRaw2 = fs.readFileSync(filePath, 'utf-8');
    const onDisk2 = JSON.parse(onDiskRaw2);
    if (onDisk2[testGroupJid]?.plugins?.warn?.maxWarns !== 5) {
      throw new Error('Falha: flushSync não persistiu a alteração pendente no desligamento');
    }
    console.log('  ✅ [PASS] flushSync salvou imediatamente no disco antes do desligamento');

    // ------------------------------------------------------------------
    // TESTE 3: Edição Externa no Painel da Discloud + reloadFromDisk()
    // ------------------------------------------------------------------
    console.log('\n▶️ Teste 3: Usuário edita data/groups.json no painel da Discloud e envia /reload');
    const diskToEdit = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    diskToEdit[testGroupJid].plugins.automsg = {
      enabled: true,
      configured: true,
      message: 'Vídeo manual da Discloud',
      intervalMinutes: 180
    };
    fs.writeFileSync(filePath, JSON.stringify(diskToEdit, null, 2), 'utf-8');

    // Executa o Hot-Reload disparado pelo /reload
    const reloadResult = configManager.reloadFromDisk();
    if (!reloadResult.success) {
      throw new Error(`Falha no reloadFromDisk: ${reloadResult.error}`);
    }

    const cfgInRam = configManager.getPluginConfig(testGroupJid, 'automsg');
    if (!cfgInRam || cfgInRam.message !== 'Vídeo manual da Discloud') {
      throw new Error('Falha: reloadFromDisk não atualizou a memória RAM com o arquivo da Discloud');
    }
    console.log('  ✅ [PASS] reloadFromDisk() sincronizou perfeitamente a edição da Discloud com a RAM');

    // ------------------------------------------------------------------
    // TESTE 4: Blindagem contra sobrescrita na reinicialização da Discloud
    // ------------------------------------------------------------------
    console.log('\n▶️ Teste 4: Discloud reiniciada após edição manual (flushSync com isDirty: false)');
    // Simula edição externa direta no disco
    const diskToEdit2 = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    diskToEdit2[testGroupJid].name = 'Nome Editado no Painel Discloud';
    fs.writeFileSync(filePath, JSON.stringify(diskToEdit2, null, 2), 'utf-8');

    // O bot é reiniciado pelo painel da Discloud (dispara flushSync)
    // A RAM antiga NÃO deve sobrescrever o arquivo do disco!
    configManager.flushSync();

    const diskAfterRestart = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (diskAfterRestart[testGroupJid].name !== 'Nome Editado no Painel Discloud') {
      throw new Error('Falha de Sobrescrita: flushSync apagou a edição manual da Discloud');
    }
    console.log('  ✅ [PASS] Blindagem confirmada: o bot NÃO sobrescreveu a edição da Discloud ao reiniciar');

    // ------------------------------------------------------------------
    // TESTE 5: Tolerância a Erros de Digitação no JSON (Crash-Proof)
    // ------------------------------------------------------------------
    console.log('\n▶️ Teste 5: Usuário errou a digitação do JSON no painel da Discloud');
    fs.writeFileSync(filePath, '{\n  "invalido": [ erro de sintaxe sem aspas e sem fechar\n', 'utf-8');

    const badResult = configManager.reloadFromDisk();
    if (badResult.success !== false) {
      throw new Error('Falha: reloadFromDisk deveria reportar erro para JSON inválido');
    }

    // A memória RAM NÃO pode ter sido apagada ou corrompida
    const safeCheck = configManager.getPluginConfig(testGroupJid, 'automsg');
    if (!safeCheck) {
      throw new Error('Falha: RAM foi corrompida mesmo após falha de parse no reloadFromDisk');
    }
    console.log(`  ✅ [PASS] Bot interceptou o erro com segurança: "${badResult.error}"`);
    console.log('  ✅ [PASS] Memória RAM permaneceu intacta e bot não caiu');

    console.log('\n====================================================');
    console.log('🏁 TODOS OS 5 TESTES DE SINCRONIZAÇÃO PASSARAM COM 100% DE SUCESSO!');
    console.log('====================================================');

  } finally {
    // Restaura o arquivo original
    fs.writeFileSync(filePath, backupOriginal, 'utf-8');
    configManager.reloadFromDisk();
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
