const pluginLoader = require('../../core/pluginLoader');

module.exports = {
  name: 'reload',
  aliases: ['reload', 'relaod', 'recarregar', 'recargar', 'atualizar'],
  usage: 'reload',
  description: 'Hot-reload de plugins, schemas e traduções em tempo real',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ reply, t }) {
    try {
      pluginLoader.reloadPlugins();
      return reply(t('reload.success'));
    } catch (err) {
      return reply(t('reload.error', { error: err.message }));
    }
  }
};
