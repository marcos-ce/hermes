const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function learnGroupFact({ from, lang, args }) {
  const category = String(args.category || 'fact').toLowerCase();
  const key = typeof args.key === 'string' ? args.key.trim().slice(0, 100) : '';
  const value = typeof args.value === 'string' ? args.value.trim().slice(0, 300) : '';

  if (!key || !value) {
    return { success: false, error: 'Chave e valor são obrigatórios para registrar o fato.' };
  }

  if (category === 'rule') {
    configManager.addCultureRule(from, `${key}: ${value}`);
  } else if (category === 'tone') {
    configManager.updateGroupCulture(from, { tone: value, vibe: key });
  } else {
    configManager.addCultureFact(from, key, value);
  }

  const confirmMsg = t(lang, 'hermes.fact_learned', { key, value });
  return {
    success: true,
    message: confirmMsg
  };
};
