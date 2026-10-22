const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'welcome',
  aliases: ['welcome', 'bemvindo', 'bienvenida', 'bv', 'regras', 'rules', 'reglas'],
  description: 'Boas-vindas e regras automáticas com auto-delete opcional',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Mensagem de Boas-Vindas',
      es: 'Mensaje de Bienvenida',
      en: 'Welcome Message'
    },
    description: {
      pt: 'Envia mensagem personalizada quando novos membros entram',
      es: 'Envía mensaje personalizado cuando entran nuevos miembros',
      en: 'Sends custom message when new members join'
    },
    fields: [
      {
        name: 'message',
        type: 'string',
        question: {
          pt: 'Digite o texto de boas-vindas (use {user} para marcar, {group} para nome e {desc} para descrição).\nOu responda "padrão" para usar a mensagem padrão:',
          es: 'Escribe el texto de bienvenida (usa {user} para mencionar, {group} para nombre y {desc} para descripción).\nO responde "predeterminado" para usar el mensaje predeterminado:',
          en: 'Enter welcome text (use {user} for mention, {group} for name and {desc} for description).\nOr reply "default" to use the default message:'
        },
        default: '👋 Olá {user}, seja bem-vindo(a) ao grupo {group}!\n\n📋 Regras/Descrição: {desc}'
      },
      {
        name: 'autoDeleteSeconds',
        type: 'number',
        question: {
          pt: 'Após quantos segundos a mensagem deve ser apagada automaticamente? (Digite 0 para não apagar):',
          es: '¿Después de cuántos segundos debe borrarse automáticamente el mensaje? (Escribe 0 para no borrar):',
          en: 'After how many seconds should the message be auto-deleted? (Enter 0 to not delete):'
        },
        default: 0,
        min: 0,
        max: 3600
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'welcome') || {};

    // Digitar /bemvindo sem argumentos (ou /bemvindo config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'welcome');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'welcome', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'welcome');
      }
      const secs = cfg.autoDeleteSeconds || 0;
      return reply(`${t('common.saved')}\n👋 *Boas-Vindas:* ATIVADO (Foto do grupo + texto)\n⏱️ *Auto-delete:* ${secs ? `${secs}s` : 'Desativado'}`);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'welcome', false);
      return reply(t('common.saved') + '\n👋 *Boas-Vindas:* DESATIVADO');
    }

    // Configuração direta de tempo de auto-delete
    if (['tempo', 'time', 'segundos', 'secs', 'seg'].includes(sub)) {
      const parsedSecs = parseInt(args[1], 10);
      if (isNaN(parsedSecs) || parsedSecs < 0) {
        return reply('⚠️ Digite os segundos de auto-delete. Ex: `/bemvindo tempo 15` (ou 0 para não apagar).');
      }
      configManager.updatePluginConfig(from, 'welcome', { autoDeleteSeconds: parsedSecs, enabled: true });
      return reply(`💾 *Boas-Vindas atualizado:* Auto-delete definido para *${parsedSecs} segundos*.`);
    }

    // Resetar para mensagem padrão
    if (['padrao', 'padrão', 'default', 'reset'].includes(sub)) {
      configManager.updatePluginConfig(from, 'welcome', { 
        message: '👋 Olá {user}, seja bem-vindo(a) ao grupo {group}!\n\n📋 Regras/Descrição: {desc}',
        enabled: true 
      });
      return reply('💾 *Boas-Vindas atualizado:* Mensagem redefinida para o padrão.');
    }

    // Configuração direta do texto da mensagem (se começou com "texto" ou texto livre longo)
    if (sub === 'texto' || sub === 'msg' || args.length > 1 || (args.length === 1 && !['status', 'config', 'wizard'].includes(sub))) {
      const customText = sub === 'texto' || sub === 'msg' ? args.slice(1).join(' ') : args.join(' ');
      if (customText.length < 3) {
        return reply('⚠️ Texto muito curto. Use: `/bemvindo Olá {user}, bem-vindo ao {group}!`');
      }
      configManager.updatePluginConfig(from, 'welcome', { message: customText, enabled: true });
      return reply(`💾 *Boas-Vindas atualizado!*\n\n📝 *Novo texto:* \n${customText}\n\n💡 *Tags suportadas:* \`{user}\` (menção), \`{group}\` (nome do grupo), \`{desc}\` (regras).`);
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'welcome');
    }

    const status = configManager.isPluginEnabled(from, 'welcome') ? t('common.enabled') : t('common.disabled');
    const seconds = cfg.autoDeleteSeconds || 0;
    const currentMsg = cfg.message || t('welcome.default');

    let help = `${t('welcome.status', { status, seconds })}\n📝 *Mensagem atual:*\n${currentMsg}`;
    help += `\n\n💡 *Comandos Diretos:*\n• \`/bemvindo on\` ou \`/bemvindo off\`\n• \`/bemvindo [seu texto aqui]\` (suporta {user}, {group}, {desc})\n• \`/bemvindo tempo 15\` (apaga após 15s)\n• \`/bemvindo padrao\` (restaura padrão)\n• \`/bemvindo config\` (abre wizard)`;
    return reply(help);
  }
};
