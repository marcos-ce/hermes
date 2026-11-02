'use strict';

const path = require('path');
const fs   = require('fs');
const logger = require('../utils/logger');

/**
 * IntentStore — Persistência leve de ações agênticas executadas pelo Hermes
 *
 * Armazena cada tool call bem-sucedida com: grupo, executor, ferramenta,
 * argumentos compactos, resultado (ok/erro) e timestamp.
 *
 * Uso principal:
 *   - Injetar as últimas N ações no prompt → habilita "desfaz", "faz de novo",
 *     "o que você fez hoje?" e prevenção de duplicata
 *   - Auditoria de atividade agêntica por grupo
 *
 * Backend: SQLite nativo (node:sqlite, mesmo motor do memoryEngine).
 * Fallback: Map em RAM se o SQLite não estiver disponível.
 * TTL padrão: 24 horas (86400s). Ações mais antigas são purgadas no boot.
 */
class IntentStore {
  constructor() {
    this.dataDir  = path.resolve(process.cwd(), 'data');
    this.dbPath   = path.join(this.dataDir, 'intents.db');
    this.db       = null;
    this.fallback = new Map(); // groupJid → Array<intent>
    this._init();
  }

  _init() {
    try {
      const { DatabaseSync } = require('node:sqlite');

      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS intents (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          group_jid   TEXT    NOT NULL,
          sender_jid  TEXT    NOT NULL,
          sender_name TEXT,
          tool        TEXT    NOT NULL,
          args_json   TEXT    NOT NULL DEFAULT '{}',
          success     INTEGER NOT NULL DEFAULT 1,
          summary     TEXT,
          timestamp   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_intent_group_ts
          ON intents(group_jid, timestamp DESC);
      `);

      this._insertStmt = this.db.prepare(`
        INSERT INTO intents
          (group_jid, sender_jid, sender_name, tool, args_json, success, summary, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this._selectStmt = this.db.prepare(`
        SELECT id, sender_jid, sender_name, tool, args_json, success, summary, timestamp
        FROM intents
        WHERE group_jid = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      this._selectTodayStmt = this.db.prepare(`
        SELECT id, sender_jid, sender_name, tool, args_json, success, summary, timestamp
        FROM intents
        WHERE group_jid = ? AND timestamp >= ?
        ORDER BY timestamp ASC
      `);

      this._deleteOldStmt = this.db.prepare(`
        DELETE FROM intents WHERE timestamp < ?
      `);

      this._deleteByIdStmt = this.db.prepare(`
        DELETE FROM intents WHERE id = ?
      `);

      // Purga ações com mais de 24h no boot
      try {
        const cutoff = Date.now() - 86400 * 1000;
        this._deleteOldStmt.run(cutoff);
      } catch (_) {}

    } catch (err) {
      this.db = null;
      logger.warn({ err: err.message }, '[IntentStore] SQLite indisponível — usando fallback em RAM.');
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Gera um resumo legível de 1 linha para injeção no prompt.
   * Ex: "ban_member(target:55119...)" ou "schedule_open(time:07:00)"
   */
  _summarize(tool, args) {
    if (!args || typeof args !== 'object') return tool;
    const keyFields = ['target', 'action', 'time', 'text', 'duration', 'reason', 'question'];
    const parts = keyFields
      .filter(k => args[k] !== undefined && args[k] !== null && String(args[k]).length > 0)
      .map(k => `${k}:${String(args[k]).slice(0, 30)}`);
    return parts.length > 0 ? `${tool}(${parts.join(', ')})` : tool;
  }

  /**
   * Formata timestamp para exibição compacta (HH:MM ou "hoje HH:MM").
   */
  _formatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ─── API Pública ────────────────────────────────────────────────────────────

  /**
   * Registra uma ação executada pelo Hermes.
   * @param {string} groupJid
   * @param {string} senderJid    — JID do admin que solicitou
   * @param {string} senderName   — pushName do admin
   * @param {string} tool         — nome da ferramenta (ex: "ban_member")
   * @param {object} args         — argumentos usados
   * @param {boolean} success     — true se executou sem erro
   * @param {string} [summary]    — texto livre opcional (ex: mensagem de retorno)
   */
  record(groupJid, senderJid, senderName, tool, args, success = true, summary = '') {
    if (!groupJid || !tool) return;

    const ts       = Date.now();
    const argsJson = (() => { try { return JSON.stringify(args || {}); } catch (_) { return '{}'; } })();
    const sumText  = summary ? String(summary).slice(0, 200) : this._summarize(tool, args);

    if (!this.db) {
      // Fallback RAM — mantém máximo 20 por grupo
      const arr = this.fallback.get(groupJid) || [];
      arr.unshift({ senderJid, senderName, tool, args, success, summary: sumText, timestamp: ts });
      if (arr.length > 20) arr.pop();
      this.fallback.set(groupJid, arr);
      return;
    }

    try {
      this._insertStmt.run(groupJid, senderJid, senderName || '', tool, argsJson, success ? 1 : 0, sumText, ts);
    } catch (err) {
      logger.warn({ err: err.message, tool }, '[IntentStore] Falha ao registrar intenção.');
    }
  }

  /**
   * Retorna as últimas N ações de um grupo.
   * @param {string} groupJid
   * @param {number} limit        — padrão 5
   * @returns {Array<object>}
   */
  getRecent(groupJid, limit = 5) {
    if (!groupJid) return [];

    if (!this.db) {
      return (this.fallback.get(groupJid) || []).slice(0, limit);
    }

    try {
      const rows = this._selectStmt.all(groupJid, limit);
      return rows.map(r => ({
        id:         r.id,
        senderJid:  r.sender_jid,
        senderName: r.sender_name,
        tool:       r.tool,
        args:       (() => { try { return JSON.parse(r.args_json); } catch (_) { return {}; } })(),
        success:    r.success === 1,
        summary:    r.summary,
        timestamp:  r.timestamp,
      }));
    } catch (err) {
      logger.warn({ err: err.message }, '[IntentStore] Falha ao ler intenções recentes.');
      return [];
    }
  }

  /**
   * Retorna todas as ações de hoje (desde meia-noite local) de um grupo.
   * @param {string} groupJid
   * @returns {Array<object>}
   */
  getToday(groupJid) {
    if (!groupJid) return [];

    const now      = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (!this.db) {
      return (this.fallback.get(groupJid) || [])
        .filter(i => i.timestamp >= midnight)
        .reverse();
    }

    try {
      const rows = this._selectTodayStmt.all(groupJid, midnight);
      return rows.map(r => ({
        id:         r.id,
        senderJid:  r.sender_jid,
        senderName: r.sender_name,
        tool:       r.tool,
        args:       (() => { try { return JSON.parse(r.args_json); } catch (_) { return {}; } })(),
        success:    r.success === 1,
        summary:    r.summary,
        timestamp:  r.timestamp,
      }));
    } catch (err) {
      logger.warn({ err: err.message }, '[IntentStore] Falha ao ler ações de hoje.');
      return [];
    }
  }

  /**
   * Retorna a última ação bem-sucedida de um grupo (para "desfaz" e "faz de novo").
   * @param {string} groupJid
   * @returns {object|null}
   */
  getLast(groupJid) {
    const recent = this.getRecent(groupJid, 1);
    return recent.length > 0 ? recent[0] : null;
  }

  /**
   * Formata as últimas N ações como bloco compacto para injeção no prompt.
   * Ex: "[Ações recentes do Hermes: ban_member(@João) 14:23 ✓ | warn_member(@Pedro) 14:45 ✓ | ...]"
   * @param {string} groupJid
   * @param {number} limit    — padrão 5
   * @returns {string|null}   — null se não houver ações
   */
  formatForPrompt(groupJid, limit = 5) {
    const actions = this.getRecent(groupJid, limit);
    if (actions.length === 0) return null;

    const parts = actions
      .slice()
      .reverse() // mais antigo → mais recente
      .map(a => {
        const icon   = a.success ? '✓' : '✗';
        const time   = this._formatTime(a.timestamp);
        const label  = this._summarize(a.tool, a.args);
        const who    = a.senderName ? ` (por ${a.senderName})` : '';
        return `${label} ${time}${who} ${icon}`;
      });

    return `[Ações recentes do Hermes: ${parts.join(' | ')}]`;
  }

  /**
   * Formata o relatório completo de hoje para o comando "o que você fez hoje?"
   * @param {string} groupJid
   * @returns {string}
   */
  formatTodayReport(groupJid) {
    const actions = this.getToday(groupJid);
    if (actions.length === 0) return 'Nenhuma ação agêntica registrada hoje neste grupo.';

    const lines = actions.map(a => {
      const icon  = a.success ? '✅' : '❌';
      const time  = this._formatTime(a.timestamp);
      const who   = a.senderName ? ` (pedido de ${a.senderName})` : '';
      return `${icon} ${time}${who} — ${a.summary || a.tool}`;
    });

    return `📋 *Ações de hoje (${actions.length}):*\n${lines.join('\n')}`;
  }

  /**
   * Remove uma entrada específica pelo id (usado pelo undo para limpar após reverter).
   * @param {number} id
   */
  remove(id) {
    if (!id) return;
    if (!this.db) return; // fallback não suporta remoção por id
    try {
      this._deleteByIdStmt.run(id);
    } catch (_) {}
  }
}

const intentStore = new IntentStore();

// Encerramento limpo
let _closed = false;
function _closeIntentStore() {
  if (_closed || !intentStore.db) return;
  _closed = true;
  const db = intentStore.db;
  intentStore.db = null;
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}
  try { db.close(); } catch (_) {}
}
process.on('exit', _closeIntentStore);

module.exports = intentStore;
