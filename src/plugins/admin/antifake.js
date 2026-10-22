const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'antifake',
  aliases: ['antifake', 'antifakes', 'ddi', 'antiddi', 'extranjeros', 'foreigners'],
  description: 'Bloqueio automático de números estrangeiros (Filtro de DDI)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Filtro Anti-Fake / DDI',
      es: 'Filtro Anti-Fake / DDI',
      en: 'Anti-Fake / Country Code Filter'
    },
    description: {
      pt: 'Permite apenas a entrada de números com códigos de país autorizados',
      es: 'Permite solo la entrada de números con prefijos autorizados',
      en: 'Only allows entry of numbers with authorized country codes'
    },
    fields: [
      {
        name: 'allowedDdis',
        type: 'string_list',
        question: {
          pt: 'Digite os códigos de país (DDIs) permitidos separados por espaço (Ex: 55 351 1) ou . para padrão:',
          es: 'Escribe los prefijos de país (DDIs) permitidos separados por espacio (Ej: 55 351 1) o . para predeterminado:',
          en: 'Enter allowed country calling codes (DDIs) separated by space (e.g. 55 351 1) or . for default:'
        },
        default: ['55', '351', '1', '34', '54', '52']
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'antifake') || {};

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'antifake', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antifake');
      }
      return reply(t('common.saved') + '\n🎭 *AntiFake:* ATIVADO');
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'antifake', false);
      return reply(t('common.saved') + '\n🎭 *AntiFake:* DESATIVADO');
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antifake');
    }

    const status = configManager.isPluginEnabled(from, 'antifake') ? t('common.enabled') : t('common.disabled');
    const ddis = (cfg.allowedDdis && cfg.allowedDdis.length) ? cfg.allowedDdis.join(', ') : '55, 351, 1, 34, 54, 52';

    return reply(t('antifake.status', { status, ddis }));
  }
};
