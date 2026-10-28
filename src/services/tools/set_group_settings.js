const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const memoryEngine = require('../memoryEngine');
const { t } = require('../../utils/i18n');

module.exports = async function setGroupSettings({ sock, msg, from, sender, lang, args }) {
  const results = [];
  if (args.lang && ['pt', 'es', 'en'].includes(args.lang)) {
    configManager.setGroupLang(from, args.lang);
    results.push(t(args.lang, 'lang.changed'));
  }
  if (args.prefix && String(args.prefix).trim().length === 1) {
    const newPrefix = String(args.prefix).trim();
    configManager.setGroupPrefix(from, newPrefix);
    results.push(t(lang, 'config.prefix_changed', { prefix: newPrefix }));
  }
  if (args.clearMemory) {
    memoryEngine.clearGroupMemory(from);
    results.push('🧹 *Memória limpa:* O histórico de conversas do Hermes neste grupo foi zerado.');
  }
  if (args.openPanel) {
    await wizardEngine.startConfigPanel(sock, msg, from, sender);
    return { success: true };
  }
  if (results.length > 0) {
    return { success: true, message: results.join('\n') };
  }
  return { success: false, error: t(lang, 'common.error') };
};
