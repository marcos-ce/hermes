const settings = require('../config/settings');

const INVITE_RE = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{18,26})/i;

/** Extrai o código de convite de um link do WhatsApp (ou null). */
function extractInviteCode(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  const m = clean.match(INVITE_RE);
  if (m) return m[1];
  // Suporte resiliente a código alfanumérico direto (18 a 26 chars)
  if (/^[A-Za-z0-9_-]{18,26}$/.test(clean)) {
    return clean;
  }
  return null;
}

function normalizeGroupJid(id) {
  if (!id) return null;
  return String(id).endsWith('@g.us') ? String(id) : `${id}@g.us`;
}

function renewalUrl(inviteCode = null, extra = {}) {
  // Abre o modal do site já em modo "Renovar" (normaliza barras e pré-preenche o grupo se disponível)
  if (settings.siteUrl) {
    const base = settings.siteUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    const cleanCode = (inviteCode || '')
      .replace(/.*chat\.whatsapp\.com\/(?:invite\/)?/, '')
      .replace(/[?#].*$/, '')
      .trim();
    let query = '?renovar=1';
    if (cleanCode) query += `&grupo=${encodeURIComponent(cleanCode)}`;
    if (extra.name && extra.name !== 'Cliente') query += `&nome=${encodeURIComponent(extra.name)}`;
    if (extra.phone) query += `&tel=${encodeURIComponent(extra.phone)}`;
    return `${base}/${query}`;
  }

  // Fallback amigável para o WhatsApp do Dono com mensagem pré-formatada para o cliente
  if (settings.ownerNumber) {
    const cleanOwner = settings.ownerNumber.replace(/\D/g, '');
    const groupRef = extra.name && extra.name !== 'Cliente' ? ` para o grupo "${extra.name}"` : '';
    const textMsg = encodeURIComponent(`Olá! Gostaria de renovar a assinatura do Hermes${groupRef}.`);
    return `https://wa.me/${cleanOwner}?text=${textMsg}`;
  }

  return '';
}

module.exports = { extractInviteCode, normalizeGroupJid, renewalUrl };
