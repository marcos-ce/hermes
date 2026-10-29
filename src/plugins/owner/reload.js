const pluginLoader = require('../../core/pluginLoader');
const configManager = require('../../core/configManager');

module.exports = {
  name: 'reload',
  aliases: ['reload', 'relaod', 'recarregar', 'recargar', 'atualizar'],
  usage: 'reload',
  description: 'Hot-reload de plugins, schemas, grupos e traduções em tempo real',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ reply, t }) {
    try {
      pluginLoader.reloadPlugins();
      const configRes = configManager.reloadFromDisk();
      if (!configRes.success) {
        return reply(`⚠️ Plugins recarregados, mas erro ao recarregar data/groups.json: ${configRes.error}`);
      }
      return reply(t('reload.success'));
    } catch (err) {
      return reply(t('reload.error', { error: err.message }));
    }
  }
};
