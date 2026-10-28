const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

module.exports = async function manageJoinRequests({ sock, msg, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const autoapprovePlugin = require('../../plugins/admin/autoapprove');

  if (args.action === 'enable_auto') {
    const isAll = args.mode === 'all' || args.allow_all === true;
    configManager.setPluginEnabled(from, 'autoapprove', true);
    if (isAll) {
      configManager.updatePluginConfig(from, 'autoapprove', {
        enabled: true,
        configured: true,
        allowedDdis: ['*']
      });
      return {
        success: true,
        message: '✅ *Auto-Aprovação Anti-Ban ATIVADA para QUALQUER membro!*\nNovos participantes de qualquer país serão aceitos automaticamente com fila de segurança.'
      };
    }

    configManager.updatePluginConfig(from, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ['55']
    });
    return {
      success: true,
      message: '✅ *Auto-Aprovação Anti-Ban ATIVADA para BRASILEIROS!*\nNovos participantes com número brasileiro (DDI 55) serão aceitos automaticamente com fila de segurança.'
    };
  }

  if (args.action === 'disable_auto') {
    configManager.setPluginEnabled(from, 'autoapprove', false);
    return {
      success: true,
      message: '🛑 *Auto-Aprovação Anti-Ban DESATIVADA!*\nSolicitações de entrada permanecerão na fila para aprovação manual dos administradores.'
    };
  }

  if (args.action === 'approve_all') {
    let replyMsg = '';
    const captureReply = async (text) => {
      replyMsg = text;
    };
    await autoapprovePlugin.execute({
      sock,
      msg,
      from,
      sender,
      args: ['todos'],
      reply: captureReply,
      t: (k, vars) => t(lang, k, vars),
      isGroup: true,
      prefix: configManager.getGroupPrefix(from)
    });
    return {
      success: true,
      message: replyMsg || '🚀 *Iniciando aprovação segura anti-ban de todos os participantes...*'
    };
  }

  if (args.action === 'approve_all_br') {
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
      message: replyMsg || '🚀 *Iniciando aprovação segura anti-ban de participantes brasileiros...*'
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

  for (const item of (pendingList || [])) {
    const info = autoapprovePlugin.extractParticipantInfo(item);
    if (autoapprovePlugin.isNumberAllowed(info.digits, ['55'])) {
      brCount++;
    } else {
      foreignCount++;
    }
  }

  const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');
  const isAll = (cfg.allowedDdis || []).some(d => ['*', 'all', 'todos', 'qualquer'].includes(String(d).toLowerCase()));
  const modeText = isAll ? 'Qualquer membro (Todos)' : 'Apenas Brasileiros (DDI 55)';
  return {
    success: true,
    message: `📋 *Solicitações Pendentes:* ${pendingList.length} no total\n🇧🇷 *Brasileiros:* ${brCount}\n🌍 *Estrangeiros:* ${foreignCount}\n⚙️ *Auto-Aprovação:* ${isEnabled ? 'Ativada' : 'Desativada'} (${modeText})`
  };
};
