const { getGroupMetadata } = require('../../utils/jidResolver');
const wizardEngine = require('../../core/wizardEngine');
const pluginLoader = require('../../core/pluginLoader');

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

        // Coleta dinâmica de todos os plugins utilitários e de moderação direta
        const directCommandsOrder = ['hidetag', 'promote', 'demote', 'ban', 'mute', 'del', 'warn', 'sortear', 'blacklist', 'idioma', 'ping'];
        const groupCmds = [];

        for (const [name, plugin] of pluginLoader.commands.entries()) {
          if (plugin.category === 'owner' || plugin.ownerOnly) continue; // Nunca expõe comandos de dono em grupos
          if (['menu', 'config'].includes(name)) continue;

          const isUtility = !plugin.configSchema || ['ban', 'warn'].includes(name) || plugin.isDirectCommand;
          if (!isUtility) continue;

          const usage = plugin.usage || plugin.aliases?.[0] || plugin.name;
          const desc = typeof plugin.description === 'object'
            ? (plugin.description[l] || plugin.description.pt)
            : (plugin.description || '');

          const cmdNum = plugin.cmdNumber || pluginLoader.getCommandNumber(name);

          groupCmds.push({
            name,
            num: cmdNum,
            usage: `${p}${usage}`,
            desc
          });
        }

        groupCmds.sort((a, b) => {
          const idxA = directCommandsOrder.indexOf(a.name);
          const idxB = directCommandsOrder.indexOf(b.name);
          return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
        });

        const titles = {
          pt: {
            title: '🤖 *HERMES BOT - COMANDOS DO GRUPO*',
            sec: '╭━━━〔 🛡️ COMANDOS DE ADMINISTRAÇÃO 〕━━━╮',
            tip: `💡 *Dica:* Use comandos pelo nome (Ex: \`${p}all\`), pelo número atrelado (Ex: \`${p}9 aviso\`, \`${p}5 @user\`, \`${p}10 @user\`, \`${p}17\`) ou mencionando o bot (Ex: \`@bot 9 aviso\`, \`@bot all\`).`
          },
          es: {
            title: '🤖 *HERMES BOT - COMANDOS DEL GRUPO*',
            sec: '╭━━━〔 🛡️ COMANDOS DE ADMINISTRACIÓN 〕━━━╮',
            tip: `💡 *Consejo:* Usa comandos por nombre (Ej: \`${p}all\`), por número asignado (Ej: \`${p}9 aviso\`, \`${p}5 @user\`, \`${p}10 @user\`, \`${p}17\`) o mencionando al bot (Ej: \`@bot 9 aviso\`, \`@bot all\`).`
          },
          en: {
            title: '🤖 *HERMES BOT - GROUP COMMANDS*',
            sec: '╭━━━〔 🛡️ ADMINISTRATION COMMANDS 〕━━━╮',
            tip: `💡 *Tip:* Use commands by name (e.g. \`${p}all\`), by assigned number (e.g. \`${p}9 notice\`, \`${p}5 @user\`, \`${p}10 @user\`, \`${p}17\`) or by mentioning the bot (e.g. \`@bot 9 notice\`, \`@bot all\`).`
          }
        };

        const tInfo = titles[l] || titles.pt;
        let output = `${tInfo.title}\n\n`;
        output += `👥 *Grupo:* ${groupName} (${membersCount} membros)\n`;
        output += `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n\n`;
        output += `${tInfo.sec}\n`;

        groupCmds.forEach(cmd => {
          const numLabel = cmd.num ? `[${cmd.num}] ` : '';
          output += `┃ *${numLabel}${cmd.usage}* - ${cmd.desc}\n`;
        });
        output += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
        output += `${tInfo.tip}`;

        return reply(output);
      }

      // Por padrão em grupos: /menu abre o Painel Interativo de Configurações - Hermes
      return await wizardEngine.startConfigPanel(sock, msg, from, sender);
    }

    // ========================================================
    // 2. NO PRIVADO (DM) - APENAS PARA O DONO (DINÂMICO E ANTI-POLUIÇÃO)
    // ========================================================
    if (isOwner) {
      const ownerOrder = ['bot', 'autoadm', 'bangrupo', 'reload'];
      const ownerCmds = [];

      for (const [name, plugin] of pluginLoader.commands.entries()) {
        if (plugin.category === 'owner' || plugin.ownerOnly) {
          const usage = plugin.usage || plugin.aliases?.[0] || plugin.name;
          const desc = typeof plugin.description === 'object'
            ? (plugin.description[l] || plugin.description.pt)
            : (plugin.description || '');

          const cmdNum = plugin.cmdNumber || pluginLoader.getCommandNumber(name);

          ownerCmds.push({
            name,
            num: cmdNum,
            usage: `${p}${usage}`,
            desc
          });
        }
      }

      ownerCmds.sort((a, b) => {
        const idxA = ownerOrder.indexOf(a.name);
        const idxB = ownerOrder.indexOf(b.name);
        return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
      });

      let ownerMenu = `👑 *PAINEL DO DONO & SAAS - HERMES*\n\n` +
        `📌 *Prefixo atual:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n` +
        `─────────────────────────\n`;

      ownerCmds.forEach(cmd => {
        const numLabel = cmd.num ? `[${cmd.num}] ` : '';
        ownerMenu += `🔑 *${numLabel}${cmd.usage}*\n    _${cmd.desc}_\n`;
      });

      const pingPlugin = pluginLoader.commands.get('ping');
      if (pingPlugin) {
        const pingNum = pingPlugin.cmdNumber || pluginLoader.getCommandNumber('ping');
        const numLabel = pingNum ? `[${pingNum}] ` : '';
        ownerMenu += `🏓 *${numLabel}${p}${pingPlugin.usage || 'ping'}*\n    _${pingPlugin.description}_\n`;
      }

      ownerMenu += `─────────────────────────\n` +
        `💡 *Dica Anti-Ban:* Gerencie seus grupos e licenças aqui no privado usando o comando ou o número (Ex: \`${p}19 on 30\`, \`${p}20\`, \`${p}17\`).`;

      return reply(ownerMenu);
    }

    return reply(`🤖 *Hermes Bot*\nComandos disponíveis apenas para administradores em grupos autorizados.`);
  }
};
