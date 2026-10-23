const { safeKick, safeDelete } = require('../../utils/antiBan');
const { resolveTarget, checkAdminStatus, cleanJid } = require('../../utils/jidResolver');
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

    const targetData = await resolveTarget(sock, msg, from, text);
    if (!targetData) {
      return reply(t('common.not_found_target'));
    }

    const targetPhone = targetData.phoneJid;
    const targetGroup = targetData.groupJid;
    const targetNum = targetData.displayNum;

    // Proteção: Não banir o próprio bot
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    if (targetGroup === botJid || targetGroup === botLid || (botNum && targetNum === botNum)) {
      return reply(t('ban.cannot_ban_bot'));
    }

    // Proteção: Não banir o Dono
    if (settings.isOwner(targetPhone, sock) || settings.isOwner(targetGroup, sock)) {
      return reply(t('ban.cannot_ban_owner'));
    }

    // Proteção: Não banir administradores
    const adminCheck = await checkAdminStatus(sock, from, targetPhone);
    if (adminCheck.isAdmin) {
      return reply(t('ban.cannot_ban_admin'));
    }

    // Se houver mensagem respondida e o plugin ban estiver configurado para deletar
    const banCfg = configManager.getPluginConfig(from, 'ban') || {};
    if (banCfg.deleteMessage !== false) {
      const realMsg = msg?.message?.ephemeralMessage?.message ||
                      msg?.message?.viewOnceMessage?.message ||
                      msg?.message;

      const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                          realMsg?.imageMessage?.contextInfo ||
                          msg?.message?.extendedTextMessage?.contextInfo;

      const quotedStanzaId = contextInfo?.stanzaId;
      const quotedParticipant = contextInfo?.participant;
      if (quotedStanzaId) {
        await safeDelete(sock, from, {
          remoteJid: from,
          id: quotedStanzaId,
          participant: quotedParticipant
        });
      }
    }

    // Remoção Imediata usando o JID exato que o WhatsApp espera no grupo
    await safeKick(sock, from, targetGroup);
    return reply(t('ban.success', { user: targetNum }), {
      mentions: [targetGroup, targetPhone]
    });
  }
};
