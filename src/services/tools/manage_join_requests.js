const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function manageJoinRequests({ sock, msg, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const autoapprovePlugin = require('../../plugins/admin/autoapprove');

  if (args.action === 'enable_auto') {
    configManager.setPluginEnabled(from, 'autoapprove', true);
    configManager.updatePluginConfig(from, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ['55']
    });
    return {
      success: true,
      message: '✅ *Auto-Aprovação Anti-Ban ATIVADA em Modo Natural (DDI 55 - Brasil)!*\nNovos participantes com número brasileiro serão aceitos automaticamente na fila segura (intervalo humano de 1 a 2 minutos entre cada aprovação).'
    };
  }

  if (args.action === 'disable_auto') {
    configManager.setPluginEnabled(from, 'autoapprove', false);
    await autoapprovePlugin.approvalQueue.cancelGroup(from, 'disabled');
    return {
      success: true,
      message: '🛑 *Auto-Aprovação Anti-Ban DESATIVADA!*\nSolicitações de entrada permanecerão na fila para aprovação manual dos administradores.'
    };
  }

  if (args.action === 'approve_all' || args.action === 'approve_all_br') {
    let replyMsg = '';
    const captureReply = async (text) => {
      replyMsg = text;
    };
    await autoapprovePlugin.execute({
      sock,
      msg,
      from,
      sender,
      args: ['agora'],
      reply: captureReply,
      t: (k, vars) => t(lang, k, vars),
      isGroup: true,
      prefix: configManager.getGroupPrefix(from)
    });
    return {
      success: true,
      message: replyMsg || '🚀 *Iniciando aprovação em fila natural segura (1 a 2 minutos entre cada membro)...*'
    };
  }

  // 'list' ou default
  let pendingList = [];
  try {
    pendingList = await sock.groupRequestParticipantsList(from);
  } catch (_) {
    pendingList = [];
  }

  const cfg = configManager.getPluginConfig(from, 'autoapprove') || {};
  let brCount = 0;
  let foreignCount = 0;
  let unknownCount = 0;

  for (const item of (pendingList || [])) {
    const info = autoapprovePlugin.extractParticipantInfo(item);
    if (!info.resolved) {
      unknownCount++;
    } else if (autoapprovePlugin.isNumberAllowed(info.digits, ['55'])) {
      brCount++;
    } else {
      foreignCount++;
    }
  }

  const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');
  const isAll = autoapprovePlugin.isWildcardList(cfg.allowedDdis);
  const modeText = isAll ? 'Qualquer membro (Todos)' : 'Apenas Brasileiros (DDI 55)';
  return {
    success: true,
    message: `📋 *Solicitações Pendentes:* ${pendingList.length} no total\n🇧🇷 *Brasileiros:* ${brCount}\n🌍 *Estrangeiros:* ${foreignCount}\n🔒 *LIDs não resolvidos:* ${unknownCount}\n⚙️ *Auto-Aprovação:* ${isEnabled ? 'Ativada' : 'Desativada'} (${modeText})`
  };
};
