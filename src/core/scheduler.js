const configManager = require('./configManager');
const pluginLoader = require('./pluginLoader');
const settings = require('../config/settings');
const { sendSafeMessage, randomDelay } = require('../utils/antiBan');
const { t } = require('../utils/i18n');
const logger = require('../utils/logger');

class Scheduler {
  constructor() {
    this.sock = null;
    this.intervalId = null;
    this.lastExecutedSchedule = new Set();
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

  async _tick() {
    if (!this.sock) return;

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
          } else if (item.type === 'license_expired') {
            await sendSafeMessage(this.sock, item.groupJid, { text: t(item.lang, 'saas.license_expired') });
            configManager.markExpiryNotified(item.groupJid, true);
          }
        } catch (err) {
          logger.warn({ err, item }, 'Falha ao executar ação escalonada no Scheduler');
        }
      }

      // Limpeza de cache de execuções antigas do schedule (evita acúmulo em RAM)
      if (this.lastExecutedSchedule.size > 500) {
        this.lastExecutedSchedule.clear();
      }
    } catch (err) {
      logger.error({ err }, 'Erro no loop do scheduler');
    }
  }
}

const scheduler = new Scheduler();
module.exports = scheduler;
