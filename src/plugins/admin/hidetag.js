const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');

module.exports = {
  name: 'hidetag',
  aliases: ['hidetag', 'totag', 'aviso', 'todos', 'marcar', 'notificar', 'all'],
  description: 'Marca todos os membros do grupo de forma oculta',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const quotedText = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                       msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
                       msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption ||
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
