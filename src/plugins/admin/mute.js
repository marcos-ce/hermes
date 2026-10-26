const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'mute',
  cmdNumber: 12,
  aliases: ['mute', 'unmute', 'fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'grupo'],
  usage: 'fechar | /abrir',
  description: 'Abre e fecha o grupo imediatamente para envio de mensagens',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, sender, args, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmd = (command || '').toLowerCase();
    const arg = (args[0] || '').toLowerCase();
    const myNum = String(module.exports.cmdNumber || 12);

    // Comandos explícitos de fechar
    const isExplicitClose = ['fechar', 'cerrar', 'lock'].includes(cmd);
    // Comandos explícitos de abrir
    const isExplicitOpen = ['abrir', 'unlock', 'unmute', 'desmutar'].includes(cmd);
    const isCmdOrAlias = ['mute', 'mutar', 'grupo', myNum].includes(cmd);

    // Fechamento: comando direto ou !mute on / !mute 1 / !mute fechar / !12 fechar
    if (isExplicitClose || (isCmdOrAlias && ['on', 'fechar', 'cerrar', 'lock', '1'].includes(arg))) {
      await sock.groupSettingUpdate(from, 'announcement');
      return reply(t('mute.closed'));
    }

    // Abertura: comando direto ou !mute off / !mute 2 / !mute abrir / !12 abrir
    if (isExplicitOpen || (isCmdOrAlias && ['off', 'abrir', 'unlock', 'open', '2'].includes(arg))) {
      await sock.groupSettingUpdate(from, 'not_announcement');
      return reply(t('mute.opened'));
    }

    // Se chamado pelo número sem argumentos (ex: /12), faz o toggle inteligente do grupo
    if (cmd === myNum && !arg) {
      const { getGroupMetadata } = require('../../utils/jidResolver');
      const meta = await getGroupMetadata(sock, from);
      const isClosed = meta?.announce === true || meta?.announce === 'true';
      if (isClosed) {
        await sock.groupSettingUpdate(from, 'not_announcement');
        return reply(t('mute.opened'));
      } else {
        await sock.groupSettingUpdate(from, 'announcement');
        return reply(t('mute.closed'));
      }
    }

    // Se chamado apenas como !mute ou !grupo sem argumentos (abre sessão interativa)
    return await wizardEngine.startMuteSelection(sock, msg, from, sender);
  }
};
