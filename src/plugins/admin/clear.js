const { safeDelete } = require('../../utils/antiBan');

module.exports = {
  name: 'del',
  aliases: ['del', 'apagar', 'delete', 'borrar', 'limparmsg', 'rm'],
  description: 'Apaga a mensagem específica respondida no chat',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, reply, t }) {
    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo;
    const quotedStanzaId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant;

    if (!quotedStanzaId) {
      return reply(t('clear.reply_required'));
    }

    try {
      // Apaga a mensagem respondida
      await safeDelete(sock, from, {
        remoteJid: from,
        id: quotedStanzaId,
        participant: quotedParticipant
      });

      // Também apaga o comando !del enviado pelo admin para limpar o chat
      if (msg.key) {
        await safeDelete(sock, from, msg.key);
      }
    } catch (err) {
      return reply(t('common.error'));
    }
  }
};
