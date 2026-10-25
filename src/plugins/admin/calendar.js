const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const settings = require('../../config/settings');
const { sendSafeMessage } = require('../../utils/antiBan');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');

/**
 * Normaliza e valida data no formato DD/MM
 * @param {string} dateStr 
 * @returns {string|null}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const lower = dateStr.toLowerCase().trim();

  const now = new Date();
  const tz = settings.timezone || 'America/Sao_Paulo';

  // Suporte a "hoje" e "amanhã"
  if (lower === 'hoje' || lower === 'today' || lower === 'hoy') {
    try {
      const parts = now.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
    } catch (_) {
      return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  if (lower === 'amanha' || lower === 'amanhã' || lower === 'tomorrow' || lower === 'mañana') {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    try {
      const parts = tomorrow.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
    } catch (_) {
      return `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // Formato DD/MM ou DD-MM
  const match = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/**
 * Normaliza e valida horário no formato HH:MM
 * @param {string} timeStr 
 * @returns {string|null}
 */
function parseTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2})[:hH](\d{2})?$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

module.exports = {
  name: 'calendar',
  aliases: ['calendar', 'agenda', 'calendario', 'calendário', 'agendamento', 'agendamentos', 'eventos'],
  description: 'Agendamento de compromissos e eventos futuros com avisos automáticos na data e hora marcada',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Calendário de Agendamentos',
      es: 'Calendario de Eventos',
      en: 'Calendar & Event Scheduler'
    },
    description: {
      pt: 'Gerencia avisos automáticos programados para datas e horários específicos',
      es: 'Gestiona avisos automáticos programados para fechas y horas específicas',
      en: 'Manages automated announcements scheduled for specific dates and times'
    },
    fields: [
      {
        name: 'mentionAll',
        type: 'boolean',
        question: {
          pt: 'Marcar todos os membros (@todos) quando o evento for anunciado no grupo?',
          es: '¿Mencionar a todos los miembros (@todos) cuando se anuncie el evento?',
          en: 'Mention all group members (@everyone) when the event is announced?'
        },
        default: false
      }
    ]
  },

  /**
   * Hook periódico executado a cada minuto pelo scheduler
   */
  async onSchedule({ sock, groupJid, config, currentHHMM, currentDateKey, lang, queueTask, lastExecuted }) {
    if (!config || config.enabled === false) return;

    const events = Array.isArray(config.events) ? config.events : [];
    if (events.length === 0) return;

    const now = new Date();
    const tz = settings.timezone || 'America/Sao_Paulo';
    let currentDDMM = '';
    try {
      const parts = now.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
      currentDDMM = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
    } catch (_) {
      currentDDMM = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    let modified = false;

    for (const event of events) {
      if (event.executed) continue;

      if (event.date === currentDDMM && event.time === currentHHMM) {
        const execKey = `${groupJid}:calendar:${event.id}:${currentDateKey}:${currentHHMM}`;
        if (lastExecuted.has(execKey)) continue;

        lastExecuted.set(execKey, Date.now());
        event.executed = true;
        event.executedAt = Date.now();
        modified = true;

        const eventText = event.text;
        const eventTime = event.time;
        const mentionAll = Boolean(config.mentionAll);

        queueTask({
          type: 'calendar_event',
          groupJid,
          run: async () => {
            const body = t(lang, 'calendar.event_announcement', {
              time: eventTime,
              text: eventText
            });

            let mentions = [];
            if (mentionAll) {
              const meta = await getGroupMetadata(sock, groupJid);
              if (meta && Array.isArray(meta.participants)) {
                mentions = meta.participants.map(p => p.id);
              }
            }

            await sendSafeMessage(sock, groupJid, { text: body, mentions });
          }
        });
      }
    }

    if (modified) {
      configManager.updatePluginConfig(groupJid, 'calendar', { events });
    }
  },

  async execute({ sock, msg, from, sender, args, reply, t: translate, isGroup, prefix }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'calendar') || {};
    const events = Array.isArray(cfg.events) ? cfg.events : [];

    // 1. Abrir Wizard de configuração
    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'calendar');
    }

    // 2. Ativar / Desativar
    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'calendar', true);
      return reply(`${translate('common.saved')}\n📅 *Calendário de Agendamentos:* ATIVADO`);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'calendar', false);
      return reply(`${translate('common.saved')}\n📅 *Calendário de Agendamentos:* DESATIVADO`);
    }

    // 3. Adicionar evento: !agenda add DD/MM HH:MM Mensagem
    if (sub === 'add' || sub === 'criar' || sub === 'agendar' || sub === 'novo') {
      const rawDate = args[1];
      const rawTime = args[2];
      const eventText = args.slice(3).join(' ').trim();

      const parsedDate = parseDate(rawDate);
      const parsedTime = parseTime(rawTime);

      if (!parsedDate || !parsedTime || !eventText) {
        return reply(translate('calendar.invalid_format', { prefix }));
      }

      const newId = String(Date.now()).slice(-4);
      const newEvent = {
        id: newId,
        date: parsedDate,
        time: parsedTime,
        text: eventText,
        createdBy: sender.replace(/@.*$/, ''),
        createdAt: Date.now(),
        executed: false
      };

      events.push(newEvent);
      configManager.updatePluginConfig(from, 'calendar', { events, enabled: true });

      return reply(translate('calendar.added', {
        id: newId,
        date: parsedDate,
        time: parsedTime,
        text: eventText
      }));
    }

    // 4. Remover evento específico: !agenda del <id>
    if (sub === 'del' || sub === 'rm' || sub === 'remover' || sub === 'cancelar') {
      const targetId = (args[1] || '').replace(/\D/g, '');
      if (!targetId) {
        return reply(`⚠️ Informe o ID do agendamento.\nExemplo: \`${prefix}agenda del 1234\``);
      }

      const idx = events.findIndex(e => e.id === targetId);
      if (idx === -1) {
        return reply(translate('calendar.not_found', { id: targetId }));
      }

      events.splice(idx, 1);
      configManager.updatePluginConfig(from, 'calendar', { events });
      return reply(translate('calendar.deleted', { id: targetId }));
    }

    // 5. Limpar todos os eventos: !agenda clear
    if (sub === 'clear' || sub === 'limpar' || sub === 'zerar') {
      configManager.updatePluginConfig(from, 'calendar', { events: [] });
      return reply(translate('calendar.cleared'));
    }

    // 6. Listagem de Eventos (Comportamento padrão ao enviar !agenda ou !agenda list)
    const activeEvents = events.filter(e => !e.executed);
    if (activeEvents.length === 0) {
      return reply(translate('calendar.list_empty', { prefix }));
    }

    let listText = `${translate('calendar.list_title')}\n\n`;
    activeEvents.forEach(e => {
      listText += `${translate('calendar.item', { id: e.id, date: e.date, time: e.time, text: e.text })}\n`;
    });

    listText += `\n💡 *Comandos Rápidos:*\n`;
    listText += `• \`${prefix}agenda add DD/MM HH:MM [texto]\` (adiciona)\n`;
    listText += `• \`${prefix}agenda del [id]\` (remove)\n`;
    listText += `• \`${prefix}agenda config\` (configura @todos)`;

    return reply(listText);
  }
};
