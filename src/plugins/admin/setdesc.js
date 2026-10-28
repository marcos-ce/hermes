const { getGroupMetadata } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const logger = require('../../utils/logger');

module.exports = {
  name: 'setdesc',
  cmdNumber: 32,
  aliases: ['setdesc', 'desc', 'descricao', 'descrição', 'descripcion', 'description', 'mudardesc', 'modificardesc'],
  usage: 'setdesc [novo texto]',
  description: {
    pt: 'Altera, exibe ou limpa a descrição/regras do grupo',
    es: 'Cambia, muestra o elimina la descripción/reglas del grupo',
    en: 'Changes, displays or clears the group description/rules'
  },
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, args, reply, t, prefix, isGroup }) {
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

    const firstArg = (args[0] || '').toLowerCase();
    const isClearAction = ['limpar', 'clear', 'remover', 'del', 'apagar', '-'].includes(firstArg) && args.length === 1;

    // Se o admin solicitou a remoção/limpeza da descrição
    if (isClearAction) {
      try {
        await sock.groupUpdateDescription(from, '');
        groupCache.del(from);
        return reply(t('setdesc.cleared'));
      } catch (err) {
        logger.error({ err, from }, 'Erro ao limpar descrição do grupo');
        return reply(t('setdesc.error'));
      }
    }

    const newDescription = text || quotedText;

    // Se nenhum texto foi fornecido e não respondeu a mensagem com texto, exibe a descrição atual com ajuda
    if (!newDescription || newDescription.trim().length === 0) {
      const metadata = await getGroupMetadata(sock, from);
      const currentDesc = metadata?.desc && metadata.desc.trim().length > 0
        ? metadata.desc.trim()
        : t('setdesc.empty');

      return reply(t('setdesc.current', { description: currentDesc, prefix: prefix || '!' }));
    }

    // Atualiza a descrição no WhatsApp
    try {
      await sock.groupUpdateDescription(from, newDescription);
      groupCache.del(from);
      return reply(t('setdesc.success'));
    } catch (err) {
      logger.error({ err, from }, 'Erro ao atualizar descrição do grupo');
      return reply(t('setdesc.error'));
    }
  }
};
