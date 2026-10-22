const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { floodCache } = require('../../utils/cache');
const { safeDelete, safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { checkAdminStatus, resolveParticipant } = require('../../utils/jidResolver');
const settings = require('../../config/settings');

module.exports = {
  name: 'antiflood',
  aliases: ['antiflood', 'antispam', 'flood', 'spam', 'antitrava', 'trava'],
  description: 'Anti-Spam de mensagens rápidas e Anti-Trava (caracteres excessivos)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Proteção Anti-Flood e Anti-Trava',
      es: 'Protección Anti-Flood y Anti-Trava',
      en: 'Anti-Flood & Anti-Crash Protection'
    },
    description: {
      pt: 'Protege o grupo contra spam em massa e mensagens gigantes',
      es: 'Protege el grupo contra spam masivo y mensajes gigantes',
      en: 'Protects group against mass spam and giant crash messages'
    },
    fields: [
      {
        name: 'maxMessages',
        type: 'number',
        question: {
          pt: 'Quantas mensagens consecutivas em 5 segundos caracterizam Flood? (Padrão: 6):',
          es: '¿Cuántos mensajes consecutivos en 5 segundos se consideran Flood? (Predeterminado: 6):',
          en: 'How many consecutive messages in 5 seconds are considered Flood? (Default: 6):'
        },
        default: 6,
        min: 3,
        max: 20
      },
      {
        name: 'maxChars',
        type: 'number',
        question: {
          pt: 'Qual o limite de caracteres por mensagem para Anti-Trava? (Padrão: 2500):',
          es: '¿Cuál es el límite de caracteres por mensaje para Anti-Trava? (Predeterminado: 2500):',
          en: 'What is the character limit per message for Anti-Crash? (Default: 2500):'
        },
        default: 2500,
        min: 500,
        max: 10000
      },
      {
        name: 'action',
        type: 'choice',
        question: {
          pt: 'Qual ação aplicar em caso de flood ou trava?',
          es: '¿Qué acción aplicar en caso de flood o trava?',
          en: 'What action should be taken in case of flood or crash attempt?'
        },
        choices: [
          { value: 'warn', label: { pt: 'Apagar e advertir (soma no !warn)', es: 'Borrar y advertir (suma en !warn)', en: 'Delete and warn (adds to !warn)' } },
          { value: 'ban', label: { pt: 'Apagar e banir imediatamente', es: 'Borrar y expulsar inmediatamente', en: 'Delete and ban immediately' } }
        ],
        default: 'warn'
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'antiflood') || {};

    // Digitar /antiflood sem argumentos (ou /antiflood config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antiflood');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'antiflood', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antiflood');
      }
      const msgs = cfg.maxMessages || 6;
      const chars = cfg.maxChars || 2500;
      const action = cfg.action || 'warn';
      return reply(`${t('common.saved')}\n🌊 *AntiFlood:* ATIVADO\n⚡ *Máx:* ${msgs} msgs/5s | *Trava:* ${chars} carac | *Ação:* ${action}`);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'antiflood', false);
      return reply(t('common.saved') + '\n🌊 *AntiFlood:* DESATIVADO');
    }

    if (['ban', 'banir', 'expulsar'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antiflood', { action: 'ban', enabled: true });
      return reply('💾 *AntiFlood atualizado:* Ação definida para *EXPULSAR (BAN)*.');
    }

    if (['warn', 'adv', 'advertir'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antiflood', { action: 'warn', enabled: true });
      return reply('💾 *AntiFlood atualizado:* Ação definida para *ADVERTIR (WARN)*.');
    }

    // Configuração direta: /antiflood 5 2000
    const parsedMsgs = parseInt(sub, 10);
    if (!isNaN(parsedMsgs) && parsedMsgs >= 3) {
      const parsedChars = parseInt(args[1], 10) || (cfg.maxChars || 2500);
      configManager.updatePluginConfig(from, 'antiflood', { 
        maxMessages: parsedMsgs, 
        maxChars: parsedChars, 
        enabled: true 
      });
      return reply(`💾 *AntiFlood atualizado e ATIVADO!*\n⚡ *Limite Flood:* \`${parsedMsgs} mensagens em 5s\`\n🛡️ *Limite Anti-Trava:* \`${parsedChars} caracteres\``);
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antiflood');
    }

    const status = configManager.isPluginEnabled(from, 'antiflood') ? t('common.enabled') : t('common.disabled');
    const msgs = cfg.maxMessages || 6;
    const chars = cfg.maxChars || 2500;
    const action = cfg.action || 'warn';

    let help = t('antiflood.status', { status, msgs, chars, action });
    help += `\n\n💡 *Comandos Diretos:*\n• \`/antiflood on\` ou \`/antiflood off\`\n• \`/antiflood 5 2000\` (msgs/5s + limite anti-trava)\n• \`/antiflood ban\` (expulsa infrator)\n• \`/antiflood adv\` (adverte infrator)\n• \`/antiflood config\` (abre wizard)`;
    return reply(help);
  },

  /**
   * Hook passivo: monitora frequência de mensagens e tamanho do texto
   */
  async onMessage({ sock, msg, from, sender, text, lang }) {
    if (!configManager.isPluginEnabled(from, 'antiflood')) return false;

    // Ignora Dono e Admins
    if (settings.isOwner(sender, sock)) return false;
    const adminCheck = await checkAdminStatus(sock, from, sender);
    if (adminCheck.isAdmin) return false;

    const cfg = configManager.getPluginConfig(from, 'antiflood') || {};
    const maxMessages = cfg.maxMessages || 6;
    const maxChars = cfg.maxChars || 2500;
    const action = cfg.action || 'warn';
    const userNum = sender.replace(/@.*$/, '').replace(/\D/g, '');

    let isViolation = false;
    let violationType = '';

    // 1. Checagem de Anti-Trava (Tamanho da mensagem)
    if (text && text.length > maxChars) {
      isViolation = true;
      violationType = 'trava';
    }

    // 2. Checagem de Anti-Flood (Mensagens em 5 segundos com janela temporal real)
    if (!isViolation) {
      const cacheKey = `${from}:${sender}`;
      const now = Date.now();
      let record = floodCache.get(cacheKey);

      if (!record || (now - record.startTime) > 5000) {
        record = { count: 1, startTime: now };
      } else {
        record.count += 1;
      }
      floodCache.set(cacheKey, record, 10);

      if (record.count > maxMessages) {
        isViolation = true;
        violationType = 'flood';
        floodCache.del(cacheKey); // Reseta após flagrar
      }
    }

    if (!isViolation) return false;

    // Ação de Emergência (Zero Delay): Apagar mensagem
    await safeDelete(sock, from, msg.key);

    const targetData = await resolveParticipant(sock, from, sender);
    const targetPhone = targetData?.phoneJid || sender;
    const targetGroup = targetData?.groupJid || sender;
    const resolvedUserNum = targetData?.displayNum || userNum;

    if (action === 'ban') {
      await safeKick(sock, from, targetGroup);
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antiflood.banned', { user: resolvedUserNum }),
        mentions: [targetGroup, targetPhone]
      });
    } else {
      // Advertir
      const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
      const maxWarns = warnCfg.maxWarns || 3;
      const reason = violationType === 'trava' ? 'Envio de mensagem excessivamente longa (Trava)' : 'Envio de mensagens rápidas (Flood)';
      const count = configManager.addWarn(from, targetPhone, reason);

      if (count >= maxWarns) {
        await safeKick(sock, from, targetGroup);
        configManager.resetWarns(from, targetPhone);
        await sendSafeMessage(sock, from, {
          text: t(lang, 'warn.max_reached', { user: resolvedUserNum, max: maxWarns }),
          mentions: [targetGroup, targetPhone]
        });
      } else {
        const alertKey = violationType === 'trava' ? 'antiflood.trava_detected' : 'antiflood.flood_detected';
        await sendSafeMessage(sock, from, {
          text: `${t(lang, alertKey, { user: resolvedUserNum })}\n${t(lang, 'warn.added', { user: resolvedUserNum, reason, warns: count, max: maxWarns })}`,
          mentions: [targetGroup, targetPhone]
        });
      }
    }

    return true; // Interrompe o pipeline
  }
};
