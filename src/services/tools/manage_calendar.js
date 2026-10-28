const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const { cleanJid, resolveParticipant } = require('../../utils/jidResolver');
const { parseRelativeTime } = require('../timeParser');
const { executeCalendarAction } = require('../../plugins/admin/calendar');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function manageCalendar({ sock, from, sender, lang, args }) {
  const action = String(args.action || '').toLowerCase();
  const cfg = configManager.getPluginConfig(from, 'calendar') || {};
  const events = Array.isArray(cfg.events) ? cfg.events : [];

  if (action === 'add') {
    let parsedDate = null;
    let parsedTime = null;
    let relDelayMs = null;

    // 1. Tentar parse relativo se houver delayMinutes ou se time/date for expressão relativa
    const relCandidate = args.delayMinutes || args.time || args.date;
    if (args.delayMinutes || (typeof relCandidate === 'string' && /(?:daqui|dq|em\s+\d+|meia\s+hora|minutos?|horas?|amanh[aã]|hoje|\+\d+)/i.test(relCandidate))) {
      const rel = parseRelativeTime(args.delayMinutes || relCandidate);
      if (rel.success) {
        parsedDate = rel.formattedDate;
        parsedTime = rel.formattedTime;
        relDelayMs = rel.delayMs;
      }
    }

    // 2. Se não foi relativo, usar parsing padrão de date/time
    if (!parsedDate || !parsedTime) {
      const lowerDate = String(args.date || 'hoje').toLowerCase().trim();
      const now = new Date();
      const tz = settings.timezone || 'America/Sao_Paulo';

      if (lowerDate === 'hoje' || lowerDate === 'today' || lowerDate === 'hoy') {
        try {
          const parts = now.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
          parsedDate = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
        } catch (_) {
          parsedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
      } else if (lowerDate === 'amanha' || lowerDate === 'amanhã' || lowerDate === 'tomorrow' || lowerDate === 'mañana') {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        try {
          const parts = tomorrow.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
          parsedDate = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
        } catch (_) {
          parsedDate = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;
        }
      } else {
        const dateMatch = lowerDate.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
        if (dateMatch) {
          const d = parseInt(dateMatch[1], 10);
          const m = parseInt(dateMatch[2], 10);
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            parsedDate = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
          }
        }
      }

      if (!parsedTime && args.time) {
        const timeMatch = String(args.time).match(/^(\d{1,2})(?:[:hH](\d{2})?)?$/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1], 10);
          const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            parsedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
        }
      }
    }

    if (!parsedDate || !parsedTime) {
      return { success: false, error: 'Data ou hora inválida. Use formatos como "daqui a meia hora", "em 1 hora", "amanhã às 10h" ou data DD/MM e hora HH:MM.' };
    }

    const reminderText = String(args.text || args.message || 'Lembrete agendado pelo administrador').trim();

    // Detecção e inferência inteligente do tipo de ação agendada:
    let actionType = String(args.actionType || args.type || '').toLowerCase();
    if (!actionType || actionType === 'reminder') {
      const combinedText = `${reminderText} ${String(args.action || '')}`.toLowerCase();
      if (/enquete|poll|resultado|voto|vota[cç][aã]o|placar|parcial|ganh|apur/i.test(combinedText)) {
        actionType = 'poll_result';
      } else if (/sorte|raffle|sortear|ganhador/i.test(combinedText)) {
        actionType = 'raffle';
      } else if (/desfix|unpin|despin/i.test(combinedText)) {
        actionType = 'unpin';
      } else if (/fech|tranc|mute|lock/i.test(combinedText) && !/abrir/i.test(combinedText)) {
        actionType = 'close_group';
      } else if (/abr|unmute|unlock/i.test(combinedText)) {
        actionType = 'open_group';
      } else {
        actionType = 'reminder';
      }
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
      text: reminderText,
      action: actionType,
      raffleQuantity: args.quantity ? parseInt(args.quantity, 10) : 1,
      rafflePrize: args.text || args.prize || '',
      createdBy: creatorNum,
      creatorDisplay,
      creatorJid,
      creatorPhoneJid,
      createdAt: Date.now(),
      executed: false
    };

    events.push(newEvent);
    configManager.updatePluginConfig(from, 'calendar', { events, enabled: true });

    // Se for atraso curto com delayMs calculado (até 120 minutos), agenda timer em memória
    if (relDelayMs && relDelayMs <= 120 * 60 * 1000) {
      const timer = setTimeout(async () => {
        try {
          const currentCfg = configManager.getPluginConfig(from, 'calendar') || {};
          const currentEvents = Array.isArray(currentCfg.events) ? currentCfg.events : [];
          const ev = currentEvents.find(e => String(e.id) === newId);
          if (ev && !ev.executed) {
            ev.executed = true;
            ev.executedAt = Date.now();
            configManager.updatePluginConfig(from, 'calendar', { events: currentEvents });

            await executeCalendarAction({ sock, groupJid: from, event: ev, lang, config: currentCfg });
          }
        } catch (err) {
          logger.error({ err, from, newId }, 'Erro ao disparar ação agendada temporizada');
        }
      }, relDelayMs);
      if (timer.unref) timer.unref();
    }

    let confirmMsg = '';
    if (actionType === 'poll_result') {
      confirmMsg = `📊 Apuração da enquete agendada com sucesso para ${parsedTime} (${parsedDate}). No horário, os votos serão apurados e o resultado oficial será publicado aqui no grupo!`;
    } else if (actionType === 'raffle') {
      const prizeInfo = args.text ? ` (${args.text})` : '';
      confirmMsg = `🎲 Sorteio agendado com sucesso para ${parsedTime} (${parsedDate})${prizeInfo}. No horário marcado, o ganhador será anunciado!`;
    } else if (actionType === 'unpin') {
      confirmMsg = `📌 Desafixação de mensagens agendada com sucesso para ${parsedTime} (${parsedDate}).`;
    } else if (actionType === 'close_group') {
      confirmMsg = `🔒 Fechamento do grupo agendado com sucesso para ${parsedTime} (${parsedDate}).`;
    } else if (actionType === 'open_group') {
      confirmMsg = `🔓 Abertura do grupo agendada com sucesso para ${parsedTime} (${parsedDate}).`;
    } else {
      confirmMsg = t(lang, 'calendar.added', {
        id: newId,
        date: parsedDate,
        time: parsedTime,
        text: newEvent.text
      });
    }

    return {
      success: true,
      message: confirmMsg
    };
  }

  if (action === 'delete') {
    const targetId = String(args.eventId || '').trim().replace(/^#/, '');
    if (!targetId) return { success: false, error: 'Informe o ID do agendamento para remover.' };
    const idx = events.findIndex(e => String(e.id) === targetId);
    if (idx === -1) return { success: false, error: t(lang, 'calendar.not_found', { id: targetId }) };
    events.splice(idx, 1);
    configManager.updatePluginConfig(from, 'calendar', { events });
    return { success: true, message: t(lang, 'calendar.deleted', { id: targetId }) };
  }

  if (action === 'clear') {
    configManager.updatePluginConfig(from, 'calendar', { events: [] });
    return { success: true, message: t(lang, 'calendar.cleared') };
  }

  if (action === 'list') {
    const activeEvents = events.filter(e => !e.executed);
    if (activeEvents.length === 0) {
      return {
        success: true,
        message: t(lang, 'calendar.list_empty', { prefix: configManager.getGroupPrefix(from) || '!' })
      };
    }
    let listText = `${t(lang, 'calendar.list_title')}\n\n`;
    activeEvents.forEach(e => {
      listText += `${t(lang, 'calendar.item', { id: e.id, date: e.date, time: e.time, text: e.text })}\n`;
    });
    return { success: true, message: listText };
  }

  return { success: false, error: `Ação "${action}" desconhecida.` };
};
