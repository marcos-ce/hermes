const { groupCache } = require('../../utils/cache');
const { checkAdminStatus, checkGroupUpdateResult } = require('../../utils/jidResolver');
const { getExplicitMentionTargets, hasExplicitMentionSyntax } = require('../../services/targetResolver');
const logger = require('../../utils/logger');

module.exports = {
  name: 'promote',
  aliases: ['promote', 'promover', 'promove', 'adm', 'admin', 'daradm'],
  usage: 'adm @user',
  description: 'Promove membro a Administrador do grupo (requer menção expressa com @)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  async execute({ sock, msg, from, text, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    // Trava de segurança obrigatória: só permite promover quem for marcado
    // expressamente com @. O resolver central cobre menções @lid/@s.whatsapp.net,
    // números com @ e nomes literais (@Fulano) de um único membro do grupo.
    const targets = await getExplicitMentionTargets(sock, msg, from);
    const targetData = targets.find(target => target && target.resolved !== false);

    if (!targetData) {
      const explicitAt = hasExplicitMentionSyntax(sock, msg);
      logger.warn(
        {
          groupJid: from,
          text,
          resolvedTargets: targets.length,
          explicitAt
        },
        'Promote: alvo explícito não resolvido'
      );

      const errorKey = explicitAt ? 'common.not_found_target' : 'promote.need_explicit_mention';
      return reply(t(errorKey));
    }

    const adminCheck = await checkAdminStatus(sock, from, targetData.phoneJid || targetData.groupJid);
    if (adminCheck.isAdmin) {
      return reply(t('promote.already_admin'));
    }

    try {
      const result = await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
      const { ok, failures } = checkGroupUpdateResult(result);
      groupCache.del(from); // Invalida o cache

      if (!ok) {
        logger.warn(
          {
            groupJid: from,
            targetJid: targetData.groupJid,
            failures
          },
          'Promote: WhatsApp recusou a promoção'
        );
        return reply(t('common.error'));
      }

      const mentions = [...new Set([targetData.groupJid, targetData.phoneJid].filter(Boolean))];
      return reply(t('promote.success', { user: targetData.displayUser || targetData.displayNum }), {
        mentions
      });
    } catch (err) {
      groupCache.del(from); // Metadados podem ter mudado; força nova consulta
      logger.error(
        {
          err,
          groupJid: from,
          targetJid: targetData.groupJid
        },
        'Promote: erro ao executar groupParticipantsUpdate'
      );
      return reply(t('common.error'));
    }
  }
};
