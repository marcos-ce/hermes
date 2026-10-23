const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { t } = require('../../utils/i18n');

module.exports = {
  name: 'idioma',
  aliases: ['idioma', 'lang', 'language', 'lingua', 'lenguaje'],
  usage: 'idioma [pt/es/en]',
  description: 'Altera o idioma do bot no grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, args, reply, t: translate, isGroup }) {
    if (!isGroup) {
      return reply(translate('common.group_only'));
    }

    const arg = (args[0] || '').toLowerCase();

    let targetLang = null;
    if (['1', 'pt', 'br', 'portugues', 'português'].includes(arg)) targetLang = 'pt';
    else if (['2', 'es', 'espanhol', 'español'].includes(arg)) targetLang = 'es';
    else if (['3', 'en', 'ingles', 'inglês', 'english'].includes(arg)) targetLang = 'en';

    if (targetLang) {
      configManager.setGroupLang(from, targetLang);
      return reply(t(targetLang, 'lang.changed'));
    }

    // Se chamado sem argumentos (ex: /idioma), abre a seleção interativa que intercepta respostas 1, 2 ou 3
    return await wizardEngine.startLangSelection(sock, msg, from, sender);
  }
};
