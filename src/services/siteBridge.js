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

/**
 * Resolve o plano e quantidade de dias com prioridade inteligente:
 * 1. Pedido específico 187419436876: intervenção do dono (Plano Mensal - 30 dias)
 * 2. Dias explícitos em metadata (days, dias, duration)
 * 3. Plano explícito em metadata (plan, plano, plan_name, type)
 * 4. Título ou descrição no Mercado Pago (description, items[0].title, items[0].description)
 * 5. Valor pago (amount / transaction_amount / total_paid_amount)
 * 6. Fallback seguro: Sempre Mensal (30 dias) - nunca rebaixa cliente pagante para 7 dias
 *
 * @param {object} param0
 * @returns {{ plan: string, days: number, label: string }}
 */
function resolvePlanInfo({ payment, amount, metadata, description, title, rawPlan, rawDays, orderId } = {}) {
  // Pedido 187419436876: intervenção direta solicitada pelo dono (30 dias garantidos)
  if (String(orderId) === '187419436876') {
    return { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
  }

  const md = metadata || payment?.metadata || {};
  const desc = String(description || payment?.description || '').toLowerCase();
  const itemTitle = String(title || payment?.additional_info?.items?.[0]?.title || '').toLowerCase();
  const itemDesc = String(payment?.additional_info?.items?.[0]?.description || '').toLowerCase();
  const extRef = String(payment?.external_reference || '').toLowerCase();
  const combinedText = `${desc} ${itemTitle} ${itemDesc} ${extRef}`;

  // 1. Dias explícitos em metadata ou argumentos
  const explicitDays = Number(rawDays || md.days || md.dias || md.duration || md.periodo || 0);
  if (explicitDays > 0) {
    if (explicitDays >= 25) {
      return { plan: 'mensal', days: explicitDays, label: `Mensal (${explicitDays} dias)` };
    }
    if (explicitDays <= 15) {
      return { plan: 'teste', days: explicitDays, label: `Teste (${explicitDays} dias)` };
    }
    return { plan: explicitDays >= 20 ? 'mensal' : 'teste', days: explicitDays, label: `${explicitDays} dias` };
  }

  // 2. Metadados do checkout / webhook
  const planStr = String(rawPlan || md.plan || md.plano || md.plan_id || md.plan_name || md.type || md.tipo || '').toLowerCase();
  if (planStr.includes('mensal') || planStr.includes('month') || planStr.includes('30') || planStr.includes('pro') || planStr.includes('padrao')) {
    return { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
  }
  if (planStr.includes('trimestral') || planStr.includes('90')) {
    return { plan: 'trimestral', days: 90, label: 'Trimestral (90 dias)' };
  }
  if (planStr.includes('anual') || planStr.includes('yearly') || planStr.includes('365')) {
    return { plan: 'anual', days: 365, label: 'Anual (365 dias)' };
  }
  if (planStr.includes('teste') || planStr.includes('trial') || planStr.includes('test') || planStr === '7') {
    return { plan: 'teste', days: 7, label: 'Teste (7 dias)' };
  }

  // 3. Título e descrição do produto no Mercado Pago
  if (combinedText.includes('mensal') || combinedText.includes('30 dias') || combinedText.includes('30d') || combinedText.includes('1 mes') || combinedText.includes('1 mês')) {
    return { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
  }
  if (combinedText.includes('trimestral') || combinedText.includes('90 dias')) {
    return { plan: 'trimestral', days: 90, label: 'Trimestral (90 dias)' };
  }
  if (combinedText.includes('teste') || combinedText.includes('7 dias') || combinedText.includes('7d') || combinedText.includes('trial')) {
    return { plan: 'teste', days: 7, label: 'Teste (7 dias)' };
  }

  // 4. Valor financeiro
  const val = Number(amount || payment?.transaction_amount || payment?.total_paid_amount || 0);
  if (val >= 25) {
    return { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
  }
  // Somente se for estritamente em torno de R$ 10 E sem nenhuma menção a mensal
  if (val >= 8 && val <= 15) {
    return { plan: 'teste', days: 7, label: 'Teste (7 dias)' };
  }

  // 5. Fallback seguro: Sempre Mensal (30 dias)
  return { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
}

/**
 * Função de conveniência retrocompatível
 */
function resolvePlan(amount, opts = {}) {
  if (typeof amount === 'object' && amount !== null) {
    return resolvePlanInfo(amount);
  }
  return resolvePlanInfo({ amount, ...opts });
}

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

    // Tratamento e recuperação automática do pedido 187419436876 (Plano Mensal - 30 dias)
    this._ensureOrder187419436876();

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
   * Garante que o pedido 187419436876 esteja configurado com 30 dias (Plano Mensal),
   * registrado com segurança sem repetições nem loops de mensagens.
   */
  _ensureOrder187419436876() {
    const id = '187419436876';
    const existing = siteOrders.get(id);
    if (existing) {
      existing.plan = 'mensal';
      existing.days = 30;
      existing.status = 'waiting_owner_join';
      existing.notified = true; // Impede qualquer disparo repetido
      existing.retry = false;
      delete existing.error;
      delete existing.reason;
      if (Array.isArray(existing.groups)) {
        for (const g of existing.groups) {
          g.plan = 'mensal';
          g.days = 30;
          g.status = 'waiting_owner_join';
          g.notified = true;
        }
      }
      siteOrders.upsert(id, existing);
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
        if (!p?.id || p.status !== 'approved') continue;
        const approvedMs = new Date(p.date_approved || p.date_created || 0).getTime();
        if (approvedMs > 0 && now - approvedMs > maxAgeMs) continue;

        const md = p.metadata || {};
        // Extrai link de convite em qualquer campo de metadata, itens ou descrição
        const rawLink = md.invite_link || md.invite_link_2 || md.invitelink || md.group_link || md.link || md.whatsapp_link || '';
        const itemDesc = p.additional_info?.items?.[0]?.description || '';
        const hasInviteCode = Boolean(
          extractInviteCode(rawLink) ||
          extractInviteCode(p.description) ||
          extractInviteCode(itemDesc) ||
          extractInviteCode(p.external_reference)
        );
        if (!hasInviteCode) continue;

        const id = String(p.id);
        const existing = siteOrders.get(id);

        // Se o pedido já foi registrado e notificado, ou já está concluído/aguardando entrada: NUNCA re-enfileirar!
        if (existing) {
          if (existing.notified && !existing.retry) continue;
          if (['done', 'waiting_owner_join', 'partial', 'rejected'].includes(existing.status) && !existing.retry) continue;
        }

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
    const id = String(paymentId);
    if (this.queued.has(id)) return;
    const existing = siteOrders.get(id);
    if (existing && (existing.notified || ['done', 'waiting_owner_join', 'rejected'].includes(existing.status)) && !existing.retry) {
      return;
    }
    this.queued.add(id);
    this.queue.push(id);
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
          siteOrders.upsert(id, { status: 'error', error: String(err.message).slice(0, 200) });
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

  async _process(id, options = {}) {
    let order = siteOrders.get(id);
    const force = Boolean(options.force || order?.retry);
    if (order && (order.notified || ['done', 'waiting_owner_join', 'rejected'].includes(order.status)) && !force) return;
    if (order && order.status === 'partial' && order.reason === 'no_valid_invite' && !force && !order.error) return;

    let planInfo = null;
    let meta = null;
    let payment = null;

    const isSpecialOrder = String(id) === '187419436876';

    if (order?.groups && order.plan && !force) {
      // retomada: dados já validados anteriormente
      const days = isSpecialOrder ? 30 : (order.days || 30);
      const plan = isSpecialOrder ? 'mensal' : (order.plan || 'mensal');
      planInfo = { plan, days, label: plan === 'teste' ? 'Teste (7 dias)' : `Mensal (${days} dias)` };
      meta = { name: order.name || 'Cliente', phone: order.phone || '' };
    } else {
      if (settings.siteVerifyPayment) {
        payment = await this._verify(id);
        if (payment.notFound || payment.status !== 'approved') {
          siteOrders.upsert(id, { status: 'rejected', reason: payment.notFound ? 'not_found' : `status_${payment.status}` });
          await this._notifyOwner(`🚫 Pedido ${id} rejeitado (pagamento não aprovado no Mercado Pago).`);
          return;
        }
        planInfo = isSpecialOrder ? { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' } : resolvePlanInfo({ payment, orderId: id });
      } else {
        // Modo inseguro (sem verificação): não aceita nada além do plano padrão
        planInfo = { plan: 'mensal', days: 30, label: 'Mensal (30 dias)' };
        payment = { metadata: {} };
      }

      const md = payment?.metadata || {};
      const possibleLinks = [
        md.invite_link,
        md.invite_link_2,
        md.invitelink,
        md.group_link,
        md.link,
        md.whatsapp_link,
        payment?.description,
        payment?.additional_info?.items?.[0]?.description,
        payment?.external_reference
      ];
      const codes = [...new Set(possibleLinks.map(extractInviteCode).filter(Boolean))];

      let name = String(md.name || md.customer_name || md.client_name || payment?.payer?.first_name || 'Cliente')
        .replace(/[\u0000-\u001F<>]/g, '')
        .slice(0, 80);
      const phone = String(md.phone || md.customer_phone || md.whatsapp || md.celular || payment?.payer?.phone?.number || '')
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
        const amount = payment?.transaction_amount || order?.amount || (planInfo.days === 30 ? 32 : 10);
        siteOrders.upsert(id, { status: 'partial', plan: planInfo.plan, days: planInfo.days, amount, ...meta, groups: [], reason: 'no_valid_invite' });
        await this._notifyOwner(
          `⚠️ Pagamento Pix Aprovado no Mercado Pago, mas sem link de convite válido!\n\n` +
          `• Cliente: ${name}\n` +
          `• WhatsApp: https://wa.me/${phone} (${phone})\n` +
          `• Plano: ${planInfo.label} (R$ ${amount})\n` +
          `• ID Mercado Pago: ${id}\n\n` +
          `Entre em contato com o cliente ou libere manualmente via !liberar <link> <dias>.`
        );
        return;
      }

      const amount = payment?.transaction_amount || order?.amount || (planInfo.days === 30 ? 32 : 10);
      order = siteOrders.upsert(id, {
        status: 'processing',
        plan: planInfo.plan,
        days: planInfo.days,
        amount,
        ...meta,
        groups: codes.map((code) => ({ code, status: 'pending', days: planInfo.days, plan: planInfo.plan }))
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
        g.days = planInfo.days;
        g.plan = planInfo.plan;

        const planLabel = planInfo.plan === 'teste' ? 'Teste (7 dias)' : `Mensal (${planInfo.days} dias)`;
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
        g.days = planInfo.days;
        g.plan = planInfo.plan;

        const planLabel = planInfo.plan === 'teste' ? 'Teste (7 dias)' : `Mensal (${planInfo.days} dias)`;
        const paymentAmount = payment?.transaction_amount || order?.amount || (planInfo.days === 30 ? 32 : 10);

        const newOrderMsg =
          `🛒 *Novo Pix Aprovado no Mercado Pago!*\n\n` +
          `• Cliente: ${meta.name}\n` +
          `• WhatsApp: https://wa.me/${meta.phone} (${meta.phone})\n` +
          `• Plano: *${planLabel}* — R$ ${paymentAmount}\n` +
          `• Grupo: "${groupName}"\n` +
          `• Link do Grupo: https://chat.whatsapp.com/${g.code}\n` +
          `• ID Pagamento: ${id}`;

        await this._notifyOwner(newOrderMsg);
      }
    }

    const allDone = order.groups.every(g => g.status === 'done');
    const finalStatus = allDone ? 'done' : 'waiting_owner_join';

    siteOrders.upsert(id, {
      status: finalStatus,
      notified: true,
      groups: order.groups,
      name: meta.name,
      phone: meta.phone,
      plan: planInfo.plan,
      days: planInfo.days,
      amount: payment?.transaction_amount || order?.amount || (planInfo.days === 30 ? 32 : 10),
      retry: false
    });
  }

  /**
   * Força o reprocessamento manual de um pedido pelo ID do Mercado Pago.
   * @param {string} id 
   * @param {number} [days] 
   */
  async reprocessOrder(id, days = null) {
    const existing = siteOrders.get(id);
    const targetDays = (days && Number(days) > 0) ? Number(days) : (String(id) === '187419436876' ? 30 : null);

    if (!existing) {
      siteOrders.upsert(id, {
        status: 'queued',
        days: targetDays || 30,
        plan: (targetDays && targetDays < 20) ? 'teste' : 'mensal',
        retry: true
      });
      this._enqueue(id);
      return { ok: true, queued: true };
    }

    if (targetDays) {
      existing.days = targetDays;
      existing.plan = targetDays < 20 ? 'teste' : 'mensal';
      if (Array.isArray(existing.groups)) {
        for (const g of existing.groups) {
          g.days = targetDays;
          g.plan = existing.plan;
          if (g.status === 'partial' || g.status === 'error' || g.status === 'done') {
            g.status = 'pending';
          }
        }
      }
    }

    delete existing.error;
    delete existing.reason;
    existing.status = 'queued';
    existing.retry = true;
    siteOrders.upsert(id, existing);
    this._enqueue(id);
    return { ok: true, order: existing };
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
    let sentViaTelegram = false;

    if (token && chatId) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500), disable_web_page_preview: true }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          sentViaTelegram = true;
        } else {
          logger.warn({ status: res.status }, 'siteBridge: Telegram recusou o aviso');
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'siteBridge: falha ao avisar no Telegram');
      }
    } else {
      logger.warn({ text }, 'siteBridge: Telegram não configurado no .env');
    }

    // Fallback de Emergência: se o Telegram não foi enviado (ou não configurado),
    // e o dono possui número configurado no WhatsApp (OWNER_NUMBER), envia no WhatsApp do Dono!
    if (!sentViaTelegram && settings.ownerNumber && this.sock?.user) {
      try {
        const ownerJid = `${settings.ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`;
        const { sendSafeMessage } = require('../utils/antiBan');
        await sendSafeMessage(this.sock, ownerJid, text);
        logger.info({ ownerJid }, 'siteBridge: aviso de compra enviado com sucesso ao Dono no WhatsApp');
      } catch (waErr) {
        logger.warn({ err: waErr.message }, 'siteBridge: falha no fallback de aviso ao Dono no WhatsApp');
      }
    }
  }
}

const instance = new SiteBridge();
instance.resolvePlanInfo = resolvePlanInfo;
instance.resolvePlan = resolvePlan;
module.exports = instance;
