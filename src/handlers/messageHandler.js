const { wizardCache } = require('../utils/cache');
const { sendSafeMessage, checkCooldown } = require('../utils/antiBan');
const { extractSender, resolveSender, checkAdminStatus, cleanJid, getBr } = require('../utils/jidResolver');
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
 * Processa todas as mensagens do batch para garantir zero perda de mensagens sob tráfego intenso.
 * @param {object} sock Instância do Baileys
 * @param {object} m Objeto do evento messages.upsert
 */
async function handleMessage(sock, m) {
  if (!m || !Array.isArray(m.messages) || m.type !== 'notify') return;

  for (const msg of m.messages) {
    try {
      await processSingleMessage(sock, msg);
    } catch (err) {
      logger.error({ err, remoteJid: msg?.key?.remoteJid }, 'Erro ao processar mensagem individual');
    }
  }
}

async function processSingleMessage(sock, msg) {
  if (!msg || !msg.message) return;

  // Ignora mensagens internas de protocolo do WhatsApp (status de entrega, exclusão remota, etc.)
  if (msg.message.protocolMessage) return;

  // Ignora mensagens enviadas pelo próprio bot ou broadcasts de status
  if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

  // Ignora mensagens recebidas antes do boot do bot (com margem de 10s)
  const msgTime = Number(msg.messageTimestamp) || 0;
  if (msgTime < (bootTimestamp - 10)) return;

  const from = msg.key.remoteJid || '';
  const rawSender = extractSender(msg);
  const sender = await resolveSender(sock, msg);
  const isGroup = from.endsWith('@g.us');
  const text = extractText(msg.message).trim();
  if (!text) return;

  // ========================================================
  // Detecção de Menção ao Bot como Prefixo Simultâneo
  // ========================================================
  const botJid = cleanJid(sock?.user?.id || '');
  const botLid = cleanJid(sock?.user?.lid || '');
  const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  const envBotNum = (settings.botNumber || '').replace(/\D/g, '');
  const botBr = getBr(botNum || envBotNum);

  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo;

  const mentionedJids = contextInfo?.mentionedJid || [];
  const isBotMentionedInContext = Array.isArray(mentionedJids) && mentionedJids.some(j => {
    const clean = cleanJid(j);
    const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const numBr = getBr(num);
    return clean === botJid || 
           clean === botLid || 
           (botNum && num === botNum) || 
           (botLidNum && num === botLidNum) || 
           (envBotNum && num === envBotNum) ||
           (botBr.ddd && numBr.ddd && botBr.ddd === numBr.ddd && botBr.last8 === numBr.last8);
  });

  let isMentionPrefix = false;
  let mentionPrefixLength = 0;
  let mentionPrefixStr = '';

  if (text.startsWith('@')) {
    const mentionMatch = text.match(/^@([a-zA-Z0-9_:.-]+)\s*/);
    if (mentionMatch) {
      const targetStr = mentionMatch[1].toLowerCase();
      const targetDigits = targetStr.replace(/:\d+$/, '').replace(/\D/g, '');
      const targetBr = getBr(targetDigits);

      const isBotTarget =
        targetStr === 'bot' ||
        targetStr === 'hermes' ||
        (botNum && targetDigits === botNum) ||
        (botLidNum && targetDigits === botLidNum) ||
        (envBotNum && targetDigits === envBotNum) ||
        (botBr.ddd && targetBr.ddd && botBr.ddd === targetBr.ddd && botBr.last8 === targetBr.last8) ||
        (isBotMentionedInContext);

      if (isBotTarget) {
        isMentionPrefix = true;
        mentionPrefixLength = mentionMatch[0].length;
        mentionPrefixStr = mentionMatch[0];
      }
    }
  }

  // ========================================================
  // 1. Trava Anti-Ban de Privado (DM)
  // ========================================================
  const directPn = msg.key?.participantPn || msg.key?.senderPn || msg?.participantPn || msg?.senderPn;
  const isSenderOwner = settings.isOwner(sender, sock) || 
                        settings.isOwner(rawSender, sock) ||
                        (directPn && settings.isOwner(directPn, sock));

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
  // Resolução Dinâmica de Prefixo e Comando (Totalmente Desacoplada)
  // ========================================================
  let effectivePrefix = null;
  let rawBody = '';

  if (isMentionPrefix) {
    effectivePrefix = mentionPrefixStr;
    rawBody = text.slice(mentionPrefixLength).trim();
    if (rawBody.startsWith(groupPrefix) || rawBody.startsWith('/') || rawBody.startsWith('!')) {
      rawBody = rawBody.slice(1).trim();
    }
  } else if (text.startsWith(groupPrefix)) {
    effectivePrefix = groupPrefix;
    rawBody = text.slice(groupPrefix.length).trim();
  } else if (!isGroup && (text.startsWith('/') || text.startsWith('!'))) {
    effectivePrefix = text[0];
    rawBody = text.slice(1).trim();
  } else if (isSenderOwner && (text.startsWith('/') || text.startsWith('!'))) {
    effectivePrefix = text[0];
    rawBody = text.slice(1).trim();
  } else if (isSenderOwner && isGroup) {
    // Permite que o Dono envie comandos mesmo sem prefixo em emergências (ex: "bot on", "desbangp")
    const firstWord = text.split(/\s+/)[0].toLowerCase();
    const probe = pluginLoader.findCommand(firstWord);
    if (probe && (probe.ownerOnly || probe.allowWhenInactive || probe.allowWhenBanned)) {
      effectivePrefix = '';
      rawBody = text.trim();
    }
  }

  const [commandTrigger, ...args] = rawBody ? rawBody.split(/\s+/) : ['', []];
  const commandArgsText = commandTrigger ? rawBody.slice(commandTrigger.length).trim() : '';
  const plugin = commandTrigger ? pluginLoader.findCommand(commandTrigger) : null;

  // ========================================================
  // Trava de Grupo Banido (Silêncio Total: bot fica 100% mudo e invisível)
  // ========================================================
  if (isGroup && configManager.isGroupBanned(from)) {
    // Se o grupo está banido, o bot fica totalmente mudo e invisível.
    // Apenas o Dono do bot pode enviar comando para desbanir o grupo:
    if (!isSenderOwner) {
      return; // Silêncio total absoluto para todos os membros e administradores
    }

    // Apenas permite passar se o plugin declarar expressamente allowWhenBanned: true
    if (!plugin || !plugin.allowWhenBanned) {
      return;
    }
  }

  // ========================================================
  // 2. Verificação de Grupo Ativo e Licença SaaS
  // ========================================================
  if (isGroup) {
    const isEnabled = configManager.isGroupEnabled(from);

    if (!isEnabled) {
      // Se for um comando com permissão declarada de execução quando inativo (ex: groupAuth !bot on)
      if (plugin && plugin.allowWhenInactive) {
        // Permite seguir para a execução do comando de ativação/gestão
      } else {
        // Licença expirada com aviso único
        if (configManager.isGroupExpired(from)) {
          const group = configManager.getGroup(from);
          if (group && !group.expiryNotified) {
            configManager.markExpiryNotified(from, true);
            await reply(translate('saas.license_expired'));
          }
        } else if (plugin) {
          // Se alguém tentar usar comandos comuns em um grupo não ativado, orienta como ativar
          const adminStatus = await checkAdminStatus(sock, from, sender);
          if (isSenderOwner || adminStatus.isAdmin) {
            await reply(translate('saas.inactive_group_hint', { prefix: groupPrefix }));
          }
        }
        return;
      }
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
  const activeSession = wizardCache.get(wizardKey) || (rawSender ? wizardCache.get(`${from}:${rawSender}`) : null);

  // Se existe sessão do Wizard ativa e o texto NÃO é um comando com prefixo ou menção
  const isExplicitCommand = effectivePrefix !== null && effectivePrefix !== '';
  if (activeSession && !isExplicitCommand) {
    const intercepted = await wizardEngine.handleInput(sock, msg, from, sender, text);
    if (intercepted) {
      return;
    }
  }

  // Se o usuário apenas mencionou o bot sem comando ("@bot" / "@hermes") e nenhum hook tratou
  if (isMentionPrefix && !rawBody && isGroup) {
    const adminStatus = await checkAdminStatus(sock, from, sender);
    if (adminStatus.isAdmin || isSenderOwner) {
      await reply(translate('common.mention_greeting', { prefix: groupPrefix }));
    }
    return;
  }

  // Se não foi identificado comando válido com prefixo ou menção, encerra o pipeline
  if (effectivePrefix === null || !rawBody || !plugin) {
    return;
  }

  // Rate-Limit Anti-Spam por usuário (cooldown de 2 segundos)
  if (checkCooldown(sender, 2000)) {
    return; // Descarta comandos duplicados silenciosamente
  }

  // ========================================================
  // 5. Verificação de Permissões (Owner, Admin, BotAdmin)
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

  // Comando exclusivo do Dono (Silêncio total para membros comuns para evitar flood)
  if (plugin.ownerOnly && !isSenderOwner) {
    return;
  }

  // Comando exclusivo de Administradores (Silêncio total para membros comuns para evitar flood)
  if (plugin.adminOnly && !isAdmin && !isSenderOwner) {
    return;
  }

  // Comando exige que o BOT seja Administrador
  if (plugin.botAdminRequired && isGroup && !isBotAdmin) {
    await reply(translate('common.bot_not_admin'));
    return;
  }

  // ========================================================
  // 6. Execução do Comando
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
