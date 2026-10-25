const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');

module.exports = {
  name: 'hidetag',
  aliases: ['hidetag', 'totag', 'comunicado', 'todos', 'marcar', 'notificar', 'all'],
  usage: 'all [texto]',
  description: 'Marca todos os membros do grupo de forma oculta',
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

    const metadata = await getGroupMetadata(sock, from);
    if (!metadata || !Array.isArray(metadata.participants)) {
      return reply(t('common.error'));
    }

    const allMembers = new Set();
    metadata.participants.forEach(p => {
      if (p.id) allMembers.add(p.id);
      if (p.jid) allMembers.add(p.jid);
      if (p.lid) allMembers.add(p.lid);
    });

    // Envia a mensagem com todas as menções invisíveis
    await sendSafeMessage(sock, from, {
      text: messageToSend,
      mentions: Array.from(allMembers)
    });
  }
};
