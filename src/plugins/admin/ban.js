const { safeKick, safeDelete } = require('../../utils/antiBan');
const { extractTarget, checkAdminStatus } = require('../../utils/jidResolver');
const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'ban',
  aliases: ['ban', 'kick', 'remover', 'expulsar', 'banir', 'eliminar'],
  description: 'Remove membro do grupo imediatamente com proteção para admins e dono',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Configurações de Banimento',
      es: 'Configuraciones de Expulsión',
      en: 'Ban Settings'
    },
    description: {
      pt: 'Configura o comportamento da remoção de membros',
      es: 'Configura el comportamiento de la expulsión de miembros',
      en: 'Configures member removal behavior'
    },
    fields: [
      {
        name: 'deleteMessage',
        type: 'boolean',
        question: {
          pt: 'Apagar a mensagem que foi respondida ao aplicar o ban?',
          es: '¿Borrar el mensaje al que se respondió al aplicar la expulsión?',
          en: 'Delete the replied message when banning?'
        },
        default: true
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    if (args[0]?.toLowerCase() === 'config') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'ban');
    }

    const target = extractTarget(msg, text);
    if (!target) {
      return reply(t('common.not_found_target'));
    }

    // Proteção: Não banir o próprio bot
    const botJid = sock?.user?.id?.replace(/@.*$/, '').split(':')[0];
    const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');
    if (botJid && targetNum === botJid) {
      return reply(t('ban.cannot_ban_bot'));
    }

    // Proteção: Não banir o Dono
    if (settings.isOwner(target, sock)) {
      return reply(t('ban.cannot_ban_owner'));
    }

    // Proteção: Não banir administradores
    const adminCheck = await checkAdminStatus(sock, from, target);
    if (adminCheck.isAdmin) {
      return reply(t('ban.cannot_ban_admin'));
    }

    // Se houver mensagem respondida e o plugin ban estiver configurado para deletar
    const banCfg = configManager.getPluginConfig(from, 'ban') || {};
    if (banCfg.deleteMessage !== false) {
      const quotedMsg = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedStanzaId = msg?.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const quotedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedMsg && quotedStanzaId) {
        await safeDelete(sock, from, {
          remoteJid: from,
          id: quotedStanzaId,
          participant: quotedParticipant
        });
      }
    }

    // Remoção Imediata
    await safeKick(sock, from, target);
    return reply(t('ban.success', { user: targetNum }), {
      mentions: [target]
    });
  }
};
