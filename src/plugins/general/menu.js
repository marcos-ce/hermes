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

          const isUtility = !plugin.configSchema || ['ban', 'warn'].includes(name);
          if (!isUtility) continue;

          const usage = plugin.usage || plugin.aliases?.[0] || plugin.name;
          const desc = typeof plugin.description === 'object'
            ? (plugin.description[l] || plugin.description.pt)
            : (plugin.description || '');

          groupCmds.push({
            name,
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
            tip: `💡 *Dica:* Você pode usar comandos com o prefixo (Ex: \`${p}all\`) ou mencionando o bot (Ex: \`@bot all\`, \`@bot menu\`).`
          },
          es: {
            title: '🤖 *HERMES BOT - COMANDOS DEL GRUPO*',
            sec: '╭━━━〔 🛡️ COMANDOS DE ADMINISTRACIÓN 〕━━━╮',
            tip: `💡 *Consejo:* Puedes usar comandos con prefijo (Ej: \`${p}all\`) o mencionando al bot (Ej: \`@bot all\`, \`@bot menu\`).`
          },
          en: {
            title: '🤖 *HERMES BOT - GROUP COMMANDS*',
            sec: '╭━━━〔 🛡️ ADMINISTRATION COMMANDS 〕━━━╮',
            tip: `💡 *Tip:* You can send commands with prefix (e.g. \`${p}all\`) or by mentioning the bot (e.g. \`@bot all\`, \`@bot menu\`).`
          }
        };

        const tInfo = titles[l] || titles.pt;
        let output = `${tInfo.title}\n\n`;
        output += `👥 *Grupo:* ${groupName} (${membersCount} membros)\n`;
        output += `📌 *Prefixo:* \`${p}\` | 🌐 *Idioma:* \`${l.toUpperCase()}\`\n\n`;
        output += `${tInfo.sec}\n`;

        groupCmds.forEach(cmd => {
          output += `┃ *${cmd.usage}* - ${cmd.desc}\n`;
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

          ownerCmds.push({
            name,
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
        ownerMenu += `🔑 *${cmd.usage}*\n    _${cmd.desc}_\n`;
      });

      const pingPlugin = pluginLoader.commands.get('ping');
      if (pingPlugin) {
        ownerMenu += `🏓 *${p}${pingPlugin.usage || 'ping'}*\n    _${pingPlugin.description}_\n`;
      }

      ownerMenu += `─────────────────────────\n` +
        `💡 *Dica Anti-Ban:* Gerencie seus grupos e licenças aqui no privado para evitar poluição nos grupos.`;

      return reply(ownerMenu);
    }

    return reply(`🤖 *Hermes Bot*\nComandos disponíveis apenas para administradores em grupos autorizados.`);
  }
};
