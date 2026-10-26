const configManager = require('../../core/configManager');
const settings = require('../../config/settings');
const { getGroupMetadata } = require('../../utils/jidResolver');

module.exports = {
  name: 'bot',
  aliases: ['bot', 'ativar', 'activar', 'activate', 'licenca', 'licencia', 'pv', 'dm', 'setup', 'onboarding', 'estilo', 'style'],
  usage: 'bot on/off/add/list/pv/setup/estilo',
  description: 'Gestão de licenças SaaS e ativação do bot no grupo',
  ownerOnly: false, // Checado dinamicamente conforme authMode no execute
  adminOnly: false,
  botAdminRequired: false,
  allowWhenInactive: true,

  async execute({ sock, _msg, from, sender, args, command, reply, t, isOwner, isAdmin, isGroup }) {
    const cmd = (command || '').toLowerCase();
    const isDirectActivate = ['ativar', 'activar', 'activate'].includes(cmd);
    const isPvDirect = ['pv', 'dm'].includes(cmd);
    const sub = isDirectActivate ? (args[0] ? args[0].toLowerCase() : 'on') : (args[0] || 'status').toLowerCase();
    const canManageGroup = isOwner || (settings.authMode === 'admin' && isAdmin);

    // ==========================================
    // Gestão de Comandos Privados (!pv on / !pv off ou !bot pv on / !bot pv off)
    // ==========================================
    if (isPvDirect || sub === 'pv' || sub === 'dm') {
      if (!isOwner) {
        return;
      }
      const state = (isPvDirect ? (args[0] || '') : (args[1] || '')).toLowerCase();
      if (state === 'on' || state === '1' || state === 'ativar') {
        configManager.setPrivateEnabled(true);
        return reply(t('saas.pv_on'));
      } else if (state === 'off' || state === '0' || state === 'desativar') {
        configManager.setPrivateEnabled(false);
        return reply(t('saas.pv_off'));
      } else {
        const current = configManager.isPrivateEnabled() ? t('common.enabled') : t('common.disabled');
        return reply(`🔒 *Privado (DM):* ${current}\nUse: \`/pv on\` ou \`/pv off\``);
      }
    }

    // ==========================================
    // Listagem Geral de Grupos (!bot list)
    // ==========================================
    if (sub === 'list' || sub === 'lista') {
      if (!isOwner) {
        return;
      }
      const allGroups = configManager.getAllGroups();
      if (allGroups.length === 0) {
        return reply(t('saas.list_empty'));
      }

      let text = `${t('saas.list_header')}\n\n`;
      for (const [jid, data] of allGroups) {
        let status = data.enabled ? '🟢 ATIVO' : '🔴 PAUSADO';
        if (configManager.isGroupBanned(jid)) {
          status = '🛑 BANIDO';
        }
        let remaining = t('common.lifetime');
        if (data.expiresAt) {
          const diffMs = data.expiresAt - Date.now();
          if (diffMs > 0) {
            const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            remaining = `${days} ${t('common.days')}`;
          } else {
            remaining = 'EXPIRADO';
          }
        }
        text += t('saas.list_item', {
          name: data.name || 'Grupo sem nome',
          id: jid,
          status,
          remaining
        }) + '\n';
      }
      return reply(text);
    }

    // ==========================================
    // Banir / Desbanir Grupo via !bot
    // ==========================================
    // M-5: 'ban'/'banir' aqui são SUBCOMANDOS de !bot (ex: !bot ban <id>), não aliases globais.
  // O plugin ban.js usa aliases ['ban', 'kick', ...] — sem conflito pois o trigger chega como 'bot'.
  if (sub === 'ban' || sub === 'bangrupo' || sub === 'banir') {
      if (!isOwner) return;
      const targetJid = (args[1] && (args[1].includes('@g.us') || /^\d{15,25}$/.test(args[1])))
        ? (args[1].endsWith('@g.us') ? args[1] : `${args[1]}@g.us`)
        : (isGroup ? from : null);
      if (!targetJid) {
        return reply('⚠️ Informe o ID do grupo ou execute dentro do grupo.\nEx: `/bot ban 120363000000000@g.us`');
      }
      configManager.banGroup(targetJid, args.slice(2).join(' '));
      return reply(t('bangroup.banned', { id: targetJid }));
    }

    if (sub === 'unban' || sub === 'desbanir') {
      if (!isOwner) return;
      const targetJid = (args[1] && (args[1].includes('@g.us') || /^\d{15,25}$/.test(args[1])))
        ? (args[1].endsWith('@g.us') ? args[1] : `${args[1]}@g.us`)
        : (isGroup ? from : null);
      if (!targetJid) {
        return reply('⚠️ Informe o ID do grupo ou execute dentro do grupo.\nEx: `/bot unban 120363000000000@g.us`');
      }
      configManager.unbanGroup(targetJid);
      return reply(t('bangroup.unbanned', { id: targetJid }));
    }

    if (sub === 'banidos' || sub === 'banned') {
      if (!isOwner) return;
      const banned = configManager.getBannedGroups();
      if (!banned.length) return reply(t('bangroup.list_empty'));
      let txt = `${t('bangroup.list_title')}\n\n`;
      banned.forEach((j, i) => {
        txt += `*[${i + 1}]* \`${j}\`\n`;
      });
      return reply(txt);
    }

    // ==========================================
    // Auto-Admin do Dono (!bot adm [id|all] ou !bot autoadm)
    // ==========================================
    if (sub === 'adm' || sub === 'autoadm' || sub === 'daradm') {
      if (!isOwner) return;
      const autoAdmPlugin = require('./autoAdm');
      return await autoAdmPlugin.execute({
        sock,
        msg: _msg,
        from,
        sender,
        args: args.slice(1),
        reply,
        prefix: configManager.getGroupPrefix(from),
        isGroup
      });
    }

    // As ações a seguir são para grupos
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    if (!canManageGroup) {
      return;
    }

    // ==========================================
    // Ativação do Grupo (!bot on [dias] ou !ativar [dias])
    // ==========================================
    if (sub === 'on' || sub === 'ativar' || sub === 'activar' || sub === 'activate') {
      const rawDays = isDirectActivate && !isNaN(parseInt(args[0], 10)) ? args[0] : args[1];
      const daysArg = parseInt(rawDays, 10);
      let expiryDisplay = t('common.lifetime');

      if (!isNaN(daysArg) && daysArg > 0) {
        const expiresAt = configManager.addDaysToGroup(from, daysArg);
        expiryDisplay = new Date(expiresAt).toLocaleDateString();
      } else {
        configManager.setGroupExpiry(from, null); // Vitalício
      }

      configManager.setGroupEnabled(from, true);

      // Atualiza nome do grupo
      try {
        const meta = await getGroupMetadata(sock, from);
        if (meta?.subject) {
          configManager.getOrCreateGroup(from, meta.subject);
        }
      } catch (_) {}

      // Se for a primeira ativação no grupo, dispara o Onboarding de 3 passos automaticamente
      if (!configManager.isGroupOnboarded(from)) {
        const wizardEngine = require('../../core/wizardEngine');
        return await wizardEngine.startOnboarding(sock, _msg, from, sender, expiryDisplay);
      }

      return reply(t('saas.activated', { expiry: expiryDisplay }));
    }

    // ==========================================
    // Onboarding Manual (!bot setup ou !onboarding)
    // ==========================================
    if (cmd === 'setup' || cmd === 'onboarding' || sub === 'setup' || sub === 'onboarding') {
      const wizardEngine = require('../../core/wizardEngine');
      return await wizardEngine.startOnboarding(sock, _msg, from, sender);
    }

    // ==========================================
    // Alternar Estilo de Mensagens (!estilo [natural|formal] ou !bot estilo)
    // ==========================================
    if (cmd === 'estilo' || cmd === 'style' || sub === 'estilo' || sub === 'style') {
      const targetStyle = (cmd === 'estilo' || cmd === 'style' ? (args[0] || '') : (args[1] || '')).toLowerCase();
      if (['formal', 'f', '2'].includes(targetStyle)) {
        configManager.setGroupStyle(from, 'formal');
        return reply('*[Sistema]* Estilo de mensagens alterado para: *Formal (Etiquetas)*');
      } else if (['natural', 'n', '1', 'emojis', 'emoji'].includes(targetStyle)) {
        configManager.setGroupStyle(from, 'natural');
        return reply('🌈 *Estilo de mensagens alterado para:* *Natural (Emojis)*');
      } else {
        const currentStyle = configManager.getGroupStyle(from);
        const display = currentStyle === 'formal' ? 'Formal *[Tag]*' : 'Natural (Emojis)';
        return reply(`🎭 *Estilo Atual:* ${display}\nPara alterar, envie:\n• \`!estilo natural\` (com emojis)\n• \`!estilo formal\` (com etiquetas em negrito)`);
      }
    }

    // ==========================================
    // Adicionar Dias à Licença (!bot add <dias>)
    // ==========================================
    if (sub === 'add' || sub === 'somar' || sub === 'dias') {
      if (!isOwner) {
        return;
      }
      const daysArg = parseInt(args[1], 10);
      if (isNaN(daysArg) || daysArg <= 0) {
        return reply('⚠️ Digite a quantidade de dias válida. Ex: `!bot add 30`');
      }

      const expiresAt = configManager.addDaysToGroup(from, daysArg);
      const expiryDisplay = new Date(expiresAt).toLocaleDateString();
      return reply(t('saas.days_added', { days: daysArg, expiry: expiryDisplay }));
    }

    // ==========================================
    // Desativar Grupo (!bot off) - Soft Disable
    // ==========================================
    if (sub === 'off' || sub === 'desativar' || sub === 'pausar') {
      configManager.setGroupEnabled(from, false);
      return reply(t('saas.deactivated'));
    }

    // ==========================================
    // Status da Licença do Grupo (!bot status)
    // ==========================================
    if (sub === 'status' || sub === 'info') {
      const group = configManager.getGroup(from) || {};
      const status = group.enabled ? '🟢 ATIVO' : '🔴 DESATIVADO';

      let expiryDisplay = t('common.lifetime');
      if (group.expiresAt) {
        const diffMs = group.expiresAt - Date.now();
        if (diffMs > 0) {
          const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          expiryDisplay = `${new Date(group.expiresAt).toLocaleDateString()} (${days} ${t('common.days')})`;
        } else {
          expiryDisplay = '⚠️ EXPIRADA';
        }
      }

      const activeModules = [];
      if (group.plugins) {
        for (const [pName, pCfg] of Object.entries(group.plugins)) {
          if (pCfg && pCfg.enabled) {
            activeModules.push(pName);
          }
        }
      }

      const modulesDisplay = activeModules.length > 0 ? activeModules.join(', ') : 'Nenhum';

      return reply(t('saas.status', {
        id: from,
        status,
        expiry: expiryDisplay,
        modules: modulesDisplay
      }));
    }

    return reply('💡 Comandos do Bot:\n• `!bot on [dias]`\n• `!bot add <dias>`\n• `!bot off`\n• `!bot status`\n• `!bot list`\n• `!pv on/off`');
  }
};
