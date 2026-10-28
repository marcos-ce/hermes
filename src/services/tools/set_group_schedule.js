const configManager = require('../../core/configManager');
const { normalizeTime } = require('../toolHelpers');
const { t } = require('../../utils/i18n');

module.exports = async function setGroupSchedule({ from, lang, args }) {
  const currentCfg = configManager.getPluginConfig(from, 'schedule') || {};
  if (args.enabled === false) {
    configManager.setPluginEnabled(from, 'schedule', false);
    return {
      success: true,
      message: `${t(lang, 'common.saved')}\n⏰ *Horários Automáticos:* ${t(lang, 'common.disabled')}`
    };
  }

  const normClose = args.closeTime !== undefined ? normalizeTime(args.closeTime) : null;
  const normOpen = args.openTime !== undefined ? normalizeTime(args.openTime) : null;

  if (args.closeTime !== undefined && !normClose) {
    return { success: false, error: 'Formato de horário de fechamento inválido. Use HH:MM (ex: 23:00).' };
  }
  if (args.openTime !== undefined && !normOpen) {
    return { success: false, error: 'Formato de horário de abertura inválido. Use HH:MM (ex: 07:00).' };
  }

  const closeTime = normClose || currentCfg.closeTime || '23:00';
  const openTime = normOpen || currentCfg.openTime || '07:00';

  configManager.updatePluginConfig(from, 'schedule', {
    closeTime,
    openTime,
    enabled: true
  });

  return {
    success: true,
    message: t(lang, 'schedule.status', {
      status: t(lang, 'common.enabled'),
      close: closeTime === '0' ? '—' : closeTime,
      open: openTime === '0' ? '—' : openTime
    })
  };
};
