const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'config',
  aliases: ['config', 'painel', 'panel', 'settings', 'menu', 'cfg', 'wizard'],
  description: 'Painel Interativo de Configurações do Grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, reply, t, isGroup }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    await wizardEngine.startConfigPanel(sock, msg, from, sender);
  }
};
