const { groupCache } = require('../utils/cache');
const { sendSafeMessage, safeKick, safeDelete } = require('../utils/antiBan');
const { cleanJid, getGroupMetadata, resolveParticipant } = require('../utils/jidResolver');
const { t } = require('../utils/i18n');
const configManager = require('../core/configManager');
const pluginLoader = require('../core/pluginLoader');
const logger = require('../utils/logger');

/**
 * Manipulador do evento group-participants.update do Baileys
 * @param {object} sock Instância do Baileys
 * @param {object} update Objeto do evento { id: string, participants: string[], action: string }
 */
async function handleParticipantsUpdate(sock, update) {
  if (!sock || !update || !update.id) return;

  const { id: groupJid, participants, action } = update;

  // Invalidação imediata do cache de metadados do grupo
  groupCache.del(groupJid);

  // Se o grupo estiver banido ou inativo na licença SaaS, ignora 100% em silêncio
  if (configManager.isGroupBanned(groupJid) || !configManager.isGroupEnabled(groupJid)) {
    return;
  }

  const lang = configManager.getGroupLang(groupJid);

  if (action === 'add' && Array.isArray(participants)) {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    for (const rawParticipant of participants) {
      const resolved = await resolveParticipant(sock, groupJid, rawParticipant);
      const targetPhoneJid = resolved?.phoneJid || cleanJid(rawParticipant);
      const targetGroupJid = resolved?.groupJid || cleanJid(rawParticipant);
      const participantNumber = resolved?.displayNum || targetPhoneJid.replace(/@.*$/, '').replace(/\D/g, '');

      // Não aplica boas-vindas nem punições ao próprio bot ao entrar no grupo
      if (!participantNumber || participantNumber === botNumber || targetGroupJid === botLid) {
        continue;
      }

      // ==========================================
      // 1. Verificação de Blacklist (Global e Grupo)
      // ==========================================
      const isGlobalBL = configManager.isGlobalBlacklisted(targetPhoneJid) || configManager.isGlobalBlacklisted(targetGroupJid);
      const isGroupBL = configManager.isGroupBlacklisted(groupJid, targetPhoneJid) || configManager.isGroupBlacklisted(groupJid, targetGroupJid);

      if (isGlobalBL || isGroupBL) {
        // Remoção de Emergência (Zero Delay) usando o JID exato do grupo
        await safeKick(sock, groupJid, targetGroupJid);
        await sendSafeMessage(sock, groupJid, {
          text: t(lang, 'blacklist.banned_entry', { user: participantNumber }),
          mentions: [targetGroupJid, targetPhoneJid]
        });
        continue; // Não executa boas-vindas nem antifake
      }

      // ==========================================
      // 2. Verificação de AntiFake (Filtro de DDI)
      // ==========================================
      const antifakeCfg = configManager.getPluginConfig(groupJid, 'antifake');
      if (antifakeCfg && antifakeCfg.enabled) {
        const allowedDdis = Array.isArray(antifakeCfg.allowedDdis) && antifakeCfg.allowedDdis.length > 0
          ? antifakeCfg.allowedDdis
          : ['55', '351', '1', '34', '54', '52'];

        const hasValidDdi = allowedDdis.some(ddi => participantNumber.startsWith(ddi.replace(/\D/g, '')));
        if (!hasValidDdi) {
          // Número estrangeiro não permitido -> Ban imediato
          await safeKick(sock, groupJid, targetGroupJid);
          await sendSafeMessage(sock, groupJid, {
            text: t(lang, 'antifake.detected', { user: participantNumber }),
            mentions: [targetGroupJid, targetPhoneJid]
          });
          continue; // Não envia boas-vindas
        }
      }

      // ==========================================
      // 3. Boas-Vindas (Welcome)
      // ==========================================
      const welcomeCfg = configManager.getPluginConfig(groupJid, 'welcome');
      if (welcomeCfg && welcomeCfg.enabled) {
        try {
          const metadata = await getGroupMetadata(sock, groupJid);
          const groupName = metadata?.subject || 'Grupo';
          const groupDesc = metadata?.desc || '';

          let welcomeText = welcomeCfg.message || t(lang, 'welcome.default');
          welcomeText = welcomeText
            .replace(/\{user\}/g, `@${participantNumber}`)
            .replace(/\{group\}/g, groupName)
            .replace(/\{desc\}/g, groupDesc);

          // Tenta obter a foto do perfil do grupo para enriquecer as boas-vindas
          let ppUrl = null;
          try {
            ppUrl = await sock.profilePictureUrl(groupJid, 'image');
          } catch (_) {
            ppUrl = null;
          }

          const messagePayload = {
            mentions: [targetGroupJid, targetPhoneJid]
          };

          if (ppUrl) {
            messagePayload.image = { url: ppUrl };
            messagePayload.caption = welcomeText;
          } else {
            messagePayload.text = welcomeText;
          }

          const sentMsg = await sendSafeMessage(sock, groupJid, messagePayload);

          // Auto-delete configurável em segundos
          const autoDeleteSecs = parseInt(welcomeCfg.autoDeleteSeconds, 10);
          if (autoDeleteSecs > 0 && sentMsg?.key) {
            setTimeout(async () => {
              await safeDelete(sock, groupJid, sentMsg.key);
            }, autoDeleteSecs * 1000);
          }
        } catch (err) {
          logger.error({ err, groupJid }, 'Erro ao disparar mensagem de boas-vindas');
        }
      }
    }
  }

  // Executa outros hooks registrados pelos plugins para participantsUpdate
  for (const plugin of pluginLoader.onParticipantsUpdateHooks) {
    try {
      await plugin.onParticipantsUpdate({ sock, update, groupJid, participants, action, lang });
    } catch (err) {
      logger.error({ err, pluginName: plugin.name }, 'Erro no hook onParticipantsUpdate');
    }
  }
}

module.exports = {
  handleParticipantsUpdate
};
