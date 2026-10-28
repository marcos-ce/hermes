const pollTracker = require('../../utils/pollTracker');
const { sendSafeMessage } = require('../../utils/antiBan');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function createGroupPoll({ sock, from, lang, args }) {
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 255) : '';
  const options = Array.isArray(args.options) ? args.options : [];
  const isMultiple = Boolean(args.multipleAnswers);

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
    }

    const typeLabel = isMultiple ? t(lang, 'poll.type_multi') : t(lang, 'poll.type_single');
    const confirmMsg = t(lang, 'poll.success', {
      title,
      type: typeLabel,
      count: options.length
    });

    return {
      success: true,
      message: confirmMsg
    };
  } catch (err) {
    logger.error({ err, from, title }, 'Erro ao criar enquete via Hermes');
    return {
      success: false,
      error: t(lang, 'poll.error')
    };
  }
};
