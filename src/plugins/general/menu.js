const { getGroupMetadata } = require('../../utils/jidResolver');
const wizardEngine = require('../../core/wizardEngine');
const pluginLoader = require('../../core/pluginLoader');

module.exports = {
  name: 'menu',
  aliases: ['menu', 'comandos', 'commands', 'ajuda', 'help', 'start', 'botmenu'],
  description: 'Guia de Comandos e Ajuda do Hermes Bot',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, args, reply, prefix, lang, style, isOwner, isGroup }) {
    const p = prefix || '/';
    const l = (lang || 'pt').toLowerCase();
    const sub = (args[0] || '').toLowerCase();
    const isFormal = (style === 'formal') || (isGroup && require('../../core/configManager').getGroupStyle(from) === 'formal');

    // Se o usuário pedir especificamente o painel via subcomando: !menu config ou !menu painel
    if (['config', 'painel', 'panel', 'settings', 'cfg'].includes(sub)) {
      if (isGroup) {
        return await wizardEngine.startConfigPanel(sock, msg, from, sender);
      }
    }

    // ========================================================
    // 1. EM GRUPOS
    // ========================================================
    if (isGroup) {
      let groupName = 'Grupo';
      let membersCount = 0;
      try {
        const meta = await getGroupMetadata(sock, from);
        groupName = meta?.subject || 'Grupo';
        membersCount = meta?.participants?.length || 0;
      } catch (_) {}

      // Resposta Formal (Etiquetas em negrito e sem emojis)
      if (isFormal) {
        const formalTitles = {
          pt: {
            title: '*[Hermes AutoMod - Guia de Comandos]*',
            group: 'Grupo:',
            members: 'membros',
            secQuick: '*[Ações Rápidas & Moderação]*',
            secConfig: '*[Gestão & Utilidades]*',
            tipHeader: '*[Painel de Controle]*',
            tipBody: `Para gerenciar módulos de proteção e filtros, envie: \`${p}config\``
          },
          es: {
            title: '*[Hermes AutoMod - Guía de Comandos]*',
            group: 'Grupo:',
            members: 'miembros',
            secQuick: '*[Acciones Rápidas y Moderación]*',
            secConfig: '*[Gestión y Utilidades]*',
            tipHeader: '*[Panel de Control]*',
            tipBody: `Para gestionar los módulos de protección, envía: \`${p}config\``
          },
          en: {
            title: '*[Hermes AutoMod - Commands Guide]*',
            group: 'Group:',
            members: 'members',
            secQuick: '*[Quick Actions & Moderation]*',
            secConfig: '*[Management & Utilities]*',
            tipHeader: '*[Control Panel]*',
            tipBody: `To manage protection modules, send: \`${p}config\``
          }
        };

        const fInfo = formalTitles[l] || formalTitles.pt;

        const quickActions = [
          { cmd: `${p}fechar | ${p}abrir`, desc: { pt: 'Trancar ou abrir o grupo', es: 'Cerrar o abrir el grupo', en: 'Lock or unlock the group' } },
          { cmd: `${p}mutar @user [tempo]`, desc: { pt: 'Silenciar membro por até 24h (!desmutar)', es: 'Silenciar miembro por hasta 24h (!desmutar)', en: 'Mute member for up to 24h (!unmute)' } },
          { cmd: `${p}ban @user`, desc: { pt: 'Banir membro (ou via resposta)', es: 'Expulsar miembro (o respondiendo)', en: 'Kick member (or via reply)' } },
          { cmd: `${p}warn @user`, desc: { pt: 'Advertir membro (!unwarn, !warns)', es: 'Advertir miembro (!unwarn, !warns)', en: 'Warn member (!unwarn, !warns)' } },
          { cmd: `${p}del`, desc: { pt: 'Apagar mensagem respondida', es: 'Borrar mensaje respondido', en: 'Delete replied message' } },
          { cmd: `${p}link [reset]`, desc: { pt: 'Obter ou redefinir link de convite', es: 'Obtener o restablecer enlace de invitación', en: 'Get or reset group invite link' } },
          { cmd: `${p}pin [24h|7d|30d]`, desc: { pt: 'Fixar mensagem (!unpin desfixa)', es: 'Fijar mensaje (!unpin desfija)', en: 'Pin message (!unpin unpins)' } },
          { cmd: `${p}enquete [opções]`, desc: { pt: 'Criar votação interativa', es: 'Crear encuesta interactiva', en: 'Create interactive poll' } },
          { cmd: `${p}foto`, desc: { pt: 'Definir foto do grupo (com imagem)', es: 'Cambiar foto del grupo (con imagen)', en: 'Change group icon (with image)' } },
          { cmd: `${p}setdesc [texto]`, desc: { pt: 'Alterar descrição do grupo', es: 'Cambiar descripción del grupo', en: 'Change group description' } },
          { cmd: `${p}all [texto]`, desc: { pt: 'Notificar todos os membros', es: 'Notificar a todos los miembros', en: 'Notify all group members' } },
          { cmd: `${p}adm @user`, desc: { pt: 'Promover membro a Administrador', es: 'Promover miembro a Administrador', en: 'Promote member to Admin' } },
          { cmd: `${p}demote @user`, desc: { pt: 'Rebaixar administrador a membro', es: 'Degradar administrador a miembro', en: 'Demote admin to regular member' } }
        ];

        const configActions = [
          { cmd: `${p}config`, desc: { pt: 'Painel de controle de módulos', es: 'Panel de control de módulos', en: 'Modules control panel' } },
          { cmd: `${p}agenda`, desc: { pt: 'Cronograma de lembretes e avisos', es: 'Calendario de recordatorios', en: 'Reminders calendar' } },
          { cmd: `${p}sortear [qtd] [prêmio]`, desc: { pt: 'Sorteio entre membros', es: 'Sorteo entre miembros', en: 'Raffle draw among members' } },
          { cmd: `${p}blacklist add/del`, desc: { pt: 'Lista negra do grupo', es: 'Lista negra del grupo', en: 'Group blacklist' } },
          { cmd: `${p}idioma [pt|es|en]`, desc: { pt: 'Alterar idioma do bot', es: 'Cambiar idioma del bot', en: 'Change bot language' } },
          { cmd: `${p}estilo [natural|formal]`, desc: { pt: 'Alternar estilo de mensagens', es: 'Cambiar estilo de mensajes', en: 'Toggle message style' } },
          { cmd: `${p}ping`, desc: { pt: 'Diagnóstico de operação e latência', es: 'Diagnóstico de operación y latencia', en: 'Bot diagnostics and latency' } }
        ];

        let output = `${fInfo.title}\n`;
        output += `Prefixo: \`${p}\` | Idioma: \`${l.toUpperCase()}\` | Estilo: \`Formal\`\n`;
        output += `${fInfo.group} *${groupName}* (${membersCount} ${fInfo.members})\n\n`;

        output += `${fInfo.secQuick}\n`;
        quickActions.forEach(a => {
          const d = a.desc[l] || a.desc.pt;
          output += `• \`${a.cmd}\` - ${d}\n`;
        });

        output += `\n${fInfo.secConfig}\n`;
        configActions.forEach(a => {
          const d = a.desc[l] || a.desc.pt;
          output += `• \`${a.cmd}\` - ${d}\n`;
        });

        output += `\n${fInfo.tipHeader}\n${fInfo.tipBody}`;
        return reply(output);
      }

      const titles = {
        pt: {
          title: '🤖 *HERMES BOT* • Guia de Comandos',
          group: '👥 Grupo:',
          members: 'membros',
          secQuick: '⚡ *Ações Rápidas & Moderação*',
          secConfig: '⚙️ *Gestão & Utilidades*',
          tipHeader: '💡 *Dica do Hermes:*',
          tipBody: `Você não precisa decorar comandos! Peça normalmente em português:\n• _"Hermes, fecha o grupo e avisa que volta às 14h"_\n• _"Hermes, cria uma votação sobre o almoço de amanhã"_\n• _"Hermes, fixa essa mensagem por 7 dias"_\n\n👉 Para abrir o painel de módulos de proteção, envie \`${p}config\``
        },
        es: {
          title: '🤖 *HERMES BOT* • Guía de Comandos',
          group: '👥 Grupo:',
          members: 'miembros',
          secQuick: '⚡ *Acciones Rápidas y Moderación*',
          secConfig: '⚙️ *Gestión y Utilidades*',
          tipHeader: '💡 *Consejo de Hermes:*',
          tipBody: `¡No necesitas memorizar comandos! Pídelo normalmente en lenguaje natural:\n• _"Hermes, cierra el grupo hasta las 14h"_\n• _"Hermes, crea una encuesta sobre el almuerzo"_\n• _"Hermes, fija este mensaje por 7 días"_\n\n👉 Para abrir el panel de módulos de protección, envía \`${p}config\``
        },
        en: {
          title: '🤖 *HERMES BOT* • Commands Guide',
          group: '👥 Group:',
          members: 'members',
          secQuick: '⚡ *Quick Actions & Moderation*',
          secConfig: '⚙️ *Management & Utilities*',
          tipHeader: '💡 *Hermes Tip:*',
          tipBody: `No need to memorize commands! Just ask naturally:\n• _"Hermes, close the group until 2 PM"_\n• _"Hermes, create a poll about tomorrow's lunch"_\n• _"Hermes, pin this message for 7 days"_\n\n👉 To open the protection modules panel, send \`${p}config\``
        }
      };

      const tInfo = titles[l] || titles.pt;

      // Lista limpa e consistente de comandos rápidos
      const quickActions = [
        { cmd: `${p}fechar | ${p}abrir`, desc: { pt: 'Trancar ou abrir o grupo', es: 'Cerrar o abrir el grupo', en: 'Lock or unlock the group' } },
        { cmd: `${p}mutar @user [tempo]`, desc: { pt: 'Silenciar membro por até 24h (!desmutar)', es: 'Silenciar miembro por hasta 24h (!desmutar)', en: 'Mute member for up to 24h (!unmute)' } },
        { cmd: `${p}ban @user`, desc: { pt: 'Banir membro (ou via resposta)', es: 'Expulsar miembro (o respondiendo)', en: 'Kick member (or via reply)' } },
        { cmd: `${p}warn @user`, desc: { pt: 'Advertir membro (!unwarn, !warns)', es: 'Advertir miembro (!unwarn, !warns)', en: 'Warn member (!unwarn, !warns)' } },
        { cmd: `${p}del`, desc: { pt: 'Apagar mensagem respondida', es: 'Borrar mensaje respondido', en: 'Delete replied message' } },
        { cmd: `${p}link [reset]`, desc: { pt: 'Obter ou redefinir link de convite', es: 'Obtener o restablecer enlace de invitación', en: 'Get or reset group invite link' } },
        { cmd: `${p}pin [24h|7d|30d]`, desc: { pt: 'Fixar mensagem (!unpin desfixa)', es: 'Fijar mensaje (!unpin desfija)', en: 'Pin message (!unpin unpins)' } },
        { cmd: `${p}enquete [opções]`, desc: { pt: 'Criar votação interativa', es: 'Crear encuesta interactiva', en: 'Create interactive poll' } },
        { cmd: `${p}foto`, desc: { pt: 'Definir foto do grupo (com imagem)', es: 'Cambiar foto del grupo (con imagen)', en: 'Change group icon (with image)' } },
        { cmd: `${p}setdesc [texto]`, desc: { pt: 'Alterar descrição do grupo', es: 'Cambiar descripción del grupo', en: 'Change group description' } },
        { cmd: `${p}all [texto]`, desc: { pt: 'Marcar todos os membros', es: 'Mencionar a todos los miembros', en: 'Mention all group members' } },
        { cmd: `${p}adm @user`, desc: { pt: 'Promover membro a Administrador', es: 'Promover miembro a Administrador', en: 'Promote member to Admin' } },
        { cmd: `${p}demote @user`, desc: { pt: 'Rebaixar administrador a membro', es: 'Degradar administrador a miembro', en: 'Demote admin to regular member' } }
      ];

      const configActions = [
        { cmd: `${p}config`, desc: { pt: 'Painel de módulos interativo (1 a 10)', es: 'Panel interactivo de módulos (1 a 10)', en: 'Interactive modules panel (1 to 10)' } },
        { cmd: `${p}agenda`, desc: { pt: 'Calendário de lembretes e avisos', es: 'Calendario de recordatorios y avisos', en: 'Reminders and schedule calendar' } },
        { cmd: `${p}sortear [qtd] [prêmio]`, desc: { pt: 'Sorteio rápido e justo entre membros', es: 'Sorteo rápido entre miembros', en: 'Raffle draw among members' } },
        { cmd: `${p}blacklist add/del`, desc: { pt: 'Lista negra que expulsa ao entrar', es: 'Lista negra que expulsa al entrar', en: 'Blacklist auto-kick on join' } },
        { cmd: `${p}idioma [pt|es|en]`, desc: { pt: 'Alterar o idioma do bot', es: 'Cambiar idioma del bot', en: 'Change bot language' } },
        { cmd: `${p}estilo [natural|formal]`, desc: { pt: 'Alternar estilo (Emojis ou Etiquetas)', es: 'Cambiar estilo (Emojis o Etiquetas)', en: 'Toggle message style (Emojis or Tags)' } },
        { cmd: `${p}ping`, desc: { pt: 'Status, latência e memória do bot', es: 'Estado, latencia y memoria', en: 'Bot status, latency and memory' } }
      ];

      let output = `${tInfo.title}\n`;
      output += `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n`;
      output += `${tInfo.group} *${groupName}* (${membersCount} ${tInfo.members})\n\n`;

      output += `${tInfo.secQuick}\n`;
      quickActions.forEach(a => {
        const d = a.desc[l] || a.desc.pt;
        output += `• \`${a.cmd}\` - ${d}\n`;
      });

      output += `\n${tInfo.secConfig}\n`;
      configActions.forEach(a => {
        const d = a.desc[l] || a.desc.pt;
        output += `• \`${a.cmd}\` - ${d}\n`;
      });

      output += `\n${tInfo.tipHeader}\n${tInfo.tipBody}`;

      return reply(output);
    }

    // ========================================================
    // 2. NO PRIVADO (DM) - APENAS PARA O DONO
    // ========================================================
    if (isOwner) {
      const ownerCmds = [
        { cmd: `${p}bot on [dias]`, desc: 'Ativar bot no grupo (ou renovar dias)' },
        { cmd: `${p}bot add [dias]`, desc: 'Adicionar dias à assinatura do grupo' },
        { cmd: `${p}bot off`, desc: 'Pausar bot no grupo (mantém configurações)' },
        { cmd: `${p}bot list`, desc: 'Listar todos os grupos e dias restantes' },
        { cmd: `${p}bot status`, desc: 'Exibir status do grupo atual' },
        { cmd: `${p}pv on / off`, desc: 'Liberar ou travar comandos no privado (Anti-Ban)' },
        { cmd: `${p}autoadm all`, desc: 'Promover o Dono a admin em todos os grupos' },
        { cmd: `${p}bangrupo [id]`, desc: 'Banir grupo permanentemente do bot' },
        { cmd: `${p}reload`, desc: 'Recarregar plugins e traduções em tempo real' },
        { cmd: `${p}ping`, desc: 'Status, latência e consumo de memória do bot' }
      ];

      let ownerMenu = `👑 *PAINEL DO DONO & SAAS* • Hermes\n`;
      ownerMenu += `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n\n`;

      ownerCmds.forEach(c => {
        ownerMenu += `• \`${c.cmd}\`\n  _${c.desc}_\n`;
      });

      ownerMenu += `\n💡 *Dica Anti-Ban:* Mantenha respostas no PV restritas apenas a você para máxima segurança.`;

      return reply(ownerMenu);
    }

    return reply(`🤖 *Hermes Bot*\nComandos disponíveis apenas para administradores em grupos autorizados.`);
  }
};
