const { groupCache } = require('../utils/cache');
const { sendSafeMessage, safeKick, safeDelete } = require('../utils/antiBan');
const { cleanJid, getGroupMetadata } = require('../utils/jidResolver');
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

  // Se o grupo não estiver ativo na licença SaaS, ignora
  if (!configManager.isGroupEnabled(groupJid)) {
    return;
  }

  const lang = configManager.getGroupLang(groupJid);

  if (action === 'add' && Array.isArray(participants)) {
    for (const rawParticipant of participants) {
      const participant = cleanJid(rawParticipant);
      const participantNumber = participant.replace(/@.*$/, '').replace(/\D/g, '');

      // ==========================================
      // 1. Verificação de Blacklist (Global e Grupo)
      // ==========================================
      const isGlobalBL = configManager.isGlobalBlacklisted(participant);
      const isGroupBL = configManager.isGroupBlacklisted(groupJid, participant);

      if (isGlobalBL || isGroupBL) {
        // Remoção de Emergência (Zero Delay)
        await safeKick(sock, groupJid, participant);
        await sendSafeMessage(sock, groupJid, {
          text: t(lang, 'blacklist.banned_entry', { user: participantNumber }),
          mentions: [participant]
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
          await safeKick(sock, groupJid, participant);
          await sendSafeMessage(sock, groupJid, {
            text: t(lang, 'antifake.detected', { user: participantNumber }),
            mentions: [participant]
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

          const sentMsg = await sendSafeMessage(sock, groupJid, {
            text: welcomeText,
            mentions: [participant]
          });

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
