const configManager = require('./configManager');
const pluginLoader = require('./pluginLoader');
const settings = require('../config/settings');
const { sendSafeMessage, randomDelay, safeGroupLeave, isGroupLeaving } = require('../utils/antiBan');
const { getGroupAdmins } = require('../utils/jidResolver');
const { t } = require('../utils/i18n');
const logger = require('../utils/logger');
const { groupCache } = require('../utils/cache');

const LICENSE_WARN_MS = 24 * 60 * 60 * 1000; // aviso D-1
const LICENSE_GRACE_MS = 24 * 60 * 60 * 1000; // carência após o vencimento
const MAX_LEAVE_ATTEMPTS = 5;

class Scheduler {
  constructor() {
    this.sock = null;
    this.intervalId = null;
    this.isTicking = false; // Trava de reentrância contra concorrência de ticks (P0.4)
    this.lastExecutedSchedule = new Map(); // Map<execKey, timestamp> para limpeza seletiva sem perda de estado
  }

  /**
   * Inicializa o Scheduler leve com loop a cada 60 segundos
   * @param {object} sock 
   */
  init(sock) {
    this.sock = sock;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Intervalo de 60 segundos com unref() para não impedir graceful shutdown
    this.intervalId = setInterval(async () => {
      await this._tick();
    }, 60 * 1000);

    this.intervalId.unref();
    logger.info('Scheduler de tarefas agendadas iniciado com sucesso.');
  }

  /**
   * Atualiza a referência do socket Baileys em caso de reconexão
   * @param {object} sock 
   */
  updateSocket(sock) {
    this.sock = sock;
  }

  /**
   * Ciclo de vida da licença (apenas grupos com autoLeave=true, ou todos se AUTO_LEAVE_ALL_EXPIRED=true):
   *  - D-1: avisa uma única vez que a licença/teste vence em < 24h (com link de renovação)
   *  - Vencida:
   *      - Teste grátis (3 dias): encerra imediatamente ao expirar (carência 0)
   *      - Licença mensal/paga: tolerância de 24h de carência
   *  - Sai do grupo via groupLeave preservando 100% das configs (enabled=false)
   * Renovar (addDaysToGroup/setGroupExpiry) zera warned1d e leftAt, cancelando qualquer saída.
   */
  _licenseLifecycle(groupJid, group, queue) {
    if (!group.autoLeave && !settings.autoLeaveAllExpired) return;
    if (group.expiresAt === null || group.expiresAt === undefined || group.leftAt || isGroupLeaving(groupJid)) return;

    const lang = group.lang || 'pt';
    const remaining = group.expiresAt - Date.now();
    const { renewalUrl } = require('../services/joinService');
    const isTrial = Boolean(group.plan === 'teste' || group.isTrial);

    // Aviso D-1: menos de 24h restantes para expirar
    if (remaining > 0 && remaining <= LICENSE_WARN_MS && !group.warned1d && group.enabled) {
      group.warned1d = true; // marca antes de enviar: no máximo 1 aviso
      configManager.scheduleSave();
      queue.push({
        run: async () => {
          let code = null;
          try {
            code = await this.sock.groupInviteCode(groupJid);
          } catch (_) {}
          const url = renewalUrl(code, { name: group.ownerName, phone: group.ownerPhone });
          const { adminJids, mentionText } = await getGroupAdmins(this.sock, groupJid);
          const warnKey = isTrial ? 'saas.trial_warn_1d' : 'saas.license_warn_1d';
          let text = t(lang, warnKey, { url, admins: mentionText });
          if (!mentionText) {
            text = text.replace(/^[^\n]*\*(Aviso aos Administradores|Aviso a los Administradores|Notice to Administrators):\*\n+/i, '');
          }
          await sendSafeMessage(this.sock, groupJid, { text, mentions: adminJids });
        }
      });
      return;
    }

    // Saída automática:
    // Para teste grátis: saída pontual no final dos 3 dias (graceMs = 0), apenas texto limpo sem link
    // Para planos pagos: carência de 24 horas (graceMs = LICENSE_GRACE_MS)
    const graceMs = isTrial ? 0 : LICENSE_GRACE_MS;
    if (remaining <= -graceMs) {
      queue.push({
        run: async () => {
          // Revalida no momento da execução (o cliente pode ter renovado enquanto estava na fila)
          const g = configManager.getGroup(groupJid);
          if (!g || g.leftAt || g.expiresAt === null || Date.now() <= g.expiresAt + graceMs || isGroupLeaving(groupJid)) return;

          g.leaveAttempts = (g.leaveAttempts || 0) + 1;

          if (isTrial) {
            if (!g.expiryNotified) {
              g.expiryNotified = true;
              configManager.flushSync();
              try {
                const text = t(lang, 'saas.trial_leaving');
                await sendSafeMessage(this.sock, groupJid, { text });
              } catch (_) {}
            }
          } else if (g.leaveAttempts === 1) {
            let code = null;
            try {
              code = await this.sock.groupInviteCode(groupJid);
            } catch (_) {}
            const url = renewalUrl(code, { name: g.ownerName, phone: g.ownerPhone });
            const { adminJids, mentionText } = await getGroupAdmins(this.sock, groupJid);
            let text = t(lang, 'saas.license_leaving', { url, admins: mentionText });
            if (!mentionText) {
              text = text.replace(/^[^\n]*\*(Aviso aos Administradores|Aviso a los Administradores|Notice to Administrators):\*\n+/i, '');
            }

            try {
              await sendSafeMessage(this.sock, groupJid, { text, mentions: adminJids });
            } catch (_) {}
          }

          try {
            await safeGroupLeave(this.sock, groupJid, isTrial ? 'trial_expired_3d' : 'license_expired_with_grace');
          } catch (err) {
            const msg = String(err?.message || err);
            const gone = /not.?in|forbidden|item-not-found|not-authorized|403|404/i.test(msg);
            if (!gone && g.leaveAttempts < MAX_LEAVE_ATTEMPTS) {
              configManager.scheduleSave();
              throw err;
            }
            logger.warn({ err: msg, groupJid }, 'safeGroupLeave falhou/indisponível; encerrando ciclo da licença');
          }

          g.leftAt = Date.now();
          g.enabled = false;
          groupCache.del(groupJid);
          configManager.flushSync();
        }
      });
    }
  }

  async _tick() {
    if (!this.sock || this.isTicking) return;
    this.isTicking = true;

    try {
      const now = new Date();
      // Formatação no fuso horário configurado (ex: America/Sao_Paulo)
      let currentHHMM = '';
      let currentDateKey = '';
      try {
        const timeParts = now.toLocaleTimeString('pt-BR', {
          timeZone: settings.timezone || 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).split(':');
        const hh = (timeParts[0] === '24' ? '00' : timeParts[0]).padStart(2, '0');
        const mm = (timeParts[1] || '00').padStart(2, '0');
        currentHHMM = `${hh}:${mm}`;
        currentDateKey = now.toLocaleDateString('pt-BR', { timeZone: settings.timezone || 'America/Sao_Paulo' });
      } catch (_) {
        const hours = String(now.getHours() === 24 ? 0 : now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        currentHHMM = `${hours}:${minutes}`;
        currentDateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      }

      const allGroups = configManager.getAllGroups();
      const executionQueue = [];

      for (const [groupJid, group] of allGroups) {
        if (configManager.isGroupBanned(groupJid)) {
          continue; // Grupo banido: 100% ignorado pelo scheduler
        }

        // Ciclo de vida da licença: aviso D-1 e saída automática após 24h de carência
        this._licenseLifecycle(groupJid, group, executionQueue);

        if (!configManager.isGroupEnabled(groupJid)) {
          // Checagem de notificação de licença expirada
          if (group.expiresAt !== null && Date.now() > group.expiresAt && !group.expiryNotified) {
            executionQueue.push({
              type: 'license_expired',
              groupJid,
              lang: group.lang || 'pt'
            });
          }
          continue;
        }

        const lang = group.lang || 'pt';
        const style = group.style || configManager.getGroupStyle(groupJid);

        // Despacha dinamicamente para todos os plugins que possuem rotina agendada (onSchedule)
        for (const plugin of pluginLoader.onScheduleHooks) {
          const cfg = configManager.getPluginConfig(groupJid, plugin.name);
          if (!cfg || !cfg.enabled) continue;

          try {
            await plugin.onSchedule({
              sock: this.sock,
              groupJid,
              group,
              config: cfg,
              currentHHMM,
              currentDateKey,
              lang,
              style,
              queueTask: (task) => executionQueue.push(task),
              lastExecuted: this.lastExecutedSchedule
            });
          } catch (err) {
            logger.error({ err, pluginName: plugin.name }, 'Erro no hook onSchedule do plugin');
          }
        }
      }

      // ========================================================
      // Fila Escalonada Anti-Ban: Execução Sequencial com Jitter
      // Intervalo de 4000ms a 9000ms entre ações em grupos distintos
      // ========================================================
      for (const item of executionQueue) {
        if (!this.sock) break;
        await randomDelay(4000, 9000);

        try {
          if (typeof item.run === 'function') {
            await item.run();
            if (typeof item.onSuccess === 'function') {
              item.onSuccess();
            }
          } else if (item.type === 'license_expired') {
            let code = null;
            try {
              code = await this.sock.groupInviteCode(item.groupJid);
            } catch (_) {}
            const g = configManager.getGroup(item.groupJid);
            const { renewalUrl } = require('../services/joinService');
            const url = renewalUrl(code, { name: g?.ownerName, phone: g?.ownerPhone });
            const { adminJids, mentionText } = await getGroupAdmins(this.sock, item.groupJid);
            let text = t(item.lang, 'saas.license_expired', { url, admins: mentionText });
            if (!mentionText) {
              text = text.replace(/^[^\n]*\*(Aviso aos Administradores|Aviso a los Administradores|Notice to Administrators):\*\n+/i, '');
            }
            await sendSafeMessage(this.sock, item.groupJid, { text, mentions: adminJids });
            configManager.markExpiryNotified(item.groupJid, true);
          }
        } catch (err) {
          logger.warn({ err, item }, 'Falha ao executar ação escalonada no Scheduler');
        }
      }

      // Limpeza seletiva de execuções antigas (> 2 min): evita acúmulo em RAM sem apagar estado recente ou em fila (-1)
      if (this.lastExecutedSchedule.size > 500) {
        const cutoff = Date.now() - 2 * 60 * 1000;
        for (const [k, ts] of this.lastExecutedSchedule.entries()) {
          if (ts > 0 && ts < cutoff) this.lastExecutedSchedule.delete(k);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erro no loop do scheduler');
    } finally {
      this.isTicking = false;
    }
  }
}

const scheduler = new Scheduler();
module.exports = scheduler;

