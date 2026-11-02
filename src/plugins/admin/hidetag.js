const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');

module.exports = {
  name: 'hidetag',
  aliases: ['hidetag', 'totag', 'comunicado', 'todos', 'marcar', 'notificar', 'all'],
  usage: 'all [texto]',
  description: 'Envia comunicado oficial em destaque no grupo (sem marcação em massa por segurança Anti-Ban)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    const quotedMsg = contextInfo?.quotedMessage?.ephemeralMessage?.message ||
                      contextInfo?.quotedMessage?.viewOnceMessage?.message ||
                      contextInfo?.quotedMessage?.viewOnceMessageV2?.message ||
                      contextInfo?.quotedMessage?.documentWithCaptionMessage?.message ||
                      contextInfo?.quotedMessage;

    const quotedText = quotedMsg?.conversation ||
                       quotedMsg?.extendedTextMessage?.text ||
                       quotedMsg?.imageMessage?.caption ||
                       quotedMsg?.videoMessage?.caption ||
                       quotedMsg?.documentMessage?.caption ||
                       '';

    const messageToSend = text || quotedText;
    if (!messageToSend) {
      return reply(t('hidetag.empty'));
    }

    // BLINDAGEM ANTI-BAN: Menção oculta em massa de todos os membros foi desativada
    // permanentemente para prevenir banimento imediato da conta pela Meta.
    // O comunicado oficial é enviado com destaque visual no chat, sem adicionar menções invisíveis.
    await sendSafeMessage(sock, from, {
      text: `📢 *COMUNICADO:*\n\n${messageToSend}`
    });
  }
};
