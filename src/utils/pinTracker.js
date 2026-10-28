const logger = require('./logger');

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
  addPin(groupJid, key) {
    if (!groupJid || !key?.id) return;
    if (!this.pinnedByGroup.has(groupJid)) {
      this.pinnedByGroup.set(groupJid, new Map());
    }
    const groupPins = this.pinnedByGroup.get(groupJid);
    groupPins.set(key.id, key);

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
    return Array.from(groupPins.values());
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
    for (const key of pinnedList) {
      try {
        await sock.sendMessage(groupJid, { pin: key, type: 2 });
        count++;
        await new Promise(r => setTimeout(r, 400));
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
