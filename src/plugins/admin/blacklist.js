const configManager = require('../../core/configManager');
const { extractTarget, getGroupMetadata } = require('../../utils/jidResolver');
const { safeKick } = require('../../utils/antiBan');
const settings = require('../../config/settings');

module.exports = {
  name: 'blacklist',
  aliases: ['blacklist', 'listanegra', 'bl', 'bloqueados'],
  description: 'Lista negra do grupo ou global que expulsa automaticamente ao entrar',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, sender, args, text, reply, t, isOwner, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || 'list').toLowerCase();

    // ==========================================
    // Listagem (!blacklist list)
    // ==========================================
    if (sub === 'list' || sub === 'lista') {
      const groupList = configManager.getGroupBlacklist(from);
      const globalList = configManager.getGlobalBlacklist();

      if (groupList.length === 0 && globalList.length === 0) {
        return reply(t('blacklist.list_empty'));
      }

      let res = `${t('blacklist.list_title')}\n\n`;
      if (groupList.length > 0) {
        res += `📌 *Lista do Grupo:*\n`;
        for (const jid of groupList) {
          const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
          res += `▫️ +${num}\n`;
        }
      }

      if (globalList.length > 0) {
        res += `\n🌐 *Lista Negra Global:*\n`;
        for (const jid of globalList) {
          const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
          res += `▫️ +${num}\n`;
        }
      }

      return reply(res);
    }

    // ==========================================
    // Adicionar à Lista Negra Global (!blacklist global @user)
    // ==========================================
    if (sub === 'global') {
      if (!isOwner) {
        return reply(t('common.no_permission_owner'));
      }

      const targetText = args.slice(1).join(' ');
      const target = extractTarget(msg, targetText);
      if (!target) {
        return reply(t('common.not_found_target'));
      }

      configManager.addGlobalBlacklist(target);
      const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');

      // Se o usuário estiver no grupo atual, já remove
      await safeKick(sock, from, target);

      return reply(t('blacklist.added_global', { user: targetNum }), {
        mentions: [target]
      });
    }

    // ==========================================
    // Adicionar à Lista do Grupo (!blacklist add @user)
    // ==========================================
    if (sub === 'add' || sub === 'adicionar') {
      const targetText = args.slice(1).join(' ');
      const target = extractTarget(msg, targetText);
      if (!target) {
        return reply(t('common.not_found_target'));
      }

      if (settings.isOwner(target, sock)) {
        return reply('⚠️ Não é permitido adicionar o dono à lista negra.');
      }

      configManager.addGroupBlacklist(from, target);
      const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');

      // Remove imediatamente se estiver presente
      await safeKick(sock, from, target);

      return reply(t('blacklist.added', { user: targetNum }), {
        mentions: [target]
      });
    }

    // ==========================================
    // Remover da Lista Negra (!blacklist del @user)
    // ==========================================
    if (sub === 'del' || sub === 'remover' || sub === 'rm') {
      const targetText = args.slice(1).join(' ');
      const target = extractTarget(msg, targetText);
      if (!target) {
        return reply(t('common.not_found_target'));
      }

      const targetNum = target.replace(/@.*$/, '').replace(/\D/g, '');
      const removedGroup = configManager.removeGroupBlacklist(from, target);
      let removedGlobal = false;

      if (isOwner) {
        removedGlobal = configManager.removeGlobalBlacklist(target);
      }

      if (removedGlobal) {
        return reply(t('blacklist.removed_global', { user: targetNum }), {
          mentions: [target]
        });
      }

      if (removedGroup) {
        return reply(t('blacklist.removed', { user: targetNum }), {
          mentions: [target]
        });
      }

      return reply('⚠️ Este usuário não estava na lista negra.');
    }

    return reply('💡 Uso do comando:\n• `!blacklist add @user`\n• `!blacklist del @user`\n• `!blacklist list`\n• `!blacklist global @user` (Apenas Dono)');
  }
};
