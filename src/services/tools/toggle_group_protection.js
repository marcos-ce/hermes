const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function toggleGroupProtection({ from, lang, args }) {
  const rawMod = String(args.module || '').toLowerCase();
  const mod = rawMod === 'agenda' ? 'calendar' : rawMod;
  const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'mutemember', 'autoapprove', 'antistatus', 'autolockflood', 'milestone'];
  if (!validModules.includes(mod)) {
    return { success: false, error: `Módulo "${mod}" inválido.` };
  }

  const currentCfg = configManager.getPluginConfig(from, mod) || {};

  let enabled = currentCfg.enabled !== false;
  if (args.enabled !== undefined) {
    enabled = Boolean(args.enabled);
  } else if (
    args.allowedDomains !== undefined ||
    args.maxWarns !== undefined ||
    args.action !== undefined ||
    args.maxMessages !== undefined ||
    args.maxChars !== undefined ||
    args.allowedDdis !== undefined ||
    args.welcomeMessage !== undefined ||
    args.autoDeleteSeconds !== undefined ||
    args.autoMsgText !== undefined ||
    args.intervalMinutes !== undefined ||
    args.groupMsgLimit !== undefined ||
    args.windowSeconds !== undefined ||
    args.lockMinutes !== undefined
  ) {
    enabled = true;
  }

  const updates = { enabled };
  const specificFeedbacks = [];

  if (mod === 'antilink') {
    // Se especificou maxWarns (ex: "ban no 2º link", "2 links = ban"):
    if (args.maxWarns && Number(args.maxWarns) >= 1) {
      updates.action = 'warn';
      const warnLimit = parseInt(args.maxWarns, 10);
      configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
      specificFeedbacks.push(t(lang, 'protection.antilink.warn_limit', { limit: warnLimit }));
    } else if (args.action && ['delete', 'warn', 'ban'].includes(args.action)) {
      updates.action = args.action;
      specificFeedbacks.push(t(lang, 'protection.antilink.action_updated', { action: args.action }));
    }

    if (args.allowedDomains !== undefined) {
      const rawDoms = String(args.allowedDomains).trim();
      const parsedDomains = (rawDoms === '.' || rawDoms === '' || rawDoms === 'todos' || rawDoms === 'none')
        ? []
        : rawDoms.split(/[\s,]+/).map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')).filter(Boolean);
      updates.allowedDomains = parsedDomains;
      if (parsedDomains.length > 0) {
        specificFeedbacks.push(t(lang, 'protection.antilink.domains_updated', { domains: parsedDomains.join(', ') }));
      } else {
        specificFeedbacks.push(t(lang, 'protection.antilink.all_blocked'));
      }
    }
  }

  if (mod === 'antiflood') {
    if (args.maxWarns && Number(args.maxWarns) >= 1) {
      updates.action = 'warn';
      const warnLimit = parseInt(args.maxWarns, 10);
      configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
      specificFeedbacks.push(t(lang, 'protection.warn.limit_updated', { limit: warnLimit }));
    } else if (args.action && ['warn', 'ban'].includes(args.action)) {
      updates.action = args.action;
    }
    if (args.maxMessages && Number(args.maxMessages) >= 2) {
      updates.maxMessages = parseInt(args.maxMessages, 10);
      specificFeedbacks.push(t(lang, 'protection.antiflood.config_updated', { limit: updates.maxMessages, window: 5 }));
    }
    if (args.maxChars && Number(args.maxChars) >= 100) {
      updates.maxChars = parseInt(args.maxChars, 10);
    }
  }

  if (mod === 'antifake' && args.allowedDdis !== undefined) {
    const ddis = String(args.allowedDdis).split(/[\s,]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
    if (ddis.length > 0) {
      updates.allowedDdis = ddis;
      specificFeedbacks.push(t(lang, 'protection.antifake.ddis_updated', { ddis: ddis.join(', ') }));
    }
  }

  if (mod === 'welcome') {
    if (args.welcomeMessage && String(args.welcomeMessage).trim().length > 0) {
      updates.message = String(args.welcomeMessage).trim();
      specificFeedbacks.push(t(lang, 'protection.welcome.message_updated'));
    }
    if (args.autoDeleteSeconds !== undefined && Number(args.autoDeleteSeconds) >= 0) {
      updates.autoDeleteSeconds = parseInt(args.autoDeleteSeconds, 10);
      specificFeedbacks.push(t(lang, 'protection.welcome.autodelete_updated', { seconds: updates.autoDeleteSeconds }));
    }
  }

  if (mod === 'automsg') {
    if (args.autoMsgText && String(args.autoMsgText).trim().length > 0) {
      updates.message = String(args.autoMsgText).trim();
    }
    if (args.intervalMinutes && Number(args.intervalMinutes) > 0) {
      updates.intervalMinutes = Math.max(parseInt(args.intervalMinutes, 10), 5);
      specificFeedbacks.push(t(lang, 'protection.automsg.interval_updated', { minutes: updates.intervalMinutes }));
    }
  }

  if (mod === 'warn' && args.maxWarns && Number(args.maxWarns) >= 1) {
    updates.maxWarns = parseInt(args.maxWarns, 10);
    specificFeedbacks.push(t(lang, 'protection.warn.limit_updated', { limit: updates.maxWarns }));
  }

  if (mod === 'ban' && args.customBanMessage !== undefined) {
    updates.customMessage = String(args.customBanMessage).trim();
  }

  if (mod === 'hermes' && args.personality && ['descontraido', 'formal'].includes(args.personality)) {
    updates.personality = args.personality;
  }

  // antistatus: toggle de aviso público após apagar menção @status
  if (mod === 'antistatus') {
    if (args.warn !== undefined) {
      updates.warn = Boolean(args.warn);
    }
  }

  // autolockflood: configura gatilho coletivo de flood → fechamento automático
  if (mod === 'autolockflood') {
    let touchedConfig = false;
    if (args.groupMsgLimit && Number(args.groupMsgLimit) >= 5) {
      updates.groupMsgLimit = parseInt(args.groupMsgLimit, 10);
      touchedConfig = true;
    }
    if (args.windowSeconds && Number(args.windowSeconds) >= 5) {
      updates.windowSeconds = parseInt(args.windowSeconds, 10);
      touchedConfig = true;
    }
    if (args.lockMinutes !== undefined && Number(args.lockMinutes) >= 0) {
      updates.lockMinutes = parseInt(args.lockMinutes, 10);
      touchedConfig = true;
    }
    if (args.ignoreAdmins !== undefined) {
      updates.ignoreAdmins = Boolean(args.ignoreAdmins);
    }
    if (touchedConfig) {
      const minutes = updates.lockMinutes !== undefined ? updates.lockMinutes : (currentCfg.lockMinutes !== undefined ? currentCfg.lockMinutes : 5);
      const limit = updates.groupMsgLimit || currentCfg.groupMsgLimit || 20;
      const window = updates.windowSeconds || currentCfg.windowSeconds || 10;
      specificFeedbacks.push(t(lang, 'protection.autolockflood.config_updated', { minutes, limit, window }));
    }
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

  // Feedback em Linguagem Natural centralizado no motor canônico i18n (PT/ES/EN)
  let feedback = '';
  if (args.enabled === false) {
    const i18nKey = `protection.${mod}.off`;
    const translated = t(lang, i18nKey);
    feedback = (translated && translated !== i18nKey)
      ? translated
      : `Módulo ${mod} ${t(lang, "common.disabled")}.`;
  } else if (specificFeedbacks.length > 0) {
    feedback = specificFeedbacks.join('\n');
  } else {
    const stateKey = enabled ? "on" : "off";
    const i18nKey = `protection.${mod}.${stateKey}`;
    const translated = t(lang, i18nKey);
    feedback = (translated && translated !== i18nKey)
      ? translated
      : `Módulo ${mod} ${enabled ? t(lang, "common.enabled") : t(lang, "common.disabled")}.`;
  }

  return {
    success: true,
    message: feedback
  };
};
