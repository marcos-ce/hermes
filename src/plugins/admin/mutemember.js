const { safeDelete, safeKick } = require('../../utils/antiBan');
const { resolveTarget, checkAdminStatus, getBotIdentity } = require('../../utils/jidResolver');
const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const logger = require('../../utils/logger');

/**
 * Analisa uma string de duração para silenciamento temporário (ex: "10m", "2h", "1d", "30min", etc.)
 * Limita entre 1 minuto e 24 horas (1440 minutos).
 * @param {string} str
 * @returns {{ minutes: number, ms: number, formatted: string }|null}
 */
function parseMuteDuration(str) {
  if (!str) return null;
  const raw = String(str).toLowerCase().trim();
  const match = raw.match(/^(\d+)\s*(m|min|mins|minuto|minutos|h|hr|hrs|hora|horas|d|dia|dias|s|seg|segundos)?$/i);
  if (!match) return null;

  const val = parseInt(match[1], 10);
  if (isNaN(val) || val <= 0) return null;

  const unit = (match[2] || 'm').toLowerCase();
  let minutes = 15;

  if (['m', 'min', 'mins', 'minuto', 'minutos'].includes(unit)) {
    minutes = val;
  } else if (['h', 'hr', 'hrs', 'hora', 'horas'].includes(unit)) {
    minutes = val * 60;
  } else if (['d', 'dia', 'dias'].includes(unit)) {
    minutes = val * 1440;
  } else if (['s', 'seg', 'segundos'].includes(unit)) {
    minutes = Math.max(1, Math.round(val / 60));
  } else {
    minutes = val;
  }

  const cappedMinutes = Math.min(Math.max(minutes, 1), 1440);
  const ms = cappedMinutes * 60 * 1000;

  const hours = Math.floor(cappedMinutes / 60);
  const mins = cappedMinutes % 60;
  let formatted = '';
  if (hours > 0 && mins > 0) {
    formatted = `${hours}h ${mins}m`;
  } else if (hours > 0) {
    formatted = `${hours}h`;
  } else {
    formatted = `${mins}m`;
  }

  return { minutes: cappedMinutes, ms, formatted };
}

// Rastreador de mensagens por membro silenciado para proteção anti-abuso (janela deslizante de 3s)
const spamTracker = new Map();

setInterval(() => {
  const cutoff = Date.now() - 5000;
  for (const [k, times] of spamTracker.entries()) {
    const valid = times.filter(t => t > cutoff);
    if (valid.length === 0) spamTracker.delete(k);
    else spamTracker.set(k, valid);
  }
}, 5 * 60 * 1000).unref();

module.exports = {
  name: 'mutemember',
  aliases: ['mutemember', 'mutar', 'silenciar', 'muteuser', 'desmutar', 'unmuteuser', 'mutados', 'silenciados'],
  usage: 'mutar @user [tempo] [motivo]',
  description: 'Silencia um membro temporariamente por até 24h apagando todas as mensagens dele',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 5, // Prioridade alta: intercepta antes de filtros de flood, memória ou comandos

  configSchema: {
    title: {
      pt: 'Silenciamento Individual de Membros',
      es: 'Silenciamiento Individual de Miembros',
      en: 'Individual Member Mute'
    },
    description: {
      pt: 'Configura o tempo padrão para silenciamento temporário de membros',
      es: 'Configura el tiempo predeterminado para silenciar temporalmente miembros',
      en: 'Configures default duration for temporary member muting'
    },
    fields: [
      {
        name: 'defaultDuration',
        type: 'number',
        question: {
          pt: 'Duração padrão do silenciamento em minutos (padrão: 15, máximo: 1440):',
          es: 'Duración predeterminada del silenciamiento en minutos (por defecto: 15, máximo: 1440):',
          en: 'Default mute duration in minutes (default: 15, max: 1440):'
        },
        default: 15
      },
      {
        name: 'maxInsistence',
        type: 'number',
        question: {
          pt: 'Máximo de mensagens apagadas por insistência antes de expulsar (padrão: 8, mínimo: 3):',
          es: 'Máximo de mensajes eliminados por insistencia antes de expulsar (por defecto: 8, mínimo: 3):',
          en: 'Maximum deleted messages from insistence before kicking (default: 8, min: 3):'
        },
        default: 8
      }
    ]
  },

  /**
   * Hook passivo que apaga mensagens em tempo real de membros silenciados.
   * Executa em silêncio absoluto para evitar ban por flood ou poluição no chat.
   */
  async onMessage({ sock, msg, from, sender, reply, t }) {
    if (!from || !from.endsWith('@g.us') || !sender) return false;

    // Verifica se o participante está silenciado no grupo
    if (!configManager.isMemberMuted(from, sender)) {
      return false;
    }

    // O membro está silenciado! Apaga a mensagem na hora sem delay
    try {
      await safeDelete(sock, from, msg.key);
    } catch (err) {
      logger.error({ err, from, sender }, 'Erro ao apagar mensagem de membro silenciado');
    }

    // Contabiliza total acumulado de mensagens apagadas durante o silenciamento deste membro
    const deleteCount = configManager.incrementMutedDeleteCount(from, sender);

    // Proteção Anti-Abuso 1: detecção de flood / birra súbita (> 5 mensagens em 3 segundos)
    const now = Date.now();
    const trackerKey = `${from}:${sender}`;
    let timestamps = spamTracker.get(trackerKey) || [];
    timestamps = timestamps.filter(t => now - t < 3000);
    timestamps.push(now);
    spamTracker.set(trackerKey, timestamps);

    const cfg = configManager.getPluginConfig(from, 'mutemember') || {};
    const maxInsistence = Math.min(Math.max(parseInt(cfg.maxInsistence, 10) || 8, 3), 50);

    if (timestamps.length > 5) {
      spamTracker.delete(trackerKey);
      configManager.unmuteMember(from, sender);
      try {
        await safeKick(sock, from, sender);
        const cleanNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
        await reply(t('mutemember.abuse_banned', { user: cleanNum }), { mentions: [sender] });
      } catch (err) {
        logger.error({ err, from, sender }, 'Erro ao expulsar membro silenciado abusivo');
      }
      return true;
    }

    // Proteção Anti-Abuso 2: detecção de insistência acumulada (atingiu o teto total de mensagens apagadas)
    if (deleteCount >= maxInsistence) {
      spamTracker.delete(trackerKey);
      configManager.unmuteMember(from, sender);
      try {
        await safeKick(sock, from, sender);
        const cleanNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
        await reply(t('mutemember.insistence_banned', { user: cleanNum, count: maxInsistence }), { mentions: [sender] });
      } catch (err) {
        logger.error({ err, from, sender }, 'Erro ao expulsar membro silenciado por insistência acumulada');
      }
      return true;
    }

    // Retorna true em silêncio absoluto para interromper o pipeline de processamento
    return true;
  },

  async execute({ sock, msg, from, sender, args, text, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const cmdLower = (command || '').toLowerCase();
    const firstArg = (args[0] || '').toLowerCase();

    // 1. Wizard de Configuração
    if (firstArg === 'config') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'mutemember');
    }

    // 2. Listagem de Membros Silenciados
    const isListCmd = ['mutados', 'silenciados'].includes(cmdLower) || ['list', 'listar', 'mutados', 'silenciados'].includes(firstArg);
    if (isListCmd) {
      const muted = configManager.getAllMutedMembers(from);
      const keys = Object.keys(muted);
      if (keys.length === 0) {
        return reply(t('mutemember.list_empty'));
      }
      const now = Date.now();
      let listText = `${t('mutemember.list_title')}\n\n`;
      for (const [key, data] of Object.entries(muted)) {
        const userNum = key.replace(/@.*$/, '');
        const remainingSec = Math.max(0, Math.round((data.until - now) / 1000));
        const hours = Math.floor(remainingSec / 3600);
        const mins = Math.floor((remainingSec % 3600) / 60);
        const secs = remainingSec % 60;
        let timeStr = '';
        if (hours > 0) timeStr = `${hours}h ${mins}m`;
        else if (mins > 0) timeStr = `${mins}m ${secs}s`;
        else timeStr = `${secs}s`;

        const countStr = data.deleteCount ? ` • ${data.deleteCount} msgs apagadas` : '';
        const reasonStr = data.reason ? ` - _${data.reason}_` : '';
        listText += `• @${userNum} (restam ${timeStr}${countStr})${reasonStr}\n`;
      }
      return reply(listText.trim(), { mentions: keys });
    }

    // 3. Desmutar Membro (Unmute)
    const isUnmuteCmd = ['desmutar', 'unmute', 'unmuteuser'].includes(cmdLower) || ['del', 'remove', 'unmute', 'desmutar', 'off'].includes(firstArg);
    if (isUnmuteCmd) {
      const targetData = await resolveTarget(sock, msg, from, text);
      if (!targetData) {
        return reply(t('common.not_found_target'));
      }
      const targetPhone = targetData.phoneJid;
      const isMuted = configManager.isMemberMuted(from, targetPhone);
      if (!isMuted) {
        return reply(t('mutemember.not_muted', { user: targetData.displayNum }), { mentions: [targetData.groupJid] });
      }
      configManager.unmuteMember(from, targetPhone);
      return reply(t('mutemember.unmuted', { user: targetData.displayNum }), { mentions: [targetData.groupJid] });
    }

    // 4. Silenciar Membro (Mute)
    const targetData = await resolveTarget(sock, msg, from, text);
    if (!targetData) {
      return reply(t('common.not_found_target'));
    }

    const targetPhone = targetData.phoneJid;
    const targetGroup = targetData.groupJid;
    const targetNum = targetData.displayNum;

    // Proteção: Não silenciar o próprio bot
    const { botJid, botLid, botNum } = getBotIdentity(sock);

    if (targetGroup === botJid || targetGroup === botLid || (botNum && targetNum === botNum)) {
      return reply(t('mutemember.cannot_mute_bot'));
    }

    // Proteção: Não silenciar o Dono
    if (settings.isOwner(targetPhone, sock) || settings.isOwner(targetGroup, sock)) {
      return reply(t('mutemember.cannot_mute_owner'));
    }

    // Proteção: Não silenciar Administrador
    const adminCheck = await checkAdminStatus(sock, from, targetPhone);
    if (adminCheck.isAdmin) {
      return reply(t('mutemember.cannot_mute_admin'));
    }

    // Extrai duração e motivo a partir dos tokens
    const tokens = [...args];
    const filteredTokens = [];
    let targetRemoved = false;
    for (const tok of tokens) {
      const cleanTok = tok.replace(/[@+]/g, '').replace(/\D/g, '');
      if (!targetRemoved && (tok.startsWith('@') || (cleanTok && targetNum && (cleanTok === targetNum || targetNum.includes(cleanTok))))) {
        targetRemoved = true;
        continue;
      }
      filteredTokens.push(tok);
    }

    let parsedDuration = null;
    let reasonStartIndex = 0;

    if (filteredTokens.length >= 2) {
      const twoToken = `${filteredTokens[0]} ${filteredTokens[1]}`;
      const d2 = parseMuteDuration(twoToken);
      if (d2) {
        parsedDuration = d2;
        reasonStartIndex = 2;
      }
    }

    if (!parsedDuration && filteredTokens.length >= 1) {
      const d1 = parseMuteDuration(filteredTokens[0]);
      if (d1) {
        parsedDuration = d1;
        reasonStartIndex = 1;
      }
    }

    if (!parsedDuration) {
      const cfg = configManager.getPluginConfig(from, 'mutemember') || {};
      const defMin = Math.min(Math.max(parseInt(cfg.defaultDuration, 10) || 15, 1), 1440);
      parsedDuration = {
        minutes: defMin,
        ms: defMin * 60 * 1000,
        formatted: defMin >= 60 ? `${Math.floor(defMin / 60)}h${defMin % 60 > 0 ? ` ${defMin % 60}m` : ''}` : `${defMin}m`
      };
      reasonStartIndex = 0;
    }

    const reason = filteredTokens.slice(reasonStartIndex).join(' ').trim();
    const until = Date.now() + parsedDuration.ms;

    configManager.muteMember(from, targetPhone, until, reason, sender);

    const adminNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
    const adminText = `\n👮 *Por:* @${adminNum}`;
    const reasonText = reason ? `\n📝 *Motivo:* ${reason}` : '';

    const responseMsg = t('mutemember.muted', {
      user: targetNum,
      duration: parsedDuration.formatted,
      admin: adminText,
      reason: reasonText
    });

    return reply(responseMsg, { mentions: [targetGroup, sender] });
  }
};
