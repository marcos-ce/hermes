const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function forgetGroupFact({ from, lang, args }) {
  const key = typeof args.key === 'string' ? args.key.trim().slice(0, 100) : '';
  if (!key) {
    return { success: false, error: 'Informe a chave do fato a ser esquecido.' };
  }

  const removed = configManager.removeCultureFact(from, key);
  const confirmMsg = removed
    ? t(lang, 'hermes.fact_forgotten', { key })
    : t(lang, 'hermes.fact_not_found', { key });

  return {
    success: true,
    message: confirmMsg
  };
};
