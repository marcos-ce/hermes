const { parseRelativeTime } = require('../timeParser');
const { scheduleTimedGroupAction } = require('../../plugins/admin/calendar');
const { t } = require('../../utils/i18n');

module.exports = async function setGroupMute({ sock, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  // Se action === 'close' e duration for fornecido (ex: "tranca por 30m", "fecha por 1 hora"):
  // Tranca o grupo imediatamente e agenda a reabertura automática após o tempo!
  const durationCandidate = args.duration || (args.action === 'close' && args.time && /(?:por|durante|\b\d+\s*(?:m|min|mins|minutos?|h|hrs?|horas?)\b)/i.test(args.time) && !/^(?:[aàá]s|\d{1,2}:\d{2})/i.test(args.time) ? args.time : null);
  if (args.action === 'close' && durationCandidate) {
    const durRel = parseRelativeTime(durationCandidate);
    if (durRel.success && durRel.delayMinutes > 0) {
      await sock.groupSettingUpdate(from, 'announcement');

      await scheduleTimedGroupAction(sock, from, {
        action: 'open_group',
        rel: durRel,
        text: 'Reabertura automática do grupo após fechamento temporário',
        sender,
        lang
      });

      return {
        success: true,
        message: `🔒 *Grupo trancado!*\n🔓 Reabertura automática programada ${durRel.humanLabel}.`
      };
    }
  }

  const delayArg = args.delayMinutes || args.time;
  if (delayArg) {
    const rel = parseRelativeTime(delayArg);
    if (rel.success && rel.delayMinutes > 0) {
      const calendarAction = args.action === 'close' ? 'close_group' : 'open_group';
      const isClose = args.action === 'close';
      const actionLabel = isClose ? 'Fechamento do grupo' : 'Abertura do grupo';

      await scheduleTimedGroupAction(sock, from, {
        action: calendarAction,
        rel,
        text: `${actionLabel} programado pelo administrador`,
        sender,
        lang
      });

      const responseText = isClose
        ? `🔒 *Fechamento Programado:*\nO grupo será fechado ${rel.humanLabel}.`
        : `🔓 *Abertura Programada:*\nO grupo será aberto ${rel.humanLabel}.`;

      return {
        success: true,
        message: responseText
      };
    }
  }

  const action = args.action === 'close' ? 'announcement' : 'not_announcement';
  await sock.groupSettingUpdate(from, action);

  return {
    success: true,
    message: action === 'announcement'
      ? t(lang, 'mute.closed')
      : t(lang, 'mute.opened')
  };
};
