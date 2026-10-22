const configManager = require('../../core/configManager');

module.exports = {
  name: 'idioma',
  aliases: ['idioma', 'lang', 'language', 'lingua', 'lenguaje'],
  description: 'Altera o idioma do bot no grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ from, args, reply, t, isGroup }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    const arg = (args[0] || '').toLowerCase();

    if (arg === 'pt' || arg === '1' || arg === 'br') {
      configManager.setGroupLang(from, 'pt');
      return reply(t('lang.changed'));
    }

    if (arg === 'es' || arg === '2') {
      configManager.setGroupLang(from, 'es');
      return reply(t('lang.changed'));
    }

    if (arg === 'en' || arg === '3') {
      configManager.setGroupLang(from, 'en');
      return reply(t('lang.changed'));
    }

    return reply(t('lang.prompt'));
  }
};
