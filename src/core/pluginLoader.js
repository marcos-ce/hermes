const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { COMMAND_NUMBER_MAP, getNumberForCommand } = require('./commandNumbers');

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

    /** @type {Array<object>} Plugins que possuem hook onSchedule */
    this.onScheduleHooks = [];

    /** @type {Array<object>} Plugins que possuem hook onJoinRequest */
    this.onJoinRequestHooks = [];
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
    this.onScheduleHooks = [];
    this.onJoinRequestHooks = [];

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

    // Ordena os hooks de mensagem e atualização de participantes por prioridade declarada (menor número = roda primeiro)
    this.onMessageHooks.sort((a, b) => {
      const prioA = typeof a.priority === 'number' ? a.priority : 100;
      const prioB = typeof b.priority === 'number' ? b.priority : 100;
      return prioA - prioB;
    });

    this.onParticipantsUpdateHooks.sort((a, b) => {
      const prioA = typeof a.priority === 'number' ? a.priority : 100;
      const prioB = typeof b.priority === 'number' ? b.priority : 100;
      return prioA - prioB;
    });

    // 1. Aplica a numeração canônica centralizada (fonte única da verdade)
    const assignedNumbers = new Map();

    for (const [numStr, cmdName] of Object.entries(COMMAND_NUMBER_MAP)) {
      const plugin = this.commands.get(cmdName.toLowerCase());
      if (plugin) {
        if (plugin.cmdNumber && String(plugin.cmdNumber) !== numStr) {
          logger.warn(
            { plugin: plugin.name, declared: plugin.cmdNumber, canonical: numStr },
            'Aviso de divergência de cmdNumber: aplicando número canônico da fonte única.'
          );
        }
        plugin.cmdNumber = parseInt(numStr, 10);
        this.aliases.set(numStr, plugin);
        assignedNumbers.set(numStr, plugin.name);
        if (!Array.isArray(plugin.aliases)) plugin.aliases = [];
        if (!plugin.aliases.includes(numStr)) {
          plugin.aliases.push(numStr);
        }
      }
    }

    // 2. Se algum plugin customizado/novo não estiver no mapa canônico mas tiver cmdNumber, valida colisão
    for (const [, plugin] of this.commands.entries()) {
      if (plugin.cmdNumber && !assignedNumbers.has(String(plugin.cmdNumber))) {
        const numStr = String(plugin.cmdNumber);
        this.aliases.set(numStr, plugin);
        assignedNumbers.set(numStr, plugin.name);
        if (!Array.isArray(plugin.aliases)) plugin.aliases = [];
        if (!plugin.aliases.includes(numStr)) {
          plugin.aliases.push(numStr);
        }
      }
    }

    // 3. Para qualquer plugin adicional que ainda não tiver número, atribui número sequencial automático
    let nextAvailable = 34;
    for (const [, plugin] of this.commands.entries()) {
      if (!plugin.cmdNumber) {
        while (assignedNumbers.has(String(nextAvailable))) {
          nextAvailable++;
        }
        const numStr = String(nextAvailable++);
        plugin.cmdNumber = parseInt(numStr, 10);
        this.aliases.set(numStr, plugin);
        assignedNumbers.set(numStr, plugin.name);
        if (!Array.isArray(plugin.aliases)) plugin.aliases = [];
        if (!plugin.aliases.includes(numStr)) {
          plugin.aliases.push(numStr);
        }
      }
    }

    logger.info(
      `Plugins carregados: ${this.commands.size} comandos, ${this.aliases.size} aliases, ${this.schemas.size} schemas, ${this.onScheduleHooks.length} rotinas agendadas.`
    );
  }

  /**
   * Obtém o número atrelado a um comando
   * @param {string} name 
   * @returns {number|null}
   */
  getCommandNumber(name) {
    if (!name) return null;
    const plugin = this.commands.get(name.toLowerCase()) || this.aliases.get(name.toLowerCase());
    return plugin?.cmdNumber || null;
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

      if (typeof plugin.onSchedule === 'function') {
        this.onScheduleHooks.push(plugin);
      }

      if (typeof plugin.onJoinRequest === 'function') {
        this.onJoinRequestHooks.push(plugin);
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
    // Dispara hook opcional de pré-reload para que cada plugin gerencie seus próprios recursos satélites
    for (const [, plugin] of this.commands.entries()) {
      if (typeof plugin.onReload === 'function') {
        try {
          plugin.onReload();
        } catch (_) {}
      }
    }

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

    // Recarrega também o dicionário i18n sincronizando a referência em memória
    const i18nPath = path.resolve(process.cwd(), 'src', 'utils', 'i18n.js');
    if (fs.existsSync(i18nPath)) {
      const currentI18n = require('../utils/i18n');
      delete require.cache[require.resolve(i18nPath)];
      const freshI18n = require('../utils/i18n');
      if (currentI18n.dictionaries && freshI18n.dictionaries) {
        Object.assign(currentI18n.dictionaries, freshI18n.dictionaries);
      }
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
