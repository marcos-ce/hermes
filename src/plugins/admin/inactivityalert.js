const configManager = require('../../core/configManager');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const { getGroupMetadata } = require('../../utils/jidResolver');
const logger = require('../../utils/logger');

// ─── Pool de mensagens variadas por idioma ───────────────────────────────────
// Anti-Ban: rotação garante que nunca envie o mesmo texto consecutivamente.
// O admin pode substituir com mensagem personalizada via !inatividade config.

const DEFAULT_POOL = {
  pt: [
    '💬 Ei, {group}! Que tal uma boa conversa? 😄',
    '🤔 Oi, {group}! Alguém tem algum assunto pra compartilhar?',
    '👋 Olá, {group}! Passando pra ver como todo mundo tá. 😊',
    '🗨️ {group} no silêncio? Vamos movimentar! Alguma novidade?',
    '☀️ Boa! {group} — alguém acordado por aqui? 😄',
    '💡 {group} — tem alguma dúvida, dica ou curiosidade pra compartilhar?',
    '🎲 {group} — que tal jogar uma pergunta pra galera responder?',
  ],
  es: [
    '💬 ¡Ei, {group}! ¿Qué tal una buena charla? 😄',
    '🤔 ¡Hola, {group}! ¿Alguien tiene algo para compartir?',
    '👋 ¡Hola, {group}! Pasando a ver cómo están todos. 😊',
    '🗨️ ¿{group} en silencio? ¡Vamos a movernos! ¿Alguna novedad?',
    '☀️ ¡{group} — alguien despierto por aquí? 😄',
    '💡 {group} — ¿tienen alguna duda, tip o curiosidad para compartir?',
    '🎲 {group} — ¿qué tal lanzar una pregunta para que todos respondan?',
  ],
  en: [
    '💬 Hey, {group}! How about a good chat? 😄',
    '🤔 Hi, {group}! Anyone have something to share?',
    '👋 Hello, {group}! Just checking in. 😊',
    '🗨️ {group} gone quiet? Let\'s get it going! Any news?',
    '☀️ {group} — anyone awake in here? 😄',
    '💡 {group} — any tips, doubts or curiosities to share?',
    '🎲 {group} — how about throwing a question for everyone to answer?',
  ]
};

/**
 * Escolhe uma mensagem da pool que seja diferente da última enviada.
 * Persiste o índice usado em cfg.lastPoolIndex para evitar repetição.
 */
function pickPoolMessage(lang, groupName, cfg) {
  // Se o admin configurou mensagem personalizada, usa ela (sem rotação)
  if (cfg.message && cfg.message !== DEFAULT_POOL.pt[0]) {
    return cfg.message.replace(/\{group\}/g, groupName);
  }

  const pool = DEFAULT_POOL[lang] || DEFAULT_POOL.pt;
  const lastIndex = typeof cfg._lastPoolIndex === 'number' ? cfg._lastPoolIndex : -1;

  // Sorteia um índice diferente do último
  let idx;
  if (pool.length === 1) {
    idx = 0;
  } else {
    do {
      idx = Math.floor(Math.random() * pool.length);
    } while (idx === lastIndex);
  }

  // Persiste o índice de forma não-destrutiva
  configManager.updatePluginConfig(
    // groupJid é passado fora — salva via closure no onSchedule
    null, null, null, // placeholder: veja uso abaixo
    idx
  );

  return pool[idx].replace(/\{group\}/g, groupName);
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

module.exports = {
  name: 'inactivityalert',
  aliases: ['inactivityalert', 'inatividade', 'inactividad', 'inactivity', 'alertainativo', 'grupoinativo'],
  description: 'Envia mensagem variada de estímulo quando o grupo fica inativo por X horas',
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
      pt: 'Envia mensagem automática variada quando ninguém fala por um período configurado',
      es: 'Envía mensaje automático variado cuando nadie habla por el tiempo configurado',
      en: 'Sends a varied automatic message when nobody talks for a configured period'
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
          pt: 'Texto customizado (opcional). Use {group} para o nome do grupo. Deixe em branco para usar a rotação de mensagens variadas automática:',
          es: 'Texto personalizado (opcional). Usa {group} para el nombre del grupo. Deja vacío para usar la rotación de mensajes variados automática:',
          en: 'Custom message (optional). Use {group} for group name. Leave blank to use automatic varied message rotation:'
        },
        default: ''
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

  async onSchedule({ sock, groupJid, group, config, queueTask, lastExecuted }) {
    const cfg = config || {};
    const thresholdHours = Math.min(Math.max(parseFloat(cfg.thresholdHours) || 12, 1), 72);
    const cooldownHours = Math.min(Math.max(parseFloat(cfg.cooldownHours) || 24, 1), 168);

    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    const now = Date.now();
    const lastActivity = group?.lastActivity || 0;

    if (now - lastActivity < thresholdMs) return;

    const execKey = `inactivityalert:${groupJid}`;
    const lastSent = lastExecuted.get(execKey) || 0;
    if (now - lastSent < cooldownMs) return;

    lastExecuted.set(execKey, now);

    // Captura o índice antes de enfileirar (para fechar a closure corretamente)
    const lang = group?.lang || 'pt';
    const lastIndex = typeof cfg._lastPoolIndex === 'number' ? cfg._lastPoolIndex : -1;
    const pool = DEFAULT_POOL[lang] || DEFAULT_POOL.pt;
    let idx;
    if (pool.length === 1) {
      idx = 0;
    } else {
      do { idx = Math.floor(Math.random() * pool.length); } while (idx === lastIndex);
    }
    // Persiste o índice de forma não-destrutiva para evitar repetição no próximo ciclo
    configManager.updatePluginConfig(groupJid, 'inactivityalert', { _lastPoolIndex: idx });

    queueTask({
      run: async () => {
        try {
          // Busca nome real do grupo via metadata (não usa cache local que pode estar desatualizado)
          let groupName = 'Grupo';
          try {
            const metadata = await getGroupMetadata(sock, groupJid);
            groupName = metadata?.subject || 'Grupo';
          } catch (_) {}

          // Monta a mensagem: custom ou pool rotacionada
          let message;
          if (cfg.message && cfg.message.trim().length > 0) {
            message = cfg.message.replace(/\{group\}/g, groupName);
          } else {
            message = pool[idx].replace(/\{group\}/g, groupName);
          }

          await sendSafeMessage(sock, groupJid, { text: message });
          logger.info(
            { groupJid, poolIdx: idx, thresholdHours, idleHours: Math.round((now - lastActivity) / 3600000) },
            '[inactivityalert] Alerta de inatividade enviado'
          );
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
    const groupData = configManager.getGroup(from) || {};
    const idleH = Math.round((Date.now() - (groupData.lastActivity || 0)) / 3600000);
    const modeStr = cfg.message && cfg.message.trim().length > 0
      ? `Customizada: _"${cfg.message.slice(0, 40)}${cfg.message.length > 40 ? '…' : ''}"_`
      : `Rotação automática (${(DEFAULT_POOL[lang] || DEFAULT_POOL.pt).length} variações)`;

    return reply(
      `😴 *Alerta de Inatividade:* ${statusStr}\n` +
      `⏱️ Disparo após: *${hours}h* sem mensagens\n` +
      `🔁 Cooldown: *${cooldown}h* entre alertas\n` +
      `💬 Última mensagem: há *${idleH}h*\n` +
      `📝 Modo: ${modeStr}\n\n` +
      `💡 *Comandos:*\n• \`!inatividade on\` / \`!inatividade off\`\n• \`!inatividade config\` — abre o assistente`
    );
  }
};
