const process = require('process');
const configManager = require('../../core/configManager');

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'ping',
  aliases: ['ping', 'status', 'info', 'latencia', 'uptime'],
  usage: 'ping',
  description: 'Exibe status, latência, consumo de memória e validade da licença',
  ownerOnly: false,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ msg, from, reply, t, lang, isGroup }) {
    const startTimestamp = (Number(msg.messageTimestamp) * 1000) || Date.now();
    const latency = Math.max(0, Date.now() - startTimestamp);

    const memUsage = process.memoryUsage();
    const ramMb = (memUsage.rss / (1024 * 1024)).toFixed(1);
    const uptimeStr = formatUptime(process.uptime());

    let expiryDisplay = t('common.lifetime');
    if (isGroup) {
      const group = configManager.getGroup(from);
      if (group?.expiresAt) {
        const diffMs = group.expiresAt - Date.now();
        if (diffMs > 0) {
          const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          expiryDisplay = `${new Date(group.expiresAt).toLocaleDateString()} (${days} ${t('common.days')})`;
        } else {
          expiryDisplay = '⚠️ EXPIRADA';
        }
      }
    } else {
      expiryDisplay = 'DM / Privado';
    }

    let pingText = `${t('ping.title')}\n\n`;
    pingText += `${t('ping.latency', { latency })}\n`;
    pingText += `${t('ping.uptime', { uptime: uptimeStr })}\n`;
    pingText += `${t('ping.ram', { ram: ramMb })}\n`;
    pingText += `${t('ping.lang', { lang: lang.toUpperCase() })}\n`;
    pingText += `${t('ping.license', { expiry: expiryDisplay })}`;

    return reply(pingText);
  }
};
