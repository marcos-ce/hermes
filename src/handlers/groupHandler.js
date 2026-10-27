const { groupCache } = require('../utils/cache');
const { cleanJid, resolveParticipant } = require('../utils/jidResolver');
const configManager = require('../core/configManager');
const pluginLoader = require('../core/pluginLoader');
const logger = require('../utils/logger');

/**
 * Manipulador desacoplado do evento group-participants.update do Baileys
 * Roteia dinamicamente os eventos para os plugins registrados sem lógica engessada no handler.
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
  const style = configManager.getGroupStyle(groupJid);

  if (action === 'add' && Array.isArray(participants)) {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    for (const rawParticipant of participants) {
      let resolved = await resolveParticipant(sock, groupJid, rawParticipant);
      let targetPhoneJid = resolved?.phoneJid || cleanJid(rawParticipant);
      let targetGroupJid = resolved?.groupJid || cleanJid(rawParticipant);

      // BAN-3: Se após a primeira resolução o phoneJid ainda for @lid (mapa não populado),
      // força reload dos metadados e tenta resolver novamente.
      // Evita falso positivo do antifake expulsando brasileiro legítimo por DDI não reconhecido.
      if (targetPhoneJid.endsWith('@lid')) {
        const { getGroupMetadata } = require('../utils/jidResolver');
        await getGroupMetadata(sock, groupJid); // popula o mapa LID→Phone via cache
        const reResolved = await resolveParticipant(sock, groupJid, rawParticipant);
        if (reResolved?.phoneJid && !reResolved.phoneJid.endsWith('@lid')) {
          targetPhoneJid = reResolved.phoneJid;
          targetGroupJid = reResolved.groupJid;
          resolved = reResolved;
        }
      }

      const participantNumber = resolved?.displayNum || targetPhoneJid.replace(/@.*$/, '').replace(/\D/g, '');

      // Não aplica boas-vindas nem punições ao próprio bot ao entrar no grupo
      if (!participantNumber || participantNumber === botNumber || targetGroupJid === botLid) {
        continue;
      }

      // Despacha para os plugins registrados em ordem de prioridade (ex: 1º Blacklist -> 2º AntiFake -> 3º Boas-Vindas)
      for (const plugin of pluginLoader.onParticipantsUpdateHooks) {
        try {
          const result = await plugin.onParticipantsUpdate({
            sock,
            update,
            groupJid,
            targetPhoneJid,
            targetGroupJid,
            participantNumber,
            lang,
            style,
            action
          });

          // Se o plugin retornou { stop: true } (ex: banido por blacklist ou antifake), interrompe os próximos plugins
          if (result && result.stop === true) {
            break;
          }
        } catch (err) {
          logger.error({ err, pluginName: plugin.name }, 'Erro no hook onParticipantsUpdate do plugin');
        }
      }
    }
  } else {
    // Para outros eventos (remove, promote, demote), notifica plugins interessados
    for (const plugin of pluginLoader.onParticipantsUpdateHooks) {
      try {
        await plugin.onParticipantsUpdate({
          sock,
          update,
          groupJid,
          participants,
          action,
          lang,
          style
        });
      } catch (err) {
        logger.error({ err, pluginName: plugin.name }, 'Erro no hook onParticipantsUpdate do plugin');
      }
    }
  }
}

module.exports = {
  handleParticipantsUpdate
};
