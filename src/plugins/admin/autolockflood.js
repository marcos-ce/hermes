'use strict';

const configManager  = require('../../core/configManager');
const wizardEngine   = require('../../core/wizardEngine');
const { floodCache } = require('../../utils/cache');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t }          = require('../../utils/i18n');
const logger         = require('../../utils/logger');

/**
 * autolockflood — Fecha o grupo automaticamente quando o volume de mensagens
 * do grupo inteiro supera um limite configurável em um janela de tempo.
 *
 * Difere do antiflood (que pune o *usuário* individual): este monitora a
 * *taxa coletiva* do grupo — útil para eventos, sorteios ou quando vários
 * membros disparam ao mesmo tempo.
 *
 * Fluxo:
 *   1. Conta mensagens de membros (não-admin) na janela de windowSeconds
 *   2. Se >= groupMsgLimit → fecha o grupo (groupSettingUpdate 'announcement')
 *   3. Envia aviso explicando o motivo e o tempo de reabertura
 *   4. Agenda reabertura após lockMinutes via timeout (zero scheduler externo)
 *   5. Protege contra re-lock durante o período de cooldown
 */

/** Chave de cooldown por grupo (evita fechar múltiplas vezes seguidas) */
const LOCK_COOLDOWN_KEY = (jid) => `autolockflood:locked:${jid}`;
/** Chave do contador de msgs do grupo na janela */
const GROUP_COUNT_KEY   = (jid) => `autolockflood:count:${jid}`;

module.exports = {
  name: 'autolockflood',
  aliases: [
    'autolockflood', 'autofechamento', 'autolock', 'lockflood',
    'fechamento_automatico', 'autoclose', 'grouplock'
  ],
  description: 'Fecha o grupo automaticamente quando o volume coletivo de mensagens excede o limite',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 8, // executa antes do antiflood individual (10)

  configSchema: {
    title: {
      pt: 'Fechamento Automático por Excesso de Movimento',
      es: 'Cierre Automático por Exceso de Actividad',
      en: 'Auto-Lock on Group Flood'
    },
    description: {
      pt: 'Fecha o grupo automaticamente quando muitas pessoas falam ao mesmo tempo',
      es: 'Cierra el grupo automáticamente cuando demasiadas personas hablan a la vez',
      en: 'Auto-closes the group when too many members send messages simultaneously'
    },
    fields: [
      {
        name: 'groupMsgLimit',
        type: 'number',
        question: {
          pt: 'Quantas mensagens (de membros diferentes) na janela de tempo ativam o fechamento? (Padrão: 20):',
          es: '¿Cuántos mensajes (de distintos miembros) en la ventana de tiempo activan el cierre? (Predeterminado: 20):',
          en: 'How many messages (from different members) in the time window trigger auto-lock? (Default: 20):'
        },
        default: 20,
        min: 5,
        max: 200
      },
      {
        name: 'windowSeconds',
        type: 'number',
        question: {
          pt: 'Janela de tempo observada em segundos? (Padrão: 10):',
          es: '¿Ventana de tiempo observada en segundos? (Predeterminado: 10):',
          en: 'Observation time window in seconds? (Default: 10):'
        },
        default: 10,
        min: 5,
        max: 60
      },
      {
        name: 'lockMinutes',
        type: 'number',
        question: {
          pt: 'Por quantos minutos o grupo ficará fechado? (Padrão: 5 | 0 = não reabre automaticamente):',
          es: '¿Por cuántos minutos permanecerá cerrado el grupo? (Predeterminado: 5 | 0 = no reabre):',
          en: 'How many minutes will the group stay locked? (Default: 5 | 0 = no auto-reopen):'
        },
        default: 5,
        min: 0,
        max: 1440
      },
      {
        name: 'ignoreAdmins',
        type: 'boolean',
        question: {
          pt: 'Ignorar mensagens de admins na contagem?\n[1] Sim — só conta membros (recomendado)\n[2] Não — conta todos',
          es: '¿Ignorar mensajes de admins en el conteo?\n[1] Sí — solo miembros (recomendado)\n[2] No — contar todos',
          en: 'Ignore admin messages in the count?\n[1] Yes — members only (recommended)\n[2] No — count everyone'
        },
        choices: [
          { value: true,  label: { pt: 'Sim — só membros', es: 'Sí — solo miembros', en: 'Yes — members only' } },
          { value: false, label: { pt: 'Não — todos',      es: 'No — todos',          en: 'No — everyone'    } }
        ],
        default: true
      }
    ]
  },

  // ─── Comando direto ────────────────────────────────────────────────────────
  async execute({ sock, msg, from, sender, args, reply, lang }) {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
      configManager.setPluginEnabled(from, 'autolockflood', true);
      return reply(t(lang, 'plugin.enabled', { plugin: 'autolockflood' }));
    }

    if (sub === 'off') {
      configManager.setPluginEnabled(from, 'autolockflood', false);
      return reply(t(lang, 'plugin.disabled', { plugin: 'autolockflood' }));
    }

    if (sub === 'config') {
      return wizardEngine.startWizard({ sock, msg, from, sender, lang, pluginName: 'autolockflood' });
    }

    if (sub === 'status') {
      const enabled = configManager.isPluginEnabled(from, 'autolockflood');
      const cfg     = configManager.getPluginConfig(from, 'autolockflood') || {};
      const st      = enabled ? '✅ ativo' : '❌ inativo';
      const limit   = cfg.groupMsgLimit ?? 20;
      const window  = cfg.windowSeconds  ?? 10;
      const lock    = cfg.lockMinutes    ?? 5;
      const admins  = cfg.ignoreAdmins !== false ? '✅ ignorados' : '❌ contados';
      return reply(
        `🔒 *Auto-Lock Flood* — ${st}\n` +
        `• Gatilho: ${limit} msgs em ${window}s\n` +
        `• Duração do lock: ${lock === 0 ? 'manual' : lock + ' min'}\n` +
        `• Admins: ${admins}`
      );
    }

    // Sem subcomando → abre wizard
    return wizardEngine.startWizard({ sock, msg, from, sender, lang, pluginName: 'autolockflood' });
  },

  // ─── Hook passivo: monitora volume coletivo do grupo ──────────────────────
  async onMessage({ sock, msg, from, sender, text, lang }) {
    if (!configManager.isPluginEnabled(from, 'autolockflood')) return false;

    // Se o grupo já está em cooldown de lock, ignora
    if (floodCache.get(LOCK_COOLDOWN_KEY(from))) return false;

    const cfg          = configManager.getPluginConfig(from, 'autolockflood') || {};
    const groupMsgLimit = cfg.groupMsgLimit ?? 20;
    const windowSeconds = cfg.windowSeconds  ?? 10;
    const lockMinutes   = cfg.lockMinutes    ?? 5;
    const ignoreAdmins  = cfg.ignoreAdmins  !== false;

    // Opcionalmente ignora admins (verificação leve via cache de metadados)
    if (ignoreAdmins) {
      try {
        const { checkAdminStatus } = require('../../utils/jidResolver');
        const adminCheck = await checkAdminStatus(sock, from, sender);
        if (adminCheck.isAdmin) return false;
      } catch (_) {}
    }

    // Incrementa contador da janela (TTL = windowSeconds)
    const countKey = GROUP_COUNT_KEY(from);
    const current  = floodCache.get(countKey) || 0;
    const next     = current + 1;

    if (current === 0) {
      // Primeira mensagem da janela — inicializa com TTL fixo
      floodCache.set(countKey, 1, windowSeconds);
    } else {
      // Incrementa sem renovar o TTL (janela não-renovável, igual ao antiflood individual)
      floodCache.set(countKey, next, windowSeconds);
    }

    if (next < groupMsgLimit) return false;

    // ── Limite atingido → fechar o grupo ─────────────────────────────────────

    // Marca cooldown para evitar re-lock (TTL = lockMinutes ou 5 min mínimo)
    const cooldownSecs = Math.max((lockMinutes || 5) * 60, 300);
    floodCache.set(LOCK_COOLDOWN_KEY(from), true, cooldownSecs);
    floodCache.del(countKey); // zera o contador

    logger.info({ from, count: next, limit: groupMsgLimit }, '[autolockflood] Limite de mensagens do grupo atingido — fechando');

    try {
      await sock.groupSettingUpdate(from, 'announcement');
    } catch (err) {
      logger.error({ err, from }, '[autolockflood] Falha ao fechar o grupo');
      return false;
    }

    // Mensagem de aviso (anti-ban: sendSafeMessage com composing)
    const lockMsg = lockMinutes > 0
      ? t(lang, 'autolockflood.locked_timed', {
          limit: String(groupMsgLimit),
          window: String(windowSeconds),
          minutes: String(lockMinutes),
          fallback: `🔒 Grupo fechado automaticamente — ${groupMsgLimit} mensagens em ${windowSeconds}s. Reabrindo em ${lockMinutes} minuto(s).`
        })
      : t(lang, 'autolockflood.locked_manual', {
          limit: String(groupMsgLimit),
          window: String(windowSeconds),
          fallback: `🔒 Grupo fechado automaticamente — ${groupMsgLimit} mensagens em ${windowSeconds}s. Um admin deverá reabrir manualmente.`
        });

    await sendSafeMessage(sock, from, { text: lockMsg });

    // Reabertura automática após lockMinutes (se > 0)
    if (lockMinutes > 0) {
      const reopenMs = lockMinutes * 60 * 1000;
      setTimeout(async () => {
        try {
          // Verifica se o grupo ainda está ativo antes de reabrir
          if (!configManager.isGroupEnabled(from)) return;
          await sock.groupSettingUpdate(from, 'not_announcement');
          await sendSafeMessage(sock, from, {
            text: t(lang, 'autolockflood.reopened', {
              fallback: '🔓 Grupo reaberto automaticamente. Mantenham o respeito! 🙏'
            })
          });
          logger.info({ from }, '[autolockflood] Grupo reaberto automaticamente');
        } catch (err) {
          logger.warn({ err, from }, '[autolockflood] Falha ao reabrir o grupo automaticamente');
        }
      }, reopenMs).unref(); // .unref() → não impede o processo de encerrar normalmente
    }

    return true; // interrompe o pipeline (msg que causou o lock já foi contada)
  }
};
