const { wizardCache } = require('../utils/cache');
const { sendSafeMessage, checkCooldown } = require('../utils/antiBan');
const { cleanJid, extractSender, checkAdminStatus } = require('../utils/jidResolver');
const { t } = require('../utils/i18n');
const settings = require('../config/settings');
const configManager = require('../core/configManager');
const pluginLoader = require('../core/pluginLoader');
const wizardEngine = require('../core/wizardEngine');
const logger = require('../utils/logger');

const bootTimestamp = Math.floor(Date.now() / 1000);

/**
 * Desencapsula mensagens normais, efêmeras e viewOnce
 * @param {object} message 
 * @returns {string}
 */
function extractText(message) {
  if (!message) return '';
  const real = message.ephemeralMessage?.message ||
               message.viewOnceMessage?.message ||
               message.viewOnceMessageV2?.message ||
               message.documentWithCaptionMessage?.message ||
               message;

  return (
    real.conversation ||
    real.extendedTextMessage?.text ||
    real.imageMessage?.caption ||
    real.videoMessage?.caption ||
    real.documentMessage?.caption ||
    ''
  );
}

/**
 * Pipeline principal de tratamento de mensagens
 * @param {object} sock Instância do Baileys
 * @param {object} m Objeto do evento messages.upsert
 */
async function handleMessage(sock, m) {
  if (!m || !m.messages || m.type !== 'notify') return;

  const msg = m.messages[0];
  if (!msg || !msg.message) return;

  // Ignora mensagens enviadas pelo próprio bot ou broadcasts de status
  if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

  // Ignora mensagens recebidas antes do boot do bot (com margem de 10s)
  const msgTime = Number(msg.messageTimestamp) || 0;
  if (msgTime < (bootTimestamp - 10)) return;

  const from = msg.key.remoteJid || '';
  const sender = extractSender(msg);
  const isGroup = from.endsWith('@g.us');
  const text = extractText(msg.message).trim();

  // ========================================================
  // 1. Trava Anti-Ban de Privado (DM)
  // ========================================================
  const isSenderOwner = settings.isOwner(sender, sock);

  if (!isGroup) {
    // O Dono sempre tem permissão no privado
    if (!isSenderOwner) {
      // Se allowPrivateCmds estiver desligado (recomendado Anti-Ban), silêncio absoluto
      if (!configManager.isPrivateEnabled()) {
        return;
      }
    }
  }

  // Define prefixo e idioma do contexto
  const groupPrefix = isGroup ? configManager.getGroupPrefix(from) : settings.defaultPrefix;
  const groupLang = isGroup ? configManager.getGroupLang(from) : settings.defaultLang;

  // Helpers injetados
  const reply = async (content, options = {}) => {
    return await sendSafeMessage(sock, from, content, { quoted: msg, ...options });
  };
  const translate = (key, vars = {}) => t(groupLang, key, vars);

  // ========================================================
  // 2. Verificação de Grupo Ativo e Licença SaaS
  // ========================================================
  if (isGroup) {
    const isEnabled = configManager.isGroupEnabled(from);
    const cmdBody = text.slice(groupPrefix.length).trim().toLowerCase();
    const isActivatingCmd = text.startsWith(groupPrefix) && (
      cmdBody.startsWith('bot') ||
      cmdBody.startsWith('ativar') ||
      cmdBody.startsWith('activar') ||
      cmdBody.startsWith('activate') ||
      cmdBody.startsWith('licenca') ||
      cmdBody.startsWith('licencia')
    );

    if (!isEnabled && !isActivatingCmd) {
      // Licença expirada com aviso único
      if (configManager.isGroupExpired(from)) {
        const group = configManager.getGroup(from);
        if (group && !group.expiryNotified) {
          configManager.markExpiryNotified(from, true);
          await reply(translate('saas.license_expired'));
        }
      }
      return;
    }

    // Registra atividade recente do grupo para o AutoMsg
    configManager.touchGroupActivity(from);
  }

  // ========================================================
  // 3. Hooks Passivos de Proteção (onMessage)
  // ========================================================
  if (isGroup) {
    for (const hookPlugin of pluginLoader.onMessageHooks) {
      try {
        const handled = await hookPlugin.onMessage({
          sock,
          msg,
          from,
          sender,
          text,
          reply,
          t: translate,
          lang: groupLang
        });

        // Se o hook aplicou punição (ex: apagou link ou flood), interrompe o pipeline
        if (handled === true) {
          return;
        }
      } catch (err) {
        logger.error({ err, plugin: hookPlugin.name }, 'Erro no hook onMessage');
      }
    }
  }

  // ========================================================
  // 4. Interceptador do Wizard Exclusivo do Admin (${from}:${sender})
  // ========================================================
  const wizardKey = `${from}:${sender}`;
  const activeSession = wizardCache.get(wizardKey);

  // Se existe sessão do Wizard ativa e o texto NÃO é um comando com prefixo
  if (activeSession && (!text.startsWith(groupPrefix) || text.length <= 3)) {
    const intercepted = await wizardEngine.handleInput(sock, msg, from, sender, text);
    if (intercepted) {
      return;
    }
  }

  // ========================================================
  // 5. Checagem de Prefixo e Resolução de Comandos
  // ========================================================
  if (!text.startsWith(groupPrefix)) {
    return;
  }

  // Rate-Limit Anti-Spam por usuário (cooldown de 2 segundos)
  if (checkCooldown(sender, 2000)) {
    return; // Descarta comandos duplicados silenciosamente
  }

  const rawBody = text.slice(groupPrefix.length).trim();
  if (!rawBody) return;

  const [commandTrigger, ...args] = rawBody.split(/\s+/);
  const commandArgsText = rawBody.slice(commandTrigger.length).trim();

  const plugin = pluginLoader.findCommand(commandTrigger);
  if (!plugin) {
    return;
  }

  // ========================================================
  // 6. Verificação de Permissões (Owner, Admin, BotAdmin)
  // ========================================================
  let isAdmin = false;
  let isSuperAdmin = false;
  let isBotAdmin = false;

  if (isGroup) {
    const adminStatus = await checkAdminStatus(sock, from, sender);
    isAdmin = adminStatus.isAdmin;
    isSuperAdmin = adminStatus.isSuperAdmin;
    isBotAdmin = adminStatus.isBotAdmin;
  } else {
    isAdmin = isSenderOwner;
    isSuperAdmin = isSenderOwner;
  }

  // Comando exclusivo do Dono
  if (plugin.ownerOnly && !isSenderOwner) {
    await reply(translate('common.no_permission_owner'));
    return;
  }

  // Comando exclusivo de Administradores
  if (plugin.adminOnly && !isAdmin && !isSenderOwner) {
    await reply(translate('common.no_permission_admin'));
    return;
  }

  // Comando exige que o BOT seja Administrador
  if (plugin.botAdminRequired && isGroup && !isBotAdmin) {
    await reply(translate('common.bot_not_admin'));
    return;
  }

  // ========================================================
  // 7. Execução do Comando
  // ========================================================
  try {
    await plugin.execute({
      sock,
      msg,
      from,
      sender,
      args,
      text: commandArgsText,
      command: commandTrigger.toLowerCase(),
      reply,
      t: translate,
      lang: groupLang,
      prefix: groupPrefix,
      isOwner: isSenderOwner,
      isAdmin,
      isSuperAdmin,
      isBotAdmin,
      isGroup
    });
  } catch (err) {
    logger.error({ err, command: commandTrigger, from, sender }, 'Erro ao executar comando');
    await reply(translate('common.error'));
  }
}

module.exports = {
  handleMessage
};
