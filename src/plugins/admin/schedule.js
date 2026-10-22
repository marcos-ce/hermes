const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');

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

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'schedule') || {};

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'schedule', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'schedule');
      }
      return reply(t('common.saved') + '\n⏰ *Horários Automáticos:* ATIVADO');
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'schedule', false);
      return reply(t('common.saved') + '\n⏰ *Horários Automáticos:* DESATIVADO');
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'schedule');
    }

    const status = configManager.isPluginEnabled(from, 'schedule') ? t('common.enabled') : t('common.disabled');
    const close = cfg.closeTime || '23:00';
    const open = cfg.openTime || '07:00';

    return reply(t('schedule.status', { status, close, open }));
  }
};
