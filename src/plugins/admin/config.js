const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'config',
  aliases: ['config', 'painel', 'panel', 'settings', 'cfg', 'wizard'],
  description: 'Painel Interativo de Configurações - Hermes Bot',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, reply, t, isGroup }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    // Tanto /menu quanto /painel, /config, etc. abrem o Painel Interativo elegante!
    await wizardEngine.startConfigPanel(sock, msg, from, sender);
  }
};
