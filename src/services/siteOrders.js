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

  pendingIds() {
    return [...this.orders.values()]
      .filter((o) => {
        if (o.status === 'done' || o.status === 'rejected') return false;
        if (o.status === 'waiting_owner_join' && o.notified && !o.retry) return false;
        if (o.notified && !o.retry) return false;
        return o.status === 'queued' || o.retry || (o.status === 'error' && !o.notified);
      })
      .map((o) => o.paymentId);
  }

  /**
   * Retorna os pedidos mais recentes ordenados por data
   * @param {number} [limit=25]
   */
  getAll(limit = 25) {
    return [...this.orders.values()]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, limit);
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


  /**
   * Verifica se um grupo (código de convite ou JID) ou telefone já usou o teste grátis.
   * Evita abuso de solicitações repetidas de teste grátis para o mesmo grupo.
   * @param {object} param0 
   * @returns {boolean}
   */
  hasUsedTrial({ code, jid, phone } = {}) {
    this.load();
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    const cleanJid = jid ? (jid.endsWith('@g.us') ? jid : `${jid}@g.us`) : '';

    for (const order of this.orders.values()) {
      const isTrial = order.plan === 'teste' || order.isTrial;
      if (!isTrial) continue;
      if (order.status === 'rejected') continue;

      if (cleanPhone && order.phone && String(order.phone).replace(/\D/g, '') === cleanPhone) {
        return true;
      }

      if (code && order.trialCode === code) return true;

      if (Array.isArray(order.groups)) {
        for (const g of order.groups) {
          if (code && g.code === code) return true;
          if (cleanJid && g.jid && (g.jid === cleanJid || cleanJid.includes(g.jid.replace(/@.*$/, '')))) return true;
        }
      }
    }

    if (cleanJid) {
      try {
        const configManager = require('../core/configManager');
        if (configManager.hasGroupUsedTrial(cleanJid)) return true;
      } catch (_) {}
    }

    return false;
  }

  /**
   * Registra um grupo aguardando o dono entrar manualmente pelo app oficial do WhatsApp.
   * Elimina completamente o groupAcceptInvite do bot (Zero Risco de Ban).
   * @param {object} pendingData 
   */
  registerPendingGroup(pendingData) {
    const { paymentId, code, groupJid, groupName, days, plan, ownerName, ownerPhone, isTrial } = pendingData;
    const id = String(paymentId);
    const existing = this.orders.get(id) || { paymentId: id, createdAt: Date.now() };

    const resolvedPlan = plan || 'mensal';
    const resolvedDays = days || (resolvedPlan === 'teste' ? 3 : 30);
    const resolvedIsTrial = Boolean(isTrial || resolvedPlan === 'teste');

    const groups = existing.groups || [];
    const gIdx = groups.findIndex(g => g.code === code || (groupJid && g.jid === groupJid));
    const gEntry = {
      code,
      jid: groupJid || null,
      groupName: groupName || 'Grupo',
      days: resolvedDays,
      plan: resolvedPlan,
      isTrial: resolvedIsTrial,
      status: 'waiting_owner_join',
      registeredAt: Date.now()
    };

    if (gIdx >= 0) {
      groups[gIdx] = { ...groups[gIdx], ...gEntry };
    } else {
      groups.push(gEntry);
    }

    const next = {
      ...existing,
      status: 'waiting_owner_join',
      plan: resolvedPlan,
      days: resolvedDays,
      isTrial: resolvedIsTrial,
      name: ownerName || 'Cliente',
      phone: ownerPhone || '',
      groups,
      updatedAt: Date.now()
    };
    this.orders.set(id, next);
    this._persist();
    return next;
  }

  /**
   * Busca e consome uma licença pendente quando o dono entra no grupo pelo app oficial.
   * Suporta correspondência por groupJid ou por inviteCode do grupo.
   * @param {string} groupJid 
   * @param {string} [inviteCode]
   * @returns {object|null}
   */
  claimPendingGroup(groupJid, inviteCode = null) {
    if (!groupJid && !inviteCode) return null;
    const cleanJid = groupJid ? (groupJid.endsWith('@g.us') ? groupJid : `${groupJid}@g.us`) : '';

    // Varre pedidos aguardando entrada do dono (do mais antigo para o mais novo ou vice-versa)
    for (const order of this.orders.values()) {
      if (!order.groups || order.status === 'done') continue;

      for (const g of order.groups) {
        if (g.status !== 'waiting_owner_join') continue;

        const matchesJid = cleanJid && g.jid && (g.jid === cleanJid || cleanJid.includes(g.jid.replace(/@.*$/, '')));
        const matchesCode = inviteCode && g.code && g.code === inviteCode;

        if (matchesJid || matchesCode) {
          g.status = 'done';
          g.activatedAt = Date.now();
          if (cleanJid) g.jid = cleanJid;

          const allDone = order.groups.every(og => og.status === 'done');
          if (allDone) {
            order.status = 'done';
          }
          order.updatedAt = Date.now();
          this._persist();

          return {
            paymentId: order.paymentId,
            days: g.days || order.days || (g.plan === 'teste' || order.plan === 'teste' ? 3 : 30),
            plan: g.plan || order.plan || 'mensal',
            isTrial: Boolean(g.isTrial || order.isTrial || g.plan === 'teste' || order.plan === 'teste'),
            ownerName: order.name,
            ownerPhone: order.phone,
            groupName: g.groupName
          };
        }
      }
    }

    // Fallback inteligente: se não houve match exato por JID/código, mas há um pedido pendente
    // recente (últimas 2 horas) aguardando ativação, associa ao grupo recém-entrado
    const now = Date.now();
    for (const order of this.orders.values()) {
      if (!order.groups || order.status === 'done') continue;
      for (const g of order.groups) {
        if (g.status === 'waiting_owner_join' && (now - (g.registeredAt || 0) < 2 * 60 * 60 * 1000)) {
          g.status = 'done';
          g.activatedAt = now;
          if (cleanJid) g.jid = cleanJid;

          const allDone = order.groups.every(og => og.status === 'done');
          if (allDone) {
            order.status = 'done';
          }
          order.updatedAt = now;
          this._persist();

          return {
            paymentId: order.paymentId,
            days: g.days || order.days || (g.plan === 'teste' || order.plan === 'teste' ? 3 : 30),
            plan: g.plan || order.plan || 'mensal',
            isTrial: Boolean(g.isTrial || order.isTrial || g.plan === 'teste' || order.plan === 'teste'),
            ownerName: order.name,
            ownerPhone: order.phone,
            groupName: g.groupName
          };
        }
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
