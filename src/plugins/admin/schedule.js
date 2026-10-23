const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');

module.exports = {
  name: 'schedule',
  aliases: ['schedule', 'horarios', 'horario', 'agendar', 'timer', 'programar'],
  description: 'Agendamento automático para abrir e fechar o grupo diariamente por horário',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Agendamento de Horários',
      es: 'Horarios Programados',
      en: 'Automated Schedule'
    },
    description: {
      pt: 'Abre e fecha o grupo diariamente nos horários programados',
      es: 'Abre y cierra el grupo diariamente en los horarios programados',
      en: 'Automatically opens and closes group daily at set times'
    },
    fields: [
      {
        name: 'closeTime',
        type: 'string',
        question: {
          pt: 'Qual o horário diário para FECHAR o grupo? (Formato HH:MM, ex: 23:00 ou 0 para não fechar):',
          es: '¿A qué hora diaria se debe CERRAR el grupo? (Formato HH:MM, ej: 23:00 o 0 para no cerrar):',
          en: 'What daily time should the group CLOSE? (Format HH:MM, e.g. 23:00 or 0 to not close):'
        },
        default: '23:00'
      },
      {
        name: 'openTime',
        type: 'string',
        question: {
          pt: 'Qual o horário diário para ABRIR o grupo? (Formato HH:MM, ex: 07:00 ou 0 para não abrir):',
          es: '¿A qué hora diaria se debe ABRIR el grupo? (Formato HH:MM, ej: 07:00 o 0 para no abrir):',
          en: 'What daily time should the group OPEN? (Format HH:MM, e.g. 07:00 or 0 to not open):'
        },
        default: '07:00'
      }
    ]
  },

  /**
   * Hook de execução periódica chamado a cada minuto pelo scheduler
   */
  async onSchedule({ sock, groupJid, config, currentHHMM, currentDateKey, lang, queueTask, lastExecuted }) {
    const scheduleCfg = config;
    if (!scheduleCfg || !scheduleCfg.enabled) return;

    const closeTime = scheduleCfg.closeTime;
    const openTime = scheduleCfg.openTime;

    // Fechar grupo no horário agendado
    if (closeTime && closeTime === currentHHMM && closeTime !== '0') {
      const execKey = `${groupJid}:close:${currentDateKey}:${currentHHMM}`;
      if (!lastExecuted.has(execKey)) {
        lastExecuted.add(execKey);
        queueTask({
          type: 'schedule_close',
          groupJid,
          run: async () => {
            await sock.groupSettingUpdate(groupJid, 'announcement');
            await sendSafeMessage(sock, groupJid, { text: t(lang, 'schedule.closed') });
          }
        });
      }
    }

    // Abrir grupo no horário agendado
    if (openTime && openTime === currentHHMM && openTime !== '0') {
      const execKey = `${groupJid}:open:${currentDateKey}:${currentHHMM}`;
      if (!lastExecuted.has(execKey)) {
        lastExecuted.add(execKey);
        queueTask({
          type: 'schedule_open',
          groupJid,
          run: async () => {
            await sock.groupSettingUpdate(groupJid, 'not_announcement');
            await sendSafeMessage(sock, groupJid, { text: t(lang, 'schedule.opened') });
          }
        });
      }
    }
  },

  async execute({ sock, msg, from, sender, args, reply, t: translate, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'schedule') || {};

    // Digitar /horarios sem argumentos (ou /horarios config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'schedule');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'schedule', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'schedule');
      }
      const close = cfg.closeTime || '23:00';
      const open = cfg.openTime || '07:00';
      return reply(`${translate('common.saved')}\n⏰ *Horários Automáticos:* ATIVADO\n🔒 *Fechar:* ${close} | 🔓 *Abrir:* ${open}`);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'schedule', false);
      return reply(translate('common.saved') + '\n⏰ *Horários Automáticos:* DESATIVADO');
    }

    // Configuração direta de horário: /horarios 23:00 07:00
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (timeRegex.test(sub)) {
      const closeTime = sub;
      const openTime = args[1] && timeRegex.test(args[1]) ? args[1] : (cfg.openTime || '07:00');
      configManager.updatePluginConfig(from, 'schedule', { closeTime, openTime, enabled: true });
      return reply(`💾 *Horários atualizados e ATIVADOS!*\n🔒 *Fechar:* \`${closeTime}\`\n🔓 *Abrir:* \`${openTime}\``);
    }

    if (sub === 'fechar' && args[1] && timeRegex.test(args[1])) {
      configManager.updatePluginConfig(from, 'schedule', { closeTime: args[1], enabled: true });
      return reply(`💾 *Horário de fechar atualizado:* \`${args[1]}\``);
    }

    if (sub === 'abrir' && args[1] && timeRegex.test(args[1])) {
      configManager.updatePluginConfig(from, 'schedule', { openTime: args[1], enabled: true });
      return reply(`💾 *Horário de abrir atualizado:* \`${args[1]}\``);
    }

    const status = configManager.isPluginEnabled(from, 'schedule') ? translate('common.enabled') : translate('common.disabled');
    const close = cfg.closeTime || '23:00';
    const open = cfg.openTime || '07:00';

    let help = translate('schedule.status', { status, close, open });
    help += `\n\n💡 *Comandos Diretos:*\n• \`/horarios on\` ou \`/horarios off\`\n• \`/horarios 23:00 07:00\` (define fechar e abrir direto)\n• \`/horarios fechar 23:00\`\n• \`/horarios abrir 07:00\`\n• \`/horarios config\` (abre wizard)`;
    return reply(help);
  }
};
