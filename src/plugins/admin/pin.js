const { cleanJid, getBotIdentity } = require('../../utils/jidResolver');
const pinTracker = require('../../utils/pinTracker');
const logger = require('../../utils/logger');

module.exports = {
  name: 'pin',
  cmdNumber: 26,
  aliases: ['pin', 'fixar', 'pinar', 'destacar', 'unpin', 'desafixar', 'despinar'],
  usage: 'pin (reply) [24h|7d|30d] | unpin (reply)',
  description: {
    pt: 'Fixa ou desafixa uma mensagem no topo da conversa do grupo',
    es: 'Fija o desfija un mensaje en el chat del grupo',
    en: 'Pins or unpins a message at the top of the group chat'
  },
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, args, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmdName = (command || '').toLowerCase();
    const subArg = (args[0] || '').toLowerCase();

    // Suporte a desafixar todas as mensagens do grupo (!unpin all / !desafixar todas)
    const isUnpinAll = (['unpin', 'desafixar', 'despinar'].includes(cmdName) && ['all', 'todas', 'todos', 'tudo'].includes(subArg)) ||
                       (['all', 'todas', 'todos', 'tudo'].includes(args[1]?.toLowerCase()));

    if (isUnpinAll) {
      const count = await pinTracker.unpinAllMessages(sock, from);
      if (count === 0) {
        return reply('📌 Não há mensagens fixadas registradas neste grupo.');
      }
      return reply(`📌 Todas as mensagens fixadas registradas foram desafixadas com sucesso!`);
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

    const stanzaId = contextInfo?.stanzaId;
    if (!stanzaId) {
      return reply(t('pin.reply_required'));
    }

    const { botJid, botLid, botNum, botLidNum } = getBotIdentity(sock);

    const participantJid = cleanJid(contextInfo?.participant || '');
    const participantNum = participantJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isFromMe = participantJid === botJid ||
                     participantJid === botLid ||
                     (botNum && participantNum === botNum) ||
                     (botLidNum && participantNum === botLidNum);

    const targetKey = {
      remoteJid: from,
      fromMe: isFromMe,
      id: stanzaId,
      participant: isFromMe ? (participantJid || botJid || undefined) : (contextInfo?.participant || undefined)
    };

    const isUnpin = ['unpin', 'desafixar', 'despinar'].includes(cmdName) ||
                    ['unpin', 'desafixar', 'despinar', 'del', 'remover', 'tirar', 'off', '2'].includes(subArg);

    if (isUnpin) {
      try {
        await sock.sendMessage(from, {
          pin: targetKey,
          type: 2 // 2 = UNPIN_FOR_ALL
        });
        pinTracker.removePin(from, targetKey.id);
        return reply(t('pin.unpinned'));
      } catch (err) {
        logger.error({ err, from, stanzaId }, 'Erro ao desafixar mensagem');
        return reply(t('pin.error'));
      }
    }

    // Identificação do tempo de fixação
    let durationSecs = 86400; // padrão 24 horas
    let durationLabel = '24 horas';

    const durInput = subArg || (args[1] || '').toLowerCase();
    if (durInput === '7d' || durInput === '7' || durInput === 'semana') {
      durationSecs = 604800; // 7 dias
      durationLabel = '7 dias';
    } else if (durInput === '30d' || durInput === '30' || durInput === 'mes' || durInput === 'mês') {
      durationSecs = 2592000; // 30 dias
      durationLabel = '30 dias';
    } else if (durInput === '24h' || durInput === '1d' || durInput === 'dia') {
      durationSecs = 86400;
      durationLabel = '24 horas';
    }

    try {
      await sock.sendMessage(from, {
        pin: targetKey,
        type: 1, // 1 = PIN_FOR_ALL
        time: durationSecs
      });
      pinTracker.addPin(from, targetKey);
      return reply(t('pin.pinned', { duration: durationLabel }));
    } catch (err) {
      logger.error({ err, from, stanzaId }, 'Erro ao fixar mensagem');
      return reply(t('pin.error'));
    }
  }
};
