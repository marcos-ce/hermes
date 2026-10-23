const configManager = require('../../core/configManager');

module.exports = {
  name: 'bangrupo',
  aliases: [
    'bangp',
    'desbangp',
    'unbangp',
    'bangrupo',
    'bangroup',
    'banirgrupo',
    'bloqueargrupo',
    'blockgroup',
    'desbanirgrupo',
    'unbangroup',
    'desbloqueargrupo',
    'unblockgroup',
    'gruposbanidos',
    'gpsbanidos',
    'bannedgroups'
  ],
  usage: 'bangp [id] | /desbangp [id]',
  description: 'Bane ou desbane um grupo completamente (bot fica 100% mudo e invisível)',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ _sock, _msg, from, _sender, args, command, reply, t: translate, isGroup }) {
    const cmd = (command || '').toLowerCase();
    const isUnbanAction = [
      'desbangp',
      'unbangp',
      'desbanirgrupo',
      'unbangroup',
      'desbloqueargrupo',
      'unblockgroup'
    ].includes(cmd);

    const isListAction = [
      'gruposbanidos',
      'gpsbanidos',
      'bannedgroups'
    ].includes(cmd) || (args[0] && ['list', 'lista', 'listar'].includes(args[0].toLowerCase()));

    // ==========================================
    // 1. Listagem de Grupos Banidos
    // ==========================================
    if (isListAction) {
      const banned = configManager.getBannedGroups();
      if (!banned || banned.length === 0) {
        return reply(translate('bangroup.list_empty'));
      }

      let listText = `${translate('bangroup.list_title')}\n\n`;
      banned.forEach((jid, index) => {
        const groupData = configManager.getGroup(jid);
        const name = groupData?.name || 'Grupo sem nome';
        const reason = groupData?.banReason ? ` (Motivo: _${groupData.banReason}_)` : '';
        listText += `*[${index + 1}]* ${name}\n    🆔 \`${jid}\`${reason}\n`;
      });
      listText += `\n💡 Para desbanir: \`/desbangp <id>\` (ou \`/desbanirgrupo <id>\`)`;
      return reply(listText);
    }

    // Resolve o JID do grupo alvo
    let targetGroupJid = '';
    let reason = '';

    const firstArg = args[0] || '';
    const isFirstArgJid = firstArg.includes('@g.us') || /^\d{15,25}$/.test(firstArg);

    if (isFirstArgJid) {
      targetGroupJid = firstArg.endsWith('@g.us') ? firstArg : `${firstArg}@g.us`;
      reason = args.slice(1).join(' ').trim();
    } else if (isGroup) {
      targetGroupJid = from;
      reason = args.join(' ').trim();
    } else if (firstArg === 'unban' || firstArg === 'desbanir' || firstArg === 'desbangp') {
      const secondArg = args[1] || '';
      if (secondArg.includes('@g.us') || /^\d{15,25}$/.test(secondArg)) {
        targetGroupJid = secondArg.endsWith('@g.us') ? secondArg : `${secondArg}@g.us`;
      }
    }

    if (!targetGroupJid) {
      return reply(
        '⚠️ Informe o ID do grupo para executar esta ação no privado.\n' +
        'Exemplos:\n' +
        '• `/bangp 120363000000000@g.us` (para banir)\n' +
        '• `/desbangp 120363000000000@g.us` (para desbanir)\n' +
        '• `/gpsbanidos` (para listar)'
      );
    }

    // ==========================================
    // 2. Ação de Desbanir Grupo
    // ==========================================
    if (isUnbanAction || (args[0] && ['unban', 'desbanir', 'del', 'remover'].includes(args[0].toLowerCase()))) {
      if (!configManager.isGroupBanned(targetGroupJid)) {
        return reply(translate('bangroup.not_banned'));
      }

      configManager.unbanGroup(targetGroupJid);
      return reply(translate('bangroup.unbanned', { id: targetGroupJid }));
    }

    // ==========================================
    // 3. Ação de Banir Grupo
    // ==========================================
    if (configManager.isGroupBanned(targetGroupJid)) {
      return reply(translate('bangroup.already_banned'));
    }

    configManager.banGroup(targetGroupJid, reason);
    return reply(translate('bangroup.banned', { id: targetGroupJid }));
  }
};
