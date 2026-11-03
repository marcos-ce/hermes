const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function toggleGroupProtection({ from, lang, args }) {
  const rawMod = String(args.module || '').toLowerCase();
  const mod = rawMod === 'agenda' ? 'calendar' : rawMod;
  const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'mutemember', 'autoapprove', 'antistatus', 'autolockflood'];
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

  // antistatus: toggle de aviso público após apagar menção @status
  if (mod === 'antistatus') {
    if (args.warn !== undefined) {
      updates.warn = Boolean(args.warn);
    }
  }

  // autolockflood: configura gatilho coletivo de flood → fechamento automático
  if (mod === 'autolockflood') {
    if (args.groupMsgLimit && Number(args.groupMsgLimit) >= 5) {
      updates.groupMsgLimit = parseInt(args.groupMsgLimit, 10);
    }
    if (args.windowSeconds && Number(args.windowSeconds) >= 5) {
      updates.windowSeconds = parseInt(args.windowSeconds, 10);
    }
    if (args.lockMinutes !== undefined && Number(args.lockMinutes) >= 0) {
      updates.lockMinutes = parseInt(args.lockMinutes, 10);
    }
    if (args.ignoreAdmins !== undefined) {
      updates.ignoreAdmins = Boolean(args.ignoreAdmins);
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

  const feedback = formatModuleFeedback(mod, enabled, lang, extraFeedback);
  return {
    success: true,
    message: feedback
  };
};

/**
 * Retorna mensagem humanizada e elegante para a ativação/desativação de módulos
 * Substitui jargões técnicos e nomes internos em caps lock (ex: "AUTOLOCKFLOOD: ATIVADO")
 */
function formatModuleFeedback(mod, enabled, lang, extraFeedback = '') {
  const isEs = lang === 'es';
  const isEn = lang === 'en';

  const descriptions = {
    autolockflood: {
      pt: {
        on: '🔒 *Proteção contra excesso de mensagens ativada!*\nSe o grupo receber muitas mensagens em poucos segundos (flood coletivo), ele será trancado temporariamente.',
        off: '🔓 Proteção contra excesso de mensagens desativada.'
      },
      es: {
        on: '🔒 *¡Protección contra exceso de mensajes activada!*\nSi el grupo recibe demasiados mensajes seguidos, se cerrará temporalmente.',
        off: '🔓 Protección contra exceso de mensajes desactivada.'
      },
      en: {
        on: '🔒 *Excess message protection enabled!*\nIf the group receives too many messages in a short burst, it will be locked temporarily.',
        off: '🔓 Excess message protection disabled.'
      }
    },
    antilink: {
      pt: {
        on: '🔗 *Filtro de links ativado!*\nLinks não autorizados serão apagados automaticamente.',
        off: '🔗 Filtro de links desativado.'
      },
      es: {
        on: '🔗 *¡Filtro de enlaces activado!*\nLos enlaces no autorizados serán eliminados.',
        off: '🔗 Filtro de enlaces desactivado.'
      },
      en: {
        on: '🔗 *Link filter enabled!*\nUnauthorized links will be automatically deleted.',
        off: '🔗 Link filter disabled.'
      }
    },
    antiflood: {
      pt: {
        on: '🛡️ *Anti-flood ativado!*\nMensagens em sequência rápida ou com caracteres excessivos serão bloqueadas.',
        off: '🛡️ Anti-flood desativado.'
      },
      es: {
        on: '🛡️ *¡Anti-flood activado!*\nMensajes repetitivos o textos excesivos serán bloqueados.',
        off: '🛡️ Anti-flood desactivado.'
      },
      en: {
        on: '🛡️ *Anti-flood enabled!*\nSpam messages and excessive text will be blocked.',
        off: '🛡️ Anti-flood disabled.'
      }
    },
    antifake: {
      pt: {
        on: '🌍 *Filtro de números estrangeiros (DDI) ativado!*\nApenas números com códigos de país autorizados poderão permanecer no grupo.',
        off: '🌍 Filtro de números estrangeiros desativado.'
      },
      es: {
        on: '🌍 *¡Filtro de números extranjeros (DDI) activado!*',
        off: '🌍 Filtro de números extranjeros desactivado.'
      },
      en: {
        on: '🌍 *Foreign number filter (DDI) enabled!*',
        off: '🌍 Foreign number filter disabled.'
      }
    },
    antistatus: {
      pt: {
        on: '🚫 *Filtro anti-status ativado!*\nMensagens mencionando @status serão apagadas imediatamente.',
        off: '🚫 Filtro anti-status desativado.'
      },
      es: {
        on: '🚫 *¡Filtro anti-status activado!*\nMensajes mencionando @status serán eliminados.',
        off: '🚫 Filtro anti-status desactivado.'
      },
      en: {
        on: '🚫 *Anti-status filter enabled!*\nMessages mentioning @status will be removed.',
        off: '🚫 Anti-status filter disabled.'
      }
    },
    welcome: {
      pt: {
        on: '👋 *Mensagens de boas-vindas ativadas!*\nNovos membros receberão as regras e recepção ao entrar.',
        off: '👋 Mensagens de boas-vindas desativadas.'
      },
      es: {
        on: '👋 *¡Mensajes de bienvenida activados!*',
        off: '👋 Mensajes de bienvenida desactivados.'
      },
      en: {
        on: '👋 *Welcome messages enabled!*',
        off: '👋 Welcome messages disabled.'
      }
    },
    automsg: {
      pt: {
        on: '📢 *Mensagens periódicas automáticas ativadas!*',
        off: '📢 Mensagens periódicas automáticas desativadas.'
      },
      es: {
        on: '📢 *¡Mensajes periódicos automáticos activados!*',
        off: '📢 Mensajes periódicos automáticos desactivados.'
      },
      en: {
        on: '📢 *Periodic announcement messages enabled!*',
        off: '📢 Periodic announcement messages disabled.'
      }
    },
    warn: {
      pt: {
        on: '⚠️ *Sistema de advertências ativo!*',
        off: '⚠️ Sistema de advertências desativado.'
      },
      es: {
        on: '⚠️ *¡Sistema de advertencias activado!*',
        off: '⚠️ Sistema de advertencias desactivado.'
      },
      en: {
        on: '⚠️ *Warning system enabled!*',
        off: '⚠️ Warning system disabled.'
      }
    },
    schedule: {
      pt: {
        on: '⏰ *Horários automáticos de abertura e fechamento ativados!*',
        off: '⏰ Horários automáticos desativados.'
      },
      es: {
        on: '⏰ *¡Horarios automáticos activados!*',
        off: '⏰ Horarios automáticos desactivados.'
      },
      en: {
        on: '⏰ *Automatic schedule enabled!*',
        off: '⏰ Automatic schedule disabled.'
      }
    },
    autoapprove: {
      pt: {
        on: '✅ *Aprovação automática de entrada ativada!*',
        off: '🛑 Aprovação automática de entrada desativada.'
      },
      es: {
        on: '✅ *¡Aprobación automática activada!*',
        off: '🛑 Aprobación automática desactivada.'
      },
      en: {
        on: '✅ *Automatic entry approval enabled!*',
        off: '🛑 Automatic entry approval disabled.'
      }
    },
    calendar: {
      pt: {
        on: '📅 *Calendário de agendamentos ativado!*',
        off: '📅 Calendário de agendamentos desativado.'
      },
      es: {
        on: '📅 *¡Calendario de eventos activado!*',
        off: '📅 Calendario de eventos desactivado.'
      },
      en: {
        on: '📅 *Event calendar enabled!*',
        off: '📅 Event calendar disabled.'
      }
    },
    hermes: {
      pt: {
        on: '🤖 *Assistente Hermes ativado no grupo!*',
        off: '🤖 Assistente Hermes desativado no grupo.'
      },
      es: {
        on: '🤖 *¡Asistente Hermes activado en el grupo!*',
        off: '🤖 Asistente Hermes desactivado en el grupo.'
      },
      en: {
        on: '🤖 *Hermes Assistant enabled in this group!*',
        off: '🤖 Hermes Assistant disabled in this group.'
      }
    }
  };

  const lKey = isEs ? 'es' : (isEn ? 'en' : 'pt');
  const modItem = descriptions[mod]?.[lKey] || descriptions[mod]?.pt;
  if (modItem) {
    const base = enabled ? modItem.on : modItem.off;
    return `${base}${extraFeedback}`;
  }

  const state = enabled ? 'ativado' : 'desativado';
  return `⚙️ Módulo *${mod}* ${state}.${extraFeedback}`;
}
