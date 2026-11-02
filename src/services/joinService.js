const configManager = require('../core/configManager');
const settings = require('../config/settings');
const { sendSafeMessage, randomDelay } = require('../utils/antiBan');
const { groupCache } = require('../utils/cache');
const { t } = require('../utils/i18n');
const logger = require('../utils/logger');

const INVITE_RE = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{18,26})/i;

/** Extrai o código de convite de um link do WhatsApp (ou null). */
function extractInviteCode(input) {
  if (!input || typeof input !== 'string') return null;
  const m = input.trim().match(INVITE_RE);
  return m ? m[1] : null;
}

function normalizeGroupJid(id) {
  if (!id) return null;
  return String(id).endsWith('@g.us') ? String(id) : `${id}@g.us`;
}

function renewalUrl(inviteCode = null, extra = {}) {
  // Abre o modal do site já em modo "Renovar" (normaliza barras e pré-preenche o grupo se disponível)
  if (settings.siteUrl) {
    const base = settings.siteUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    const cleanCode = (inviteCode || '').replace(/.*chat\.whatsapp\.com\/(?:invite\/)?/, '').trim();
    let query = '?renovar=1';
    if (cleanCode) query += `&grupo=${cleanCode}`;
    if (extra.name && extra.name !== 'Cliente') query += `&nome=${encodeURIComponent(extra.name)}`;
    if (extra.phone) query += `&tel=${encodeURIComponent(extra.phone)}`;
    return `${base}/${query}`;
  }
  return settings.ownerNumber ? `https://wa.me/${settings.ownerNumber}` : '';
}

/**
 * Entra no grupo pelo convite e aplica/soma a licença.
 * - Grupo novo: entra, aplica Starter Kit e envia apresentação.
 * - Grupo já licenciado (renovação): apenas soma dias (preserva TODAS as configs) e agradece.
 * - Grupo banido pelo dono: NUNCA é liberado automaticamente (vai para revisão manual).
 *
 * @returns {Promise<{ok:boolean, reason?:string, jid?:string, name?:string, renewal?:boolean, expiresAt?:number|null}>}
 */
async function joinAndLicense(sock, { inviteCode, days, plan, ownerName, ownerPhone, paymentId }) {
  if (!sock?.user) return { ok: false, reason: 'bot_offline' };
  if (!inviteCode || !Number.isFinite(days) || days <= 0) return { ok: false, reason: 'invalid_input' };

  // 1. Valida o convite antes de qualquer ação
  let info;
  try {
    info = await sock.groupGetInviteInfo(inviteCode);
  } catch (err) {
    logger.warn({ err: err.message }, 'joinService: convite inválido/expirado');
    return { ok: false, reason: 'invalid_link' };
  }
  const jid = normalizeGroupJid(info?.id);
  if (!jid) return { ok: false, reason: 'invalid_link' };

  if (configManager.isGroupBanned(jid)) return { ok: false, reason: 'banned_group', jid };

  const existing = configManager.getGroup(jid);
  const wasLicensed = Boolean(existing && !existing.leftAt);

  // 2. Entra no grupo (tolera "já estou no grupo")
  let joined = false;
  try {
    const res = await sock.groupAcceptInvite(inviteCode);
    joined = Boolean(res);
  } catch (err) {
    logger.warn({ err: err.message }, 'joinService: groupAcceptInvite retornou erro (pode já estar no grupo)');
  }

  // 3. Confirma participação de fato (grupos com aprovação de admin ficam pendentes)
  await new Promise((r) => setTimeout(r, 2000));
  let meta = null;
  try {
    meta = await sock.groupMetadata(jid);
  } catch (_) {}
  if (!meta || !Array.isArray(meta.participants)) {
    return { ok: false, reason: joined ? 'meta_unavailable' : 'pending_approval', jid };
  }
  groupCache.set(jid, meta);
  const name = meta.subject || info.subject || 'Grupo';

  // 4. Licença (soma dias apenas se for renovação mensal real; se for teste ou compra nova, força vigência exata)
  const isRealRenewal = Boolean(existing && existing.lastPaymentId && !existing.leftAt && plan === 'mensal');
  const { group, shouldSendWelcome } = configManager.ensureGroupStarterKit(jid, name, isRealRenewal ? days : null);

  if (!isRealRenewal) {
    // Nova assinatura (ex: teste de 7 dias): FORÇA a vigência exata comprada, sem herdar 30 dias padrão do Baileys
    configManager.setGroupExpiry(jid, Date.now() + days * 24 * 60 * 60 * 1000);
  }

  group.autoLeave = true; // habilita a saída automática (carência) somente para grupos vendidos
  group.plan = plan;

  // Preserva o nome real do cliente anterior se a renovação veio sem nome ou como "Cliente"
  const validOwnerName = (ownerName && ownerName !== 'Cliente') ? ownerName : (group.ownerName || '');
  const validOwnerPhone = ownerPhone || group.ownerPhone || '';
  group.ownerName = validOwnerName;
  group.ownerPhone = validOwnerPhone;
  group.lastPaymentId = String(paymentId);
  configManager.flushSync();

  // 5. Mensagem no grupo (pausa humana de 5-15s após entrar: evita falar no mesmo instante do join)
  try {
    await randomDelay(5000, 15000);
    const lang = group.lang || 'pt';
    if (wasLicensed) {
      const expiry = group.expiresAt ? new Date(group.expiresAt).toLocaleDateString('pt-BR') : '∞';
      await sendSafeMessage(sock, jid, { text: t(lang, 'saas.site_renewed', { expiry }) });
    } else if (shouldSendWelcome) {
      const prefix = configManager.getGroupPrefix(jid) || '!';
      await sendSafeMessage(sock, jid, { text: t(lang, 'saas.group_presentation', { prefix }) });
      configManager.markWelcomeSent(jid, true);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'joinService: falha ao enviar mensagem de boas-vindas');
  }

  return {
    ok: true,
    jid,
    name,
    renewal: wasLicensed,
    expiresAt: group.expiresAt,
    ownerName: validOwnerName,
    ownerPhone: validOwnerPhone
  };
}

module.exports = { joinAndLicense, extractInviteCode, renewalUrl };
