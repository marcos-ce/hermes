const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Registro de pedidos vindos do site (idempotência por paymentId).
 * Arquivo SEPARADO (data/site-orders.json) para NÃO alterar o esquema de data/groups.json.
 * Escrita atômica: .tmp -> .bak -> rename.
 */
class SiteOrders {
  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.filePath = path.join(this.dataDir, 'site-orders.json');
    this.tmpPath = this.filePath + '.tmp';
    this.bakPath = this.filePath + '.bak';
    /** @type {Map<string, object>} */
    this.orders = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    fs.mkdirSync(this.dataDir, { recursive: true });
    for (const p of [this.filePath, this.bakPath]) {
      try {
        if (!fs.existsSync(p)) continue;
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        for (const [id, rec] of Object.entries(parsed)) {
          if (rec && typeof rec === 'object') this.orders.set(id, rec);
        }
        return;
      } catch (err) {
        logger.warn({ err: err.message, file: p }, 'site-orders: arquivo ilegível, tentando backup');
      }
    }
  }

  get(paymentId) {
    return this.orders.get(String(paymentId)) || null;
  }

  /** Mescla (shallow) e persiste imediatamente de forma atômica. */
  upsert(paymentId, patch) {
    const id = String(paymentId);
    const prev = this.orders.get(id) || { paymentId: id, createdAt: Date.now() };
    const next = { ...prev, ...patch, updatedAt: Date.now() };
    this.orders.set(id, next);
    this._persist();
    return next;
  }

  /** Timestamps das tentativas de entrada em grupos (para o teto por hora/dia). */
  attemptTimestamps() {
    const out = [];
    for (const o of this.orders.values()) {
      for (const g of o.groups || []) if (g.attemptedAt) out.push(g.attemptedAt);
    }
    return out;
  }

  pendingIds() {
    return [...this.orders.values()]
      .filter((o) => o.status === 'queued' || o.status === 'processing')
      .map((o) => o.paymentId);
  }

  /**
   * Encontra nome e telefone de pedidos anteriores pelo telefone ou códigos de convite.
   * Usado para resgatar o nome real do cliente em renovações rápidas.
   */
  findPreviousCustomer({ phone, codes = [] }) {
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    const cleanCodes = new Set(codes.filter(Boolean));

    // Ordena do mais recente para o mais antigo
    const all = [...this.orders.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    for (const o of all) {
      const matchPhone = cleanPhone && o.phone && String(o.phone).replace(/\D/g, '') === cleanPhone;
      const matchCode = (o.groups || []).some((g) => cleanCodes.has(g.code));
      if ((matchPhone || matchCode) && o.name && o.name !== 'Cliente') {
        return { name: o.name, phone: o.phone || cleanPhone };
      }
    }
    return null;
  }

  _persist() {
    try {
      const obj = Object.fromEntries(this.orders.entries());
      fs.writeFileSync(this.tmpPath, JSON.stringify(obj, null, 2));
      if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, this.bakPath);
      fs.renameSync(this.tmpPath, this.filePath);
    } catch (err) {
      logger.error({ err: err.message }, 'site-orders: falha ao persistir');
    }
  }
}

module.exports = new SiteOrders();
