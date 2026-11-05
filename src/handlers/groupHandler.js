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

  // Trava anti-abuso imediata: verifica se o próprio bot foi adicionado a este grupo
  if (action === 'add' && Array.isArray(participants)) {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBotAdded = participants.some((p) => {
      const cleanP = cleanJid(p);
      const num = cleanP.replace(/@.*$/, '').replace(/\D/g, '');
      return cleanP === botJid || cleanP === botLid || (botNumber && num === botNumber);
    });

    if (isBotAdded) {
      const siteOrders = require('../services/siteOrders');
      let inviteCode = null;
      try { inviteCode = await sock.groupInviteCode(groupJid); } catch (_) {}
      const pending = siteOrders.claimPendingGroup(groupJid, inviteCode);
      const isTrialPending = Boolean(!pending || pending.isTrial || pending.plan === 'teste');
      const trialAlreadyUsed = configManager.hasGroupUsedTrial(groupJid);

      if (isTrialPending && trialAlreadyUsed) {
        logger.warn({ groupJid }, 'Bot re-adicionado a grupo que já consumiu o teste grátis. Saindo...');
        try {
          const siteBridge = require('../services/siteBridge');
          siteBridge._notifyOwner(
            `⚠️ *Tentativa de Reuso de Teste Grátis Bloqueada!*\n\n` +
            `• Grupo: \`${groupJid}\`\n` +
            `O bot foi adicionado a um grupo que já utilizou os 3 dias grátis anteriormente.\n` +
            `Como não há pagamento mensal aprovado, o bot saiu do grupo automaticamente.`
          );
        } catch (_) {}

        try {
          const { t } = require('../utils/i18n');
          const { sendSafeMessage } = require('../utils/antiBan');
          const groupLang = configManager.getGroupLang(groupJid) || 'pt';
          const siteUrl = process.env.PUBLIC_URL || process.env.URL_PUBLICA || 'https://hermes.hewhotries.tech';
          let adminsMention = '';
          try {
            const meta = await sock.groupMetadata(groupJid);
            const admins = (meta.participants || []).filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`);
            if (admins.length > 0) adminsMention = admins.join(' ');
          } catch (_) {}

          const text = t(groupLang, 'saas.trial_already_consumed', { admins: adminsMention, url: siteUrl });
          try {
            await sendSafeMessage(sock, groupJid, { text });
            await new Promise(r => setTimeout(r, 1500));
          } catch (_) {}
        } catch (_) {}

        try {
          const { safeGroupLeave } = require('../utils/antiBan');
          await safeGroupLeave(sock, groupJid, 'trial_already_consumed_on_add');
        } catch (err) {
          logger.error({ err: err.message, groupJid }, 'Falha ao executar safeGroupLeave');
        }
        return;
      }
    }
  }

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

/**
 * Manipulador desacoplado do evento group.join-request do Baileys
 * Roteia solicitações de entrada de novos participantes para os plugins registrados.
 * @param {object} sock Instância do Baileys
 * @param {object} request Objeto do evento { id: string, author?: string, participant: string, action: string, method?: string }
 */
async function handleJoinRequest(sock, request) {
  if (!sock || !request || !request.id) return;

  const { id: groupJid, participant, action, method, author } = request;

  // Invalidação preventiva do cache de metadados do grupo
  groupCache.del(groupJid);

  // Se o grupo estiver banido ou inativo na licença SaaS, ignora 100% em silêncio
  if (configManager.isGroupBanned(groupJid) || !configManager.isGroupEnabled(groupJid)) {
    return;
  }

  const lang = configManager.getGroupLang(groupJid);
  const style = configManager.getGroupStyle(groupJid);

  for (const plugin of pluginLoader.onJoinRequestHooks) {
    try {
      const result = await plugin.onJoinRequest({
        sock,
        request,
        groupJid,
        participant,
        action,
        method,
        author,
        lang,
        style
      });

      if (result && result.stop === true) {
        break;
      }
    } catch (err) {
      logger.error({ err, pluginName: plugin.name }, 'Erro no hook onJoinRequest do plugin');
    }
  }
}

module.exports = {
  handleParticipantsUpdate,
  handleJoinRequest
};
