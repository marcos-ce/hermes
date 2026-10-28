const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { cleanJid, checkAdminStatus, lidToPhoneMap } = require('../../utils/jidResolver');
const { sendSafeMessage, randomDelay, sleep } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

const WILDCARD_VALUES = new Set(['*', 'all', 'todos', 'qualquer']);

/**
 * Normaliza a configuração de DDIs. Aceita array, string separada por espaços/vírgulas
 * ou valor único. Nunca retorna um array vazio.
 * @param {string[]|string|number} value
 * @returns {string[]}
 */
function normalizeAllowedDdis(value) {
  if (value === undefined || value === null || value === '') return ['55'];

  const list = Array.isArray(value) ? value : String(value).split(/[\s,;]+/);
  const normalized = list
    .map((item) => String(item).trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : ['55'];
}

/**
 * Verifica se a lista de DDIs usa o curinga de "qualquer membro".
 * @param {string[]|string} value
 * @returns {boolean}
 */
function isWildcardList(value) {
  return normalizeAllowedDdis(value).some((ddi) => WILDCARD_VALUES.has(ddi.toLowerCase()));
}

/**
 * Avalia o retorno de sock.groupRequestParticipantsUpdate.
 * O Baileys não lança exceção para erros por participante: ele devolve
 * um array no formato [{ status: '200' | '403' | '404' | ..., jid }].
 * @param {any} result
 * @returns {{ success: boolean, reason?: string, status?: string }}
 */
function evaluateParticipantUpdateResult(result) {
  const entries = Array.isArray(result)
    ? result
    : (result && typeof result === 'object' ? [result] : []);

  if (entries.length === 0) {
    return { success: false, reason: 'empty_response' };
  }

  for (const entry of entries) {
    const rawStatus = typeof entry === 'string'
      ? entry
      : (entry?.status ?? entry?.error ?? entry?.code);
    const status = String(rawStatus ?? '').trim();

    if (!status || status === '200') continue;
    if (status === '404') return { success: false, reason: 'stale_request', status };
    if (status === '403') return { success: false, reason: 'forbidden', status };
    return { success: false, reason: 'request_failed', status };
  }

  return { success: true };
}

/**
 * ============================================================================
 * MOTOR ANTI-BAN RÍGIDO: Fila Sequencial, Sliding Window & Circuit Breaker
 * ============================================================================
 * Garante que a aprovação de membros nunca acione bloqueios do WhatsApp:
 * 1. Fila FIFO com concorrência estrita 1 (zero requisições em paralelo)
 * 2. Jitter humano aleatório (2500ms a 4500ms) entre aprovações
 * 3. Rate limiting por janela deslizante (máx 10/min e máx 50/hora por grupo)
 * 4. Circuit Breaker automático se houver pico repentino de solicitações
 * 5. Prevenção de erros 403 com checagem preemptiva de admin
 */
class AntiBanApprovalQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentItem = null;
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
   * Cancela itens automáticos (tempo real/lote) de um grupo.
   * Itens manuais continuam na fila, pois representam uma ação explícita do administrador.
   * @param {string} groupJid
   * @param {string} reason
   * @returns {Promise<number>} quantidade de itens afetados
   */
  async cancelGroup(groupJid, reason = 'cancelled') {
    const cancelled = [];
    const remaining = [];

    for (const item of this.queue) {
      if (item.groupJid === groupJid && (item.source === 'realtime' || item.source === 'batch')) {
        item._cancelled = true;
        item._cancelReason = reason;
        cancelled.push(item);
      } else {
        remaining.push(item);
      }
    }
    this.queue = remaining;

    let currentWasCancelled = false;
    if (this.currentItem &&
        this.currentItem.groupJid === groupJid &&
        (this.currentItem.source === 'realtime' || this.currentItem.source === 'batch') &&
        !this.currentItem._completed) {
      this.currentItem._cancelled = true;
      this.currentItem._cancelReason = reason;
      currentWasCancelled = true;
    }

    for (const item of cancelled) {
      await this._complete(item, { success: false, reason });
    }

    return cancelled.length + (currentWasCancelled ? 1 : 0);
  }

  /**
   * Executa o callback de conclusão uma única vez por item.
   * @param {object} item
   * @param {{ success: boolean, reason?: string, status?: string }} result
   */
  async _complete(item, result) {
    if (!item || item._completed) return;
    item._completed = true;

    if (typeof item.onComplete === 'function') {
      try {
        await item.onComplete(result);
      } catch (err) {
        logger.error(
          { err, groupJid: item.groupJid, participantJid: item.participantJid },
          'AntiBan: Erro no callback onComplete da fila de aprovação'
        );
      }
    }
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
   * @returns {{ allowed: boolean, reason?: string, count?: number }}
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
   * Processa um item da fila com todas as proteções anti-ban.
   * @param {object} item
   */
  async _processItem(item) {
    const { sock, groupJid, participantJid, action, source, notifyGroup, lang, style } = item;

    if (!sock || !groupJid || !participantJid) {
      await this._complete(item, { success: false, reason: 'invalid_task' });
      return;
    }

    if (item._cancelled) {
      await this._complete(item, { success: false, reason: item._cancelReason || 'cancelled' });
      return;
    }

    // Lotes iniciados com o módulo desligado são uma ação manual explícita e podem continuar.
    // Lotes iniciados com o módulo ligado são cancelados se ele for desligado no meio.
    const requireEnabled = source === 'realtime' || (source === 'batch' && item.requireEnabled === true);
    if (requireEnabled && !configManager.isPluginEnabled(groupJid, 'autoapprove')) {
      await this._complete(item, { success: false, reason: 'disabled' });
      return;
    }

    // 1. Checagem de Circuit Breaker
    if (this.isCircuitBreakerActive(groupJid)) {
      logger.warn({ groupJid, participantJid }, 'AntiBan: Aprovação ignorada temporariamente por Circuit Breaker ativo');
      await this._complete(item, { success: false, reason: 'circuit_breaker' });
      return;
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

        if (item._cancelled) {
          await this._complete(item, { success: false, reason: item._cancelReason || 'cancelled' });
          return;
        }
        if (requireEnabled && !configManager.isPluginEnabled(groupJid, 'autoapprove')) {
          await this._complete(item, { success: false, reason: 'disabled' });
          return;
        }

        this.queue.unshift(item); // Reinsere no início para processar sem perda
        return;
      }

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

      await this._complete(item, { success: false, reason: 'rate_limit' });
      return;
    }

    // 3. Checagem Preemptiva de Permissão de Admin do Bot
    const botJid = cleanJid(sock?.user?.id || '');
    let adminStatus = await checkAdminStatus(sock, groupJid, botJid);

    // Distingue falha de metadados (rede/cache) de "bot não é admin".
    // Uma segunda tentativa curta evita descartar solicitações por um timeout transitório.
    if (!adminStatus.metadata) {
      await sleep(1000);
      if (item._cancelled) {
        await this._complete(item, { success: false, reason: item._cancelReason || 'cancelled' });
        return;
      }
      adminStatus = await checkAdminStatus(sock, groupJid, botJid);
    }

    if (item._cancelled) {
      await this._complete(item, { success: false, reason: item._cancelReason || 'cancelled' });
      return;
    }

    if (!adminStatus.metadata) {
      logger.warn({ groupJid }, 'AntiBan: Metadados do grupo indisponíveis. Não é possível confirmar se o bot é administrador.');
      await this._complete(item, { success: false, reason: 'metadata_unavailable' });
      return;
    }

    if (!adminStatus.isBotAdmin) {
      logger.warn({ groupJid }, 'AntiBan: Bot não é administrador do grupo. Cancelando requisição para evitar erro 403 no WhatsApp.');
      await this._complete(item, { success: false, reason: 'bot_not_admin' });
      return;
    }

    // 4. Jitter Delay Humano Rigoroso (2500ms a 4500ms)
    await randomDelay(2500, 4500);

    // Revalidação após o jitter: o módulo pode ter sido desligado durante a espera.
    if (item._cancelled) {
      await this._complete(item, { success: false, reason: item._cancelReason || 'cancelled' });
      return;
    }
    if (requireEnabled && !configManager.isPluginEnabled(groupJid, 'autoapprove')) {
      await this._complete(item, { success: false, reason: 'disabled' });
      return;
    }

    // 5. Execução Segura da Ação no WhatsApp
    let result;
    try {
      result = await sock.groupRequestParticipantsUpdate(groupJid, [participantJid], action);
    } catch (err) {
      const errMsg = String(err?.message || err || '').toLowerCase();
      const isStale = errMsg.includes('404') || errMsg.includes('not-found') || errMsg.includes('item-not-found');
      const reason = isStale
        ? 'stale_request'
        : (errMsg.includes('403') || errMsg.includes('forbidden') ? 'forbidden' : 'request_failed');

      if (!isStale) this.consecutiveErrors++;

      logger.error({ err, groupJid, participantJid, action }, 'Falha na requisição de aprovação de participante');

      // Se houver 2 erros consecutivos de rede/API, pausa por 45 segundos para despressurizar o socket
      if (this.consecutiveErrors >= 2) {
        logger.warn('AntiBan: Detectados erros consecutivos na API de grupos. Pausando fila por 45 segundos.');
        await sleep(45000);
        this.consecutiveErrors = 0;
      }

      await this._complete(item, { success: false, reason });
      return;
    }

    const evaluation = evaluateParticipantUpdateResult(result);
    if (!evaluation.success) {
      if (evaluation.reason !== 'stale_request') this.consecutiveErrors++;

      logger.warn(
        { groupJid, participantJid, action, status: evaluation.status, reason: evaluation.reason },
        'AntiBan: WhatsApp não confirmou a atualização do participante'
      );

      if (this.consecutiveErrors >= 2) {
        logger.warn('AntiBan: Detectados erros consecutivos na API de grupos. Pausando fila por 45 segundos.');
        await sleep(45000);
        this.consecutiveErrors = 0;
      }

      await this._complete(item, evaluation);
      return;
    }

    this.consecutiveErrors = 0;
    this._recordApproval(groupJid);

    // Restauração de presença invisível
    try {
      await sock.sendPresenceUpdate('unavailable');
    } catch (_) {}

    // 6. Notificação amigável no grupo se ativada
    if (action === 'approve' && notifyGroup) {
      const cleanUser = cleanJid(participantJid);
      const userNum = cleanUser.replace(/@.*$/, '').replace(/\D/g, '');
      await sendSafeMessage(sock, groupJid, {
        text: t(lang, 'autoapprove.approved_single', { user: userNum }, style),
        mentions: [participantJid]
      }).catch(() => {});
    }

    await this._complete(item, { success: true });
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
        this.currentItem = item;

        try {
          await this._processItem(item);
        } catch (err) {
          logger.error(
            { err, groupJid: item?.groupJid, participantJid: item?.participantJid },
            'AntiBan: Erro inesperado ao processar item da fila'
          );
          await this._complete(item, { success: false, reason: 'internal_error' });
        } finally {
          this.currentItem = null;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

const approvalQueue = new AntiBanApprovalQueue();

/**
 * Extrai dados padronizados e normalizados de um participante ou item de solicitação do Baileys.
 * Separa explicitamente "resolução" (telefone/DDI conhecido) de "política" (aceitar estrangeiros).
 * Resolve sufixos de dispositivo (:1, :0), mapeamentos de LID, domínios e formatos nacionais sem DDI.
 * @param {string|object} item JID, número ou objeto de solicitação do WhatsApp
 * @returns {{ rawJid: string, cleanTargetJid: string, digits: string, isLid: boolean, isGroup: boolean, resolved: boolean, displayNum: string }}
 */
function extractParticipantInfo(item) {
  if (!item) {
    return { rawJid: '', cleanTargetJid: '', digits: '', isLid: false, isGroup: false, resolved: false, displayNum: '' };
  }

  let rawJid = '';
  let phoneCandidate = '';

  if (typeof item === 'string') {
    rawJid = item;
  } else if (typeof item === 'object') {
    // Procura primeiro campos específicos de telefone que o WhatsApp/Baileys anexa.
    phoneCandidate = item.phone_number || item.phoneNumber || item.sender_pn ||
      item.senderPn || item.pn || item.phone || '';
    rawJid = item.jid || item.user || item.id || item.participant || item.lid || phoneCandidate || '';
  }

  // JID normalizado sem sufixos de dispositivo (:1, :0)
  if (rawJid && typeof rawJid !== 'string') rawJid = String(rawJid);
  let cleanTargetJid = cleanJid(rawJid);

  // Número solto (sem domínio) é tratado como telefone, não como LID.
  if (cleanTargetJid && !cleanTargetJid.includes('@') && /^\d+$/.test(cleanTargetJid)) {
    cleanTargetJid = `${cleanTargetJid}@s.whatsapp.net`;
  }

  const isLid = cleanTargetJid.endsWith('@lid');

  // Um telefone explícito só é aceito se não for outro LID e tiver tamanho plausível.
  const candidateClean = cleanJid(String(phoneCandidate || ''));
  const candidateDigits = candidateClean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
  let phoneSource = '';
  if (phoneCandidate && !candidateClean.endsWith('@lid') && candidateDigits.length >= 8) {
    phoneSource = phoneCandidate;
  }

  // Se o JID for @lid, tenta mapear no lidToPhoneMap global
  if (!phoneSource && isLid) {
    const mapped = lidToPhoneMap.get(cleanTargetJid);
    if (mapped) phoneSource = mapped;
  }

  // Só é considerado "resolvido" quando existe um telefone conhecido.
  // Um LID cru (mesmo que seus dígitos pareçam um telefone brasileiro) NÃO é um telefone.
  const resolved = Boolean(phoneSource) || Boolean(cleanTargetJid && !isLid);
  const numberSource = phoneSource || cleanTargetJid;

  // Extrai apenas a parte do usuário antes do @ e antes do : (remove device suffix)
  let userPart = String(numberSource).trim();
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
    isLid,
    isGroup: cleanTargetJid.endsWith('@g.us'),
    resolved,
    displayNum: digits || cleanTargetJid.replace(/@.*$/, '')
  };
}

/**
 * Verifica se um número pertence aos DDIs autorizados (com validação robusta para o Brasil).
 * Suporta wildcard '*' ou 'todos'/'all'/'qualquer' para aceitar qualquer membro de qualquer país.
 * @param {string} digits
 * @param {string[]|string} allowedDdis
 * @returns {boolean}
 */
function isNumberAllowed(digits, allowedDdis = ['55']) {
  if (!digits || typeof digits !== 'string') return false;

  const ddis = normalizeAllowedDdis(allowedDdis);

  // Wildcard aceita qualquer identificador numérico, inclusive LIDs curtos ou longos.
  // A decisão de aprovar um LID não resolvido é tomada em onJoinRequest/lote.
  if (ddis.some(d => WILDCARD_VALUES.has(d.toLowerCase()))) {
    return digits.length > 0;
  }

  for (const rawDdi of ddis) {
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
  description: 'Aprovação automática de novos membros (brasileiros ou qualquer país) com filtro anti-ban rígido',
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
      pt: 'Aprova automaticamente a entrada de novos membros (brasileiros, países selecionados ou qualquer membro)',
      es: 'Aprueba automáticamente la entrada de nuevos miembros (brasileños, países seleccionados o cualquier miembro)',
      en: 'Automatically approves entry of new members (Brazilians, selected country codes, or any member)'
    },
    fields: [
      {
        name: 'allowedDdis',
        type: 'string_list',
        question: {
          pt: 'Digite os DDIs permitidos separados por espaço (Ex: 55 ou 55 351), digite * para aceitar qualquer membro/país, ou . para manter apenas Brasil (55):',
          es: 'Escribe los prefijos (DDIs) autorizados separados por espacio (Ej: 55 o 55 351), escribe * para aceptar cualquier miembro/país, o . para mantener solo Brasil (55):',
          en: 'Enter allowed country codes (DDIs) separated by space (e.g. 55 or 55 351), enter * to accept any member/country, or . to keep Brazil only (55):'
        },
        default: ['55']
      },
      {
        name: 'actionForForeigners',
        type: 'choice',
        question: {
          pt: 'O que fazer com solicitações de números estrangeiros (caso não configurado para aceitar todos)?',
          es: '¿Qué hacer con solicitudes de números extranjeros (si no está configurado para aceptar todos)?',
          en: 'What to do with requests from foreign numbers (if not set to accept all)?'
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
    // "configured" é obrigatório: um módulo apenas ligado, mas nunca configurado,
    // não deve aprovar ninguém com os valores padrão.
    if (!cfg || !cfg.enabled || !cfg.configured) return false;

    // Resolução robusta e precisa do participante (suporta objetos, strings, LIDs e dispositivos)
    const candidate = participant || request?.participant || request?.user || request;
    const info = extractParticipantInfo(candidate);
    const targetJid = info.cleanTargetJid || cleanJid(participant);
    if (!targetJid) return false;

    const allowedDdis = normalizeAllowedDdis(cfg.allowedDdis);
    const wildcard = isWildcardList(allowedDdis);

    // LID sem telefone resolvido: NÃO é estrangeiro, é identidade desconhecida.
    // - Em modo estrito, fica pendente para análise manual (nunca rejeita).
    // - Com wildcard, a política é aceitar qualquer membro, então o LID pode ser aprovado.
    if (info.isLid && !info.resolved) {
      if (wildcard) {
        logger.info(
          { groupJid, participant, targetJid },
          'AutoApprove: LID não resolvido aprovado pela política wildcard.'
        );
        approvalQueue.enqueue({
          sock,
          groupJid,
          participantJid: targetJid,
          action: 'approve',
          source: 'realtime',
          notifyGroup: Boolean(cfg.notifyGroup),
          lang,
          style
        });
        return { stop: true };
      }

      logger.info(
        { groupJid, participant, targetJid },
        'AutoApprove: LID não resolvido mantido na fila para análise manual (modo estrito).'
      );
      return false;
    }

    if (!info.resolved) return false;

    const isAllowed = isNumberAllowed(info.digits, allowedDdis);

    if (isAllowed) {
      logger.info({ groupJid, participantNumber: info.digits }, 'AutoApprove: Número brasileiro/autorizado detectado. Enfileirando aprovação segura.');
      approvalQueue.enqueue({
        sock,
        groupJid,
        participantJid: targetJid,
        action: 'approve',
        source: 'realtime',
        notifyGroup: Boolean(cfg.notifyGroup),
        lang,
        style
      });
      return { stop: true };
    }

    if (cfg.actionForForeigners === 'reject') {
      logger.info({ groupJid, participantNumber: info.digits }, 'AutoApprove: Número estrangeiro detectado. Enfileirando rejeição automática.');
      approvalQueue.enqueue({
        sock,
        groupJid,
        participantJid: targetJid,
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
    const arg1 = (args[1] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'autoapprove') || {};
    const lang = configManager.getGroupLang(from);
    const style = configManager.getGroupStyle(from);
    const p = prefix || '!';

    // 1. Wizard interativo: /aprovar config
    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      // preserveEnabled evita que abrir o wizard ligue um módulo que estava desligado.
      return await wizardEngine.startWizard(sock, msg, from, sender, 'autoapprove', null, {
        preserveEnabled: true
      });
    }

    // 2. Ativação direta para QUALQUER membro: !aprovar qualquer, !aprovar on todos, !aprovar on all, !aprovar todos on
    const isActivatingAll = (
      (sub === 'qualquer' && !arg1) ||
      (['todos', 'all', 'qualquer'].includes(sub) && ['on', 'ativar', 'activar'].includes(arg1)) ||
      (['on', 'ativar', 'activar'].includes(sub) && ['todos', 'all', 'qualquer', '*'].includes(arg1))
    );

    if (isActivatingAll) {
      configManager.setPluginEnabled(from, 'autoapprove', true);
      configManager.updatePluginConfig(from, 'autoapprove', {
        enabled: true,
        configured: true,
        allowedDdis: ['*']
      });

      let text = `${translate('common.saved')}\n\n`;
      text += translate('autoapprove.activated_all');

      const meta = adminStatus.metadata;
      if (meta && meta.joinApprovalMode === false) {
        text += `\n\n${translate('autoapprove.approval_mode_warning')}`;
      }

      return reply(text);
    }

    // 3. Ativação direta para BRASILEIROS: !aprovar on br, !aprovar br on
    const isActivatingBr = (
      (['br', 'brasil', 'brazil', '55'].includes(sub) && ['on', 'ativar', 'activar'].includes(arg1)) ||
      (['on', 'ativar', 'activar'].includes(sub) && ['br', 'brasil', 'brazil', '55'].includes(arg1))
    );

    if (isActivatingBr) {
      configManager.setPluginEnabled(from, 'autoapprove', true);
      configManager.updatePluginConfig(from, 'autoapprove', {
        enabled: true,
        configured: true,
        allowedDdis: ['55']
      });

      let text = `${translate('common.saved')}\n\n`;
      text += translate('autoapprove.status', {
        status: '🟢 ATIVADO',
        ddis: '55 (Brasil)',
        foreignAction: cfg.actionForForeigners === 'reject' ? 'Rejeitar' : 'Ignorar (Análise manual)',
        notify: cfg.notifyGroup ? 'Sim' : 'Não (Silencioso)'
      });

      const meta = adminStatus.metadata;
      if (meta && meta.joinApprovalMode === false) {
        text += `\n\n${translate('autoapprove.approval_mode_warning')}`;
      }

      return reply(text);
    }

    // 4. Ativação padrão: /aprovar on
    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      // Nunca liga antes do wizard: se ainda não foi configurado, o wizard assume
      // e só habilita o módulo ao concluir todas as etapas.
      if (!cfg.configured) {
        configManager.setPluginEnabled(from, 'autoapprove', false);
        return await wizardEngine.startWizard(sock, msg, from, sender, 'autoapprove');
      }

      configManager.setPluginEnabled(from, 'autoapprove', true);

      const groupDdis = normalizeAllowedDdis(cfg.allowedDdis);
      const isAll = isWildcardList(groupDdis);
      const ddis = isAll ? translate('autoapprove.all_members') : groupDdis.join(', ');
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

    // 5. Desativação: /aprovar off
    if (sub === 'off' || sub === 'desativar') {
      // Desliga primeiro para que qualquer item que esteja no jitter também pare.
      configManager.setPluginEnabled(from, 'autoapprove', false);
      const cancelledCount = await approvalQueue.cancelGroup(from, 'disabled');

      const groupDdis = normalizeAllowedDdis(cfg.allowedDdis);
      const isAll = isWildcardList(groupDdis);
      const ddisDesc = isAll ? translate('autoapprove.all_members') : groupDdis.join(', ');

      let text = translate('common.saved') + '\n\n' + translate('autoapprove.status', {
        status: '🔴 DESATIVADO',
        ddis: ddisDesc,
        foreignAction: 'Ignorado',
        notify: 'Não'
      });

      if (cancelledCount > 0) {
        text += `\n\n${translate('autoapprove.queue_cancelled', { count: cancelledCount })}`;
      }

      return reply(text);
    }

    // 6. Aprovação Imediata em Lote Seguro: /aprovar agora / /aprovar todos / /aprovar all
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

      // Se comando foi especificamente 'todos' / 'all' ou tem argumento 'todos', aprova qualquer país
      const wantsAll = (sub === 'todos' || sub === 'all' || ['todos', 'all', 'qualquer', '*'].includes(arg1));
      const groupDdis = normalizeAllowedDdis(cfg.allowedDdis);
      const allowedDdis = wantsAll ? ['*'] : groupDdis;
      const isApprovingAll = isWildcardList(allowedDdis);

      const targetsToApprove = new Set();
      let skippedCount = 0;
      let unknownCount = 0;

      for (const item of pendingList) {
        const info = extractParticipantInfo(item);

        // LID sem telefone resolvido não é estrangeiro: é identidade desconhecida.
        // No lote estrito ele fica pendente; no lote wildcard é aprovado normalmente.
        if (!info.resolved && !isApprovingAll) {
          unknownCount++;
          continue;
        }

        if (isNumberAllowed(info.digits, allowedDdis)) {
          const targetJid = info.cleanTargetJid || item.jid;
          if (targetJid) targetsToApprove.add(cleanJid(targetJid));
        } else {
          skippedCount++;
        }
      }

      const targets = [...targetsToApprove];

      if (targets.length === 0) {
        return reply(translate('autoapprove.no_pending_br', {
          foreignCount: skippedCount,
          unknownCount
        }));
      }

      const startingMsg = isApprovingAll
        ? translate('autoapprove.batch_starting_all', { count: targets.length })
        : translate('autoapprove.batch_starting', { count: targets.length });

      await reply(startingMsg);

      // Enfileira cada um na fila anti-ban com delay humano e retorno assíncrono seguro
      let approvedCount = 0;
      let failedCount = 0;
      let cancelledCount = 0;
      let finishedCount = 0;
      let summarySent = false;
      const total = targets.length;

      // Se o módulo já estava desligado quando o lote começou, o comando é uma
      // ação manual explícita e pode continuar. Se estava ligado, desligar cancela.
      const requireEnabled = configManager.isPluginEnabled(from, 'autoapprove');

      const sendBatchSummary = async () => {
        if (summarySent) return;
        summarySent = true;

        const finishedMsg = cancelledCount > 0
          ? translate('autoapprove.batch_cancelled', {
            approved: approvedCount,
            total,
            failed: failedCount,
            cancelled: cancelledCount
          })
          : (isApprovingAll
            ? translate('autoapprove.batch_finished_all', {
              approved: approvedCount,
              total,
              failed: failedCount,
              cancelled: cancelledCount
            })
            : translate('autoapprove.batch_finished', {
              approved: approvedCount,
              total,
              failed: failedCount,
              cancelled: cancelledCount
            }));

        await sendSafeMessage(sock, from, { text: finishedMsg }).catch(() => {});
      };

      for (const participantJid of targets) {
        approvalQueue.enqueue({
          sock,
          groupJid: from,
          participantJid,
          action: 'approve',
          source: 'batch',
          requireEnabled,
          notifyGroup: false, // Em lote, não floda o grupo
          lang,
          style,
          onComplete: async ({ success, reason }) => {
            if (success) {
              approvedCount++;
            } else if (reason === 'cancelled' || reason === 'disabled') {
              cancelledCount++;
            } else {
              failedCount++;
            }
            finishedCount++;

            // Quando o último item terminar, envia o relatório de conclusão
            if (finishedCount >= total) {
              await sendBatchSummary();
            }
          }
        });
      }

      return;
    }

    // 7. Aprovação de Alvo Específico: !aprovar <número/menção>
    const isTargetArg = Boolean(sub && !['config', 'wizard', 'setup', 'on', 'ativar', 'activar', 'off', 'desativar', 'agora', 'all', 'todos', 'processar', 'status', 'info', 'help', 'ajuda', 'qualquer', 'br'].includes(sub));
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
      const rawTarget = mentions[0] || args.join(' ');
      const targetInfo = extractParticipantInfo(rawTarget);
      const targetDigits = targetInfo.digits;
      const targetLast8 = targetDigits.length >= 8 ? targetDigits.slice(-8) : targetDigits;

      // Coleta correspondências com pontuação. Correspondências parciais curtas
      // (ex.: "8888") não podem aprovar o primeiro item que terminar com esses dígitos.
      const matches = [];
      for (const item of pendingList) {
        const itemInfo = extractParticipantInfo(item);
        let score = 0;

        const isJidMatch = Boolean(targetInfo.cleanTargetJid) &&
          itemInfo.cleanTargetJid === targetInfo.cleanTargetJid;
        if (isJidMatch) score = Math.max(score, 3);

        if (targetDigits && itemInfo.digits === targetDigits) {
          score = Math.max(score, 2);
        }

        if (targetDigits.length >= 8 && itemInfo.digits.length >= 8) {
          if (itemInfo.digits.endsWith(targetDigits) || targetDigits.endsWith(itemInfo.digits)) {
            score = Math.max(score, 1);
          }
        }

        if (targetDigits.length >= 10 && itemInfo.digits.length >= 10) {
          const tDdd = targetDigits.startsWith('55') ? targetDigits.substring(2, 4) : targetDigits.substring(0, 2);
          const iDdd = itemInfo.digits.startsWith('55') ? itemInfo.digits.substring(2, 4) : itemInfo.digits.substring(0, 2);
          const itemLast8 = itemInfo.digits.slice(-8);
          if (tDdd === iDdd && targetLast8 === itemLast8) {
            score = Math.max(score, 1);
          }
        }

        if (score > 0) {
          matches.push({ item, info: itemInfo, score });
        }
      }

      if (matches.length === 0) {
        return reply(translate('autoapprove.target_not_found', { user: targetDigits || rawTarget }));
      }

      const bestScore = Math.max(...matches.map(m => m.score));
      const bestMatches = matches.filter(m => m.score === bestScore);

      if (bestMatches.length > 1) {
        return reply(translate('autoapprove.target_ambiguous', {
          count: bestMatches.length,
          user: targetDigits || rawTarget
        }));
      }

      const matchedItem = bestMatches[0];
      const approvedJid = matchedItem.info.cleanTargetJid || matchedItem.item.jid;
      const displayUser = matchedItem.info.displayNum || targetDigits || rawTarget;

      // A resposta só é enviada depois do resultado real da API (onComplete).
      const result = await new Promise((resolve) => {
        approvalQueue.enqueue({
          sock,
          groupJid: from,
          participantJid: cleanJid(approvedJid),
          action: 'approve',
          source: 'manual',
          notifyGroup: Boolean(cfg.notifyGroup),
          lang,
          style,
          onComplete: resolve
        });
      });

      if (result?.success) {
        return reply(translate('autoapprove.target_approved', { user: displayUser }));
      }

      return reply(translate('autoapprove.target_failed', {
        user: displayUser,
        reason: result?.reason || 'unknown'
      }));
    }

    // 8. Exibição de Status e Painel de Resumo (Default sem args)
    let pendingList = [];
    try {
      pendingList = await sock.groupRequestParticipantsList(from);
    } catch (_) {
      pendingList = [];
    }

    const groupDdis = normalizeAllowedDdis(cfg.allowedDdis);
    const isAllConfigured = isWildcardList(groupDdis);
    let brCount = 0;
    let foreignCount = 0;
    let unknownCount = 0;

    for (const item of pendingList) {
      const info = extractParticipantInfo(item);

      // LIDs não resolvidos não entram como brasileiros nem como estrangeiros.
      if (!info.resolved) {
        unknownCount++;
      } else if (isNumberAllowed(info.digits, ['55'])) {
        brCount++;
      } else {
        foreignCount++;
      }
    }

    let summaryText = translate('autoapprove.summary', {
      total: pendingList.length,
      brCount,
      foreignCount,
      unknownCount,
      prefix: p
    });

    const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');
    const modeDesc = isAllConfigured ? translate('autoapprove.all_members') : groupDdis.join(', ');
    summaryText += `\n\n📌 *Status do Bot neste grupo:* ${isEnabled ? '🟢 ATIVADO' : '🔴 DESATIVADO'}`;
    summaryText += `\n🌍 *Critério de Auto-Aprovação:* ${modeDesc}`;

    const meta = adminStatus.metadata;
    if (meta && meta.joinApprovalMode === false) {
      summaryText += `\n\n${translate('autoapprove.approval_mode_warning')}`;
    }

    return reply(summaryText);
  },

  // Exportação de utilitários para ferramentas de IA e testes unitários
  extractParticipantInfo,
  isNumberAllowed,
  normalizeAllowedDdis,
  isWildcardList,
  evaluateParticipantUpdateResult,
  approvalQueue
};
