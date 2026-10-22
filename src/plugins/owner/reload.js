const pluginLoader = require('../../core/pluginLoader');

module.exports = {
  name: 'reload',
  aliases: ['reload', 'recarregar', 'recargar', 'atualizar'],
  description: 'Hot-reload de plugins, schemas e traduções em tempo real',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ reply, t }) {
    try {
      const stats = pluginLoader.reloadPlugins();
      return reply(t('reload.success'));
    } catch (err) {
      return reply(t('reload.error', { error: err.message }));
    }
  }
};
