const { safeDelete } = require('../../utils/antiBan');
const { cleanJid, getBotIdentity } = require('../../utils/jidResolver');
const memoryEngine = require('../memoryEngine');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function deleteMessage({ sock, msg, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      msg?.message?.extendedTextMessage?.contextInfo;

  let deleteId = null;
  let deleteParticipant = null;

  const { botJid, botLid } = getBotIdentity(sock);

  // 1. Prioridade absoluta: mensagem citada diretamente no chat (reply)
  if (contextInfo?.stanzaId) {
    deleteId = contextInfo.stanzaId;
    deleteParticipant = contextInfo.participant;

    // Blindagem de Segurança: se a mensagem citada for do próprio bot (Hermes),
    // SÓ apaga se o admin tiver intenção explícita de apagar no texto (ex: "apaga", "deleta", "limpa").
    const isQuotingBot = deleteParticipant && (
      cleanJid(deleteParticipant) === botJid ||
      cleanJid(deleteParticipant) === botLid
    );
    const rawText = (msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '').toLowerCase().trim();
    const hasExplicitDelete = /\b(apaga|apagar|deleta|deletar|limpa|limpar|some|tira|del|exclui|excluir)\b/i.test(rawText);

    if (isQuotingBot && !hasExplicitDelete) {
      logger.warn({ from, sender, rawText }, 'delete_message bloqueada: quote ao bot sem intenção explícita de exclusão');
      return {
        success: false,
        error: 'Ação cancelada: para apagar mensagens do bot, diga expressamente "apaga" ou "deleta".'
      };
    }
  } else if (args.messageId && /^m\d{1,9}$/i.test(String(args.messageId).trim())) {
    // 2. Ref do histórico ("m123") quando NÃO houve citação direta
    const refData = memoryEngine.getMessageByRef(from, String(args.messageId).trim());
    if (!refData || !refData.msgId) {
      return { success: false, error: t(lang, 'hermes.msg_not_found') };
    }
    deleteId = refData.msgId;
    deleteParticipant = refData.participant || refData.sender;
  }

  if (!deleteId) {
    return { success: false, error: t(lang, 'clear.reply_required') };
  }

  await safeDelete(sock, from, {
    remoteJid: from,
    id: deleteId,
    participant: deleteParticipant
  });

  return { success: true, message: t(lang, 'clear.success') };
};
