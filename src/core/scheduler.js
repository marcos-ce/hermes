const configManager = require('./configManager');
const pluginLoader = require('./pluginLoader');
const settings = require('../config/settings');
const { sendSafeMessage, randomDelay } = require('../utils/antiBan');
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
    this.lastAutoMsgTimes = new Map();
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
   *  - D-1: avisa uma única vez que a licença vence em < 24h (com link de renovação)
   *  - Vencida + 24h de carência: envia despedida e sai do grupo (configs preservadas, enabled=false)
   * Renovar (addDaysToGroup/setGroupExpiry) zera warned1d e leftAt, cancelando qualquer saída.
   */
  _licenseLifecycle(groupJid, group, queue) {
    if (!group.autoLeave && !settings.autoLeaveAllExpired) return;
    if (group.expiresAt === null || group.expiresAt === undefined || group.leftAt) return;

    const lang = group.lang || 'pt';
    const remaining = group.expiresAt - Date.now();
    const { renewalUrl } = require('../services/joinService');

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
          await sendSafeMessage(this.sock, groupJid, { text: t(lang, 'saas.license_warn_1d', { url }) });
        }
      });
      return;
    }

    if (remaining <= -LICENSE_GRACE_MS) {
      queue.push({
        run: async () => {
          // Revalida no momento da execução (o cliente pode ter renovado enquanto estava na fila)
          const g = configManager.getGroup(groupJid);
          if (!g || g.leftAt || g.expiresAt === null || Date.now() <= g.expiresAt + LICENSE_GRACE_MS) return;

          g.leaveAttempts = (g.leaveAttempts || 0) + 1;
          let code = null;
          try {
            code = await this.sock.groupInviteCode(groupJid);
          } catch (_) {}
          const url = renewalUrl(code, { name: g.ownerName, phone: g.ownerPhone });

          try {
            await sendSafeMessage(this.sock, groupJid, { text: t(lang, 'saas.license_leaving', { url }) });
          } catch (_) {}

          try {
            await this.sock.groupLeave(groupJid);
          } catch (err) {
            const msg = String(err?.message || err);
            const gone = /not.?in|forbidden|item-not-found|not-authorized|403|404/i.test(msg);
            if (!gone && g.leaveAttempts < MAX_LEAVE_ATTEMPTS) {
              configManager.scheduleSave();
              throw err; // tenta de novo no próximo tick
            }
            logger.warn({ err: msg, groupJid }, 'groupLeave falhou/indisponível; encerrando ciclo da licença');
          }

          g.leftAt = Date.now();
          g.enabled = false; // Soft Disable: configurações preservadas
          groupCache.del(groupJid);
          configManager.flushSync();
          logger.info({ groupJid }, 'Bot saiu do grupo após vencimento + carência de 24h');
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
              lastExecuted: this.lastExecutedSchedule,
              lastAutoMsgTimes: this.lastAutoMsgTimes
            });
          } catch (err) {
            logger.error({ err, pluginName: plugin.name }, 'Erro no hook onSchedule do plugin');
          }
        }
      }

      // ========================================================
      // Fila Escalonada Anti-Ban: Execução Sequencial com Jitter
      // Intervalo de 1500ms a 3500ms entre ações em grupos
      // ========================================================
      for (const item of executionQueue) {
        await randomDelay(1500, 3500);

        try {
          if (typeof item.run === 'function') {
            await item.run();
            if (typeof item.onSuccess === 'function') {
              item.onSuccess();
            }
          } else if (item.type === 'license_expired') {
            await sendSafeMessage(this.sock, item.groupJid, { text: t(item.lang, 'saas.license_expired') });
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

