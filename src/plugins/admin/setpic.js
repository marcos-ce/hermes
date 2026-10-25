const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const logger = require('../../utils/logger');

/**
 * Extrai o buffer de imagem da mensagem direta ou da mensagem citada (quote)
 * @param {object} sock 
 * @param {object} msg 
 * @returns {Promise<Buffer|null>}
 */
async function extractImageBuffer(sock, msg) {
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

  let targetMsg = null;

  if (realMsg?.imageMessage || realMsg?.stickerMessage) {
    targetMsg = {
      key: msg?.key,
      message: realMsg
    };
  } else if (unwrappedQuoted?.imageMessage || unwrappedQuoted?.stickerMessage) {
    targetMsg = {
      key: {
        remoteJid: msg?.key?.remoteJid,
        id: contextInfo?.stanzaId,
        participant: contextInfo?.participant
      },
      message: unwrappedQuoted
    };
  }

  if (!targetMsg) return null;

  try {
    const buffer = await downloadMediaMessage(
      targetMsg,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: sock?.updateMediaMessage
      }
    );
    return buffer;
  } catch (err) {
    logger.error({ err }, 'Erro ao baixar imagem para foto de perfil do grupo');
    return null;
  }
}

module.exports = {
  name: 'setpic',
  cmdNumber: 25,
  aliases: ['setpic', 'foto', 'icone', 'setfoto', 'seticon', 'fotogrupo', 'icon', 'picture'],
  usage: 'foto (legenda ou reply) [limpar]',
  description: {
    pt: 'Altera ou remove a foto/ícone de perfil do grupo',
    es: 'Cambia o elimina la foto/icono de perfil del grupo',
    en: 'Changes or removes the group profile picture/icon'
  },
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  extractImageBuffer,

  async execute({ sock, msg, from, args, reply, t, prefix, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const firstArg = (args[0] || '').toLowerCase();
    const isClearAction = ['limpar', 'remover', 'del', 'clear', 'delete', 'tirar', '-'].includes(firstArg);

    // Se o admin solicitou remover a foto do grupo
    if (isClearAction) {
      try {
        await sock.removeProfilePicture(from);
        return reply(t('setpic.cleared'));
      } catch (err) {
        logger.error({ err, from }, 'Erro ao remover foto do grupo');
        return reply(t('setpic.error'));
      }
    }

    // Tenta extrair a imagem da mensagem ou da citação
    const buffer = await extractImageBuffer(sock, msg);
    if (!buffer) {
      return reply(t('setpic.no_image', { prefix: prefix || '!' }));
    }

    try {
      await sock.updateProfilePicture(from, buffer);
      return reply(t('setpic.success'));
    } catch (err) {
      logger.error({ err, from }, 'Erro ao atualizar foto de perfil do grupo');
      return reply(t('setpic.error'));
    }
  }
};
