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
    this.fallbackSeq = 0;
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
        CREATE INDEX IF NOT EXISTS idx_group_id ON messages(group_jid, id DESC);
      `);

      // Migração não-destrutiva: colunas extras para referenciar mensagens (apagar/banir por ref "mNN")
      for (const col of ['msg_id TEXT', 'participant TEXT']) {
        try {
          this.db.exec(`ALTER TABLE messages ADD COLUMN ${col}`);
        } catch (_) { /* coluna já existe */ }
      }

      this.insertStmt = this.db.prepare(`
        INSERT INTO messages (group_jid, sender_jid, sender_name, text, timestamp, msg_id, participant)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      this.selectStmt = this.db.prepare(`
        SELECT id, sender_jid, sender_name, text, timestamp, msg_id, participant
        FROM messages
        WHERE group_jid = ?
        ORDER BY id DESC
        LIMIT ?
      `);

      this.selectByRefStmt = this.db.prepare(`
        SELECT id, sender_jid, sender_name, msg_id, participant
        FROM messages
        WHERE group_jid = ? AND id = ?
      `);

      this.cleanupStmt = this.db.prepare(`
        DELETE FROM messages
        WHERE group_jid = ? AND id < COALESCE((
          SELECT id FROM messages WHERE group_jid = ? ORDER BY id DESC LIMIT 1 OFFSET 49
        ), 0)
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
   * @param {{ msgId?: string, participant?: string }} [extra] ID da mensagem e participante bruto (para apagar por ref)
   */
  saveMessage(groupJid, senderJid, text, timestamp = null, senderName = '', extra = {}) {
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
        id: ++this.fallbackSeq,
        sender: senderJid,
        name: senderName || (senderJid || '').replace(/@.*$/, '').replace(/\D/g, ''),
        text: cleanText,
        timestamp: ts,
        msgId: extra?.msgId || null,
        participant: extra?.participant || null
      });
      while (list.length > 50) {
        list.shift();
      }
      return;
    }

    try {
      this.insertStmt.run(
        groupJid,
        senderJid,
        senderName || '',
        cleanText,
        ts,
        extra?.msgId || null,
        extra?.participant || null
      );

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
        timestamp: r.timestamp,
        msgId: r.msg_id || null,
        participant: r.participant || null
      }));
    } catch (err) {
      logger.error({ err, groupJid }, 'Erro ao consultar mensagens da memória local');
      return [];
    }
  }

  /**
   * Converte o histórico recente em formato de diálogo legível para o prompt do modelo,
   * incluindo nome e @numero para que a IA correlacione quem disse o quê e possa agir por nome.
   * @param {string} groupJid 
   * @param {number} limit 
   * @returns {string}
   */
  getFormattedHistory(groupJid, limit = 50) {
    const list = this.getRecentMessages(groupJid, limit);
    if (!list || list.length === 0) return '';

    // Formato compacto (economia de tokens): "[mID] Nome: texto".
    // Filtra ruído de risadas vazias (ex: "kkkkk", "hahaha") preservando 100% dos diálogos reais
    return list
      .filter(m => {
        const t = (m.text || '').trim();
        if (!t) return false;
        if (/^(?:k{2,}|h[aeiou]{2,}|rs{2,}|j{2,}|l[ao]l|lmao|kk|haha|hehe|rs)+$/i.test(t.replace(/[\s.,!?~^:;()\-—_]/g, ''))) return false;
        return true;
      })
      .map(m => {
        const body = m.text.length > 200 ? `${m.text.slice(0, 200)}…` : m.text;
        if (m.sender === 'hermes@bot') {
          return `[m${m.id}] Hermes: ${body}`;
        }
        const num = (m.sender || '').replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
        const label = (m.name || '').trim() || (num ? `…${num.slice(-4)}` : 'Membro');
        return `[m${m.id}] ${label}: ${body}`;
      })
      .join('\n');
  }

  /**
   * Resolve um ref "mNN" (ou número) do histórico em autor e chave real da mensagem.
   * Valida que o ref pertence ao grupo informado (anti-alucinação do modelo).
   * @param {string} groupJid
   * @param {string|number} ref
   * @returns {{ sender: string, name: string, msgId: string|null, participant: string|null }|null}
   */
  getMessageByRef(groupJid, ref) {
    const id = parseInt(String(ref || '').replace(/^m/i, ''), 10);
    if (!groupJid || !Number.isFinite(id) || id <= 0) return null;

    let row = null;
    if (!this.db) {
      const found = (this.fallbackStore.get(groupJid) || []).find(m => m.id === id);
      if (found) row = { sender: found.sender, name: found.name, msgId: found.msgId, participant: found.participant };
    } else {
      try {
        const r = this.selectByRefStmt.get(groupJid, id);
        if (r) row = { sender: r.sender_jid, name: r.sender_name, msgId: r.msg_id || null, participant: r.participant || null };
      } catch (err) {
        logger.warn({ err, groupJid }, 'Falha ao resolver ref de mensagem');
      }
    }

    if (!row || !row.sender) return null;
    return row;
  }

  /**
   * Busca no histórico recente do grupo o JID de um participante pelo nome (pushName)
   * Permite que o admin diga "Hermes, adverte o João pelo que ele falou" sem precisar marcar com @
   * @param {string} groupJid
   * @param {string} nameQuery
   * @returns {string|null}
   */
  findParticipantByName(groupJid, nameQuery) {
    if (!groupJid || !nameQuery) return null;
    const normalize = (str) => String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const targetName = normalize(nameQuery.replace(/^@/, ''));
    if (targetName.length < 2) return null;

    const recent = this.getRecentMessages(groupJid, 50);
    // Percorre do mais recente para o mais antigo
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (!msg.sender || msg.sender === 'hermes@bot') continue;
      const senderNameNorm = normalize(msg.name);
      if (!senderNameNorm) continue;

      if (
        senderNameNorm === targetName ||
        senderNameNorm.includes(targetName) ||
        targetName.includes(senderNameNorm)
      ) {
        return msg.sender;
      }
    }
    return null;
  }

  /**
   * Obtém o nome conhecido (pushName) de um participante pelo seu JID ou número
   * @param {string} groupJid
   * @param {string} participantJid
   * @returns {string|null}
   */
  getParticipantName(groupJid, participantJid) {
    if (!groupJid || !participantJid) return null;
    const clean = String(participantJid).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    if (!clean) return null;
    const recent = this.getRecentMessages(groupJid, 100);
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i];
      if (!msg.sender || msg.sender === 'hermes@bot') continue;
      const msgNum = String(msg.sender).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      const partNum = msg.participant ? String(msg.participant).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '') : '';
      if (msgNum === clean || partNum === clean) {
        if (msg.name && !/^\d{8,15}$/.test(msg.name.trim())) {
          return msg.name.trim();
        }
      }
    }
    return null;
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
