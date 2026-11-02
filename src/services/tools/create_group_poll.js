const pollTracker = require('../../utils/pollTracker');
const { sendSafeMessage } = require('../../utils/antiBan');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

/**
 * MOTOR AGENTICO DE ENQUETES CONDICIONAIS
 *
 * Normaliza um mapa de ações condicionais passado pelo LLM.
 * O LLM pode passar como objeto { "Sim, fechar o grupo": "close_group" }
 * ou como array [{ option, action, params }].
 * Retorna sempre Array<{ option: string, action: string, params?: object }> ou null.
 *
 * Ações suportadas:
 *   close_group  → fecha o grupo
 *   open_group   → abre o grupo
 *   ban_member   → bane target (params.target obrigatório)
 *   warn_member  → adverte target
 *   raffle       → sorteia no grupo
 *   reminder     → agenda lembrete (params.text, params.time)
 */
function normalizeConditionalActions(raw) {
  if (!raw) return null;

  // Array explícito de { option, action, params? }
  if (Array.isArray(raw)) {
    const valid = raw.filter(r => r && typeof r.option === 'string' && typeof r.action === 'string');
    return valid.length > 0 ? valid : null;
  }

  // Objeto plano { "Opção A": "close_group", "Opção B": "open_group" }
  if (typeof raw === 'object') {
    const entries = Object.entries(raw)
      .filter(([, v]) => typeof v === 'string' && v.length > 0)
      .map(([option, action]) => ({ option, action }));
    return entries.length > 0 ? entries : null;
  }

  return null;
}

module.exports = async function createGroupPoll({ sock, from, lang, args }) {
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 255) : '';
  const options = Array.isArray(args.options) ? args.options : [];
  const isMultiple = Boolean(args.multipleAnswers);

  // Ações condicionais agenticas: executadas autonomamente após apuração
  const conditionalActions = normalizeConditionalActions(args.conditionalActions);

  if (!title || options.length < 2) {
    return {
      success: false,
      error: t(lang, 'poll.error_options')
    };
  }

  try {
    const sent = await sendSafeMessage(sock, from, {
      poll: {
        name: title,
        values: options.slice(0, 12),
        selectableCount: isMultiple ? 0 : 1
      }
    });

    if (sent?.key?.id) {
      pollTracker.savePoll(from, sent);

      // Persiste o mapa de ações condicionais junto à enquete
      if (conditionalActions) {
        pollTracker.setConditionalActions(sent.key.id, conditionalActions);
        logger.info({ pollId: sent.key.id, conditionalActions }, 'Enquete criada com ações condicionais agenticas');
      }
    }

    const typeLabel = isMultiple ? t(lang, 'poll.type_multi') : t(lang, 'poll.type_single');
    const confirmMsg = t(lang, 'poll.success', {
      title,
      type: typeLabel,
      count: options.length
    });

    const agentNote = conditionalActions
      ? `\n🤖 _Ação automática configurada: após a apuração, executarei o decidido pelo grupo._`
      : '';

    return {
      success: true,
      message: confirmMsg + agentNote
    };
  } catch (err) {
    logger.error({ err, from, title }, 'Erro ao criar enquete via Hermes');
    return {
      success: false,
      error: t(lang, 'poll.error')
    };
  }
};
