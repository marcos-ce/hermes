module.exports = {
  name: 'mute',
  aliases: ['mute', 'unmute', 'fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'grupo', 'mutar', 'desmutar'],
  usage: 'fechar | /abrir',
  description: 'Abre e fecha o grupo imediatamente para envio de mensagens',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, _msg, from, args, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmd = (command || '').toLowerCase();
    const arg = (args[0] || '').toLowerCase();

    // Comandos explícitos de fechar
    const isExplicitClose = ['fechar', 'cerrar', 'lock'].includes(cmd);
    // Comandos explícitos de abrir
    const isExplicitOpen = ['abrir', 'unlock', 'unmute', 'desmutar'].includes(cmd);

    // Fechamento: comando direto ou !mute on / !mute 1 / !mute fechar
    if (isExplicitClose || (['mute', 'mutar', 'grupo'].includes(cmd) && ['on', 'fechar', 'cerrar', 'lock', '1'].includes(arg))) {
      await sock.groupSettingUpdate(from, 'announcement');
      return reply(t('mute.closed'));
    }

    // Abertura: comando direto ou !mute off / !mute 2 / !mute abrir
    if (isExplicitOpen || (['mute', 'mutar', 'grupo'].includes(cmd) && ['off', 'abrir', 'unlock', 'open', '2'].includes(arg))) {
      await sock.groupSettingUpdate(from, 'not_announcement');
      return reply(t('mute.opened'));
    }

    // Se chamado apenas como !mute ou !grupo sem argumentos (ou escolha interativa)
    return reply(t('mute.prompt'));
  }
};
