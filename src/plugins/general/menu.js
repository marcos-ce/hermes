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
        const directCommandsOrder = ['hidetag', 'poll', 'setdesc', 'setpic', 'pin', 'promote', 'demote', 'ban', 'mute', 'clear', 'warn', 'raffle', 'blacklist', 'lang', 'ping'];
        const protectionOrder = ['antilink', 'antiflood', 'antifake', 'welcome', 'schedule', 'automsg', 'hermes'];
        const groupCmds = [];
        const protectionCmds = [];

        for (const [name, plugin] of pluginLoader.commands.entries()) {
          if (plugin.category === 'owner' || plugin.ownerOnly) continue; // Nunca expõe comandos de dono em grupos
          if (['menu', 'config'].includes(name)) continue;

          const usage = plugin.usage || plugin.aliases?.[0] || plugin.name;
          const desc = typeof plugin.description === 'object'
            ? (plugin.description[l] || plugin.description.pt)
            : (plugin.description || '');

          const cmdNum = plugin.cmdNumber || pluginLoader.getCommandNumber(name);
          const item = {
            name,
            num: cmdNum,
            usage: `${p}${usage}`,
            desc
          };

          const isUtility = !plugin.configSchema || ['ban', 'warn'].includes(name) || plugin.isDirectCommand;
          if (isUtility) {
            groupCmds.push(item);
          } else {
            protectionCmds.push(item);
          }
        }

        groupCmds.sort((a, b) => {
          const idxA = directCommandsOrder.indexOf(a.name);
          const idxB = directCommandsOrder.indexOf(b.name);
          return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
        });

        protectionCmds.sort((a, b) => {
          const idxA = protectionOrder.indexOf(a.name);
          const idxB = protectionOrder.indexOf(b.name);
          return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
        });

        const titles = {
          pt: {
            title: '🤖 *HERMES BOT - GUIA DE COMANDOS*',
            sec: '╭━━━〔 ⚡ AÇÕES RÁPIDAS 〕━━━╮',
            sec2: '╭━━━〔 🛡️ PROTEÇÕES, AUTOMAÇÃO & IA 〕━━━╮',
            tip: `💡 *3 Jeitos Fáceis de Usar:*\n1️⃣ *Sem decorar comandos:* Peça em português normal (Ex: _"Hermes, fecha o grupo"_, _"Hermes, muda o horário pra fechar 23:00"_).\n2️⃣ *Painel de Números:* Envie \`${p}config\` e digite apenas os números (1, 2, 3).\n3️⃣ *Comandos diretos:* Use pelo nome (Ex: \`${p}ban @user\`) ou número (Ex: \`${p}5 @user\`).`
          },
          es: {
            title: '🤖 *HERMES BOT - GUÍA DE COMANDOS*',
            sec: '╭━━━〔 ⚡ ACCIONES RÁPIDAS 〕━━━╮',
            sec2: '╭━━━〔 🛡️ PROTECCIONES, AUTOMATIZACIÓN E IA 〕━━━╮',
            tip: `💡 *3 Formas Fáciles de Usar:*\n1️⃣ *Sin memorizar comandos:* Pídelo normalmente a *"Hermes"*.\n2️⃣ *Panel Numérico:* Envía \`${p}config\` y responde con números (1, 2, 3).\n3️⃣ *Comandos directos:* Usa por nombre (Ej: \`${p}ban @user\`) o número (Ej: \`${p}5 @user\`).`
          },
          en: {
            title: '🤖 *HERMES BOT - COMMANDS GUIDE*',
            sec: '╭━━━〔 ⚡ QUICK ACTIONS 〕━━━╮',
            sec2: '╭━━━〔 🛡️ PROTECTIONS, AUTOMATION & AI 〕━━━╮',
            tip: `💡 *3 Easy Ways to Use:*\n1️⃣ *No commands needed:* Just ask *"Hermes"* in plain language.\n2️⃣ *Numbered Panel:* Send \`${p}config\` and reply with numbers (1, 2, 3).\n3️⃣ *Direct commands:* Use by name (e.g. \`${p}ban @user\`) or number (e.g. \`${p}5 @user\`).`
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

        if (protectionCmds.length > 0) {
          output += `${tInfo.sec2}\n`;
          output += `┃ *${p}config* - Painel interativo passo a passo (por números)\n`;
          protectionCmds.forEach(cmd => {
            const numLabel = cmd.num ? `[${cmd.num}] ` : '';
            output += `┃ *${numLabel}${cmd.usage}* - ${cmd.desc}\n`;
          });
          output += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
        }

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
