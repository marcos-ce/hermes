const { groupCache } = require('../../utils/cache');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function setGroupDescription({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo;

  const rawQuoted = contextInfo?.quotedMessage;
  const unwrappedQuoted = rawQuoted?.ephemeralMessage?.message ||
                          rawQuoted?.viewOnceMessage?.message ||
                          rawQuoted?.viewOnceMessageV2?.message ||
                          rawQuoted?.documentWithCaptionMessage?.message ||
                          rawQuoted;

  const quotedText = (unwrappedQuoted?.conversation ||
                      unwrappedQuoted?.extendedTextMessage?.text ||
                      unwrappedQuoted?.imageMessage?.caption ||
                      unwrappedQuoted?.videoMessage?.caption ||
                      '').trim();

  let newDesc = typeof args.description === 'string' ? args.description.trim() : '';

  // Se o admin falou "coloque isso de descrição" respondendo a uma mensagem
  const isReferential = !newDesc || /^(isso|isto|essa|esse|esta|este|o texto acima|a mensagem citada|a resposta acima|o que está citado)$/i.test(newDesc);
  if (isReferential && quotedText.length > 0) {
    newDesc = quotedText;
  }

  const isClearing = !newDesc || ['limpar', 'clear', 'remover', 'del', 'apagar', '-'].includes(newDesc.toLowerCase());

  try {
    await sock.groupUpdateDescription(from, isClearing ? '' : newDesc);
    groupCache.del(from);

    return {
      success: true,
      message: isClearing ? t(lang, 'setdesc.cleared') : t(lang, 'setdesc.success')
    };
  } catch (err) {
    logger.error({ err, from }, 'Erro ao atualizar descrição via Tool Call do Hermes');
    return {
      success: false,
      error: t(lang, 'setdesc.error')
    };
  }
};
