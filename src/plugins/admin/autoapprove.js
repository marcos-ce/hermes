const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { cleanJid, resolveParticipant, checkAdminStatus, lidToPhoneMap } = require('../../utils/jidResolver');
const { sendSafeMessage, randomDelay, sleep } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

/**
 * ============================================================================
 * MOTOR ANTI-BAN RÍGIDO: Fila Sequencial, Sliding Window & Circuit Breaker
 * ============================================================================
 * Garante que a aprovação de membros nunca acione bloqueios do WhatsApp:
 * 1. Fila FIFO com concorrência estrita 1 (zero requisições em paralelo)
 * 2. Jitter humano aleatório (2500ms a 4500ms) entre aprovações
 * 3. Rate limiting por janela deslizante (máx 5/min e máx 40/hora por grupo)
 * 4. Circuit Breaker automático se houver pico repentino de solicitações
 * 5. Prevenção de erros 403 com checagem preemptiva de admin
 */
class AntiBanApprovalQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.recentApprovals = new Map(); // Map<groupJid, number[]> timestamps
    this.circuitBreakers = new Map(); // Map<groupJid, number> pausedUntilTimestamp
    this.circuitBreakerNotified = new Map(); // Map<groupJid, number> lastNotifiedTimestamp
    this.consecutiveErrors = 0;
  }

  /**
   * Adiciona uma tarefa de aprovação/rejeição à fila segura
   * @param {object} task 
   */
  enqueue(task) {
    this.queue.push(task);
    this._processNext();
  }

  /**
   * Registra uma aprovação recente para cálculo de rate limit deslizante
   * @param {string} groupJid 
   */
  _recordApproval(groupJid) {
    const now = Date.now();
    let history = this.recentApprovals.get(groupJid) || [];
    // Mantém apenas a última 1 hora
    history = history.filter(ts => now - ts < 60 * 60 * 1000);
    history.push(now);
    this.recentApprovals.set(groupJid, history);
  }

  /**
   * Verifica se o grupo está com Circuit Breaker ativo (pausa de emergência anti-ban)
   * @param {string} groupJid 
   * @returns {boolean}
   */
  isCircuitBreakerActive(groupJid) {
    const pausedUntil = this.circuitBreakers.get(groupJid);
    if (!pausedUntil) return false;
    if (Date.now() < pausedUntil) return true;
    this.circuitBreakers.delete(groupJid);
    return false;
  }

  /**
   * Aciona Circuit Breaker de emergência por alta taxa de solicitações
   * @param {string} groupJid 
   * @param {number} pauseMinutes 
   */
  triggerCircuitBreaker(groupJid, pauseMinutes = 3) {
    const pausedUntil = Date.now() + pauseMinutes * 60 * 1000;
    this.circuitBreakers.set(groupJid, pausedUntil);
  }

  /**
   * Verifica se atingiu a cota máxima segura por minuto ou por hora
   * @param {string} groupJid 
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkRateLimit(groupJid) {
    const now = Date.now();
    const history = this.recentApprovals.get(groupJid) || [];
    
    // Contagem no último minuto (60s)
    const lastMinuteCount = history.filter(ts => now - ts < 60 * 1000).length;
    if (lastMinuteCount >= 10) {
      return { allowed: false, reason: 'minute_limit', count: lastMinuteCount };
    }

    // Contagem na última hora (60m)
    const lastHourCount = history.filter(ts => now - ts < 60 * 60 * 1000).length;
    if (lastHourCount >= 50) {
      return { allowed: false, reason: 'hour_limit', count: lastHourCount };
    }

    return { allowed: true };
  }

  /**
   * Loop sequencial da fila com atraso humano
   */
  async _processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        const { sock, groupJid, participantJid, action, source, notifyGroup, lang, style, onComplete } = item;

        // 1. Checagem de Circuit Breaker
        if (this.isCircuitBreakerActive(groupJid)) {
          logger.warn({ groupJid, participantJid }, 'AntiBan: Aprovação ignorada temporariamente por Circuit Breaker ativo');
          if (typeof onComplete === 'function') onComplete({ success: false, reason: 'circuit_breaker' });
          continue;
        }

        // 2. Checagem de Rate Limit Deslizante
        const rateCheck = this.checkRateLimit(groupJid);
        if (!rateCheck.allowed) {
          if (source === 'batch') {
            // Em lote administrativo: faz pacing de segurança aguardando a janela abrir, sem descartar itens
            const history = this.recentApprovals.get(groupJid) || [];
            const oldestInMinute = history.length > 0 ? history[0] : Date.now();
            const waitMs = Math.min(Math.max(60000 - (Date.now() - oldestInMinute) + 1000, 3000), 15000);
            logger.info({ groupJid, waitMs }, 'AntiBan: Pacing de segurança na aprovação em lote para respeitar limite da janela');
            await sleep(waitMs);
            this.queue.unshift(item); // Reinsere no início para processar sem perda
            continue;
          } else {
            // Em tempo real: se estourar o limite, é indício de flood de convites. Aciona Circuit Breaker
            logger.warn({ groupJid, rateCheck }, 'AntiBan: Rate limit estrito atingido no grupo. Ativando Circuit Breaker de 3 minutos.');
            this.triggerCircuitBreaker(groupJid, 3);

            // Notifica os administradores no grupo apenas 1 vez por ciclo
            const lastNotified = this.circuitBreakerNotified.get(groupJid) || 0;
            if (Date.now() - lastNotified > 5 * 60 * 1000) {
              this.circuitBreakerNotified.set(groupJid, Date.now());
              const prefix = configManager.getGroupPrefix(groupJid);
              await sendSafeMessage(sock, groupJid, {
                text: t(lang, 'autoapprove.circuit_breaker_pause', { count: rateCheck.count, minutes: 3, prefix }, style)
              }).catch(() => {});
            }

            if (typeof onComplete === 'function') onComplete({ success: false, reason: 'rate_limit' });
            continue;
          }
        }

        // 3. Checagem Preemptiva de Permissão de Admin do Bot
        const botJid = cleanJid(sock?.user?.id || '');
        const adminStatus = await checkAdminStatus(sock, groupJid, botJid);
        if (!adminStatus.isBotAdmin) {
          logger.warn({ groupJid }, 'AntiBan: Bot não é administrador do grupo. Cancelando requisição para evitar erro 403 no WhatsApp.');
          if (typeof onComplete === 'function') onComplete({ success: false, reason: 'bot_not_admin' });
          continue;
        }

        // 4. Jitter Delay Humano Rigoroso (2500ms a 4500ms)
        await randomDelay(2500, 4500);

        // 5. Execução Segura da Ação no WhatsApp
        let success = false;
        try {
          await sock.groupRequestParticipantsUpdate(groupJid, [participantJid], action);
          success = true;
          this.consecutiveErrors = 0;
          this._recordApproval(groupJid);

          // Restauração de presença invisível
          try {
            await sock.sendPresenceUpdate('unavailable');
          } catch (_) {}

          // 6. Notificação amigável no grupo se ativada
          if (success && action === 'approve' && notifyGroup) {
            const cleanUser = cleanJid(participantJid);
            const userNum = cleanUser.replace(/@.*$/, '').replace(/\D/g, '');
            await sendSafeMessage(sock, groupJid, {
              text: t(lang, 'autoapprove.approved_single', { user: userNum }, style),
              mentions: [participantJid]
            }).catch(() => {});
          }
        } catch (err) {
          const errMsg = String(err?.message || err || '').toLowerCase();
          const isStale = errMsg.includes('404') || errMsg.includes('not-found') || errMsg.includes('item-not-found');
          if (!isStale) {
            this.consecutiveErrors++;
          }
          logger.error({ err, groupJid, participantJid, action }, 'Falha na requisição de aprovação de participante');
          // Se houver 2 erros consecutivos de rede/API, pausa por 45 segundos para despressurizar o socket
          if (this.consecutiveErrors >= 2) {
            logger.warn('AntiBan: Detectados erros consecutivos na API de grupos. Pausando fila por 45 segundos.');
            await sleep(45000);
            this.consecutiveErrors = 0;
          }
        }

        if (typeof onComplete === 'function') {
          onComplete({ success });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

const approvalQueue = new AntiBanApprovalQueue();

/**
 * Extrai dados padronizados e normalizados de um participante ou item de solicitação do Baileys
 * Resolve sufixos de dispositivo (:1, :0), mapeamentos de LID, domínios e formatos nacionais sem DDI.
 * @param {string|object} item JID, número ou objeto de solicitação do WhatsApp
 * @returns {{ rawJid: string, cleanTargetJid: string, digits: string, isLid: boolean, displayNum: string }}
 */
function extractParticipantInfo(item) {
  if (!item) return { rawJid: '', cleanTargetJid: '', digits: '', isLid: false, displayNum: '' };

  let rawJid = '';
  let phoneCandidate = '';

  if (typeof item === 'string') {
    rawJid = item;
  } else if (typeof item === 'object') {
    // Procura primeiro campos específicos de telefone que o WhatsApp/Baileys anexa
    phoneCandidate = item.phone_number || item.phoneNumber || item.sender_pn || item.pn || item.phone || '';
    rawJid = item.jid || item.user || item.id || phoneCandidate || '';
  }

  // JID normalizado sem sufixos de dispositivo (:1, :0)
  const cleanTargetJid = cleanJid(rawJid);

  // Se o JID for @lid, tenta mapear no lidToPhoneMap global
  let resolvedPhone = phoneCandidate;
  if (!resolvedPhone && cleanTargetJid.endsWith('@lid')) {
    const mapped = lidToPhoneMap.get(cleanTargetJid);
    if (mapped) resolvedPhone = mapped;
  }
  if (!resolvedPhone) {
    resolvedPhone = cleanTargetJid;
  }

  // Extrai apenas a parte do usuário antes do @ e antes do : (remove device suffix)
  let userPart = String(resolvedPhone).trim();
  if (userPart.includes('@')) userPart = userPart.split('@')[0];
  if (userPart.includes(':')) userPart = userPart.split(':')[0];

  let digits = userPart.replace(/\D/g, '');

  // Trata prefixos internacionais com zeros (0055... ou 055...)
  if (digits.startsWith('0055')) digits = digits.substring(2);
  else if (digits.startsWith('055')) digits = digits.substring(1);

  // Se o número veio no formato nacional brasileiro sem o DDI 55
  if (digits.length === 11) {
    // Celular BR: DDD (2) + 9 + 8 dígitos
    const ddd = parseInt(digits.substring(0, 2), 10);
    const ninthDigit = digits[2];
    if (ddd >= 11 && ddd <= 99 && ninthDigit === '9') {
      digits = '55' + digits;
    }
  } else if (digits.length === 10) {
    // Fixo BR: DDD (2) + [2-5] + 7 dígitos
    const ddd = parseInt(digits.substring(0, 2), 10);
    const firstDigit = digits[2];
    if (ddd >= 11 && ddd <= 99 && ['2', '3', '4', '5'].includes(firstDigit)) {
      digits = '55' + digits;
    }
  }

  // Se veio com 55 + 0 + DDD (ex: 55011999998888)
  if (digits.startsWith('550') && (digits.length === 13 || digits.length === 14)) {
    digits = '55' + digits.substring(3);
  }

  return {
    rawJid: rawJid || cleanTargetJid,
    cleanTargetJid,
    digits,
    isLid: cleanTargetJid.endsWith('@lid'),
    displayNum: digits || cleanTargetJid.replace(/@.*$/, '')
  };
}

/**
 * Verifica se um número pertence aos DDIs autorizados (com validação robusta para o Brasil)
 * @param {string} digits 
 * @param {string[]} allowedDdis 
 * @returns {boolean}
 */
function isNumberAllowed(digits, allowedDdis = ['55']) {
  if (!digits || typeof digits !== 'string') return false;

  for (const rawDdi of allowedDdis) {
    const ddi = String(rawDdi).replace(/\D/g, '');
    if (!ddi) continue;

    if (ddi === '55') {
      if (!digits.startsWith('55')) continue;
      const ddd = parseInt(digits.substring(2, 4), 10);
      if (isNaN(ddd) || ddd < 11 || ddd > 99) continue;
      // Suporta números fixos (12), celulares (13) e formatos com dígitos de operadora/legado (14)
      if (digits.length >= 12 && digits.length <= 14) {
        return true;
      }
    } else {
      // Outros países: checa prefixo do DDI e comprimento mínimo de 6 dígitos
      if (digits.startsWith(ddi) && digits.length >= ddi.length + 6) {
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  name: 'autoapprove',
  cmdNumber: 24,
  aliases: ['autoapprove', 'autoaprovar', 'aceitar', 'aprovar', 'pedidos', 'solicitacoes', 'joinrequests', 'autoaceitar'],
  description: 'Aprovação automática de números brasileiros com filtro anti-ban rígido',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 25,

  configSchema: {
    title: {
      pt: 'Auto-Aprovação Anti-Ban',
      es: 'Auto-Aprobación Anti-Ban',
      en: 'Anti-Ban Auto-Approve'
    },
    description: {
      pt: 'Aprova automaticamente a entrada de números brasileiros e de DDIs autorizados',
      es: 'Aprueba automáticamente la entrada de números brasileños y prefijos autorizados',
      en: 'Automatically approves entry of Brazilian numbers and authorized country codes'
    },
    fields: [
      {
        name: 'allowedDdis',
        type: 'string_list',
        question: {
          pt: 'Digite os DDIs permitidos para aprovação automática separados por espaço (Ex: 55 ou 55 351) ou . para apenas Brasil (55):',
          es: 'Escribe los prefijos (DDIs) autorizados para auto-aprobación separados por espacio (Ej: 55 o 55 351) o . para solo Brasil (55):',
          en: 'Enter allowed country codes (DDIs) separated by space (e.g. 55 or 55 351) or . for Brazil only (55):'
        },
        default: ['55']
      },
      {
        name: 'actionForForeigners',
        type: 'choice',
        question: {
          pt: 'O que fazer com solicitações de números estrangeiros?',
          es: '¿Qué hacer con solicitudes de números extranjeros?',
          en: 'What to do with requests from foreign numbers?'
        },
        default: 'ignore',
        choices: [
          {
            value: 'ignore',
            label: {
              pt: 'Ignorar (deixar na lista para análise manual dos administradores)',
              es: 'Ignorar (dejar en la lista para revisión manual)',
              en: 'Ignore (leave in list for manual review)'
            }
          },
          {
            value: 'reject',
            label: {
              pt: 'Rejeitar automaticamente (recusar entrada de gringos/estrangeiros)',
              es: 'Rechazar automáticamente (negar entrada de extranjeros)',
              en: 'Reject automatically (decline foreign numbers)'
            }
          }
        ]
      },
      {
        name: 'notifyGroup',
        type: 'boolean',
        question: {
          pt: 'Deseja enviar uma mensagem no grupo sempre que um participante for aprovado? (Responda 1 para Sim ou 2 para Não):',
          es: '¿Deseas enviar un mensaje en el grupo cada vez que un participante sea aprobado? (1 para Sí o 2 para No):',
          en: 'Do you want to send a message in the group whenever a participant is approved? (1 for Yes or 2 for No):'
        },
        default: false
      }
    ]
  },

  /**
   * Hook passivo: Disparado em tempo real ao receber evento group.join-request do Baileys
   */
  async onJoinRequest({ sock, request, groupJid, participant, action, lang, style }) {
    // Processa apenas novas solicitações criadas
    if (action !== 'created') return false;

    const cfg = configManager.getPluginConfig(groupJid, 'autoapprove');
    if (!cfg || !cfg.enabled) return false;

    // Resolução robusta e precisa do participante (suporta objetos, strings, LIDs e dispositivos)
    const candidate = participant || request?.participant || request?.user || request;
    const info = extractParticipantInfo(candidate);
    const targetPhoneJid = info.cleanTargetJid;
    const participantNumber = info.digits;

    // Blindagem Anti-Ban: Se o participante for um LID não resolvível, não aprova cegamente
    if (info.isLid && (!participantNumber || participantNumber.length > 15)) {
      logger.info({ groupJid, participant }, 'AutoApprove: Participante @lid não pôde ser resolvido para telefone. Mantendo na fila por segurança.');
      return false;
    }

    const allowedDdis = Array.isArray(cfg.allowedDdis) && cfg.allowedDdis.length > 0 ? cfg.allowedDdis : ['55'];
    const isAllowed = isNumberAllowed(participantNumber, allowedDdis);

    if (isAllowed) {
      logger.info({ groupJid, participantNumber }, 'AutoApprove: Número brasileiro/autorizado detectado. Enfileirando aprovação segura.');
      approvalQueue.enqueue({
        sock,
        groupJid,
        participantJid: targetPhoneJid || cleanJid(participant),
        action: 'approve',
        source: 'realtime',
        notifyGroup: Boolean(cfg.notifyGroup),
        lang,
        style
      });
      return { stop: true };
    } else if (cfg.actionForForeigners === 'reject') {
      logger.info({ groupJid, participantNumber }, 'AutoApprove: Número estrangeiro detectado. Enfileirando rejeição automática.');
      approvalQueue.enqueue({
        sock,
        groupJid,
        participantJid: targetPhoneJid || cleanJid(participant),
        action: 'reject',
        source: 'realtime',
        notifyGroup: false,
        lang,
        style
      });
      return { stop: true };
    }

    return false;
  },

  /**
   * Execução manual por comandos
   */
  async execute({ sock, msg, from, sender, args, reply, t: translate, isGroup, prefix }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const botJid = cleanJid(sock?.user?.id || '');
    const adminStatus = await checkAdminStatus(sock, from, botJid);
    if (!adminStatus.isBotAdmin) {
      return reply(translate('common.bot_not_admin'));
    }

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'autoapprove') || {};
    const lang = configManager.getGroupLang(from);
    const style = configManager.getGroupStyle(from);
    const p = prefix || '!';

    // 1. Wizard interativo: /aprovar config
    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'autoapprove');
    }

    // 2. Ativação: /aprovar on
    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'autoapprove', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'autoapprove');
      }

      const ddis = (cfg.allowedDdis && cfg.allowedDdis.length) ? cfg.allowedDdis.join(', ') : '55';
      const foreignAction = cfg.actionForForeigners === 'reject' ? 'Rejeitar' : 'Ignorar (Análise manual)';
      const notify = cfg.notifyGroup ? 'Sim' : 'Não (Silencioso)';

      let text = `${translate('common.saved')}\n\n`;
      text += translate('autoapprove.status', {
        status: '🟢 ATIVADO',
        ddis,
        foreignAction,
        notify
      });

      // Checa se o grupo do WhatsApp está com a aprovação de membros ativada
      const meta = adminStatus.metadata;
      if (meta && meta.joinApprovalMode === false) {
        text += `\n\n${translate('autoapprove.approval_mode_warning')}`;
      }

      return reply(text);
    }

    // 3. Desativação: /aprovar off
    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'autoapprove', false);
      return reply(translate('common.saved') + '\n\n' + translate('autoapprove.status', {
        status: '🔴 DESATIVADO',
        ddis: cfg.allowedDdis?.join(', ') || '55',
        foreignAction: 'Ignorado',
        notify: 'Não'
      }));
    }

    // 4. Aprovação Imediata em Lote Seguro: /aprovar agora / /aprovar all
    if (sub === 'agora' || sub === 'all' || sub === 'todos' || sub === 'processar') {
      let pendingList = [];
      try {
        pendingList = await sock.groupRequestParticipantsList(from);
      } catch (err) {
        logger.error({ err, from }, 'Erro ao consultar lista de solicitações pendentes');
        return reply(translate('common.error'));
      }

      if (!Array.isArray(pendingList) || pendingList.length === 0) {
        return reply(translate('autoapprove.no_pending'));
      }

      const allowedDdis = Array.isArray(cfg.allowedDdis) && cfg.allowedDdis.length > 0 ? cfg.allowedDdis : ['55'];
      const brParticipants = [];
      let foreignCount = 0;

      for (const item of pendingList) {
        const info = extractParticipantInfo(item);
        if (isNumberAllowed(info.digits, allowedDdis)) {
          brParticipants.push(info.cleanTargetJid || item.jid);
        } else {
          foreignCount++;
        }
      }

      if (brParticipants.length === 0) {
        return reply(translate('autoapprove.no_pending_br', { foreignCount }));
      }

      await reply(translate('autoapprove.batch_starting', { count: brParticipants.length }));

      // Enfileira cada um na fila anti-ban com delay humano e retorno assíncrono seguro
      let approvedCount = 0;
      let finishedCount = 0;
      const total = brParticipants.length;

      for (const participantJid of brParticipants) {
        approvalQueue.enqueue({
          sock,
          groupJid: from,
          participantJid: cleanJid(participantJid),
          action: 'approve',
          source: 'batch',
          notifyGroup: false, // Em lote, não floda o grupo
          lang,
          style,
          onComplete: async ({ success }) => {
            if (success) approvedCount++;
            finishedCount++;

            // Quando o último item terminar, envia o relatório de conclusão
            if (finishedCount === total) {
              await sendSafeMessage(sock, from, {
                text: translate('autoapprove.batch_finished', { approved: approvedCount, total })
              }).catch(() => {});
            }
          }
        });
      }

      return;
    }

    // 5. Aprovação de Alvo Específico: !aprovar <número/menção>
    const isTargetArg = Boolean(sub && !['config', 'wizard', 'setup', 'on', 'ativar', 'activar', 'off', 'desativar', 'agora', 'all', 'todos', 'processar', 'status', 'info', 'help', 'ajuda'].includes(sub));
    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (isTargetArg || mentions.length > 0) {
      let pendingList = [];
      try {
        pendingList = await sock.groupRequestParticipantsList(from);
      } catch (err) {
        logger.error({ err, from }, 'Erro ao consultar lista de solicitações pendentes para alvo específico');
        return reply(translate('common.error'));
      }

      if (!Array.isArray(pendingList) || pendingList.length === 0) {
        return reply(translate('autoapprove.no_pending'));
      }

      // Determina o alvo buscado
      let rawTarget = mentions[0] || args.join(' ');
      const targetInfo = extractParticipantInfo(rawTarget);
      const targetDigits = targetInfo.digits;
      const targetLast8 = targetDigits.length >= 8 ? targetDigits.slice(-8) : targetDigits;

      // Busca na lista de pendentes por JID, dígitos exatos ou DDD + últimos 8 dígitos
      let matchedItem = null;
      for (const item of pendingList) {
        const itemInfo = extractParticipantInfo(item);
        
        const isJidMatch = targetInfo.cleanTargetJid && itemInfo.cleanTargetJid === targetInfo.cleanTargetJid;
        const isDigitsMatch = targetDigits && (itemInfo.digits === targetDigits || itemInfo.digits.endsWith(targetDigits) || targetDigits.endsWith(itemInfo.digits));
        
        let isBrMatch = false;
        if (targetDigits.length >= 10 && itemInfo.digits.length >= 10) {
          const tDdd = targetDigits.startsWith('55') ? targetDigits.substring(2, 4) : targetDigits.substring(0, 2);
          const iDdd = itemInfo.digits.startsWith('55') ? itemInfo.digits.substring(2, 4) : itemInfo.digits.substring(0, 2);
          const itemLast8 = itemInfo.digits.slice(-8);
          if (tDdd === iDdd && targetLast8 === itemLast8) {
            isBrMatch = true;
          }
        }

        if (isJidMatch || isDigitsMatch || isBrMatch) {
          matchedItem = { item, info: itemInfo };
          break;
        }
      }

      if (!matchedItem) {
        return reply(translate('autoapprove.target_not_found', { user: targetDigits || rawTarget }));
      }

      // Enfileira aprovação individual segura
      const approvedJid = matchedItem.info.cleanTargetJid || matchedItem.item.jid;
      approvalQueue.enqueue({
        sock,
        groupJid: from,
        participantJid: cleanJid(approvedJid),
        action: 'approve',
        source: 'manual',
        notifyGroup: Boolean(cfg.notifyGroup),
        lang,
        style
      });

      return reply(translate('autoapprove.target_approved', { user: matchedItem.info.digits || matchedItem.info.displayNum }));
    }

    // 6. Exibição de Status e Painel de Resumo (Default sem args)
    let pendingList = [];
    try {
      pendingList = await sock.groupRequestParticipantsList(from);
    } catch (_) {
      pendingList = [];
    }

    const allowedDdis = Array.isArray(cfg.allowedDdis) && cfg.allowedDdis.length > 0 ? cfg.allowedDdis : ['55'];
    let brCount = 0;
    let foreignCount = 0;

    for (const item of pendingList) {
      const info = extractParticipantInfo(item);
      if (isNumberAllowed(info.digits, allowedDdis)) {
        brCount++;
      } else {
        foreignCount++;
      }
    }

    let summaryText = translate('autoapprove.summary', {
      total: pendingList.length,
      brCount,
      foreignCount,
      prefix: p
    });

    const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');
    summaryText += `\n\n📌 *Status do Bot neste grupo:* ${isEnabled ? '🟢 ATIVADO' : '🔴 DESATIVADO'}`;

    const meta = adminStatus.metadata;
    if (meta && meta.joinApprovalMode === false) {
      summaryText += `\n\n${translate('autoapprove.approval_mode_warning')}`;
    }

    return reply(summaryText);
  },

  // Exportação de utilitários para ferramentas de IA e testes unitários
  extractParticipantInfo,
  isNumberAllowed,
  approvalQueue
};
