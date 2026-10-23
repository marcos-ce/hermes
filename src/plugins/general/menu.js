const { getGroupMetadata } = require('../../utils/jidResolver');
const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'menu',
  aliases: ['menu', 'comandos', 'commands', 'ajuda', 'help', 'start', 'botmenu'],
  description: 'Painel Interativo de Configurações ou Menu de Comandos',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, reply, prefix, lang, isOwner, isGroup, command }) {
    const p = prefix || '/';
    const l = (lang || 'pt').toLowerCase();
    const trigger = (command || '').toLowerCase();

    // ========================================================
    // 1. EM GRUPOS
    // ========================================================
    if (isGroup) {
      // Se solicitou explicitamente a lista de comandos rápidos (/comandos ou /ajuda)
      if (['comandos', 'commands', 'ajuda', 'help'].includes(trigger)) {
        let groupName = 'Grupo';
        let membersCount = 0;
        try {
          const meta = await getGroupMetadata(sock, from);
          groupName = meta?.subject || 'Grupo';
          membersCount = meta?.participants?.length || 0;
        } catch (_) {}

        const menuData = {
          pt: {
            title: '🤖 *HERMES BOT - COMANDOS DO GRUPO*',
            headerGroup: `👥 *Grupo:* ${groupName} (${membersCount} membros)`,
            headerPrefix: `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\``,
            secAdmin: '╭━━━〔 🛡️ ADMINISTRAÇÃO & MODERAÇÃO 〕━━━╮',
            secGeneral: '╭━━━〔 📊 GERAL & UTILIDADES 〕━━━╮',
            footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            tip: `💡 *Dica:* Para abrir o painel interativo de configurações, use *${p}menu* ou *${p}config*.`,
            adminCmds: [
              `📢 *${p}all* [texto] - Marcar todos os membros de forma oculta`,
              `👮 *${p}adm* @user - Promover membro a Administrador`,
              `📉 *${p}demote* @user - Rebaixar Administrador a membro comum`,
              `🚫 *${p}ban* @user - Banir membro do grupo imediatamente`,
              `🔒 *${p}fechar* | *${p}abrir* - Fechar ou abrir o grupo para mensagens`,
              `🗑️ *${p}del* (respondendo) - Apagar mensagem específica do chat`,
              `⚠️ *${p}warn* @user | *${p}unwarn* | *${p}warns* - Sistema de advertências`,
              `🎲 *${p}sortear* [qtd] [prêmio] - Realizar sorteio aleatório entre membros`,
              `⛔ *${p}blacklist* add/del/list - Lista negra com auto-ban na entrada`,
              `⚙️ *${p}menu* (ou *${p}config*) - Abrir o Painel Interativo de Configurações`,
              `🌐 *${p}idioma* [pt/es/en] - Trocar idioma do bot no grupo`
            ],
            generalCmds: [
              `🏓 *${p}ping* - Status do bot, latência, RAM e validade`,
              `📋 *${p}menu* - Painel interativo de configurações`
            ]
          },
          es: {
            title: '🤖 *HERMES BOT - COMANDOS DEL GRUPO*',
            headerGroup: `👥 *Grupo:* ${groupName} (${membersCount} miembros)`,
            headerPrefix: `📌 *Prefijo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\``,
            secAdmin: '╭━━━〔 🛡️ ADMINISTRACIÓN & MODERACIÓN 〕━━━╮',
            secGeneral: '╭━━━〔 📊 GENERAL & UTILIDADES 〕━━━╮',
            footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            tip: `💡 *Consejo:* Para abrir el panel interactivo de configuraciones, usa *${p}menu* o *${p}config*.`,
            adminCmds: [
              `📢 *${p}all* [texto] - Mencionar a todos los miembros ocultamente`,
              `👮 *${p}adm* @user - Promover miembro a Administrador`,
              `📉 *${p}demote* @user - Degradar Administrador a miembro común`,
              `🚫 *${p}ban* @user - Expulsar miembro del grupo inmediatamente`,
              `🔒 *${p}cerrar* | *${p}abrir* - Cerrar o abrir el grupo para mensajes`,
              `🗑️ *${p}del* (respondiendo) - Borrar mensaje del chat`,
              `⚠️ *${p}warn* @user | *${p}unwarn* | *${p}warns* - Sistema de advertencias`,
              `🎲 *${p}sortear* [cant] [premio] - Realizar sorteo aleatorio`,
              `⛔ *${p}blacklist* add/del/list - Lista negra con auto-expulsión`,
              `⚙️ *${p}menu* (o *${p}config*) - Abrir el Panel Interactivo`,
              `🌐 *${p}idioma* [pt/es/en] - Cambiar idioma del bot en el grupo`
            ],
            generalCmds: [
              `🏓 *${p}ping* - Estado del bot, latencia, RAM y validez`,
              `📋 *${p}menu* - Panel interactivo de configuraciones`
            ]
          },
          en: {
            title: '🤖 *HERMES BOT - GROUP COMMANDS*',
            headerGroup: `👥 *Group:* ${groupName} (${membersCount} members)`,
            headerPrefix: `📌 *Prefix:* \`${p}\` | 🌐 *Language:* \`${l.toUpperCase()}\``,
            secAdmin: '╭━━━〔 🛡️ ADMINISTRATION & MODERATION 〕━━━╮',
            secGeneral: '╭━━━〔 📊 GENERAL & UTILITIES 〕━━━╮',
            footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            tip: `💡 *Tip:* To open the interactive configuration panel, use *${p}menu* or *${p}config*.`,
            adminCmds: [
              `📢 *${p}all* [text] - Tag all members invisibly`,
              `👮 *${p}adm* @user - Promote member to Administrator`,
              `📉 *${p}demote* @user - Demote Administrator to regular member`,
              `🚫 *${p}ban* @user - Remove member immediately`,
              `🔒 *${p}lock* | *${p}unlock* - Lock or unlock the group for messages`,
              `🗑️ *${p}del* (replying) - Delete replied message`,
              `⚠️ *${p}warn* @user | *${p}unwarn* | *${p}warns* - Warning system`,
              `🎲 *${p}raffle* [qty] [prize] - Random raffle between members`,
              `⛔ *${p}blacklist* add/del/list - Blacklist with auto-kick`,
              `⚙️ *${p}menu* (or *${p}config*) - Open Interactive Panel`,
              `🌐 *${p}lang* [pt/es/en] - Change bot language in the group`
            ],
            generalCmds: [
              `🏓 *${p}ping* - Bot status, latency, RAM and license validity`,
              `📋 *${p}menu* - Interactive configuration panel`
            ]
          }
        };

        const d = menuData[l] || menuData.pt;
        let output = `${d.title}\n\n`;
        output += `${d.headerGroup}\n`;
        output += `${d.headerPrefix}\n\n`;

        output += `${d.secAdmin}\n`;
        d.adminCmds.forEach(cmd => { output += `┃ ${cmd}\n`; });
        output += `${d.footer}\n\n`;

        output += `${d.secGeneral}\n`;
        d.generalCmds.forEach(cmd => { output += `┃ ${cmd}\n`; });
        output += `${d.footer}\n\n`;

        output += `${d.tip}`;
        return reply(output);
      }

      // Por padrão em grupos: /menu abre o Painel Interativo de Configurações - Hermes
      return await wizardEngine.startConfigPanel(sock, msg, from, sender);
    }

    // ========================================================
    // 2. NO PRIVADO (DM) - APENAS PARA O DONO (EVITA POLUIÇÃO)
    // ========================================================
    if (isOwner) {
      const ownerMenu = `👑 *PAINEL DO DONO & SAAS - HERMES*\n\n` +
        `📌 *Prefixo atual:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n` +
        `─────────────────────────\n` +
        `🔑 *${p}bot on [dias]* - Ativar o bot no grupo (Ex: \`${p}bot on 30\` ou \`${p}bot on\` para vitalício)\n` +
        `➕ *${p}bot add <dias>* - Adicionar dias à assinatura do grupo\n` +
        `⏸️ *${p}bot off* - Pausar o bot no grupo (preserva configurações)\n` +
        `📋 *${p}bot list* - Listar todos os grupos cadastrados e status\n` +
        `📊 *${p}bot status* - Status da assinatura do grupo atual\n` +
        `👮 *${p}autoadm <id | all>* - Promover você (Dono) a Admin (por ID ou em todos os grupos)\n` +
        `🔒 *${p}pv on / off* - Liberar ou bloquear respostas a comandos no privado\n` +
        `🚫 *${p}bangp [jid]* - Banir grupo (silêncio total do bot)\n` +
        `🟢 *${p}desbangp [jid]* - Desbanir grupo do bot\n` +
        `🔄 *${p}reload* - Recarregar plugins e traduções em tempo real\n` +
        `🏓 *${p}ping* - Status do bot, latência, RAM e uptime\n` +
        `─────────────────────────\n` +
        `💡 *Dica Anti-Ban:* Gerencie seus grupos e licenças aqui no privado para evitar poluição nos grupos.`;

      return reply(ownerMenu);
    }

    return reply(`🤖 *Hermes Bot*\nComandos disponíveis apenas para administradores em grupos autorizados.`);
  }
};
