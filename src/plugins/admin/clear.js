const { safeDelete } = require('../../utils/antiBan');
const { cleanJid, getBotIdentity } = require('../../utils/jidResolver');

module.exports = {
  name: 'del',
  aliases: ['del', 'apagar', 'delete', 'borrar', 'limparmsg', 'rm'],
  usage: 'del (respondendo)',
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
      const { botJid, botLid, botNum } = getBotIdentity(sock);

      const cleanParticipant = cleanJid(quotedParticipant || '');
      const participantNum = cleanParticipant.replace(/@.*$/, '').replace(/\D/g, '');

      const isFromMe = (cleanParticipant === botJid) ||
                       (cleanParticipant === botLid) ||
                       (botNum && participantNum === botNum);

      // Apaga a mensagem respondida usando a chave original exata
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
    } catch (_err) {
      return reply(t('common.error'));
    }
  }
};
