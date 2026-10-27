const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Mapeamento canônico e permanente de números atrelados a cada comando.
 * Permite que qualquer comando seja executado diretamente pelo seu número:
 * Exemplo: /5 @user dá ban, /9 marca todos, /10 promove a admin, /17 dá ping.
 */
const COMMAND_NUMBER_MAP = {
  // 1 a 8: Módulos do Painel / Wizard
  '1': 'antifake',
  '2': 'antiflood',
  '3': 'antilink',
  '4': 'automsg',
  '5': 'ban',
  '6': 'schedule',
  '7': 'warn',
  '8': 'welcome',

  // 9 a 18: Comandos Utilitários e Moderação do Grupo
  '9': 'hidetag',
  '10': 'promote',
  '11': 'demote',
  '12': 'mute',
  '13': 'del',
  '14': 'sortear',
  '15': 'blacklist',
  '16': 'idioma',
  '17': 'ping',
  '18': 'menu',

  // 19 a 23: Comandos do Dono / SaaS (Privado)
  '19': 'bot',
  '20': 'autoadm',
  '21': 'bangrupo',
  '22': 'reload',
  '23': 'liberar'
};

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

    // 1. Registra números declarados diretamente no próprio arquivo do plugin (prioridade ao plugin)
    for (const [, plugin] of this.commands.entries()) {
      if (plugin.cmdNumber) {
        const numStr = String(plugin.cmdNumber);
        this.aliases.set(numStr, plugin);
        if (!Array.isArray(plugin.aliases)) plugin.aliases = [];
        if (!plugin.aliases.includes(numStr)) {
          plugin.aliases.push(numStr);
        }
      }
    }

    // 2. Registra mapeamento canônico de fallback para plugins que não declararam cmdNumber
    let nextAvailableNumber = 23;

    for (const [numStr, cmdName] of Object.entries(COMMAND_NUMBER_MAP)) {
      const plugin = this.commands.get(cmdName.toLowerCase());
      if (plugin && !plugin.cmdNumber) {
        plugin.cmdNumber = parseInt(numStr, 10);
        this.aliases.set(numStr, plugin);
        if (!Array.isArray(plugin.aliases)) plugin.aliases = [];
        if (!plugin.aliases.includes(numStr)) {
          plugin.aliases.push(numStr);
        }
      }
    }

    // 3. Para qualquer plugin adicional que ainda não tiver número, atribui número sequencial automático
    for (const [, plugin] of this.commands.entries()) {
      if (!plugin.cmdNumber) {
        while (
          Object.keys(COMMAND_NUMBER_MAP).includes(String(nextAvailableNumber)) ||
          this.aliases.has(String(nextAvailableNumber))
        ) {
          nextAvailableNumber++;
        }
        const numStr = String(nextAvailableNumber++);
        plugin.cmdNumber = parseInt(numStr, 10);
        this.aliases.set(numStr, plugin);
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
