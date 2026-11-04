const configManager = require('../../core/configManager');
const memoryEngine = require('../../services/memoryEngine');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const { getGroupMetadata } = require('../../utils/jidResolver');
const logger = require('../../utils/logger');

// ─── Helpers ────────────────────────────────────────────────────────────────

function fetchWeekStats(groupJid) {
  const db = memoryEngine.db;
  if (!db) return null;

  const sinceTs = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  try {
    const totalRow = db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE group_jid = ? AND timestamp >= ?'
    ).get(groupJid, sinceTs);
    const totalMsgs = totalRow?.cnt || 0;

    if (totalMsgs === 0) return { totalMsgs: 0, topSenders: [], perDay: {} };

    const topRows = db.prepare(`
      SELECT sender_jid, sender_name, COUNT(*) as cnt
      FROM messages
      WHERE group_jid = ? AND timestamp >= ?
      GROUP BY sender_jid
      ORDER BY cnt DESC
      LIMIT 5
    `).all(groupJid, sinceTs);

    const topSenders = topRows.map(r => ({
      num: r.sender_jid.replace(/@.*$/, '').replace(/\D/g, ''),
      name: r.sender_name || r.sender_jid.replace(/@.*$/, ''),
      count: r.cnt
    }));

    const dayRows = db.prepare(`
      SELECT DATE(timestamp, 'unixepoch', 'localtime') as day, COUNT(*) as cnt
      FROM messages
      WHERE group_jid = ? AND timestamp >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(groupJid, sinceTs);

    const perDay = {};
    for (const r of dayRows) perDay[r.day] = r.cnt;

    return { totalMsgs, topSenders, perDay };
  } catch (err) {
    logger.warn({ err, groupJid }, '[weeklyreport] Falha ao consultar SQLite');
    return null;
  }
}

function formatDayBar(perDay, lang) {
  const dayNames = {
    pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  };
  const names = dayNames[lang] || dayNames.pt;
  const entries = Object.entries(perDay);
  if (entries.length === 0) return '';
  return entries.map(([date, cnt]) => {
    const d = new Date(date + 'T12:00:00Z');
    return `${names[d.getUTCDay()]} ${cnt}`;
  }).join(' · ');
}

/**
 * Função compartilhada que constrói o texto e as menções do relatório.
 * Usada tanto pelo onSchedule quanto pelo execute "agora".
 */
async function buildReport(sock, groupJid, lang) {
  const stats = fetchWeekStats(groupJid);
  if (!stats || stats.totalMsgs === 0) return null;

  let metadata;
  try { metadata = await getGroupMetadata(sock, groupJid); } catch (_) {}
  const groupName = metadata?.subject || 'Grupo';
  const totalMembers = metadata?.participants?.length || 0;

  const groupData = configManager.getGroup(groupJid) || {};
  const warns = groupData.warns || {};
  const totalWarned = Object.keys(warns).length;
  const dayBar = formatDayBar(stats.perDay, lang);

  const topText = stats.topSenders.length > 0
    ? stats.topSenders.map((s, i) => `${i + 1}. @${s.num} (${s.count} msgs)`).join('\n')
    : t(lang, 'weeklyreport.no_data');
  const mentions = stats.topSenders.map(s => `${s.num}@s.whatsapp.net`);

  let text = t(lang, 'weeklyreport.header', { group: groupName }) + '\n\n';
  text += t(lang, 'weeklyreport.total_msgs', { count: stats.totalMsgs }) + '\n';
  text += t(lang, 'weeklyreport.total_members', { count: totalMembers }) + '\n';
  if (dayBar) text += `📅 ${dayBar}\n`;
  text += '\n' + t(lang, 'weeklyreport.top_title') + '\n' + topText;
  if (totalWarned > 0) text += '\n\n' + t(lang, 'weeklyreport.warns', { count: totalWarned });

  return { text, mentions };
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

module.exports = {
  name: 'weeklyreport',
  aliases: ['weeklyreport', 'relatorio', 'relatório', 'reporte', 'report', 'semana'],
  description: 'Relatório semanal automático: top ativos, advertências e resumo de movimento',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,
  priority: 60,

  configSchema: {
    title: {
      pt: 'Relatório Semanal',
      es: 'Reporte Semanal',
      en: 'Weekly Report'
    },
    description: {
      pt: 'Envia automaticamente toda segunda-feira um resumo da semana do grupo',
      es: 'Envía automáticamente cada lunes un resumen semanal del grupo',
      en: 'Automatically sends a weekly summary every Monday'
    },
    fields: [
      {
        name: 'sendTime',
        type: 'string',
        question: {
          pt: 'Horário de envio do relatório semanal (formato HH:MM, ex: "08:00"):',
          es: 'Hora de envío del reporte semanal (formato HH:MM, ej: "08:00"):',
          en: 'Weekly report send time (HH:MM format, e.g. "08:00"):'
        },
        default: '08:00'
      }
    ]
  },

  async onSchedule({ sock, groupJid, group, config, currentHHMM, currentDateKey, lang, queueTask, lastExecuted }) {
    const cfg = config || {};
    const sendTime = cfg.sendTime || '08:00';

    if (currentHHMM !== sendTime) return;

    // Só segunda-feira (day === 1)
    if (new Date().getDay() !== 1) return;

    const execKey = `weeklyreport:${groupJid}:${currentDateKey}`;
    if (lastExecuted.get(execKey)) return;
    lastExecuted.set(execKey, Date.now());

    queueTask({
      run: async () => {
        try {
          const report = await buildReport(sock, groupJid, lang);
          if (!report) return;
          await sendSafeMessage(sock, groupJid, { text: report.text, mentions: report.mentions });
        } catch (err) {
          logger.error({ err, groupJid }, '[weeklyreport] Erro ao enviar relatório semanal');
        }
      }
    });
  },

  async execute({ sock, msg, from, args, reply, t: translate, lang, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'weeklyreport') || {};

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'weeklyreport', true);
      return reply(t(lang, 'weeklyreport.on'));
    }
    if (sub === 'off' || sub === 'desativar' || sub === 'desactivar') {
      configManager.setPluginEnabled(from, 'weeklyreport', false);
      return reply(t(lang, 'weeklyreport.off'));
    }

    // !relatorio agora — envia imediatamente
    if (sub === 'now' || sub === 'agora' || sub === 'ahora' || sub === 'enviar') {
      const report = await buildReport(sock, from, lang);
      if (!report) return reply(t(lang, 'weeklyreport.no_data'));
      return await sendSafeMessage(sock, from, { text: report.text, mentions: report.mentions });
    }

    // Status
    const enabled = configManager.isPluginEnabled(from, 'weeklyreport');
    const statusStr = enabled ? translate('common.enabled') : translate('common.disabled');
    const time = cfg.sendTime || '08:00';
    return reply(
      `📊 *Relatório Semanal:* ${statusStr}\n` +
      `⏰ Horário: ${time} (toda segunda-feira)\n\n` +
      `💡 *Comandos:*\n• \`!relatorio on\` / \`!relatorio off\`\n• \`!relatorio agora\` — envia imediatamente`
    );
  }
};
