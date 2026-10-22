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
          pt: 'Digite o texto de boas-vindas (use {user} para marcar, {group} para nome e {desc} para descrição) ou . para padrão:',
          es: 'Escribe el texto de bienvenida (usa {user} para mencionar, {group} para nombre y {desc} para descripción) o . para predeterminado:',
          en: 'Enter welcome text (use {user} for mention, {group} for name and {desc} for description) or . for default:'
        },
        default: '👋 Olá {user}, seja bem-vindo(a) ao grupo {group}!\n\n📋 Regras/Descrição: {desc}'
      },
      {
        name: 'autoDeleteSeconds',
        type: 'number',
        question: {
          pt: 'Após quantos segundos a mensagem deve ser apagada automaticamente? (Digite 0 ou . para não apagar):',
          es: '¿Después de cuántos segundos debe borrarse automáticamente el mensaje? (Escribe 0 o . para no borrar):',
          en: 'After how many seconds should the message be auto-deleted? (Enter 0 or . to not delete):'
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

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'welcome', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'welcome');
      }
      return reply(t('common.saved') + '\n👋 *Boas-Vindas:* ATIVADO');
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'welcome', false);
      return reply(t('common.saved') + '\n👋 *Boas-Vindas:* DESATIVADO');
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'welcome');
    }

    const status = configManager.isPluginEnabled(from, 'welcome') ? t('common.enabled') : t('common.disabled');
    const seconds = cfg.autoDeleteSeconds || 0;

    return reply(t('welcome.status', { status, seconds }));
  }
};
