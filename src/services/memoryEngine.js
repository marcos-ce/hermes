const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * Motor de Memória Contextual Local via SQLite ultraleve nativo
 * Buffer deslizante de mensagens recentes por grupo (Custo R$ 0,00)
 */
class MemoryEngine {
  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.dbPath = path.join(this.dataDir, 'memory.db');
    this.db = null;
    this.writeCounters = new Map();
    this.fallbackStore = new Map();
    this.init();
  }

  init() {
    try {
      const { DatabaseSync } = require('node:sqlite');

      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      this.db = new DatabaseSync(this.dbPath);

      // Otimizações de performance e integridade do SQLite
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');

      // Criação da tabela de histórico com índices para busca ultra rápida O(1)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_jid TEXT NOT NULL,
          sender_jid TEXT NOT NULL,
          sender_name TEXT,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_group_timestamp ON messages(group_jid, timestamp);
      `);

      this.insertStmt = this.db.prepare(`
        INSERT INTO messages (group_jid, sender_jid, sender_name, text, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      this.selectStmt = this.db.prepare(`
        SELECT id, sender_jid, sender_name, text, timestamp
        FROM messages
        WHERE group_jid = ?
        ORDER BY id DESC
        LIMIT ?
      `);

      this.cleanupStmt = this.db.prepare(`
        DELETE FROM messages
        WHERE group_jid = ? AND id NOT IN (
          SELECT id FROM messages WHERE group_jid = ? ORDER BY id DESC LIMIT 50
        )
      `);

      this.countStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM messages WHERE group_jid = ?
      `);

      this.deleteGroupStmt = this.db.prepare(`
        DELETE FROM messages WHERE group_jid = ?
      `);
    } catch (err) {
      this.db = null;
      logger.warn({ err: err.message }, 'Banco de memória SQLite nativo indisponível nesta versão do Node.js. Utilizando fallback em memória (Map).');
    }
  }

  /**
   * Salva silenciosamente uma mensagem no buffer deslizante do grupo
   * Filtra ruído (comandos, menus e travas) e amortiza a limpeza para máximo throughput
   * @param {string} groupJid 
   * @param {string} senderJid 
   * @param {string} text 
   * @param {number} timestamp 
   * @param {string} [senderName] 
   */
  saveMessage(groupJid, senderJid, text, timestamp = null, senderName = '') {
    if (!groupJid || !text) return;

    const cleanText = text.trim();

    // 1. FILTRO ANTI-RUÍDO DE ELITE:
    // Não polui o contexto de IA com comandos de bot, menus numéricos ou mensagens de trava
    if (cleanText.length < 2 || cleanText.length > 800) return;

    const firstChar = cleanText[0];
    if (firstChar === '!' || firstChar === '/' || firstChar === '.' || firstChar === '#' || firstChar === '$') {
      return; // Ignora comandos do bot
    }

    // Ignora escolhas curtas numéricas de menus (ex: "1", "2", "[1]")
    if (/^\[?\d{1,2}\]?$/.test(cleanText)) return;

    const ts = timestamp ? Number(timestamp) : Math.floor(Date.now() / 1000);

    if (!this.db) {
      let list = this.fallbackStore.get(groupJid);
      if (!list) {
        list = [];
        this.fallbackStore.set(groupJid, list);
      }
      list.push({
        id: list.length + 1,
        sender: senderJid,
        name: senderName || (senderJid || '').replace(/@.*$/, '').replace(/\D/g, ''),
        text: cleanText,
        timestamp: ts
      });
      while (list.length > 50) {
        list.shift();
      }
      return;
    }

    try {
      this.insertStmt.run(groupJid, senderJid, senderName || '', cleanText, ts);

      // 2. LIMPEZA AMORTIZADA DE ELITE (Amortized Cleanup):
      // Em vez de executar um DELETE com subquery a cada mensagem recebida,
      // roda a limpeza apenas a cada 25 mensagens salvas. Isso reduz o I/O em 96% no Hot-Path!
      const currentCount = (this.writeCounters.get(groupJid) || 0) + 1;
      if (currentCount >= 25) {
        this.cleanupStmt.run(groupJid, groupJid);
        this.writeCounters.set(groupJid, 0);
      } else {
        this.writeCounters.set(groupJid, currentCount);
      }
    } catch (err) {
      logger.warn({ err, groupJid }, 'Falha ao salvar mensagem na memória local');
    }
  }

  /**
   * Obtém as mensagens mais recentes do grupo em ordem cronológica para contexto
   * @param {string} groupJid 
   * @param {number} limit Padrão 30 mensagens
   * @returns {Array<{ sender: string, name: string, text: string, timestamp: number }>}
   */
  getRecentMessages(groupJid, limit = 30) {
    if (!groupJid) return [];

    if (!this.db) {
      const list = this.fallbackStore.get(groupJid) || [];
      return list.slice(-limit);
    }

    try {
      const rows = this.selectStmt.all(groupJid, limit);
      // Retorna em ordem cronológica (mais antiga para mais recente)
      return rows.reverse().map(r => ({
        id: r.id,
        sender: r.sender_jid,
        name: r.sender_name || r.sender_jid.replace(/@.*$/, '').replace(/\D/g, ''),
        text: r.text,
        timestamp: r.timestamp
      }));
    } catch (err) {
      logger.error({ err, groupJid }, 'Erro ao consultar mensagens da memória local');
      return [];
    }
  }

  /**
   * Converte o histórico recente em formato de diálogo legível para o prompt do modelo
   * @param {string} groupJid 
   * @param {number} limit 
   * @returns {string}
   */
  getFormattedHistory(groupJid, limit = 30) {
    const list = this.getRecentMessages(groupJid, limit);
    if (!list || list.length === 0) return '';

    return list
      .map(m => `${m.name}: ${m.text}`)
      .join('\n');
  }

  /**
   * Retorna estatísticas de memória do grupo
   * @param {string} groupJid 
   * @returns {{ count: number }}
   */
  getGroupStats(groupJid) {
    if (!groupJid) return { count: 0 };
    if (!this.db) {
      return { count: (this.fallbackStore.get(groupJid) || []).length };
    }
    try {
      const result = this.countStmt.all(groupJid);
      return { count: result?.[0]?.count || 0 };
    } catch (_) {
      return { count: 0 };
    }
  }

  /**
   * Limpa todo o histórico de um grupo
   * @param {string} groupJid 
   */
  clearGroupMemory(groupJid) {
    if (!groupJid) return false;
    if (!this.db) {
      this.fallbackStore.delete(groupJid);
      return true;
    }
    try {
      this.deleteGroupStmt.run(groupJid);
      this.writeCounters.delete(groupJid);
      return true;
    } catch (err) {
      logger.error({ err, groupJid }, 'Erro ao limpar histórico do grupo');
      return false;
    }
  }
}

const memoryEngine = new MemoryEngine();
module.exports = memoryEngine;
