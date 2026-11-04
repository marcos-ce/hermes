const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

/**
 * Ferramenta de IA: configura metas progressivas de membros no grupo.
 * O Hermes chama esta tool quando o admin pede algo como:
 * "quando chegar a 100 membros, diga X"
 * "ao bater 500 membros, faça sorteio"
 * "meta de 50 membros: abrir o grupo"
 */
module.exports = async function setGroupMilestone({ from, lang, args }) {
  const { count, message, action, clearAll } = args || {};

  const cfg = configManager.getPluginConfig(from, 'milestone') || {};
  let targets = Array.isArray(cfg.targets) ? [...cfg.targets] : [];

  // clearAll: remove todas as metas
  if (clearAll === true) {
    configManager.updatePluginConfig(from, 'milestone', { targets: [] });
    return { success: true, message: t(lang, 'milestone.cleared') };
  }

  // count é obrigatório para adicionar
  const targetCount = parseInt(count, 10);
  if (!targetCount || isNaN(targetCount) || targetCount < 1) {
    return { success: false, error: 'Informe um número de membros válido (ex: count: 100).' };
  }

  const validActions = ['announce', 'pin', 'open_group', 'raffle'];
  const resolvedAction = validActions.includes(action) ? action : 'announce';

  const milestoneMessage = message
    ? String(message).trim()
    : `🎉 O grupo atingiu {count} membros! Bem-vindo(a), {user}!`;

  // Substitui meta existente com mesmo count ou adiciona nova
  const existingIdx = targets.findIndex(t => t.count === targetCount);
  if (existingIdx >= 0) {
    targets[existingIdx] = { count: targetCount, message: milestoneMessage, action: resolvedAction, reached: false };
  } else {
    targets.push({ count: targetCount, message: milestoneMessage, action: resolvedAction, reached: false });
  }

  // Ordena por count ascendente
  targets.sort((a, b) => a.count - b.count);

  configManager.updatePluginConfig(from, 'milestone', { targets, enabled: true, configured: true });

  const feedback = t(lang, 'milestone.target_added', { count: targetCount });
  return { success: true, message: feedback };
};
