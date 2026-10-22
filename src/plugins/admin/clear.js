const { safeDelete } = require('../../utils/antiBan');

module.exports = {
  name: 'del',
  aliases: ['del', 'apagar', 'delete', 'borrar', 'limparmsg', 'rm'],
  description: 'Apaga a mensagem específica respondida no chat',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, reply, t }) {
    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    const quotedStanzaId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant;

    if (!quotedStanzaId) {
      return reply(t('clear.reply_required'));
    }

    try {
      const botJid = sock?.user?.id?.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      const participantNum = quotedParticipant?.replace(/@.*$/, '').replace(/\D/g, '');
      const isFromMe = participantNum === botNum;

      // Apaga a mensagem respondida
      await safeDelete(sock, from, {
        remoteJid: from,
        fromMe: isFromMe,
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
