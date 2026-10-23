const configManager = require('../../core/configManager');
const { resolveTarget } = require('../../utils/jidResolver');
const { safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const settings = require('../../config/settings');

module.exports = {
  name: 'blacklist',
  aliases: ['blacklist', 'listanegra', 'bl', 'bloqueados'],
  usage: 'blacklist add/del/list',
  description: 'Lista negra do grupo ou global que expulsa automaticamente ao entrar',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 10,

  /**
   * Hook passivo: monitora entrada de participantes e expulsa imediatamente se estiver na blacklist
   */
  async onParticipantsUpdate({ sock, groupJid, targetPhoneJid, targetGroupJid, participantNumber, lang, action }) {
    if (action !== 'add') return false;

    const isGlobalBL = configManager.isGlobalBlacklisted(targetPhoneJid) || configManager.isGlobalBlacklisted(targetGroupJid);
    const isGroupBL = configManager.isGroupBlacklisted(groupJid, targetPhoneJid) || configManager.isGroupBlacklisted(groupJid, targetGroupJid);

    if (isGlobalBL || isGroupBL) {
      // Remoção de Emergência (Zero Delay) usando o JID exato do grupo
      await safeKick(sock, groupJid, targetGroupJid);
      await sendSafeMessage(sock, groupJid, {
        text: t(lang, 'blacklist.banned_entry', { user: participantNumber }),
        mentions: [targetGroupJid, targetPhoneJid]
      });
      return { stop: true }; // Interrompe próximos plugins (como welcome e antifake)
    }

    return false;
  },

  async execute({ sock, msg, from, _sender, args, _text, reply, t: translate, isOwner, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || 'list').toLowerCase();

    // ==========================================
    // Listagem (!blacklist list)
    // ==========================================
    if (sub === 'list' || sub === 'lista') {
      const groupList = configManager.getGroupBlacklist(from);
      const globalList = configManager.getGlobalBlacklist();

      if (groupList.length === 0 && globalList.length === 0) {
        return reply(translate('blacklist.list_empty'));
      }

      let res = `${translate('blacklist.list_title')}\n\n`;
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
        return reply(translate('common.no_permission_owner'));
      }

      const targetText = args.slice(1).join(' ');
      const targetData = await resolveTarget(sock, msg, from, targetText);
      if (!targetData) {
        return reply(translate('common.not_found_target'));
      }

      configManager.addGlobalBlacklist(targetData.phoneJid);

      // Se o usuário estiver no grupo atual, já remove usando o JID de grupo
      await safeKick(sock, from, targetData.groupJid);

      return reply(translate('blacklist.added_global', { user: targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    }

    // ==========================================
    // Adicionar à Lista do Grupo (!blacklist add @user)
    // ==========================================
    if (sub === 'add' || sub === 'adicionar') {
      const targetText = args.slice(1).join(' ');
      const targetData = await resolveTarget(sock, msg, from, targetText);
      if (!targetData) {
        return reply(translate('common.not_found_target'));
      }

      if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
        return reply('⚠️ Não é permitido adicionar o dono à lista negra.');
      }

      configManager.addGroupBlacklist(from, targetData.phoneJid);

      // Remove imediatamente se estiver presente
      await safeKick(sock, from, targetData.groupJid);

      return reply(translate('blacklist.added', { user: targetData.displayNum }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    }

    // ==========================================
    // Remover da Lista Negra (!blacklist del @user)
    // ==========================================
    if (sub === 'del' || sub === 'remover' || sub === 'rm') {
      const targetText = args.slice(1).join(' ');
      const targetData = await resolveTarget(sock, msg, from, targetText);
      if (!targetData) {
        return reply(translate('common.not_found_target'));
      }

      const targetNum = targetData.displayNum;
      const removedGroup = configManager.removeGroupBlacklist(from, targetData.phoneJid) || 
                           configManager.removeGroupBlacklist(from, targetData.groupJid);
      let removedGlobal = false;

      if (isOwner) {
        removedGlobal = configManager.removeGlobalBlacklist(targetData.phoneJid) || 
                        configManager.removeGlobalBlacklist(targetData.groupJid);
      }

      if (removedGlobal) {
        return reply(translate('blacklist.removed_global', { user: targetNum }), {
          mentions: [targetData.groupJid, targetData.phoneJid]
        });
      }

      if (removedGroup) {
        return reply(translate('blacklist.removed', { user: targetNum }), {
          mentions: [targetData.groupJid, targetData.phoneJid]
        });
      }

      return reply('⚠️ Este usuário não estava na lista negra.');
    }

    return reply('💡 Uso do comando:\n• `!blacklist add @user`\n• `!blacklist del @user`\n• `!blacklist list`\n• `!blacklist global @user` (Apenas Dono)');
  }
};
