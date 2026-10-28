const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function toggleGroupProtection({ from, lang, args }) {
  const rawMod = String(args.module || '').toLowerCase();
  const mod = rawMod === 'agenda' ? 'calendar' : rawMod;
  const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'autoapprove'];
  if (!validModules.includes(mod)) {
    return { success: false, error: `Módulo "${mod}" inválido.` };
  }

  const currentCfg = configManager.getPluginConfig(from, mod) || {};
  const enabled = args.enabled !== undefined ? Boolean(args.enabled) : (currentCfg.enabled !== false);
  const updates = { enabled };

  let extraFeedback = '';

  if (mod === 'antilink') {
    // Se especificou maxWarns (ex: "ban no 2º link", "2 links = ban"):
    // A ação do antilink é 'warn' (adverte a cada link) e o limite de warn é maxWarns
    if (args.maxWarns && Number(args.maxWarns) >= 1) {
      updates.action = 'warn';
      const warnLimit = parseInt(args.maxWarns, 10);
      configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
      extraFeedback = `\n⚠️ *Regra de Punição:* Banimento automático no ${warnLimit}º link (${warnLimit} advertências).`;
    } else if (args.action && ['delete', 'warn', 'ban'].includes(args.action)) {
      updates.action = args.action;
    }

    if (args.allowedDomains !== undefined) {
      const rawDoms = String(args.allowedDomains).trim();
      updates.allowedDomains = (rawDoms === '.' || rawDoms === '' || rawDoms === 'todos')
        ? []
        : rawDoms.split(/[\s,]+/).map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')).filter(Boolean);
    }
  }

  if (mod === 'antiflood') {
    if (args.maxWarns && Number(args.maxWarns) >= 1) {
      updates.action = 'warn';
      const warnLimit = parseInt(args.maxWarns, 10);
      configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
      extraFeedback = `\n⚠️ *Regra de Punição:* Banimento automático na ${warnLimit}ª advertência de flood.`;
    } else if (args.action && ['warn', 'ban'].includes(args.action)) {
      updates.action = args.action;
    }
    if (args.maxMessages && Number(args.maxMessages) >= 2) {
      updates.maxMessages = parseInt(args.maxMessages, 10);
    }
    if (args.maxChars && Number(args.maxChars) >= 100) {
      updates.maxChars = parseInt(args.maxChars, 10);
    }
  }

  if (mod === 'antifake' && args.allowedDdis !== undefined) {
    const ddis = String(args.allowedDdis).split(/[\s,]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
    if (ddis.length > 0) updates.allowedDdis = ddis;
  }

  if (mod === 'welcome') {
    if (args.welcomeMessage && String(args.welcomeMessage).trim().length > 0) {
      updates.message = String(args.welcomeMessage).trim();
    }
    if (args.autoDeleteSeconds !== undefined && Number(args.autoDeleteSeconds) >= 0) {
      updates.autoDeleteSeconds = parseInt(args.autoDeleteSeconds, 10);
    }
  }

  if (mod === 'automsg') {
    if (args.autoMsgText && String(args.autoMsgText).trim().length > 0) {
      updates.message = String(args.autoMsgText).trim();
    }
    if (args.intervalMinutes && Number(args.intervalMinutes) > 0) {
      updates.intervalMinutes = Math.max(parseInt(args.intervalMinutes, 10), 5);
    }
  }

  if (mod === 'warn' && args.maxWarns && Number(args.maxWarns) >= 1) {
    updates.maxWarns = parseInt(args.maxWarns, 10);
    extraFeedback = `\n⚠️ *Limite:* Banimento configurado para ${updates.maxWarns} advertências.`;
  }

  if (mod === 'ban' && args.customBanMessage !== undefined) {
    updates.customMessage = String(args.customBanMessage).trim();
  }

  if (mod === 'hermes' && args.personality && ['descontraido', 'formal'].includes(args.personality)) {
    updates.personality = args.personality;
  }

  if (mod === 'calendar' && args.mentionAll !== undefined) {
    updates.mentionAll = Boolean(args.mentionAll);
  }

  if (mod === 'autoapprove') {
    if (args.allowedDdis !== undefined) {
      const raw = String(args.allowedDdis).trim();
      if (['*', 'todos', 'all', 'qualquer'].includes(raw.toLowerCase())) {
        updates.allowedDdis = ['*'];
      } else {
        const ddis = raw.split(/[\s,]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
        if (ddis.length > 0) updates.allowedDdis = ddis;
      }
    }
    if (args.actionForForeigners && ['ignore', 'reject'].includes(args.actionForForeigners)) {
      updates.actionForForeigners = args.actionForForeigners;
    }
    if (args.notifyGroup !== undefined) {
      updates.notifyGroup = Boolean(args.notifyGroup);
    }
  }

  if (Object.keys(updates).length > 1) {
    configManager.updatePluginConfig(from, mod, updates);
  } else {
    configManager.setPluginEnabled(from, mod, enabled);
  }

  // Desligar a autoaprovação por qualquer caminho também interrompe lote/tempo real.
  if (mod === 'autoapprove' && !enabled) {
    const autoapprovePlugin = require('../../plugins/admin/autoapprove');
    await autoapprovePlugin.approvalQueue.cancelGroup(from, 'disabled');
  }

  const stateLabel = enabled ? t(lang, 'common.enabled') : t(lang, 'common.disabled');
  return {
    success: true,
    message: `${t(lang, 'common.saved')}\n⚙️ *${mod.toUpperCase()}:* ${stateLabel}${extraFeedback}`
  };
};
