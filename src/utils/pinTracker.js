const logger = require('./logger');
const { safeGroupAction, randomDelay } = require('./antiBan');

/**
 * Rastreador em memória de mensagens fixadas em grupos
 * Totalmente determinístico (Zero IA / Zero chamadas externas)
 */
class PinTracker {
  constructor() {
    /** @type {Map<string, Map<string, object>>} groupJid -> Map(stanzaId -> targetKey) */
    this.pinnedByGroup = new Map();
  }

  /**
   * Registra uma mensagem fixada no grupo
   * @param {string} groupJid 
   * @param {object} key Objeto de chave WAMessageKey ({ remoteJid, id, fromMe, participant })
   */
  addPin(groupJid, key, preview = null) {
    if (!groupJid || !key?.id) return;
    if (!this.pinnedByGroup.has(groupJid)) {
      this.pinnedByGroup.set(groupJid, new Map());
    }
    const groupPins = this.pinnedByGroup.get(groupJid);
    groupPins.set(key.id, {
      key,
      id: key.id,
      preview: typeof preview === 'string' ? preview : null,
      timestamp: Date.now()
    });

    // Limite de segurança em RAM (WhatsApp permite até 3 fixadas por chat)
    if (groupPins.size > 10) {
      const oldest = groupPins.keys().next().value;
      groupPins.delete(oldest);
    }
    logger.debug({ groupJid, id: key.id }, 'Mensagem fixada registrada no pinTracker');
  }

  /**
   * Remove o registro de uma mensagem fixada
   * @param {string} groupJid 
   * @param {string} stanzaId 
   */
  removePin(groupJid, stanzaId) {
    if (!groupJid || !stanzaId) return;
    const groupPins = this.pinnedByGroup.get(groupJid);
    if (groupPins) {
      groupPins.delete(stanzaId);
      logger.debug({ groupJid, stanzaId }, 'Mensagem desafixada removida do pinTracker');
    }
  }

  /**
   * Limpa todos os registros de mensagens fixadas do grupo
   * @param {string} groupJid 
   */
  clearPins(groupJid) {
    if (!groupJid) return;
    this.pinnedByGroup.delete(groupJid);
  }

  /**
   * Retorna a lista de chaves de mensagens fixadas no grupo
   * @param {string} groupJid 
   * @returns {Array<object>}
   */
  getPinned(groupJid) {
    if (!groupJid) return [];
    const groupPins = this.pinnedByGroup.get(groupJid);
    if (!groupPins || groupPins.size === 0) return [];
    return Array.from(groupPins.values()).map(e => e.key || e);
  }

  /**
   * Retorna as mensagens fixadas com texto/preview resolvido via memoryEngine
   * @param {string} groupJid
   * @param {object} [memoryEngine]
   * @returns {Array<{ id: string, key: object, text: string, senderNum: string }>}
   */
  getPinnedWithDetails(groupJid, memoryEngine = null) {
    if (!groupJid) return [];
    const groupPins = this.pinnedByGroup.get(groupJid);
    if (!groupPins || groupPins.size === 0) return [];

    const list = [];
    for (const [id, entry] of groupPins.entries()) {
      const key = entry.key || entry;
      let text = entry.preview || '';
      let sender = key.participant || (key.fromMe ? 'bot' : '');

      if (!text && memoryEngine) {
        const msg = memoryEngine.getMessageByMsgId(groupJid, id);
        if (msg) {
          text = msg.text || '';
          sender = msg.sender || sender;
        }
      }

      const senderNum = String(sender || '').replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      list.push({
        id,
        key,
        text: text ? text.slice(0, 100) : '[Foto/Mídia ou Mensagem]',
        senderNum: senderNum || (key.fromMe ? 'Hermes' : 'membro')
      });
    }
    return list;
  }

  /**
   * Desafixa uma mensagem específica pelo stanzaId
   * @param {object} sock
   * @param {string} groupJid
   * @param {string} stanzaId
   * @returns {Promise<boolean>}
   */
  async unpinMessage(sock, groupJid, stanzaId) {
    if (!sock || !groupJid || !stanzaId) return false;
    const groupPins = this.pinnedByGroup.get(groupJid);
    if (!groupPins) return false;
    const entry = groupPins.get(stanzaId);
    if (!entry) return false;
    const key = entry.key || entry;
    try {
      await safeGroupAction(sock, groupJid, (s, gid) => s.sendMessage(gid, { pin: key, type: 2 }));
      groupPins.delete(stanzaId);
      return true;
    } catch (err) {
      logger.error({ err, groupJid, stanzaId }, 'Erro ao desafixar mensagem individual');
      return false;
    }
  }

  /**
   * Desafixa todas as mensagens fixadas registradas no grupo enviando pin type 2 com delay seguro.
   * @param {object} sock Instância do socket Baileys
   * @param {string} groupJid JID do grupo
   * @returns {Promise<number>} Quantidade de mensagens desafixadas com sucesso
   */
  async unpinAllMessages(sock, groupJid) {
    if (!sock || !groupJid) return 0;
    const pinnedList = this.getPinned(groupJid);
    if (!pinnedList || pinnedList.length === 0) return 0;

    let count = 0;
    for (let i = 0; i < pinnedList.length; i++) {
      const key = pinnedList[i];
      if (i > 0) {
        await randomDelay(700, 1200);
      }
      try {
        await safeGroupAction(sock, groupJid, (s, gid) => s.sendMessage(gid, { pin: key, type: 2 }));
        count++;
      } catch (err) {
        logger.debug({ err, groupJid, keyId: key?.id }, 'Erro ao desafixar mensagem individual');
      }
    }
    this.clearPins(groupJid);
    return count;
  }

  /**
   * Trata mensagens do WhatsApp contendo pinInChatMessage
   * @param {string} groupJid 
   * @param {object} pinContent 
   */
  handlePinMessage(groupJid, pinContent) {
    if (!groupJid || !pinContent?.key) return;
    const targetKey = pinContent.key;
    const pinType = pinContent.type; // 1 = PIN, 2 = UNPIN

    if (pinType === 1) {
      this.addPin(groupJid, targetKey);
    } else if (pinType === 2 && targetKey.id) {
      this.removePin(groupJid, targetKey.id);
    }
  }
}

module.exports = new PinTracker();
