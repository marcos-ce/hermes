const http = require('http');
const crypto = require('crypto');
const settings = require('../config/settings');
const siteOrders = require('./siteOrders');
const { joinAndLicense, extractInviteCode } = require('./joinService');
const { randomDelay } = require('../utils/antiBan');
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

    // 1. Recuperação após crash/restart: reprocessa pedidos que ficaram no meio
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

  /**
   * Inicia busca ativa (polling) periódica por novos pagamentos Pix aprovados no Mercado Pago.
   * Não exige abertura de portas, túneis ou IPs públicos: funciona nativamente na Discloud.
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
        // Só processa pagamentos do Hermes que tenham link de convite de grupo
        if (!md.invite_link && !md.invite_link_2) continue;

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

  /**
   * Teto de entradas em grupos (hora/dia). Excedente FICA NA FILA e entra assim que abrir vaga.
   * Os tempos de tentativa são persistidos, então o teto sobrevive a reinícios.
   */
  async _waitJoinSlot(id) {
    let notified = false;
    for (;;) {
      const now = Date.now();
      const stamps = siteOrders.attemptTimestamps();
      const lastHour = stamps.filter((t) => now - t < 60 * 60 * 1000).length;
      const lastDay = stamps.filter((t) => now - t < 24 * 60 * 60 * 1000).length;
      if (lastHour < settings.siteMaxJoinsPerHour && lastDay < settings.siteMaxJoinsPerDay) return;
      if (!notified) {
        notified = true;
        await this._notifyOwner(
          `⏳ Pedido ${id} na fila: teto de entradas atingido (${lastHour}/${settings.siteMaxJoinsPerHour} na última hora, ${lastDay}/${settings.siteMaxJoinsPerDay} no dia). Entra automaticamente quando abrir vaga.`
        );
      }
      await new Promise((r) => setTimeout(r, 60 * 1000));
    }
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
      const codes = [...new Set([extractInviteCode(md.invite_link), extractInviteCode(md.invite_link_2)].filter(Boolean))];
      let name = String(md.name || 'Cliente').replace(/[\u0000-\u001F<>]/g, '').slice(0, 80);
      const phone = String(md.phone || '').replace(/\D/g, '').slice(0, 15);

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

    let first = true;
    for (const g of order.groups) {
      if (g.status !== 'pending') continue;
      await this._waitJoinSlot(id);
      if (!first) await randomDelay(20000, 60000); // anti-ban entre entradas
      first = false;

      // Marca antes de agir: se o processo cair, NÃO soma dias duas vezes
      g.status = 'attempting';
      g.attemptedAt = Date.now();
      siteOrders.upsert(id, { groups: order.groups });

      let result;
      try {
        result = await joinAndLicense(sock, {
          inviteCode: g.code,
          days: planInfo.days,
          plan: planInfo.plan,
          ownerName: meta.name,
          ownerPhone: meta.phone,
          paymentId: id
        });
      } catch (err) {
        result = { ok: false, reason: 'exception', error: err.message };
      }
      g.status = result.ok ? 'done' : 'manual';
      g.renewal = Boolean(result.renewal);
      if (result.renewal) g.attemptedAt = null; // renovação não é entrada nova: não conta no teto
      g.jid = result.jid;
      g.reason = result.reason;
      g.groupName = result.name;
      // Se joinAndLicense descobriu um ownerName já salvo no grupo, atualiza o meta.name
      if (result.ownerName && result.ownerName !== 'Cliente' && (!meta.name || meta.name === 'Cliente')) {
        meta.name = result.ownerName;
      }
      siteOrders.upsert(id, { groups: order.groups });
    }

    // grupos que ficaram "attempting" por crash anterior exigem revisão manual (nunca reaplicar às cegas)
    for (const g of order.groups) if (g.status === 'attempting') g.status = 'manual';

    const allDone = order.groups.every((g) => g.status === 'done');
    siteOrders.upsert(id, { status: allDone ? 'done' : 'partial', groups: order.groups, name: meta.name });

    const isRenewal = order.groups.some((g) => g.renewal);
    const title = isRenewal
      ? '✅ Renovação Aprovada & Licença Estendida — Hermes.wpp'
      : '✅ Novo Pix Aprovado & Bot Ativado — Hermes.wpp';

    const groupDetails = order.groups.map((g, idx) => {
      const gLabel = order.groups.length > 1 ? `Grupo ${idx + 1}` : 'Grupo';
      if (g.status === 'done') {
        const actionText = g.renewal ? '🔁 Licença renovada' : '🟢 Bot entrou e ativou';
        return `• ${gLabel}: "${g.groupName || 'Grupo'}"\n  Status: ${actionText} (+${planInfo.days} dias adicionados)`;
      } else {
        return `• ${gLabel}: https://chat.whatsapp.com/${g.code}\n  Status: ❌ Falha (${g.reason || 'revisar'})`;
      }
    }).join('\n');

    const paymentAmount = payment?.transaction_amount || (planInfo.plan === 'teste' ? 10 : 32);
    const planLabel = planInfo.plan === 'teste' ? 'Teste de 7 Dias' : 'Mensal';

    const msg =
      `${title}\n\n` +
      `• Cliente: ${meta.name}\n` +
      `• Plano: ${planLabel} (R$ ${paymentAmount})\n` +
      `• WhatsApp: https://wa.me/${meta.phone} (${meta.phone})\n` +
      `${groupDetails}\n` +
      `• ID Mercado Pago: ${id}` +
      (allDone ? '' : '\n\n⚠️ Atenção: Falha em grupo(s). Trate manualmente com !liberar <link> <dias>.');

    await this._notifyOwner(msg);
  }

  /**
   * Avisos ao dono SOMENTE via Telegram (zero tráfego extra no WhatsApp = menos risco de ban).
   * Reaproveita BACKUP_TELEGRAM_TOKEN / BACKUP_TELEGRAM_CHAT_ID. Sem configuração: apenas log.
   */
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
