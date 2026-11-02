const configManager = require('../../core/configManager');
const { t } = require('../../utils/i18n');

const DDI_LABELS = {
  '55': 'Brasil (+55)',
  '351': 'Portugal (+351)',
  '1': 'EUA/Canadá (+1)',
  '34': 'Espanha (+34)',
  '54': 'Argentina (+54)',
  '52': 'México (+52)',
  '598': 'Uruguai (+598)',
  '595': 'Paraguai (+595)',
  '56': 'Chile (+56)',
  '57': 'Colômbia (+57)',
  '39': 'Itália (+39)',
  '33': 'França (+33)',
  '44': 'Reino Unido (+44)',
  '49': 'Alemanha (+49)',
  '81': 'Japão (+81)'
};

function formatDdiList(ddis) {
  if (!Array.isArray(ddis) || ddis.length === 0) return 'Brasil (+55)';
  if (ddis.some(d => ['*', 'all', 'todos', 'qualquer'].includes(String(d).toLowerCase()))) {
    return 'Qualquer país (Todos)';
  }
  return ddis.map(d => DDI_LABELS[String(d).trim()] || `+${String(d).trim()}`).join(', ');
}

module.exports = async function manageJoinRequests({ sock, msg, from, sender, isBotAdmin, lang, args }) {
  if (!isBotAdmin) {
    return { success: false, error: t(lang, 'common.bot_not_admin') };
  }

  const autoapprovePlugin = require('../../plugins/admin/autoapprove');
  const action = args.action || 'list';

  // 1. Configurar ou Liberar Novos DDIs / Países
  if (action === 'set_allowed_ddis' || (action === 'enable_auto' && args.allowed_ddis)) {
    const rawDdis = String(args.allowed_ddis || '55').trim();
    let ddisToSave = [];

    if (['*', 'todos', 'all', 'qualquer'].includes(rawDdis.toLowerCase())) {
      ddisToSave = ['*'];
    } else {
      ddisToSave = rawDdis.split(/[\s,;]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
      // Mantém Brasil (55) incluído por conveniência, a menos que o admin tenha pedido expressamente apenas outros
      if (ddisToSave.length > 0 && !ddisToSave.includes('55') && !rawDdis.toLowerCase().includes('apenas') && !rawDdis.toLowerCase().includes('somente')) {
        ddisToSave.unshift('55');
      }
      if (ddisToSave.length === 0) ddisToSave = ['55'];
    }

    configManager.setPluginEnabled(from, 'autoapprove', true);
    configManager.updatePluginConfig(from, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: ddisToSave
    });

    const countriesDesc = formatDdiList(ddisToSave);
    return {
      success: true,
      message: `✅ *Auto-Aprovação Atualizada!*\n🌍 *Países/DDIs autorizados:* ${countriesDesc}\n⏱️ *Ritmo Humano Anti-Ban:* Fila sequencial segura de 1 a 2 minutos entre cada aprovação.`
    };
  }

  // 2. Ativação Geral (enable_auto)
  if (action === 'enable_auto') {
    const cfg = configManager.getPluginConfig(from, 'autoapprove') || {};
    const currentDdis = autoapprovePlugin.normalizeAllowedDdis(cfg.allowedDdis);
    configManager.setPluginEnabled(from, 'autoapprove', true);
    configManager.updatePluginConfig(from, 'autoapprove', {
      enabled: true,
      configured: true,
      allowedDdis: currentDdis
    });

    const countriesDesc = formatDdiList(currentDdis);
    return {
      success: true,
      message: `✅ *Auto-Aprovação Anti-Ban ATIVADA!*\n🌍 *Critério de Entrada:* ${countriesDesc}\n⏱️ *Ritmo Humano Anti-Ban:* Fila sequencial segura de 1 a 2 minutos entre cada participante.`
    };
  }

  // 3. Desativação (disable_auto)
  if (action === 'disable_auto') {
    configManager.setPluginEnabled(from, 'autoapprove', false);
    const cancelledCount = await autoapprovePlugin.approvalQueue.cancelGroup(from, 'disabled');
    return {
      success: true,
      message: `🛑 *Auto-Aprovação Anti-Ban DESATIVADA!*\nSolicitações de entrada permanecerão na lista para decisão manual dos administradores.${cancelledCount > 0 ? `\n(${cancelledCount} solicitação(ões) em fila foram interrompidas)` : ''}`
    };
  }

  // 4. Aprovação de Membro Específico (approve_single)
  if (action === 'approve_single') {
    const target = args.target || '';
    if (!target) {
      return {
        success: false,
        error: 'Por favor, informe o número, menção ou LID da pessoa que deseja aprovar.'
      };
    }

    let replyMsg = '';
    const captureReply = async (text) => {
      replyMsg = text;
    };

    await autoapprovePlugin.execute({
      sock,
      msg,
      from,
      sender,
      args: [target],
      reply: captureReply,
      t: (k, vars) => t(lang, k, vars),
      isGroup: true,
      prefix: configManager.getGroupPrefix(from)
    });

    return {
      success: true,
      message: replyMsg || `Pronto! Solicitação para ${target} processada.`
    };
  }

  // 5. Aprovação em Fila Natural de Membros Autorizados (approve_all / approve_all_br)
  if (action === 'approve_all' || action === 'approve_all_br') {
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

  // 6. Consulta / Listagem de Pendentes e Configurações ('list' ou default)
  let pendingList = [];
  try {
    pendingList = await sock.groupRequestParticipantsList(from);
  } catch (_) {
    pendingList = [];
  }

  const cfg = configManager.getPluginConfig(from, 'autoapprove') || {};
  const currentDdis = autoapprovePlugin.normalizeAllowedDdis(cfg.allowedDdis);
  const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');

  let allowedCount = 0;
  let foreignCount = 0;
  let unknownCount = 0;
  const foreignSamples = [];

  for (const item of (pendingList || [])) {
    const info = autoapprovePlugin.extractParticipantInfo(item);
    if (!info.resolved) {
      unknownCount++;
    } else if (autoapprovePlugin.isNumberAllowed(info.digits, currentDdis)) {
      allowedCount++;
    } else {
      foreignCount++;
      if (foreignSamples.length < 3 && info.displayNum) {
        foreignSamples.push(`+${info.displayNum}`);
      }
    }
  }

  const countriesDesc = formatDdiList(currentDdis);
  const samplesText = foreignSamples.length > 0 ? ` (${foreignSamples.join(', ')})` : '';

  return {
    success: true,
    message: `📋 *Solicitações de Entrada no Grupo:* ${pendingList.length} no total\n` +
      `✅ *Autorizados pela regra atual:* ${allowedCount}\n` +
      `⏳ *Estrangeiros pendentes (aguardando liberação):* ${foreignCount}${samplesText}\n` +
      `🔒 *Identificadores LIDs (anônimos):* ${unknownCount}\n\n` +
      `⚙️ *Auto-Aprovação:* ${isEnabled ? '🟢 ATIVADA' : '🔴 DESATIVADA'}\n` +
      `🌍 *Países autorizados:* ${countriesDesc}\n` +
      `⏱️ *Proteção Anti-Ban:* Fila sequencial humana com 1 a 2 minutos por membro.`
  };
};
