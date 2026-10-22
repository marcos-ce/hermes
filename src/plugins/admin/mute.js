module.exports = {
  name: 'mute',
  aliases: ['mute', 'unmute', 'fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'grupo'],
  description: 'Abre e fecha o grupo imediatamente para envio de mensagens',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    // Detecta qual gatilho de comando foi digitado
    const fullText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const commandTrigger = fullText.split(/\s+/)[0].replace(/^[^\w]+/, '').toLowerCase();
    const arg = (args[0] || '').toLowerCase();

    const isCloseAction = ['fechar', 'cerrar', 'lock'].includes(commandTrigger) || 
                          arg === 'on' || arg === 'fechar' || arg === 'cerrar' || arg === '1';

    const isOpenAction = ['abrir', 'unlock', 'unmute'].includes(commandTrigger) || 
                         arg === 'off' || arg === 'abrir' || arg === '2';

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
