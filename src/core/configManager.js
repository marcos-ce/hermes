const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');
const logger = require('../utils/logger');

class ConfigManager {
  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.filePath = path.join(this.dataDir, 'groups.json');
    this.bakPath = path.join(this.dataDir, 'groups.json.bak');
    this.tmpPath = path.join(this.dataDir, 'groups.json.tmp');

    /** @type {Map<string, object>} */
    this.groups = new Map();
    this.global = {
      allowPrivateCmds: settings.allowPrivateCmds || false,
      blacklist: []
    };

    this.saveTimeout = null;
    this.isDirty = false;
  }

  /**
   * Inicializa o armazenamento em RAM carregando o arquivo groups.json
   * com fallback automático para groups.json.bak em caso de corrupção.
   */
  init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    let loaded = false;

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this._loadIntoMemory(parsed);
        loaded = true;
      } catch (err) {
        logger.error({ err }, 'Erro ao ler data/groups.json. Tentando restaurar do backup...');
      }
    }

    if (!loaded && fs.existsSync(this.bakPath)) {
      try {
        const rawBak = fs.readFileSync(this.bakPath, 'utf-8');
        const parsedBak = JSON.parse(rawBak);
        this._loadIntoMemory(parsedBak);
        loaded = true;
        logger.info('Dados restaurados com sucesso do backup data/groups.json.bak');
      } catch (err) {
        logger.error({ err }, 'Erro crítico: backup data/groups.json.bak também está corrompido.');
      }
    }

    if (!loaded) {
      // Inicia com estrutura global padrão
      this.global.allowPrivateCmds = settings.allowPrivateCmds || false;
      this.flushSync();
    }
  }

  _loadIntoMemory(parsed) {
    if (parsed._global && typeof parsed._global === 'object') {
      this.global = {
        allowPrivateCmds: typeof parsed._global.allowPrivateCmds === 'boolean' 
          ? parsed._global.allowPrivateCmds 
          : settings.allowPrivateCmds,
        blacklist: Array.isArray(parsed._global.blacklist) ? parsed._global.blacklist : []
      };
    }

    for (const [key, val] of Object.entries(parsed)) {
      if (key !== '_global' && typeof val === 'object' && val !== null) {
        this.groups.set(key, val);
      }
    }
  }

  _serialize() {
    const obj = {
      _global: this.global
    };
    for (const [key, val] of this.groups.entries()) {
      obj[key] = val;
    }
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Agenda a gravação atômica assíncrona com debounce de 1000ms
   */
  scheduleSave() {
    this.isDirty = true;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveAsync();
    }, 1000);
  }

  /**
   * Gravação atômica assíncrona: .tmp -> .bak -> .json
   */
  async saveAsync() {
    if (!this.isDirty) return;
    this.isDirty = false;

    try {
      const data = this._serialize();
      await fs.promises.writeFile(this.tmpPath, data, 'utf-8');

      if (fs.existsSync(this.filePath)) {
        await fs.promises.copyFile(this.filePath, this.bakPath);
      }

      await fs.promises.rename(this.tmpPath, this.filePath);
    } catch (err) {
      logger.error({ err }, 'Erro ao salvar atomicamente data/groups.json');
      this.isDirty = true;
    }
  }

  /**
   * Flush síncrono imediato para chamadas em SIGINT/SIGTERM/exit
   */
  flushSync() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    try {
      const data = this._serialize();
      fs.writeFileSync(this.tmpPath, data, 'utf-8');

      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this.bakPath);
      }

      fs.renameSync(this.tmpPath, this.filePath);
      this.isDirty = false;
    } catch (err) {
      logger.error({ err }, 'Erro no flushSync de data/groups.json');
    }
  }

  // ==========================================
  // Métodos Globais e Trava de Privado (DM)
  // ==========================================

  isPrivateEnabled() {
    return this.global.allowPrivateCmds === true;
  }

  setPrivateEnabled(enabled) {
    this.global.allowPrivateCmds = Boolean(enabled);
    this.scheduleSave();
  }

  getGlobalBlacklist() {
    return this.global.blacklist || [];
  }

  addGlobalBlacklist(jid) {
    if (!jid) return false;
    if (!this.global.blacklist.includes(jid)) {
      this.global.blacklist.push(jid);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  removeGlobalBlacklist(jid) {
    if (!jid) return false;
    const index = this.global.blacklist.indexOf(jid);
    if (index !== -1) {
      this.global.blacklist.splice(index, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  isGlobalBlacklisted(jid) {
    if (!jid) return false;
    return this.global.blacklist.includes(jid);
  }

  // ==========================================
  // Métodos de Gestão de Grupos
  // ==========================================

  getGroup(groupJid) {
    return this.groups.get(groupJid) || null;
  }

  getOrCreateGroup(groupJid, name = '') {
    let group = this.groups.get(groupJid);
    if (!group) {
      group = {
        name: name || '',
        enabled: false,
        lang: settings.defaultLang || 'pt',
        prefix: settings.defaultPrefix || '!',
        expiresAt: null, // null = vitalício ou não ativado
        expiryNotified: false,
        lastActivity: Date.now(),
        blacklist: [],
        warns: {},
        plugins: {}
      };
      this.groups.set(groupJid, group);
      this.scheduleSave();
    } else if (name && group.name !== name) {
      group.name = name;
      this.scheduleSave();
    }
    return group;
  }

  isGroupEnabled(groupJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.enabled) return false;
    if (group.expiresAt !== null && Date.now() > group.expiresAt) {
      return false;
    }
    return true;
  }

  isGroupExpired(groupJid) {
    const group = this.groups.get(groupJid);
    if (!group) return false;
    return group.expiresAt !== null && Date.now() > group.expiresAt;
  }

  setGroupEnabled(groupJid, enabled) {
    const group = this.getOrCreateGroup(groupJid);
    group.enabled = Boolean(enabled);
    this.scheduleSave();
    return group;
  }

  getGroupLang(groupJid) {
    const group = this.groups.get(groupJid);
    return group?.lang || settings.defaultLang || 'pt';
  }

  setGroupLang(groupJid, lang) {
    const group = this.getOrCreateGroup(groupJid);
    group.lang = (lang || 'pt').toLowerCase();
    this.scheduleSave();
  }

  getGroupPrefix(groupJid) {
    const group = this.groups.get(groupJid);
    return group?.prefix || settings.defaultPrefix || '!';
  }

  setGroupPrefix(groupJid, prefix) {
    const group = this.getOrCreateGroup(groupJid);
    group.prefix = prefix || '!';
    this.scheduleSave();
  }

  touchGroupActivity(groupJid) {
    const group = this.groups.get(groupJid);
    if (group) {
      group.lastActivity = Date.now();
    }
  }

  setGroupExpiry(groupJid, expiresAt) {
    const group = this.getOrCreateGroup(groupJid);
    group.expiresAt = expiresAt;
    group.expiryNotified = false;
    this.scheduleSave();
  }

  addDaysToGroup(groupJid, days) {
    const group = this.getOrCreateGroup(groupJid);
    const msToAdd = Number(days) * 24 * 60 * 60 * 1000;
    
    // Se ainda não expirou, soma ao expiresAt atual. Se já expirou ou é null, soma a partir de agora.
    const baseTime = (group.expiresAt && group.expiresAt > Date.now()) 
      ? group.expiresAt 
      : Date.now();

    group.expiresAt = baseTime + msToAdd;
    group.enabled = true;
    group.expiryNotified = false;
    this.scheduleSave();
    return group.expiresAt;
  }

  markExpiryNotified(groupJid, notified = true) {
    const group = this.groups.get(groupJid);
    if (group) {
      group.expiryNotified = Boolean(notified);
      this.scheduleSave();
    }
  }

  getAllGroups() {
    return Array.from(this.groups.entries());
  }

  // ==========================================
  // Blacklist & Warns de Grupos
  // ==========================================

  getGroupBlacklist(groupJid) {
    const group = this.groups.get(groupJid);
    return group?.blacklist || [];
  }

  addGroupBlacklist(groupJid, jid) {
    const group = this.getOrCreateGroup(groupJid);
    if (!group.blacklist.includes(jid)) {
      group.blacklist.push(jid);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  removeGroupBlacklist(groupJid, jid) {
    const group = this.groups.get(groupJid);
    if (!group) return false;
    const index = group.blacklist.indexOf(jid);
    if (index !== -1) {
      group.blacklist.splice(index, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  isGroupBlacklisted(groupJid, jid) {
    const group = this.groups.get(groupJid);
    if (!group) return false;
    return group.blacklist.includes(jid);
  }

  getWarns(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    return group?.warns?.[userJid]?.count || 0;
  }

  addWarn(groupJid, userJid, reason = '') {
    const group = this.getOrCreateGroup(groupJid);
    if (!group.warns) group.warns = {};
    if (!group.warns[userJid]) {
      group.warns[userJid] = { count: 0, reasons: [] };
    }
    group.warns[userJid].count += 1;
    if (reason) {
      group.warns[userJid].reasons.push({ reason, date: Date.now() });
    }
    this.scheduleSave();
    return group.warns[userJid].count;
  }

  removeWarn(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.warns || !group.warns[userJid]) return 0;
    group.warns[userJid].count = Math.max(0, group.warns[userJid].count - 1);
    if (group.warns[userJid].count === 0) {
      delete group.warns[userJid];
    }
    this.scheduleSave();
    return group.warns?.[userJid]?.count || 0;
  }

  resetWarns(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    if (group && group.warns && group.warns[userJid]) {
      delete group.warns[userJid];
      this.scheduleSave();
    }
  }

  getAllWarns(groupJid) {
    const group = this.groups.get(groupJid);
    return group?.warns || {};
  }

  // ==========================================
  // Configurações de Plugins (Merge Não-Destrutivo)
  // ==========================================

  getPluginConfig(groupJid, pluginName) {
    const group = this.groups.get(groupJid);
    return group?.plugins?.[pluginName] || null;
  }

  isPluginEnabled(groupJid, pluginName) {
    const group = this.groups.get(groupJid);
    return group?.plugins?.[pluginName]?.enabled === true;
  }

  setPluginEnabled(groupJid, pluginName, enabled) {
    const group = this.getOrCreateGroup(groupJid);
    if (!group.plugins) group.plugins = {};
    
    const existing = group.plugins[pluginName] || { configured: false };
    // REGRA CRÍTICA DE RETENÇÃO: Soft toggle, preserva configs existentes
    group.plugins[pluginName] = {
      ...existing,
      enabled: Boolean(enabled)
    };
    this.scheduleSave();
    return group.plugins[pluginName];
  }

  updatePluginConfig(groupJid, pluginName, newAnswers) {
    const group = this.getOrCreateGroup(groupJid);
    if (!group.plugins) group.plugins = {};

    const existing = group.plugins[pluginName] || {};
    // Shallow Merge Não-Destrutivo
    group.plugins[pluginName] = {
      ...existing,
      ...newAnswers,
      enabled: true,
      configured: true
    };
    this.scheduleSave();
    return group.plugins[pluginName];
  }
}

const configManager = new ConfigManager();
module.exports = configManager;
