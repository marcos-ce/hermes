const configManager = require('./configManager');
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

        // 1. Verificação do Plugin Schedule (!horarios)
        const scheduleCfg = configManager.getPluginConfig(groupJid, 'schedule');
        if (scheduleCfg && scheduleCfg.enabled) {
          const closeTime = scheduleCfg.closeTime;
          const openTime = scheduleCfg.openTime;

          // Fechar grupo no horário agendado
          if (closeTime && closeTime === currentHHMM && closeTime !== '0') {
            const execKey = `${groupJid}:close:${currentDateKey}:${currentHHMM}`;
            if (!this.lastExecutedSchedule.has(execKey)) {
              this.lastExecutedSchedule.add(execKey);
              executionQueue.push({
                type: 'schedule_close',
                groupJid,
                lang
              });
            }
          }

          // Abrir grupo no horário agendado
          if (openTime && openTime === currentHHMM && openTime !== '0') {
            const execKey = `${groupJid}:open:${currentDateKey}:${currentHHMM}`;
            if (!this.lastExecutedSchedule.has(execKey)) {
              this.lastExecutedSchedule.add(execKey);
              executionQueue.push({
                type: 'schedule_open',
                groupJid,
                lang
              });
            }
          }
        }

        // 2. Verificação do Plugin AutoMsg (!automsg)
        const automsgCfg = configManager.getPluginConfig(groupJid, 'automsg');
        if (automsgCfg && automsgCfg.enabled && automsgCfg.message) {
          const intervalMs = (automsgCfg.intervalMinutes || 180) * 60 * 1000;
          const lastSent = this.lastAutoMsgTimes.get(groupJid) || automsgCfg.lastSent || 0;

          if (lastSent === 0) {
            // Primeiro boot: inicializa o marco temporal para aguardar o intervalo completo antes de disparar
            this.lastAutoMsgTimes.set(groupJid, Date.now());
            configManager.updatePluginConfig(groupJid, 'automsg', { lastSent: Date.now() });
          } else {
            const timeSinceLast = Date.now() - lastSent;

            if (timeSinceLast >= intervalMs) {
              const lastActivity = group.lastActivity || 0;
              const onlyIfActive = automsgCfg.onlyIfActive !== false;

              // Se onlyIfActive estiver ativado, só envia se houver atividade desde o último envio
              if (!onlyIfActive || lastActivity > lastSent) {
                executionQueue.push({
                  type: 'automsg',
                  groupJid,
                  message: automsgCfg.message,
                  lang
                });
              }
            }
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
          switch (item.type) {
            case 'schedule_close':
              await this.sock.groupSettingUpdate(item.groupJid, 'announcement');
              await sendSafeMessage(this.sock, item.groupJid, { text: t(item.lang, 'schedule.closed') });
              break;

            case 'schedule_open':
              await this.sock.groupSettingUpdate(item.groupJid, 'not_announcement');
              await sendSafeMessage(this.sock, item.groupJid, { text: t(item.lang, 'schedule.opened') });
              break;

            case 'automsg':
              await sendSafeMessage(this.sock, item.groupJid, { text: item.message });
              this.lastAutoMsgTimes.set(item.groupJid, Date.now());
              configManager.updatePluginConfig(item.groupJid, 'automsg', { lastSent: Date.now() });
              break;

            case 'license_expired':
              await sendSafeMessage(this.sock, item.groupJid, { text: t(item.lang, 'saas.license_expired') });
              configManager.markExpiryNotified(item.groupJid, true);
              break;
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
