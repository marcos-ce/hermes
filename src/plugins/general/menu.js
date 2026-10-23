const { getGroupMetadata } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');

module.exports = {
  name: 'menu',
  aliases: ['menu', 'comandos', 'commands', 'ajuda', 'help', 'start', 'botmenu'],
  description: 'Exibe a lista completa de comandos auto-formatada com o prefixo atual',
  ownerOnly: false,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ sock, msg, from, reply, prefix, lang, isOwner, isGroup }) {
    let groupName = 'Privado / DM';
    let membersCount = 0;

    if (isGroup) {
      try {
        const meta = await getGroupMetadata(sock, from);
        groupName = meta?.subject || 'Grupo';
        membersCount = meta?.participants?.length || 0;
      } catch (_) {}
    }

    const p = prefix || '/';
    const l = (lang || 'pt').toLowerCase();

    // Dicionário localizado das seções e comandos do menu
    const menuData = {
      pt: {
        title: '🤖 *HERMES ADMIN BOT - MENU DE COMANDOS*',
        headerGroup: `👥 *Grupo:* ${groupName} (${membersCount} membros)`,
        headerPrefix: `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\``,
        secAdmin: '╭━━━〔 🛡️ ADMINISTRAÇÃO & GRUPO 〕━━━╮',
        secAuto: '╭━━━〔 ⚙️ AUTOMAÇÃO & FILTROS 〕━━━╮',
        secGeneral: '╭━━━〔 📊 GERAL & UTILIDADES 〕━━━╮',
        secOwner: '╭━━━〔 👑 DONO & SAAS 〕━━━╮',
        footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        tip: `💡 *Dica:* Envie qualquer comando com a barra inicial (ex: \`${p}all\`, \`${p}adm\`, \`${p}config\`).`,
        adminCmds: [
          `📢 *${p}all* [texto] - Marcar todos os membros de forma oculta`,
          `👮 *${p}adm* @user - Promover membro a Administrador`,
          `📉 *${p}demote* @user - Rebaixar Administrador a membro comum`,
          `🚫 *${p}ban* @user - Banir membro do grupo imediatamente`,
          `🔒 *${p}fechar* | *${p}abrir* - Fechar ou abrir o grupo para mensagens`,
          `🗑️ *${p}del* (respondendo) - Apagar mensagem do chat`,
          `⚠️ *${p}warn* @user | *${p}unwarn* | *${p}warns* - Sistema de advertências`,
          `🎲 *${p}sortear* [qtd] [prêmio] - Realizar sorteio aleatório`,
          `⛔ *${p}blacklist* add/del/list - Lista negra com auto-ban`,
          `⚙️ *${p}config* (ou *${p}painel*) - Painel interativo de configuração`,
          `🌐 *${p}idioma* [pt/es/en] - Trocar idioma do bot no grupo`
        ],
        autoCmds: [
          `🔗 *${p}antilink* [on/off/config] - Bloqueio de links com whitelist`,
          `🌊 *${p}antiflood* [on/off/config] - Anti-Spam e proteção contra Travas`,
          `🎭 *${p}antifake* [on/off/config] - Bloqueio de números estrangeiros (DDI)`,
          `⏰ *${p}horarios* [on/off/config] - Agendamento para abrir/fechar grupo`,
          `📢 *${p}automsg* [on/off/config] - Mensagens periódicas automáticas`,
          `👋 *${p}bemvindo* [on/off/config] - Boas-vindas automáticas com regras`
        ],
        generalCmds: [
          `🏓 *${p}ping* - Status do bot, latência, RAM e validade`,
          `📋 *${p}menu* - Exibir este menu com a lista de comandos`
        ],
        ownerCmds: [
          `🔑 *${p}bot on* [dias] - Ativar licença do bot no grupo`,
          `➕ *${p}bot add* <dias> - Somar dias à licença atual`,
          `⏸️ *${p}bot off* - Pausar bot no grupo (preserva configs)`,
          `📋 *${p}bot list* - Listar todos os grupos cadastrados`,
          `🔒 *${p}pv* [on/off] - Liberar/bloquear respostas na DM`,
          `🚫 *${p}bangp* [id] - Banir grupo (silêncio total do bot)`,
          `🟢 *${p}desbangp* [id] - Desbanir grupo do bot`,
          `🔄 *${p}reload* - Hot-reload de plugins e traduções`
        ]
      },
      es: {
        title: '🤖 *HERMES ADMIN BOT - MENÚ DE COMANDOS*',
        headerGroup: `👥 *Grupo:* ${groupName} (${membersCount} miembros)`,
        headerPrefix: `📌 *Prefijo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\``,
        secAdmin: '╭━━━〔 🛡️ ADMINISTRACIÓN & GRUPO 〕━━━╮',
        secAuto: '╭━━━〔 ⚙️ AUTOMATIZACIÓN & FILTROS 〕━━━╮',
        secGeneral: '╭━━━〔 📊 GENERAL & UTILIDADES 〕━━━╮',
        secOwner: '╭━━━〔 👑 DUEÑO & SAAS 〕━━━╮',
        footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        tip: `💡 *Consejo:* Envía cualquier comando con la barra inicial (ej: \`${p}all\`, \`${p}adm\`, \`${p}config\`).`,
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
          `⚙️ *${p}config* (o *${p}panel*) - Panel interactivo de configuración`,
          `🌐 *${p}idioma* [pt/es/en] - Cambiar idioma del bot en el grupo`
        ],
        autoCmds: [
          `🔗 *${p}antilink* [on/off/config] - Bloqueo de enlaces con whitelist`,
          `🌊 *${p}antiflood* [on/off/config] - Anti-Spam y protección anti-traba`,
          `🎭 *${p}antifake* [on/off/config] - Bloqueo de números extranjeros (DDI)`,
          `⏰ *${p}horarios* [on/off/config] - Programación para abrir/cerrar grupo`,
          `📢 *${p}automsg* [on/off/config] - Mensajes periódicos automáticos`,
          `👋 *${p}bienvenida* [on/off/config] - Bienvenida automática con reglas`
        ],
        generalCmds: [
          `🏓 *${p}ping* - Estado del bot, latencia, RAM y validez`,
          `📋 *${p}menu* - Mostrar este menú con la lista de comandos`
        ],
        ownerCmds: [
          `🔑 *${p}bot on* [días] - Activar licencia del bot en el grupo`,
          `➕ *${p}bot add* <días> - Sumar días a la licencia actual`,
          `⏸️ *${p}bot off* - Pausar bot en el grupo (conserva configs)`,
          `📋 *${p}bot list* - Listar todos los grupos registrados`,
          `🔒 *${p}pv* [on/off] - Permitir/bloquear respuestas en privado`,
          `🚫 *${p}bangp* [id] - Banear grupo (silencio total del bot)`,
          `🟢 *${p}desbangp* [id] - Desbanear grupo del bot`,
          `🔄 *${p}reload* - Recarga de plugins y traducciones en vivo`
        ]
      },
      en: {
        title: '🤖 *HERMES ADMIN BOT - COMMAND MENU*',
        headerGroup: `👥 *Group:* ${groupName} (${membersCount} members)`,
        headerPrefix: `📌 *Prefix:* \`${p}\` | 🌐 *Language:* \`${l.toUpperCase()}\``,
        secAdmin: '╭━━━〔 🛡️ ADMINISTRATION & GROUP 〕━━━╮',
        secAuto: '╭━━━〔 ⚙️ AUTOMATION & FILTERS 〕━━━╮',
        secGeneral: '╭━━━〔 📊 GENERAL & UTILITIES 〕━━━╮',
        secOwner: '╭━━━〔 👑 OWNER & SAAS 〕━━━╮',
        footer: '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        tip: `💡 *Tip:* Send any command with the leading slash (e.g., \`${p}all\`, \`${p}adm\`, \`${p}config\`).`,
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
          `⚙️ *${p}config* (or *${p}panel*) - Interactive configuration panel`,
          `🌐 *${p}lang* [pt/es/en] - Change bot language in the group`
        ],
        autoCmds: [
          `🔗 *${p}antilink* [on/off/config] - Link filter with whitelist`,
          `🌊 *${p}antiflood* [on/off/config] - Anti-Spam and Anti-Crash protection`,
          `🎭 *${p}antifake* [on/off/config] - Foreign phone block (DDI)`,
          `⏰ *${p}schedule* [on/off/config] - Automatic group open/close schedule`,
          `📢 *${p}automsg* [on/off/config] - Scheduled periodic announcements`,
          `👋 *${p}welcome* [on/off/config] - Automatic welcome message & rules`
        ],
        generalCmds: [
          `🏓 *${p}ping* - Bot status, latency, RAM and license validity`,
          `📋 *${p}menu* - Display this command menu`
        ],
        ownerCmds: [
          `🔑 *${p}bot on* [days] - Activate bot license in group`,
          `➕ *${p}bot add* <days> - Add days to current license`,
          `⏸️ *${p}bot off* - Pause bot in group (keeps configs)`,
          `📋 *${p}bot list* - List all registered groups`,
          `🔒 *${p}pv* [on/off] - Allow or block DM commands`,
          `🚫 *${p}bangp* [id] - Ban group (total bot silence)`,
          `🟢 *${p}desbangp* [id] - Unban group`,
          `🔄 *${p}reload* - Live reload of plugins and translations`
        ]
      }
    };

    const d = menuData[l] || menuData.pt;

    let output = `${d.title}\n\n`;
    if (isGroup) {
      output += `${d.headerGroup}\n`;
    }
    output += `${d.headerPrefix}\n\n`;

    // 1. Administração
    output += `${d.secAdmin}\n`;
    d.adminCmds.forEach(cmd => {
      output += `┃ ${cmd}\n`;
    });
    output += `${d.footer}\n\n`;

    // 2. Automação
    output += `${d.secAuto}\n`;
    d.autoCmds.forEach(cmd => {
      output += `┃ ${cmd}\n`;
    });
    output += `${d.footer}\n\n`;

    // 3. Geral
    output += `${d.secGeneral}\n`;
    d.generalCmds.forEach(cmd => {
      output += `┃ ${cmd}\n`;
    });
    output += `${d.footer}\n\n`;

    // 4. Dono (apenas se for o Dono executando)
    if (isOwner) {
      output += `${d.secOwner}\n`;
      d.ownerCmds.forEach(cmd => {
        output += `┃ ${cmd}\n`;
      });
      output += `${d.footer}\n\n`;
    }

    output += `${d.tip}`;

    return reply(output);
  }
};
