const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage, checkHidetagCooldown, touchHidetagCooldown } = require('../../utils/antiBan');

module.exports = {
  name: 'hidetag',
  aliases: ['hidetag', 'totag', 'comunicado', 'todos', 'marcar', 'notificar', 'all'],
  usage: 'all [texto]',
  description: 'Envia comunicado oficial crucial em destaque no grupo (com extrema parcimônia e sem marcação em massa)',
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

    // BLINDAGEM ANTI-BAN: Parcimônia extrema para comunicados gerais.
    // Limita o envio a no máximo 1 comunicado a cada 2 minutos no grupo para evitar sinalizações de spam.
    const cooldownCheck = checkHidetagCooldown(from);
    if (!cooldownCheck.allowed) {
      return reply(
        `⏳ *Aviso Anti-Ban:* Comunicados gerais devem ser usados com extrema parcimônia (apenas avisos cruciais).\n` +
        `Para proteger o grupo e a conta, aguarde *${cooldownCheck.remainingSec}s* para enviar outro comunicado.`
      );
    }
    touchHidetagCooldown(from);

    // Envia comunicado com destaque visual no chat, sem adicionar menções invisíveis em massa.
    await sendSafeMessage(sock, from, {
      text: `📢 *COMUNICADO OFICIAL:*\n\n${messageToSend}`
    });
  }
};
