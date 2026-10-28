const pinTracker = require('../../utils/pinTracker');
const memoryEngine = require('../memoryEngine');
const { cleanJid, getBotIdentity } = require('../../utils/jidResolver');
const logger = require('../../utils/logger');
const { t } = require('../../utils/i18n');

module.exports = async function pinGroupMessage({ sock, msg, from, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const action = args.action || 'pin';

  // 1. Desafixar todas as mensagens fixadas do grupo
  if (action === 'unpin_all') {
    const count = await pinTracker.unpinAllMessages(sock, from);
    if (count === 0) {
      return {
        success: true,
        message: '📌 Não há mensagens fixadas registradas neste grupo.'
      };
    }
    return {
      success: true,
      message: `📌 Todas as ${count} mensagem(ns) fixada(s) foram desafixadas com sucesso!`
    };
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

  let targetStanzaId = null;
  let targetParticipant = null;

  // Prioridade absoluta: mensagem citada diretamente no chat (reply)
  if (contextInfo?.stanzaId) {
    targetStanzaId = contextInfo.stanzaId;
    targetParticipant = contextInfo.participant;
  } else if (args.messageId && /^m\d{1,9}$/i.test(args.messageId.trim())) {
    // Ref explícito do histórico (ex: "m123") quando NÃO houve citação física
    const refData = memoryEngine.getMessageByRef(from, args.messageId.trim());
    if (refData?.msgId) {
      targetStanzaId = refData.msgId;
      targetParticipant = refData.participant || refData.sender;
    }
  }

  // Se pediu para desafixar mas não apontou mensagem, tenta desafixar as conhecidas do grupo
  if (action === 'unpin' && !targetStanzaId) {
    const count = await pinTracker.unpinAllMessages(sock, from);
    if (count > 0) {
      return {
        success: true,
        message: `📌 ${count} mensagem(ns) fixada(s) foram desafixadas com sucesso!`
      };
    }
    return { success: false, error: t(lang, 'pin.reply_required') };
  }

  if (!targetStanzaId) {
    return { success: false, error: t(lang, 'pin.reply_required') };
  }

  const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);

  const cleanParticipant = cleanJid(targetParticipant || '');
  const cleanParticipantNum = cleanParticipant.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  const isFromMe = cleanParticipant === botJid ||
                   cleanParticipant === botLid ||
                   (botNum && cleanParticipantNum === botNum) ||
                   (botLidNum && cleanParticipantNum === botLidNum);

  const targetKey = {
    remoteJid: from,
    fromMe: isFromMe,
    id: targetStanzaId,
    participant: isFromMe ? (cleanParticipant || botJid || undefined) : (targetParticipant || undefined)
  };

  if (action === 'unpin') {
    try {
      await sock.sendMessage(from, {
        pin: targetKey,
        type: 2 // 2 = UNPIN_FOR_ALL
      });
      pinTracker.removePin(from, targetKey.id);
      return {
        success: true,
        message: t(lang, 'pin.unpinned')
      };
    } catch (err) {
      logger.error({ err, from }, 'Erro ao desafixar mensagem via Hermes');
      return { success: false, error: t(lang, 'pin.error') };
    }
  }

  let durationSecs = 86400;
  let durationLabel = '24 horas';
  if (args.duration === '7d') {
    durationSecs = 604800;
    durationLabel = '7 dias';
  } else if (args.duration === '30d') {
    durationSecs = 2592000;
    durationLabel = '30 dias';
  }

  try {
    await sock.sendMessage(from, {
      pin: targetKey,
      type: 1, // 1 = PIN_FOR_ALL
      time: durationSecs
    });
    pinTracker.addPin(from, targetKey);
    return {
      success: true,
      message: t(lang, 'pin.pinned', { duration: durationLabel })
    };
  } catch (err) {
    logger.error({ err, from }, 'Erro ao fixar mensagem via Hermes');
    return { success: false, error: t(lang, 'pin.error') };
  }
};
