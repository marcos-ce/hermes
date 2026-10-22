const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PluginLoader {
  constructor() {
    this.pluginsDir = path.resolve(process.cwd(), 'src', 'plugins');
    
    /** @type {Map<string, object>} Comandos indexados pelo nome principal */
    this.commands = new Map();

    /** @type {Map<string, object>} Comandos indexados por cada alias */
    this.aliases = new Map();

    /** @type {Map<string, object>} Schemas de configuração para o Wizard e !config */
    this.schemas = new Map();

    /** @type {Array<object>} Plugins que possuem hook onMessage */
    this.onMessageHooks = [];

    /** @type {Array<object>} Plugins que possuem hook onParticipantsUpdate */
    this.onParticipantsUpdateHooks = [];
  }

  /**
   * Inicializa o carregador varrendo recursivamente as pastas de plugins
   */
  init() {
    this.commands.clear();
    this.aliases.clear();
    this.schemas.clear();
    this.onMessageHooks = [];
    this.onParticipantsUpdateHooks = [];

    if (!fs.existsSync(this.pluginsDir)) {
      logger.warn(`Diretório de plugins não encontrado: ${this.pluginsDir}`);
      return;
    }

    const categories = ['admin', 'owner', 'general'];

    for (const cat of categories) {
      const catDir = path.join(this.pluginsDir, cat);
      if (!fs.existsSync(catDir)) continue;

      const files = fs.readdirSync(catDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const fullPath = path.join(catDir, file);
        this._loadPluginFile(fullPath, cat);
      }
    }

    logger.info(`Plugins carregados: ${this.commands.size} comandos, ${this.aliases.size} aliases, ${this.schemas.size} schemas.`);
  }

  _loadPluginFile(filePath, category) {
    try {
      const plugin = require(filePath);

      if (!plugin.name || typeof plugin.execute !== 'function') {
        logger.warn(`Plugin inválido ou incompleto ignorado: ${filePath}`);
        return;
      }

      plugin.category = category;
      const lowerName = plugin.name.toLowerCase();

      // Registra comando principal
      this.commands.set(lowerName, plugin);

      // Registra todos os aliases
      if (Array.isArray(plugin.aliases)) {
        for (const alias of plugin.aliases) {
          this.aliases.set(alias.toLowerCase(), plugin);
        }
      }

      // Registra Schema para o Wizard Engine se houver
      if (plugin.configSchema && Array.isArray(plugin.configSchema.fields)) {
        this.schemas.set(lowerName, plugin.configSchema);
      }

      // Registra Hooks
      if (typeof plugin.onMessage === 'function') {
        this.onMessageHooks.push(plugin);
      }

      if (typeof plugin.onParticipantsUpdate === 'function') {
        this.onParticipantsUpdateHooks.push(plugin);
      }
    } catch (err) {
      logger.error({ err, filePath }, 'Erro ao carregar arquivo de plugin');
    }
  }

  /**
   * Localiza um plugin por nome exato ou por qualquer um dos seus aliases
   * @param {string} trigger 
   * @returns {object|null}
   */
  findCommand(trigger) {
    if (!trigger) return null;
    const lower = trigger.toLowerCase();
    return this.commands.get(lower) || this.aliases.get(lower) || null;
  }

  /**
   * Limpa o cache do require e recarrega todos os plugins a quente
   */
  reloadPlugins() {
    const categories = ['admin', 'owner', 'general'];

    for (const cat of categories) {
      const catDir = path.join(this.pluginsDir, cat);
      if (!fs.existsSync(catDir)) continue;

      const files = fs.readdirSync(catDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const fullPath = path.join(catDir, file);
        delete require.cache[require.resolve(fullPath)];
      }
    }

    // Recarrega também o dicionário i18n
    const i18nPath = path.resolve(process.cwd(), 'src', 'utils', 'i18n.js');
    if (fs.existsSync(i18nPath)) {
      delete require.cache[require.resolve(i18nPath)];
    }

    this.init();
    return {
      commands: this.commands.size,
      aliases: this.aliases.size,
      schemas: this.schemas.size
    };
  }
}

const pluginLoader = new PluginLoader();
module.exports = pluginLoader;
