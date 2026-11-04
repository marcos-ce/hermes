const { getGroupMetadata } = require('../../utils/jidResolver');
const configManager = require('../../core/configManager');
const memoryEngine = require('../../services/memoryEngine');
const { t } = require('../../utils/i18n');

/**
 * Ferramenta de IA: obtém informações atuais do grupo.
 * Acione para: "quantos membros tem?", "qual o nome do grupo?", "quem são os admins?",
 * "quantas mensagens foram trocadas?", "me dá um resumo do grupo", "dados do grupo".
 */
module.exports = async function getGroupInfo({ sock, from, lang, args }) {
  try {
    const metadata = await getGroupMetadata(sock, from);
    if (!metadata) {
      return { success: false, error: 'Não foi possível obter os metadados do grupo.' };
    }

    const participants = metadata.participants || [];
    const totalMembers = participants.length;
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const groupName = metadata.subject || 'Grupo';
    const description = metadata.desc || '';

    // Dados de moderação
    const groupData = configManager.getGroup(from) || {};
    const warns = groupData.warns || {};
    const warned = Object.keys(warns).length;
    const mutedMembers = groupData.mutedMembers || {};
    const muted = Object.values(mutedMembers).filter(m => Date.now() < m.until).length;

    // Histórico de mensagens
    const stats = memoryEngine.getGroupStats(from);
    const msgCount = stats?.count || 0;

    // Monta resposta estruturada
    const lines = [
      `📋 *${groupName}*`,
      `👥 Membros: *${totalMembers}*`,
      `👑 Admins: *${admins.length}*`,
    ];

    if (description) {
      const shortDesc = description.length > 80 ? description.slice(0, 77) + '...' : description;
      lines.push(`📝 Descrição: ${shortDesc}`);
    }

    lines.push(`💬 Histórico de mensagens (memória): *${msgCount}*`);

    if (warned > 0) lines.push(`⚠️ Com advertências: *${warned}*`);
    if (muted > 0) lines.push(`🔇 Silenciados agora: *${muted}*`);

    // Licença
    if (groupData.expiresAt) {
      const remaining = Math.max(0, groupData.expiresAt - Date.now());
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
      lines.push(`📅 Licença: *${days}d* restante(s)`);
    }

    return {
      success: true,
      message: lines.join('\n'),
      data: {
        totalMembers,
        admins: admins.length,
        groupName,
        warned,
        muted,
        msgCount
      }
    };
  } catch (err) {
    return { success: false, error: `Erro ao buscar dados do grupo: ${err.message}` };
  }
};
