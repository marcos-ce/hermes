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
      blacklist: [],
      bannedGroups: []
    };

    this.saveTimeout = null;
    this.isDirty = false;
    this.isSaving = false;
    this.pendingSave = false;
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
    const fileExisted = fs.existsSync(this.filePath);

    if (fileExisted) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this._loadIntoMemory(parsed);
        loaded = true;
      } catch (err) {
        logger.error({ err }, 'Erro ao ler data/groups.json. Tentando restaurar do backup...');
        try {
          const corruptPath = `${this.filePath}.corrupted.${Date.now()}`;
          fs.copyFileSync(this.filePath, corruptPath);
          logger.warn(`Arquivo corrompido preservado em ${corruptPath} para recuperação manual.`);
        } catch (_) {}
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
      this.global.allowPrivateCmds = settings.allowPrivateCmds || false;
      // Prevenção de Wipe Acidental (P0.5): se o arquivo já existia mas falhou o parse em ambos,
      // NUNCA sobrescreve o arquivo no disco com um JSON vazio.
      if (!fileExisted) {
        this.flushSync();
      } else {
        logger.fatal('ALERTA DE SEGURANÇA: data/groups.json existente não pôde ser carregado. Flush automático cancelado para evitar perda de dados.');
      }
    }
  }

  _loadIntoMemory(parsed) {
    if (parsed._global && typeof parsed._global === 'object') {
      this.global = {
        allowPrivateCmds: typeof parsed._global.allowPrivateCmds === 'boolean' 
          ? parsed._global.allowPrivateCmds 
          : settings.allowPrivateCmds,
        blacklist: Array.isArray(parsed._global.blacklist) ? parsed._global.blacklist : [],
        bannedGroups: Array.isArray(parsed._global.bannedGroups) ? parsed._global.bannedGroups : []
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
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    if (!this.isDirty) return;

    this.isSaving = true;
    this.isDirty = false;

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = this._serialize();
      await fs.promises.writeFile(this.tmpPath, data, 'utf-8');

      if (fs.existsSync(this.filePath)) {
        await fs.promises.copyFile(this.filePath, this.bakPath);
      }

      try {
        await fs.promises.rename(this.tmpPath, this.filePath);
      } catch (renameErr) {
        // Fallback para Windows/OneDrive onde rename pode sofrer EPERM temporário por lock do SO
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
          await fs.promises.copyFile(this.tmpPath, this.filePath);
          try { await fs.promises.unlink(this.tmpPath); } catch (_) {}
        } else {
          throw renameErr;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erro ao salvar atomicamente data/groups.json');
      this.isDirty = true;
      // Reagenda nova tentativa com backoff para garantir que os dados em RAM não sejam esquecidos
      setTimeout(() => this.scheduleSave(), 2000);
    } finally {
      this.isSaving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        this.scheduleSave();
      }
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
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = this._serialize();
      fs.writeFileSync(this.tmpPath, data, 'utf-8');

      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this.bakPath);
      }

      try {
        fs.renameSync(this.tmpPath, this.filePath);
      } catch (renameErr) {
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
          fs.copyFileSync(this.tmpPath, this.filePath);
          try { fs.unlinkSync(this.tmpPath); } catch (_) {}
        } else {
          throw renameErr;
        }
      }
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
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    const exists = this.global.blacklist.some(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
    if (!exists) {
      this.global.blacklist.push(`${clean}@s.whatsapp.net`);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  removeGlobalBlacklist(jid) {
    if (!jid) return false;
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    const index = this.global.blacklist.findIndex(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
    if (index !== -1) {
      this.global.blacklist.splice(index, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  isGlobalBlacklisted(jid) {
    if (!jid) return false;
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    return this.global.blacklist.some(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
  }

  // ==========================================
  // Gestão de Grupos Banidos (Blacklist de Grupos)
  // ==========================================

  getBannedGroups() {
    return Array.isArray(this.global.bannedGroups) ? this.global.bannedGroups : [];
  }

  isGroupBanned(groupJid) {
    if (!groupJid) return false;
    // Normaliza para sempre ter formato numérico limpo e JID completo
    const numOnly = groupJid.replace(/@.*$/, '').trim();
    const fullJid = `${numOnly}@g.us`;

    // 1. Checa na lista global de banidos (compara apenas a parte numérica)
    const inGlobal = Array.isArray(this.global.bannedGroups) && this.global.bannedGroups.some(g => {
      return g.replace(/@.*$/, '').trim() === numOnly;
    });
    if (inGlobal) return true;

    // 2. Checa flag banned no registro do grupo (tenta todas as variações de chave)
    const group = this.groups.get(fullJid) || this.groups.get(numOnly) || this.groups.get(groupJid);
    return group?.banned === true;
  }

  banGroup(groupJid, reason = '') {
    if (!groupJid) return false;
    const numOnly = groupJid.replace(/@.*$/, '').trim();
    const fullJid = `${numOnly}@g.us`;

    this.global.bannedGroups = this.global.bannedGroups || [];
    if (!this.global.bannedGroups.includes(fullJid)) {
      this.global.bannedGroups.push(fullJid);
    }

    const group = this.getOrCreateGroup(fullJid);
    group.banned = true;
    group.bannedAt = Date.now();
    group.banReason = reason || 'Banido pelo Dono';
    group.enabled = false;

    this.scheduleSave();
    return true;
  }

  unbanGroup(groupJid) {
    if (!groupJid) return false;
    const numOnly = groupJid.replace(/@.*$/, '').trim();
    const fullJid = `${numOnly}@g.us`;

    let removed = false;
    if (Array.isArray(this.global.bannedGroups)) {
      const idx = this.global.bannedGroups.findIndex(g => g.replace(/@.*$/, '').trim() === numOnly);
      if (idx !== -1) {
        this.global.bannedGroups.splice(idx, 1);
        removed = true;
      }
    }

    // Tenta todas as variações de chave do grupo para garantir que a flag seja removida
    const group = this.groups.get(fullJid) || this.groups.get(numOnly) || this.groups.get(groupJid);
    if (group && group.banned) {
      group.banned = false;
      delete group.bannedAt;
      delete group.banReason;
      removed = true;
    }

    if (removed) {
      this.scheduleSave();
    }
    return removed;
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
    if (this.isGroupBanned(groupJid)) return false;
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
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    const exists = group.blacklist.some(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
    if (!exists) {
      group.blacklist.push(`${clean}@s.whatsapp.net`);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  removeGroupBlacklist(groupJid, jid) {
    const group = this.groups.get(groupJid);
    if (!group) return false;
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    const index = group.blacklist.findIndex(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
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
    const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
    return group.blacklist.some(item => item.replace(/@.*$/, '').replace(/\D/g, '') === clean);
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
  // Gestão de Membros Silenciados (Mute Member)
  // ==========================================

  muteMember(groupJid, userJid, untilTimestamp, reason = '', by = '') {
    const group = this.getOrCreateGroup(groupJid);
    if (!group.mutedMembers) group.mutedMembers = {};
    const clean = userJid.replace(/@.*$/, '').replace(/\D/g, '');
    const key = `${clean}@s.whatsapp.net`;
    group.mutedMembers[key] = {
      until: untilTimestamp,
      reason: reason || '',
      by: by || '',
      mutedAt: Date.now()
    };
    this.scheduleSave();
    return group.mutedMembers[key];
  }

  unmuteMember(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.mutedMembers) return false;
    const clean = userJid.replace(/@.*$/, '').replace(/\D/g, '');
    const key = `${clean}@s.whatsapp.net`;
    if (group.mutedMembers[key]) {
      delete group.mutedMembers[key];
      this.scheduleSave();
      return true;
    }
    return false;
  }

  isMemberMuted(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.mutedMembers) return false;
    const clean = userJid.replace(/@.*$/, '').replace(/\D/g, '');
    const key = `${clean}@s.whatsapp.net`;
    const record = group.mutedMembers[key];
    if (!record) return false;
    if (Date.now() > record.until) {
      delete group.mutedMembers[key];
      this.scheduleSave();
      return false;
    }
    return true;
  }

  getMutedMemberData(groupJid, userJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.mutedMembers) return null;
    const clean = userJid.replace(/@.*$/, '').replace(/\D/g, '');
    const key = `${clean}@s.whatsapp.net`;
    const record = group.mutedMembers[key];
    if (!record) return null;
    if (Date.now() > record.until) {
      delete group.mutedMembers[key];
      this.scheduleSave();
      return null;
    }
    return record;
  }

  getAllMutedMembers(groupJid) {
    const group = this.groups.get(groupJid);
    if (!group || !group.mutedMembers) return {};
    const now = Date.now();
    let modified = false;
    const result = {};
    for (const [key, data] of Object.entries(group.mutedMembers)) {
      if (now > data.until) {
        delete group.mutedMembers[key];
        modified = true;
      } else {
        result[key] = data;
      }
    }
    if (modified) {
      this.scheduleSave();
    }
    return result;
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

  // ==========================================
  // Perfil Cultural do Grupo (Group Culture & Memory)
  // ==========================================

  getGroupCulture(groupJid) {
    const group = this.groups.get(groupJid);
    return group?.culture || {
      vibe: '',
      tone: '',
      rules: [],
      facts: {},
      vocabulary: []
    };
  }

  updateGroupCulture(groupJid, updates = {}) {
    const group = this.getOrCreateGroup(groupJid);
    const existing = group.culture || {
      vibe: '',
      tone: '',
      rules: [],
      facts: {},
      vocabulary: []
    };

    group.culture = {
      ...existing,
      ...updates,
      rules: Array.isArray(updates.rules) ? updates.rules : existing.rules,
      facts: {
        ...(existing.facts || {}),
        ...(updates.facts || {})
      },
      vocabulary: Array.isArray(updates.vocabulary) ? updates.vocabulary : existing.vocabulary
    };

    this.scheduleSave();
    return group.culture;
  }

  addCultureFact(groupJid, key, value) {
    if (!groupJid || !key || !value) return false;
    const group = this.getOrCreateGroup(groupJid);
    if (!group.culture) {
      group.culture = { vibe: '', tone: '', rules: [], facts: {}, vocabulary: [] };
    }
    if (!group.culture.facts) group.culture.facts = {};
    group.culture.facts[key.trim()] = String(value).trim();
    this.scheduleSave();
    return true;
  }

  removeCultureFact(groupJid, key) {
    if (!groupJid || !key) return false;
    const group = this.groups.get(groupJid);
    if (group?.culture?.facts && group.culture.facts[key.trim()]) {
      delete group.culture.facts[key.trim()];
      this.scheduleSave();
      return true;
    }
    return false;
  }

  addCultureRule(groupJid, rule) {
    if (!groupJid || !rule) return false;
    const group = this.getOrCreateGroup(groupJid);
    if (!group.culture) {
      group.culture = { vibe: '', tone: '', rules: [], facts: {}, vocabulary: [] };
    }
    if (!Array.isArray(group.culture.rules)) group.culture.rules = [];
    const cleanRule = String(rule).trim();
    if (!group.culture.rules.includes(cleanRule)) {
      group.culture.rules.push(cleanRule);
      if (group.culture.rules.length > 15) {
        group.culture.rules.shift(); // Limite de 15 regras tácitas
      }
      this.scheduleSave();
      return true;
    }
    return false;
  }
}

const configManager = new ConfigManager();
module.exports = configManager;
