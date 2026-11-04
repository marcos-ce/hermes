const configManager = require('../../core/configManager');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

module.exports = {
  name: 'inactivityalert',
  aliases: ['inactivityalert', 'inatividade', 'inactividad', 'inactivity', 'alertainativo', 'grupoinativo'],
  description: 'Envia mensagem de estímulo quando o grupo fica inativo por X horas',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,
  priority: 60,

  configSchema: {
    title: {
      pt: 'Alerta de Grupo Inativo',
      es: 'Alerta de Grupo Inactivo',
      en: 'Inactive Group Alert'
    },
    description: {
      pt: 'Envia mensagem automática quando ninguém fala por um período configurado',
      es: 'Envía mensaje automático cuando nadie habla por el tiempo configurado',
      en: 'Sends automatic message when nobody talks for a configured period'
    },
    fields: [
      {
        name: 'thresholdHours',
        type: 'number',
        question: {
          pt: 'Após quantas horas sem mensagens o alerta deve ser enviado? (mínimo 1, máximo 72):',
          es: '¿Después de cuántas horas sin mensajes se debe enviar la alerta? (mínimo 1, máximo 72):',
          en: 'After how many hours without messages should the alert be sent? (min 1, max 72):'
        },
        default: 12
      },
      {
        name: 'message',
        type: 'string',
        question: {
          pt: 'Texto da mensagem de estímulo (use {group} para o nome do grupo, ou "padrão" para o texto padrão):',
          es: 'Texto del mensaje de estímulo (usa {group} para el nombre del grupo, o "predeterminado" para el texto predeterminado):',
          en: 'Stimulus message text (use {group} for group name, or "default" for default text):'
        },
        default: '💬 Ei, {group}! Tá tudo bem por aí? Que tal trocar uma ideia? 😄'
      },
      {
        name: 'cooldownHours',
        type: 'number',
        question: {
          pt: 'Após enviar o alerta, quantas horas aguardar antes de enviar novamente? (mínimo 1, máximo 168):',
          es: '¿Tras enviar la alerta, cuántas horas esperar antes de enviar de nuevo? (mínimo 1, máximo 168):',
          en: 'After sending the alert, how many hours to wait before sending again? (min 1, max 168):'
        },
        default: 24
      }
    ]
  },

  async onSchedule({ sock, groupJid, group, config, queueTask, lastExecuted, currentDateKey }) {
    const cfg = config || {};
    const thresholdHours = Math.min(Math.max(parseFloat(cfg.thresholdHours) || 12, 1), 72);
    const cooldownHours = Math.min(Math.max(parseFloat(cfg.cooldownHours) || 24, 1), 168);

    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    const now = Date.now();
    const lastActivity = group?.lastActivity || 0;
    const timeSinceActivity = now - lastActivity;

    // Ainda não passou do threshold de inatividade
    if (timeSinceActivity < thresholdMs) return;

    // Verifica cooldown: só envia uma vez por período de cooldown
    const execKey = `inactivityalert:${groupJid}`;
    const lastSent = lastExecuted.get(execKey) || 0;
    if (now - lastSent < cooldownMs) return;

    lastExecuted.set(execKey, now);

    queueTask({
      run: async () => {
        try {
          const lang = group?.lang || 'pt';
          const style = group?.style || 'default';
          const groupName = groupCache_safe(groupJid) || 'Grupo';

          let message = cfg.message || t(lang, 'inactivityalert.default_message', { group: groupName }, style);
          message = message.replace(/\{group\}/g, groupName);

          await sendSafeMessage(sock, groupJid, { text: message });
          logger.info({ groupJid, thresholdHours, timeSinceActivity: Math.round(timeSinceActivity / 3600000) + 'h' }, '[inactivityalert] Alerta de inatividade enviado');
        } catch (err) {
          logger.error({ err, groupJid }, '[inactivityalert] Erro ao enviar alerta de inatividade');
        }
      }
    });
  },

  async execute({ sock, msg, from, args, reply, t: translate, lang, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'inactivityalert') || {};

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'inactivityalert', true);
      return reply(t(lang, 'inactivityalert.on'));
    }
    if (sub === 'off' || sub === 'desativar' || sub === 'desactivar') {
      configManager.setPluginEnabled(from, 'inactivityalert', false);
      return reply(t(lang, 'inactivityalert.off'));
    }

    // Status
    const enabled = configManager.isPluginEnabled(from, 'inactivityalert');
    const statusStr = enabled ? translate('common.enabled') : translate('common.disabled');
    const hours = cfg.thresholdHours || 12;
    const cooldown = cfg.cooldownHours || 24;
    const group = configManager.getGroup(from) || {};
    const lastActivity = group.lastActivity || 0;
    const idleMs = Date.now() - lastActivity;
    const idleH = Math.round(idleMs / 3600000);

    return reply(
      `😴 *Alerta de Inatividade:* ${statusStr}\n` +
      `⏱️ Disparo após: *${hours}h* sem mensagens\n` +
      `🔁 Cooldown: *${cooldown}h* entre alertas\n` +
      `💬 Última mensagem: há *${idleH}h*\n\n` +
      `💡 *Comandos:*\n• \`!inatividade on\` / \`!inatividade off\`\n• \`!inatividade config\` — abre o assistente de configuração`
    );
  }
};

// Helper leve para nome do grupo sem bloquear o scheduler
function groupCache_safe(groupJid) {
  try {
    const { groupCache } = require('../../utils/cache');
    return groupCache.get(groupJid)?.subject || null;
  } catch (_) {
    return null;
  }
}
