const configManager = require('../../core/configManager');
const settings = require('../../config/settings');
const { getGroupMetadata } = require('../../utils/jidResolver');

module.exports = {
  name: 'bot',
  aliases: ['bot', 'ativar', 'activar', 'activate', 'licenca', 'licencia', 'pv', 'dm'],
  description: 'Gestão de licenças SaaS e ativação do bot no grupo',
  ownerOnly: false, // Checado dinamicamente conforme authMode no execute
  adminOnly: false,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, args, reply, t, isOwner, isAdmin, isGroup }) {
    const sub = (args[0] || 'status').toLowerCase();
    const canManageGroup = isOwner || (settings.authMode === 'admin' && isAdmin);

    // ==========================================
    // Gestão de Comandos Privados (!pv on / !pv off)
    // ==========================================
    if (sub === 'pv' || sub === 'dm') {
      if (!isOwner) {
        return reply(t('common.no_permission_owner'));
      }
      const state = (args[1] || '').toLowerCase();
      if (state === 'on' || state === '1' || state === 'ativar') {
        configManager.setPrivateEnabled(true);
        return reply(t('saas.pv_on'));
      } else if (state === 'off' || state === '0' || state === 'desativar') {
        configManager.setPrivateEnabled(false);
        return reply(t('saas.pv_off'));
      } else {
        const current = configManager.isPrivateEnabled() ? t('common.enabled') : t('common.disabled');
        return reply(`🔒 *Privado (DM):* ${current}\nUse: \`!pv on\` ou \`!pv off\``);
      }
    }

    // ==========================================
    // Listagem Geral de Grupos (!bot list)
    // ==========================================
    if (sub === 'list' || sub === 'lista') {
      if (!isOwner) {
        return reply(t('common.no_permission_owner'));
      }
      const allGroups = configManager.getAllGroups();
      if (allGroups.length === 0) {
        return reply(t('saas.list_empty'));
      }

      let text = `${t('saas.list_header')}\n\n`;
      for (const [jid, data] of allGroups) {
        const status = data.enabled ? '🟢 ATIVO' : '🔴 PAUSADO';
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

    // As ações a seguir são para grupos
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    if (!canManageGroup) {
      return reply(t('common.no_permission_owner'));
    }

    // ==========================================
    // Ativação do Grupo (!bot on [dias])
    // ==========================================
    if (sub === 'on' || sub === 'ativar' || sub === 'activar' || sub === 'activate') {
      const daysArg = parseInt(args[1], 10);
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

      return reply(t('saas.activated', { expiry: expiryDisplay }));
    }

    // ==========================================
    // Adicionar Dias à Licença (!bot add <dias>)
    // ==========================================
    if (sub === 'add' || sub === 'somar' || sub === 'dias') {
      if (!isOwner) {
        return reply(t('common.no_permission_owner'));
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
