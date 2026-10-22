module.exports = {
  name: 'mute',
  aliases: ['mute', 'unmute', 'fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'grupo', 'mutar', 'desmutar'],
  description: 'Abre e fecha o grupo imediatamente para envio de mensagens',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, args, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmd = (command || '').toLowerCase();
    const arg = (args[0] || '').toLowerCase();

    const isCloseAction = ['fechar', 'cerrar', 'lock', 'mute', 'mutar'].includes(cmd) && arg !== 'off' && arg !== 'abrir' && arg !== '2' || 
                          arg === 'on' || arg === 'fechar' || arg === 'cerrar' || arg === '1' || arg === 'mutar';

    const isOpenAction = ['abrir', 'unlock', 'unmute', 'desmutar'].includes(cmd) || 
                         arg === 'off' || arg === 'abrir' || arg === '2' || arg === 'desmutar';

    if (isCloseAction) {
      await sock.groupSettingUpdate(from, 'announcement');
      return reply(t('mute.closed'));
    }

    if (isOpenAction) {
      await sock.groupSettingUpdate(from, 'not_announcement');
      return reply(t('mute.opened'));
    }

    // Se chamado apenas como !mute ou !grupo sem argumentos
    return reply(t('mute.prompt'));
  }
};
