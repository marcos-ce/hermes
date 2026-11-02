const http = require('http');
const crypto = require('crypto');
const settings = require('../config/settings');
const siteOrders = require('./siteOrders');
const { extractInviteCode } = require('./joinService');
const logger = require('../utils/logger');

// Preços e prazos são definidos AQUI (nunca vêm do payload): valor pago -> plano
const PLANS = {
  10: { plan: 'teste', days: 7 },
  32: { plan: 'mensal', days: 30 }
};

const MAX_BODY_BYTES = 4096;
const RATE_LIMIT = { windowMs: 60 * 1000, max: 60 };
const AUTH_FAIL = { windowMs: 10 * 60 * 1000, max: 5 };
const MP_RETRY_DELAYS = [0, 5000, 15000, 45000];

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

class SiteBridge {
  constructor() {
    this.sock = null;
    this.server = null;
    this.queue = [];
    this.queued = new Set();
    this.running = false;
    this.hits = new Map(); // ip -> timestamps
    this.fails = new Map(); // ip -> timestamps
  }

  updateSocket(sock) {
    this.sock = sock;
  }

  /**
   * Inicia o receptor HTTP. Desligado por padrão (SITE_BRIDGE_ENABLED=true para ativar).
   * Recusa iniciar sem segredo forte e sem verificação independente do pagamento.
   */
  init(sock) {
    this.sock = sock;
    siteOrders.load();

    // 1. Recuperação após crash/restart: reprocessa pedidos pendentes em fila
    for (const id of siteOrders.pendingIds()) this._enqueue(id);

    // 2. Modo Polling do Mercado Pago (Ideal para Discloud e ambientes sem porta pública exposta)
    if (settings.mpAccessToken && settings.mpPollingEnabled) {
      this._startPolling();
    }

    // 3. Modo Servidor Webhook HTTP (Opcional, caso tenha porta pública configurada)
    if (settings.siteBridgeEnabled) {
      this._startServer();
    }
  }

  /**
   * Inicia busca ativa (polling) periódica por novos pagamentos Pix aprovados no Mercado Pago.
   * Não exige abertura de portas, túneis ou IPs públicos: funciona nativamente na Discloud.
   * Consulta HTTPS pura à API do Mercado Pago — 100% isolado do WhatsApp (zero risco Anti-Ban).
   */
  _startPolling() {
    const intervalSec = Math.max(settings.mpPollingIntervalSeconds || 30, 10);
    logger.info(`siteBridge: Polling ativo do Mercado Pago iniciado (busca a cada ${intervalSec}s).`);

    // Primeira checagem após 5s para dar tempo da conexão do WhatsApp estabilizar
    setTimeout(() => this._pollMercadoPago(), 5000);

    this.pollInterval = setInterval(() => {
      this._pollMercadoPago();
    }, intervalSec * 1000);
    this.pollInterval.unref();
  }

  async _pollMercadoPago() {
    if (!settings.mpAccessToken || this.isPolling) return;
    this.isPolling = true;

    try {
      const url = 'https://api.mercadopago.com/v1/payments/search?sort=date_approved&criteria=desc&status=approved&limit=15';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${settings.mpAccessToken}` },
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, 'siteBridge: falha ao consultar pagamentos recentes no Mercado Pago');
        return;
      }

      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      const now = Date.now();
      const maxAgeMs = 24 * 60 * 60 * 1000; // só processa pagamentos das últimas 24h

      for (const p of results) {
        if (!p?.id || p.status !== 'approved' || p.payment_method_id !== 'pix') continue;
        const approvedMs = p.date_approved ? new Date(p.date_approved).getTime() : 0;
        if (approvedMs > 0 && now - approvedMs > maxAgeMs) continue;

        const md = p.metadata || {};
        // Extrai link de convite em qualquer campo de metadata ou descrição
        const rawLink = md.invite_link || md.invite_link_2 || md.invitelink || md.group_link || md.link || md.whatsapp_link || '';
        const hasInviteCode = Boolean(extractInviteCode(rawLink) || extractInviteCode(p.description));
        if (!hasInviteCode) continue;

        const id = String(p.id);
        const existing = siteOrders.get(id);
        if (existing && ['done', 'partial', 'rejected'].includes(existing.status)) continue;

        if (!existing) {
          siteOrders.upsert(id, { status: 'queued', groups: null });
        }
        this._enqueue(id);
      }
    } catch (err) {
      logger.warn({ err: err?.message || err }, 'siteBridge: erro no ciclo de polling do Mercado Pago');
    } finally {
      this.isPolling = false;
    }
  }

  _startServer() {
    const secret = settings.botInternalSecret || '';
    if (secret.length < 24) {
      logger.error('siteBridge NÃO iniciado: BOT_INTERNAL_SECRET ausente ou com menos de 24 caracteres.');
      return;
    }
    if (settings.siteVerifyPayment && !settings.mpAccessToken) {
      logger.error('siteBridge NÃO iniciado: defina MP_ACCESS_TOKEN (verificação independente do pagamento) ou SITE_VERIFY_PAYMENT=false.');
      return;
    }
    if (!settings.siteVerifyPayment) {
      logger.warn('siteBridge: verificação do pagamento no Mercado Pago DESATIVADA (inseguro).');
    }

    this.secretDigest = sha256(secret);

    this.server = http.createServer((req, res) => this._handle(req, res));
    this.server.headersTimeout = 10000;
    this.server.requestTimeout = 10000;
    this.server.keepAliveTimeout = 5000;
    this.server.maxHeadersCount = 50;
    this.server.listen(settings.siteBridgePort, settings.siteBridgeHost, () => {
      logger.info(`siteBridge ouvindo em ${settings.siteBridgeHost}:${settings.siteBridgePort}`);
    });
    this.server.unref();
  }

  // ---------------- HTTP ----------------

  _send(res, code, body) {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' });
    res.end(payload);
  }

  _limited(map, ip, cfg, record) {
    const now = Date.now();
    const arr = (map.get(ip) || []).filter((t) => now - t < cfg.windowMs);
    if (record) arr.push(now);
    map.set(ip, arr);
    if (map.size > 5000) map.clear();
    return arr.length >= cfg.max;
  }

  _authorized(req) {
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('Bearer ')) return false;
    return crypto.timingSafeEqual(sha256(h.slice(7)), this.secretDigest);
  }

  _handle(req, res) {
    const ip = req.socket.remoteAddress || 'unknown';

    if (req.method === 'GET' && req.url === '/site/health') return this._send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/site/activate') return this._send(res, 404, { error: 'not_found' });

    if (this._limited(this.fails, ip, AUTH_FAIL, false) || this._limited(this.hits, ip, RATE_LIMIT, true)) {
      return this._send(res, 429, { error: 'rate_limited' });
    }
    if (!this._authorized(req)) {
      this._limited(this.fails, ip, AUTH_FAIL, true);
      return this._send(res, 401, { error: 'unauthorized' });
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return this._send(res, 415, { error: 'unsupported_media_type' });
    }

    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.setHeader('Connection', 'close');
        res.once('finish', () => req.destroy());
        this._send(res, 413, { error: 'payload_too_large' });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch (_) {
        return this._send(res, 400, { error: 'invalid_json' });
      }
      // Do payload usamos SOMENTE o paymentId; todo o resto é lido do Mercado Pago.
      const paymentId = String(body?.paymentId || '');
      if (!/^\d{5,20}$/.test(paymentId)) return this._send(res, 400, { error: 'invalid_payment_id' });

      const existing = siteOrders.get(paymentId);
      if (existing && ['done', 'partial', 'rejected'].includes(existing.status)) {
        return this._send(res, 200, { duplicate: true });
      }
      if (!existing) siteOrders.upsert(paymentId, { status: 'queued', groups: null });
      this._enqueue(paymentId);
      return this._send(res, 202, { accepted: true });
    });
    req.on('error', () => {});
  }

  // ---------------- Fila sequencial ----------------

  _enqueue(paymentId) {
    if (this.queued.has(paymentId)) return;
    this.queued.add(paymentId);
    this.queue.push(paymentId);
    this._drain();
  }

  async _drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift();
        try {
          await this._process(id);
        } catch (err) {
          logger.error({ err: err.message, id }, 'siteBridge: erro ao processar pedido');
          siteOrders.upsert(id, { status: 'partial', error: String(err.message).slice(0, 200) });
          await this._notifyOwner(`⚠️ Erro ao processar o pedido ${id}: ${err.message}\nTrate manualmente.`);
        } finally {
          this.queued.delete(id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  // ---------------- Mercado Pago ----------------

  async _fetchPayment(id) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${settings.mpAccessToken}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`MP HTTP ${res.status}`);
    return res.json();
  }

  async _verify(id) {
    let lastErr;
    for (const wait of MP_RETRY_DELAYS) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        return await this._fetchPayment(id);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('MP indisponível');
  }

  // ---------------- Processamento ----------------

  _waitSocket() {
    return new Promise((resolve) => {
      const check = () => (this.sock?.user ? resolve(this.sock) : setTimeout(check, 5000));
      check();
    });
  }

  async _process(id) {
    let order = siteOrders.get(id);
    if (order && ['done', 'partial', 'rejected'].includes(order.status)) return;

    let planInfo;
    let meta;
    if (order?.groups && order.plan) {
      // retomada: dados já validados anteriormente
      planInfo = { plan: order.plan, days: order.days };
      meta = { name: order.name, phone: order.phone };
    } else {
      let payment;
      if (settings.siteVerifyPayment) {
        payment = await this._verify(id);
        if (payment.notFound || payment.status !== 'approved' || payment.payment_method_id !== 'pix') {
          siteOrders.upsert(id, { status: 'rejected', reason: payment.notFound ? 'not_found' : `status_${payment.status}` });
          await this._notifyOwner(`🚫 Pedido ${id} rejeitado (pagamento não aprovado no Mercado Pago).`);
          return;
        }
        planInfo = PLANS[payment.transaction_amount];
        if (!planInfo) {
          siteOrders.upsert(id, { status: 'rejected', reason: 'unknown_amount' });
          await this._notifyOwner(`🚫 Pedido ${id} rejeitado: valor R$ ${payment.transaction_amount} não corresponde a nenhum plano.`);
          return;
        }
      } else {
        // Modo inseguro (sem verificação): não aceita nada além do plano padrão
        planInfo = PLANS[32];
        payment = { metadata: {} };
      }

      const md = payment.metadata || {};
      const possibleLinks = [
        md.invite_link,
        md.invite_link_2,
        md.invitelink,
        md.group_link,
        md.link,
        md.whatsapp_link,
        payment.description
      ];
      const codes = [...new Set(possibleLinks.map(extractInviteCode).filter(Boolean))];

      let name = String(md.name || md.customer_name || md.client_name || payment.payer?.first_name || 'Cliente')
        .replace(/[\u0000-\u001F<>]/g, '')
        .slice(0, 80);
      const phone = String(md.phone || md.customer_phone || md.whatsapp || md.celular || payment.payer?.phone?.number || '')
        .replace(/\D/g, '')
        .slice(0, 15);

      // Se o nome recebido for genérico ('Cliente') ou vazio, busca no histórico de pedidos anteriores
      if (!name || name === 'Cliente') {
        const prev = siteOrders.findPreviousCustomer({ phone, codes });
        if (prev?.name) {
          name = prev.name;
        }
      }

      meta = { name, phone };

      if (codes.length === 0) {
        siteOrders.upsert(id, { status: 'partial', plan: planInfo.plan, days: planInfo.days, ...meta, groups: [], reason: 'no_valid_invite' });
        await this._notifyOwner(
          `⚠️ Pagamento Pix Aprovado no Mercado Pago, mas sem link de convite válido!\n\n` +
          `• Cliente: ${name}\n` +
          `• WhatsApp: https://wa.me/${phone} (${phone})\n` +
          `• Plano: ${planInfo.plan} (R$ ${payment?.transaction_amount || 0})\n` +
          `• ID Mercado Pago: ${id}\n\n` +
          `Entre em contato com o cliente ou libere manualmente via !liberar <link> <dias>.`
        );
        return;
      }
      order = siteOrders.upsert(id, {
        status: 'processing',
        plan: planInfo.plan,
        days: planInfo.days,
        ...meta,
        groups: codes.map((code) => ({ code, status: 'pending' }))
      });
    }

    const sock = await this._waitSocket();
    siteOrders.upsert(id, { status: 'processing' });

    // FLUXO 100% BLINDADO ANTI-BAN: O bot NUNCA executa groupAcceptInvite.
    // Ele consulta os metadados do grupo, registra a licença pendente e avisa o dono no Telegram com o link.
    // O dono clica no link pelo app oficial do WhatsApp e entra humanamente. O bot ativa os dias sozinho ao detectar a entrada!
    const configManager = require('../core/configManager');

    for (const g of order.groups) {
      let groupJid = null;
      let groupName = 'Grupo';

      // Consulta informações do convite sem forçar entrada (leitura pública oficial)
      try {
        const inviteInfo = await sock.groupGetInviteInfo(g.code);
        if (inviteInfo?.id) {
          groupJid = inviteInfo.id.endsWith('@g.us') ? inviteInfo.id : `${inviteInfo.id}@g.us`;
          groupName = inviteInfo.subject || 'Grupo';
        }
      } catch (err) {
        logger.warn({ err: err.message, code: g.code }, 'siteBridge: link de convite indisponível para consulta prévia');
      }

      // Se o bot já está dentro do grupo: RENOVAÇÃO AUTOMÁTICA IMEDIATA!
      const existing = groupJid ? configManager.getGroup(groupJid) : null;
      const isAlreadyInGroup = Boolean(existing && !existing.leftAt);

      if (isAlreadyInGroup) {
        configManager.ensureGroupStarterKit(groupJid, groupName, planInfo.days);
        const grp = configManager.getGroup(groupJid);
        if (grp) {
          grp.ownerName = meta.name;
          grp.ownerPhone = meta.phone;
          grp.autoLeave = true;
          grp.plan = planInfo.plan;
          grp.lastPaymentId = String(id);
          configManager.flushSync();
        }

        g.status = 'done';
        g.renewal = true;
        g.jid = groupJid;
        g.groupName = groupName;

        const planLabel = planInfo.plan === 'teste' ? 'Teste 7 dias' : 'Mensal 30 dias';
        const renewMsg =
          `🔁 *Renovação Aprovada & Licença Estendida!*\n\n` +
          `• Cliente: ${meta.name}\n` +
          `• WhatsApp: https://wa.me/${meta.phone} (${meta.phone})\n` +
          `• Grupo: "${groupName}"\n` +
          `• Plano: ${planLabel} (+${planInfo.days} dias adicionados)\n` +
          `• ID Mercado Pago: ${id}\n\n` +
          `✅ Licença estendida automaticamente no grupo existente.`;

        await this._notifyOwner(renewMsg);
      } else {
        // GRUPO NOVO: Registra a licença pendente e notifica o Dono com o link do Telegram!
        siteOrders.registerPendingGroup({
          paymentId: id,
          code: g.code,
          groupJid,
          groupName,
          days: planInfo.days,
          plan: planInfo.plan,
          ownerName: meta.name,
          ownerPhone: meta.phone
        });

        g.status = 'waiting_owner_join';
        g.jid = groupJid;
        g.groupName = groupName;

        const planLabel = planInfo.plan === 'teste' ? 'Teste (7 dias)' : 'Mensal (30 dias)';
        const paymentAmount = payment?.transaction_amount || (planInfo.plan === 'teste' ? 10 : 32);

        const newOrderMsg =
          `🛒 *Novo Pix Aprovado no Mercado Pago!*\n\n` +
          `• Cliente: ${meta.name}\n` +
          `• WhatsApp: https://wa.me/${meta.phone} (${meta.phone})\n` +
          `• Plano: *${planLabel}* — R$ ${paymentAmount}\n` +
          `• Grupo: "${groupName}"\n` +
          `• Link do Grupo: https://chat.whatsapp.com/${g.code}\n` +
          `• ID Pagamento: ${id}\n\n` +
          `👉 *AÇÃO NECESSÁRIA (100% Blindado Anti-Ban):*\n` +
          `1. Clique no link do grupo acima pelo seu celular e entre.\n` +
          `2. O Hermes reconhecerá sua entrada e ativará automaticamente os *${planInfo.days} dias*!\n` +
          `*(Zero comandos necessários no grupo, tudo automático ao entrar)*`;

        await this._notifyOwner(newOrderMsg);
      }
    }

    siteOrders.upsert(id, { groups: order.groups, name: meta.name, phone: meta.phone, plan: planInfo.plan, days: planInfo.days });
  }

  /**
   * Avisos ao dono SOMENTE via Telegram (zero tráfego extra no WhatsApp = menos risco de ban).
   * Reaproveita BACKUP_TELEGRAM_TOKEN / BACKUP_TELEGRAM_CHAT_ID. Sem configuração: apenas log.
   */

  /**
   * Notifica o Dono no Telegram quando o grupo for ativado com sucesso após a entrada manual
   */
  async notifyActivationSuccess({ groupName, groupJid, days, ownerName, ownerPhone }) {
    const text =
      `🎉 *Hermes Ativado com Sucesso!*\n\n` +
      `• Grupo: "${groupName || 'Grupo'}"\n` +
      `• Licença Ativada: *${days} dias*\n` +
      `• Cliente: ${ownerName || 'Cliente'}\n` +
      `• WhatsApp: https://wa.me/${ownerPhone} (${ownerPhone})\n\n` +
      `🛡️ O bot iniciou o monitoramento e o controle de validade com proteção Anti-Ban.`;
    await this._notifyOwner(text);
  }

  async _notifyOwner(text) {
    const token = settings.backupTelegramToken;
    const chatId = settings.backupTelegramChatId;
    if (!token || !chatId) {
      logger.warn({ text }, 'siteBridge: Telegram não configurado, aviso ao dono apenas em log');
      return;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) logger.warn({ status: res.status }, 'siteBridge: Telegram recusou o aviso');
    } catch (err) {
      logger.warn({ err: err.message }, 'siteBridge: falha ao avisar no Telegram');
    }
  }
}

module.exports = new SiteBridge();
