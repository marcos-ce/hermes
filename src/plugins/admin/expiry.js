const configManager = require('../../core/configManager');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const { resolveTarget } = require('../../utils/jidResolver');
const logger = require('../../utils/logger');

/**
 * Plugin de Expiração Automática
 *
 * Responsabilidades:
 *  1. Mute temporário: o mutemember.js já registra `until` mas não avisa quando expira.
 *     Este plugin notifica o grupo silenciosamente quando um mute expira (opcional).
 *
 *  2. Blacklist temporária: `!blacklist add @user 2h` adiciona à blacklist com tempo de expiração.
 *     Ao expirar, o membro é removido da blacklist automaticamente.
 *     O comando `!bltemp add @user 2h` é o alias desta feature.
 *
 * Arquitetura: usa `tempBlacklist` como campo no groups.json (objeto { jid: expiresAt }).
 * Zero modificação em configManager, blacklist.js ou groupHandler.js.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDuration(str) {
  if (!str) return null;
  const raw = String(str).toLowerCase().trim();
  const match = raw.match(/^(\d+)\s*(m|min|mins|minuto|minutos|h|hr|hrs|hora|horas|d|dia|dias)?$/i);
  if (!match) return null;

  const val = parseInt(match[1], 10);
  if (isNaN(val) || val <= 0) return null;
  const unit = (match[2] || 'h').toLowerCase();
  let ms;

  if (['m', 'min', 'mins', 'minuto', 'minutos'].includes(unit)) ms = val * 60 * 1000;
  else if (['h', 'hr', 'hrs', 'hora', 'horas'].includes(unit)) ms = val * 60 * 60 * 1000;
  else if (['d', 'dia', 'dias'].includes(unit)) ms = val * 24 * 60 * 60 * 1000;
  else ms = val * 60 * 60 * 1000;

  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const formatted = hours > 0
    ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
    : `${mins}m`;

  return { ms, formatted };
}

function getTempBlacklist(groupJid) {
  const group = configManager.getGroup(groupJid);
  if (!group) return {};
  if (!group.tempBlacklist) group.tempBlacklist = {};
  return group.tempBlacklist;
}

function addTempBlacklist(groupJid, jid, expiresAt) {
  const group = configManager.getOrCreateGroup
    ? configManager.getOrCreateGroup(groupJid)
    : configManager.getGroup(groupJid);
  if (!group) return;
  if (!group.tempBlacklist) group.tempBlacklist = {};
  const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
  const key = `${clean}@s.whatsapp.net`;
  group.tempBlacklist[key] = expiresAt;
  configManager.addGroupBlacklist(groupJid, key); // adiciona à BL permanente
  configManager.scheduleSave();
}

function removeTempBlacklist(groupJid, jid) {
  const group = configManager.getGroup(groupJid);
  if (!group || !group.tempBlacklist) return;
  const clean = jid.replace(/@.*$/, '').replace(/\D/g, '');
  const key = `${clean}@s.whatsapp.net`;
  delete group.tempBlacklist[key];
  configManager.removeGroupBlacklist(groupJid, key); // remove da BL permanente
  configManager.scheduleSave();
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

module.exports = {
  name: 'expiry',
  aliases: ['expiry', 'bltemp', 'blacklisttemp', 'bltmp', 'listanegratemp', 'tempbl'],
  description: 'Blacklist temporária com expiração automática e notificação de fim de mute',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 60,

  configSchema: {
    title: {
      pt: 'Expiração Automática',
      es: 'Expiración Automática',
      en: 'Auto Expiry'
    },
    description: {
      pt: 'Gerencia blacklist temporária e notificações de expiração de mute',
      es: 'Gestiona blacklist temporal y notificaciones de expiración de silenciamiento',
      en: 'Manages temporary blacklist and mute expiry notifications'
    },
    fields: [
      {
        name: 'notifyMuteExpiry',
        type: 'boolean',
        question: {
          pt: 'Notificar no grupo quando o silenciamento de um membro expirar? (sim/não):',
          es: '¿Notificar en el grupo cuando expire el silenciamiento de un miembro? (sí/no):',
          en: 'Notify the group when a member\'s mute expires? (yes/no):'
        },
        default: false
      }
    ]
  },

  /**
   * Scheduler: a cada tick (60s), verifica expirações de mute e blacklist temporária.
   * Roda independente de enabled — a limpeza é sempre necessária para consistência de dados.
   */
  async onSchedule({ sock, groupJid, group, config, queueTask }) {
    const cfg = config || {};
    const now = Date.now();
    const lang = group?.lang || 'pt';

    // ── 1. Expirar mutes ────────────────────────────────────────────────────
    const mutedMembers = group?.mutedMembers || {};
    const expiredMutes = [];

    for (const [jid, data] of Object.entries(mutedMembers)) {
      if (data.until && now > data.until) {
        expiredMutes.push({ jid, data });
      }
    }

    if (expiredMutes.length > 0 && cfg.notifyMuteExpiry) {
      for (const { jid } of expiredMutes) {
        const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
        // O isMemberMuted do configManager já limpa automaticamente ao verificar
        // mas aqui notificamos antes de deixar ele limpar no próximo acesso
        queueTask({
          run: async () => {
            try {
              await sendSafeMessage(sock, groupJid, {
                text: t(lang, 'expiry.mute_expired', { user: num }),
                mentions: [jid]
              });
              configManager.unmuteMember(groupJid, jid);
            } catch (err) {
              logger.warn({ err, groupJid, jid }, '[expiry] Falha ao notificar fim de mute');
            }
          }
        });
      }
    } else if (expiredMutes.length > 0) {
      // Silencioso: apenas limpa sem notificar
      for (const { jid } of expiredMutes) {
        configManager.unmuteMember(groupJid, jid);
      }
    }

    // ── 2. Expirar blacklist temporária ─────────────────────────────────────
    const tempBL = getTempBlacklist(groupJid);
    const expiredBL = [];

    for (const [jid, expiresAt] of Object.entries(tempBL)) {
      if (now > expiresAt) {
        expiredBL.push(jid);
      }
    }

    for (const jid of expiredBL) {
      removeTempBlacklist(groupJid, jid);
      const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
      logger.info({ groupJid, jid }, '[expiry] Blacklist temporária expirada e removida');

      if (cfg.notifyMuteExpiry) {
        queueTask({
          run: async () => {
            try {
              await sendSafeMessage(sock, groupJid, {
                text: t(lang, 'expiry.blacklist_expired', { user: num }),
                mentions: [jid]
              });
            } catch (err) {
              logger.warn({ err, groupJid, jid }, '[expiry] Falha ao notificar fim de blacklist temp');
            }
          }
        });
      }
    }
  },

  async execute({ sock, msg, from, sender, args, reply, t: translate, lang, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();

    // !bltemp add @user 2h [motivo]
    if (sub === 'add' || sub === 'adicionar') {
      // Detecta duração: pode vir em qualquer posição após o alvo
      // Ex: !bltemp add @user 2h, !bltemp add @user motivo 24h
      const rawArgs = args.slice(1);

      // Extrai duração (último token que parece duração)
      let duration = null;
      let durationIdx = -1;
      for (let i = rawArgs.length - 1; i >= 0; i--) {
        const parsed = parseDuration(rawArgs[i]);
        if (parsed) { duration = parsed; durationIdx = i; break; }
      }

      if (!duration) {
        return reply('⚠️ Informe a duração. Ex: `!bltemp add @user 24h` ou `!bltemp add @user 2h spam`');
      }

      // Target: tudo exceto a duração
      const withoutDuration = rawArgs.filter((_, i) => i !== durationIdx);
      const targetText = withoutDuration.join(' ');
      const targetData = await resolveTarget(sock, msg, from, targetText);
      if (!targetData) return reply(translate('common.not_found_target'));

      const expiresAt = Date.now() + duration.ms;
      addTempBlacklist(from, targetData.phoneJid, expiresAt);

      return reply(
        t(lang, 'expiry.blacklist_added', { user: targetData.displayNum, duration: duration.formatted }),
        { mentions: [targetData.groupJid, targetData.phoneJid] }
      );
    }

    // !bltemp del @user — remove antes de expirar
    if (sub === 'del' || sub === 'remover' || sub === 'rm') {
      const targetText = args.slice(1).join(' ');
      const targetData = await resolveTarget(sock, msg, from, targetText);
      if (!targetData) return reply(translate('common.not_found_target'));

      removeTempBlacklist(from, targetData.phoneJid);
      return reply(t(lang, 'expiry.blacklist_removed', { user: targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    }

    // !bltemp list
    if (sub === 'list' || sub === 'listar' || sub === 'lista') {
      const tempBL = getTempBlacklist(from);
      const entries = Object.entries(tempBL);
      if (entries.length === 0) return reply(t(lang, 'expiry.blacklist_empty'));

      const now = Date.now();
      let text = `🕐 *Blacklist Temporária:*\n\n`;
      for (const [jid, expiresAt] of entries) {
        const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
        const remaining = Math.max(0, expiresAt - now);
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        text += `• @${num} — expira em *${timeStr}*\n`;
      }
      const mentions = entries.map(([jid]) => jid);
      return reply(text.trim(), { mentions });
    }

    // Status / ajuda
    const cfg = configManager.getPluginConfig(from, 'expiry') || {};
    const notifyStr = cfg.notifyMuteExpiry ? '✅ Sim' : '❌ Não';
    return reply(
      `🕐 *Expiração Automática*\n📢 Notificar fim de mute: ${notifyStr}\n\n` +
      `💡 *Blacklist Temporária:*\n` +
      `• \`!bltemp add @user 2h\` — bane por 2 horas\n` +
      `• \`!bltemp add @user 24h spam\` — bane por 24h (motivo: spam)\n` +
      `• \`!bltemp del @user\` — remove antes de expirar\n` +
      `• \`!bltemp list\` — lista quem está banido temporariamente`
    );
  }
};
