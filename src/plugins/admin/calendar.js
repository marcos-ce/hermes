const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const settings = require('../../config/settings');
const { sendSafeMessage } = require('../../utils/antiBan');
const { getGroupMetadata, resolveParticipant, cleanJid, getBotIdentity } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');
const pollTracker = require('../../utils/pollTracker');
const pinTracker = require('../../utils/pinTracker');
const logger = require('../../utils/logger');

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
  const match = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
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
  const match = timeStr.match(/^(\d{1,2})(?:[:hH](\d{2})?)?$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Executa de forma autônoma a ação agendada no evento
 * Suporta apuração de enquetes, sorteios, desafixar mensagens, trancar/abrir grupo e lembretes
 * @param {object} params
 * @param {object} params.sock
 * @param {string} params.groupJid
 * @param {object} params.event
 * @param {string} [params.lang]
 * @param {object} [params.config]
 */
async function executeCalendarAction({ sock, groupJid, event, lang = 'pt', config = {} }) {
  const actionType = event.action || event.actionType || 'reminder';

  // 1. Apuração e publicação do resultado de enquete
  if (actionType === 'poll_result') {
    const pollResults = pollTracker.getPollResults(groupJid);
    if (!pollResults) {
      await sendSafeMessage(sock, groupJid, {
        text: '📊 *[APURAÇÃO AUTOMÁTICA DE ENQUETE]*\n\nNenhuma votação recente com votos computados foi encontrada neste grupo.'
      });
      return;
    }
    const winnerStr = pollResults.winner
      ? `🏆 *Vencedor Oficial:* "${pollResults.winner.name}" com ${pollResults.winner.votes} voto(s)`
      : (pollResults.isTie ? '⚖️ *Resultado:* Empate entre as opções mais votadas' : 'Nenhum voto computado ainda');
    const body =
      `📊 *[RESULTADO OFICIAL DA ENQUETE]*\n\n` +
      `📌 *"${pollResults.title}"*\n\n` +
      `${pollResults.summary.split(' | ').map(s => `  ▪️ ${s}`).join('\n')}\n\n` +
      `${winnerStr}\n` +
      `_(Total de votos apurados: ${pollResults.totalVotes})_`;
    await sendSafeMessage(sock, groupJid, { text: body });
    return;
  }

  // 2. Trancar grupo
  if (actionType === 'close_group') {
    try {
      await sock.groupSettingUpdate(groupJid, 'announcement');
      await sendSafeMessage(sock, groupJid, { text: t(lang, 'mute.closed') });
    } catch (_) {}
    return;
  }

  // 3. Abrir grupo
  if (actionType === 'open_group') {
    try {
      await sock.groupSettingUpdate(groupJid, 'not_announcement');
      await sendSafeMessage(sock, groupJid, { text: t(lang, 'mute.opened') });
    } catch (_) {}
    return;
  }

  // 4. Desafixar todas as mensagens fixadas
  if (actionType === 'unpin') {
    try {
      const pinnedList = pinTracker.getPinned(groupJid);
      if (pinnedList && pinnedList.length > 0) {
        let count = 0;
        for (const key of pinnedList) {
          try {
            await sock.sendMessage(groupJid, { pin: key, type: 2 });
            count++;
            await new Promise(r => setTimeout(r, 400));
          } catch (_) {}
        }
        pinTracker.clearPins(groupJid);
        await sendSafeMessage(sock, groupJid, {
          text: `📌 *[DESAFIXAÇÃO AUTOMÁTICA]*\n\nTodas as ${count} mensagem(ns) fixada(s) foram desafixadas conforme programado.`
        });
      }
    } catch (_) {}
    return;
  }

  // 5. Sorteio aleatório agendado
  if (actionType === 'raffle') {
    try {
      let metadata = await getGroupMetadata(sock, groupJid);
      if (!metadata || !Array.isArray(metadata.participants)) {
        try { metadata = await sock.groupMetadata(groupJid); } catch (_) {}
      }
      if (!metadata || !Array.isArray(metadata.participants) || metadata.participants.length <= 1) {
        await sendSafeMessage(sock, groupJid, { text: t(lang, 'raffle.not_enough') });
        return;
      }
      const { botJid, botLid, botNum } = getBotIdentity(sock);
      let pool = metadata.participants.filter(p => {
        const pId = cleanJid(p.id);
        const pLid = p.lid ? cleanJid(p.lid) : '';
        const pJid = p.jid ? cleanJid(p.jid) : '';
        const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');
        if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
        if (p.admin === 'admin' || p.admin === 'superadmin') return false;
        return true;
      });
      if (pool.length === 0) {
        pool = metadata.participants.filter(p => {
          const pId = cleanJid(p.id);
          const pLid = p.lid ? cleanJid(p.lid) : '';
          const pJid = p.jid ? cleanJid(p.jid) : '';
          const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');
          if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
          return true;
        });
      }
      const qty = Math.max(1, Math.min(event.raffleQuantity || 1, pool.length));
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const winners = shuffled.slice(0, qty);
      const winnerMentions = winners.map(w => cleanJid(w.id || w.jid));
      const winnerText = winners.map(w => {
        const num = cleanJid(w.id || w.jid).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
        return `🎉 @${num}`;
      }).join('\n');
      const prizeStr = event.rafflePrize || event.text || '';
      const body =
        `🎲 *[SORTEIO AUTOMÁTICO AGENDADO]*\n\n` +
        (prizeStr ? `🎁 *Prêmio:* ${prizeStr}\n\n` : '') +
        `🏆 *Ganhador(es):*\n${winnerText}\n\n` +
        `✨ _Parabéns aos sorteados!_`;
      await sendSafeMessage(sock, groupJid, { text: body, mentions: winnerMentions });
      return;
    } catch (_) {}
  }

  // 6. Lembrete / Comunicado de texto padrão
  let creatorMention = '';
  let creatorJid = event.creatorJid || '';
  if (!creatorJid && event.createdBy) {
    creatorJid = event.createdBy.includes('@') ? event.createdBy : `${event.createdBy}@s.whatsapp.net`;
  }
  const creatorDisplay = event.creatorDisplay || event.createdBy || '';
  if (creatorDisplay) {
    creatorMention = t(lang, 'calendar.creator_tag', { user: creatorDisplay });
  }
  const body = t(lang, 'calendar.event_announcement', {
    time: event.time,
    text: event.text,
    creator: creatorMention
  });
  let mentions = [];
  if (Boolean(config.mentionAll)) {
    const meta = await getGroupMetadata(sock, groupJid);
    if (meta && Array.isArray(meta.participants)) {
      const allMembers = new Set();
      meta.participants.forEach(p => {
        if (p.id) allMembers.add(p.id);
        if (p.jid) allMembers.add(p.jid);
        if (p.lid) allMembers.add(p.lid);
      });
      mentions = Array.from(allMembers);
    }
  }
  if (creatorJid && !mentions.includes(creatorJid)) mentions.push(creatorJid);
  if (event.creatorPhoneJid && !mentions.includes(event.creatorPhoneJid)) mentions.push(event.creatorPhoneJid);
  await sendSafeMessage(sock, groupJid, { text: body, mentions });
}

module.exports = {
  name: 'calendar',
  aliases: ['calendar', 'agenda', 'agendar', 'calendario', 'calendário', 'agendamento', 'agendamentos', 'eventos', 'evento'],
  description: 'Agendamento de compromissos e eventos futuros com avisos automáticos na data e hora marcada',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,
  executeCalendarAction,

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

        queueTask({
          type: `calendar_${event.action || event.actionType || 'event'}`,
          groupJid,
          run: async () => {
            try {
              await executeCalendarAction({ sock, groupJid, event, lang, config });
            } catch (err) {
              logger.error({ err, groupJid, eventId: event.id }, 'Erro ao executar ação agendada no calendário');
            }
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

      const creatorData = await resolveParticipant(sock, from, sender);
      const creatorNum = creatorData?.displayNum || sender.replace(/@.*$/, '').replace(/\D/g, '');
      const creatorDisplay = creatorData?.displayUser || creatorNum;
      const creatorJid = creatorData?.groupJid || cleanJid(sender);
      const creatorPhoneJid = creatorData?.phoneJid || null;

      const maxId = events.reduce((max, e) => Math.max(max, parseInt(e.id, 10) || 0), 0);
      const newId = String(maxId + 1);
      const newEvent = {
        id: newId,
        date: parsedDate,
        time: parsedTime,
        text: eventText,
        createdBy: creatorNum,
        creatorDisplay,
        creatorJid,
        creatorPhoneJid,
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
      const targetId = (args[1] || '').trim().replace(/^#/, '');
      if (!targetId) {
        return reply(`⚠️ Informe o ID do agendamento.\nExemplo: \`${prefix}agenda del 1\``);
      }

      const idx = events.findIndex(e => String(e.id) === targetId);
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
