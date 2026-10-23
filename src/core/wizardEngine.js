const { wizardCache } = require('../utils/cache');
const { sendSafeMessage, safeDelete } = require('../utils/antiBan');
const { cleanJid } = require('../utils/jidResolver');
const { t, resolveSchemaText } = require('../utils/i18n');
const configManager = require('./configManager');
const pluginLoader = require('./pluginLoader');

class WizardEngine {
  /**
   * Inicia o fluxo de configuração interativa de um plugin
   * @param {object} sock 
   * @param {object} msg 
   * @param {string} from 
   * @param {string} sender 
   * @param {string} pluginName 
   */
  async startWizard(sock, msg, from, sender, pluginName) {
    const schema = pluginLoader.schemas.get(pluginName.toLowerCase());
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      return false;
    }

    const lang = configManager.getGroupLang(from);
    const existingConfig = configManager.getPluginConfig(from, pluginName) || {};

    const session = {
      type: 'wizard',
      pluginName: pluginName.toLowerCase(),
      stepIndex: 0,
      answers: {},
      existingConfig,
      schema,
      groupJid: from,
      sender
    };

    const sessionKey = `${from}:${sender}`;
    wizardCache.set(sessionKey, session);

    await this._sendStepPrompt(sock, msg, from, sender, session, lang);
    return true;
  }

  /**
   * Abre o Painel Geral Interativo (!config)
   * @param {object} sock 
   * @param {object} msg 
   * @param {string} from 
   * @param {string} sender 
   */
  async startConfigPanel(sock, msg, from, sender) {
    const lang = configManager.getGroupLang(from);
    const currentPrefix = configManager.getGroupPrefix(from);

    // Lista plugins que possuem schema ou são configuráveis
    const modules = [];
    for (const [name, schema] of pluginLoader.schemas.entries()) {
      const isEnabled = configManager.isPluginEnabled(from, name);
      const title = resolveSchemaText(schema.title || name, lang);
      const desc = resolveSchemaText(schema.description || '', lang);
      modules.push({
        name,
        title,
        desc,
        enabled: isEnabled,
        schema
      });
    }

    const localizedModuleNames = {
      pt: {
        antifake: 'ANTIFAKE',
        antiflood: 'ANTIFLOOD',
        antilink: 'ANTILINK',
        automsg: 'AUTOMSG',
        ban: 'BAN',
        schedule: 'HORÁRIOS',
        warn: 'ADVERTÊNCIAS',
        welcome: 'BOAS-VINDAS'
      },
      es: {
        antifake: 'ANTIFAKE',
        antiflood: 'ANTIFLOOD',
        antilink: 'ANTILINK',
        automsg: 'AUTOMSG',
        ban: 'BAN',
        schedule: 'HORARIOS',
        warn: 'ADVERTENCIAS',
        welcome: 'BIENVENIDA'
      },
      en: {
        antifake: 'ANTIFAKE',
        antiflood: 'ANTIFLOOD',
        antilink: 'ANTILINK',
        automsg: 'AUTOMSG',
        ban: 'BAN',
        schedule: 'SCHEDULE',
        warn: 'WARN',
        welcome: 'WELCOME'
      }
    };

    let menuText = `${t(lang, 'config.panel_title')}\n\n`;
    menuText += `${t(lang, 'config.panel_desc')}\n\n`;
    menuText += `📌 *Prefixo atual:* \`${currentPrefix}\` | 🌐 *Idioma:* \`${lang.toUpperCase()}\`\n`;
    menuText += `─────────────────────────\n`;

    const nameMap = localizedModuleNames[lang] || localizedModuleNames.pt;

    modules.forEach((mod, index) => {
      const statusIcon = mod.enabled ? '🟢 [ON]' : '🔴 [OFF]';
      const displayName = nameMap[mod.name] || mod.name.toUpperCase();
      menuText += `*[${index + 1}]* ${statusIcon} *${displayName}*\n`;
      if (mod.desc) menuText += `    _${mod.desc}_\n`;
    });

    menuText += `─────────────────────────\n`;
    menuText += `💡 *Exemplos rápidos:*\n`;
    menuText += `• Digite *1* para ativar/desativar ou configurar o módulo 1\n`;
    menuText += `• Digite *P /* para mudar o prefixo para /\n`;
    menuText += `• Digite *L* para mudar o idioma\n`;
    menuText += `• Digite *X* para apagar e fechar o menu`;

    const session = {
      type: 'config_menu',
      groupJid: from,
      sender,
      modules
    };

    const sessionKey = `${from}:${sender}`;
    wizardCache.set(sessionKey, session);

    const sentMsg = await sendSafeMessage(sock, from, { text: menuText }, { quoted: msg });
    if (sentMsg?.key) {
      session.menuMsgKey = sentMsg.key;
      session.promptKeys = [sentMsg.key];
      wizardCache.set(sessionKey, session);
    }
    return true;
  }

  /**
   * Inicia o fluxo interativo de seleção de idioma (!idioma)
   * @param {object} sock 
   * @param {object} msg 
   * @param {string} from 
   * @param {string} sender 
   */
  async startLangSelection(sock, msg, from, sender) {
    const sessionKey = `${from}:${sender}`;

    const promptText = `🌐 *SELEÇÃO DE IDIOMA - HERMES*\n\n` +
      `Escolha o novo idioma do grupo:\n\n` +
      `*[1]* 🇧🇷 Português\n` +
      `*[2]* 🇪🇸 Español\n` +
      `*[3]* 🇺🇸 English\n\n` +
      `Responda com *1*, *2* ou *3* (ou *X* para cancelar).`;

    const sent = await sendSafeMessage(sock, from, { text: promptText }, { quoted: msg });

    const session = {
      type: 'lang_selection',
      groupJid: from,
      sender,
      menuMsgKey: sent?.key,
      promptKeys: sent?.key ? [sent.key] : []
    };

    wizardCache.set(sessionKey, session);
    return true;
  }

  /**
   * Processa a entrada de texto do Admin que está em uma sessão ativa
   * @param {object} sock 
   * @param {object} msg 
   * @param {string} from 
   * @param {string} sender 
   * @param {string} rawText 
   * @returns {Promise<boolean>} Retorna true se a mensagem foi tratada pelo Wizard
   */
  async handleInput(sock, msg, from, sender, rawText) {
    let sessionKey = `${from}:${sender}`;
    let session = wizardCache.get(sessionKey);
    if (!session && msg) {
      const rawSender = msg?.key?.participant || msg?.participant;
      if (rawSender) {
        const altKey = `${from}:${cleanJid(rawSender)}`;
        session = wizardCache.get(altKey);
        if (session) sessionKey = altKey;
      }
    }
    if (!session) return false;

    const text = (rawText || '').trim();
    const lang = configManager.getGroupLang(from);

    // Cancelamento expresso: apaga todos os menus/prompts e a mensagem do usuário
    if (['x', 'cancelar', 'sair'].includes(text.toLowerCase())) {
      const keysToDelete = [];
      if (session.menuMsgKey) keysToDelete.push(session.menuMsgKey);
      if (Array.isArray(session.promptKeys)) {
        for (const pk of session.promptKeys) {
          if (pk?.id && !keysToDelete.some(k => k.id === pk.id)) {
            keysToDelete.push(pk);
          }
        }
      }
      for (const k of keysToDelete) {
        try {
          await safeDelete(sock, from, k);
        } catch (_) {}
      }
      if (msg?.key) {
        try {
          await safeDelete(sock, from, msg.key);
        } catch (_) {}
      }
      wizardCache.del(sessionKey);
      return true;
    }

    // ==========================================
    // Filtro Inteligente de Conversa Paralela
    // ==========================================
    const isChoiceStep = session.type === 'config_menu' || 
      session.type === 'lang_selection' ||
      (session.type === 'wizard' && ['choice', 'boolean'].includes(session.schema?.fields?.[session.stepIndex]?.type));
    
    const hasMentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0;

    if (isChoiceStep && (text.length > 20 || hasMentions)) {
      // Ignora silenciosamente conversa paralela do admin no grupo sem poluir o chat
      return true;
    }

    // Processa de acordo com o tipo de sessão
    if (session.type === 'config_menu') {
      return await this._handleConfigMenuInput(sock, msg, from, sender, text, session, lang);
    }

    if (session.type === 'lang_selection') {
      return await this._handleLangSelectionInput(sock, msg, from, sender, text, session, lang);
    }

    if (session.type === 'wizard') {
      return await this._handleWizardStepInput(sock, msg, from, sender, text, session, lang);
    }

    return false;
  }

  async _handleConfigMenuInput(sock, msg, from, sender, text, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const upper = text.toUpperCase();

    // Troca de Prefixo: [P] [novo_prefixo]
    if (upper.startsWith('P ') || upper === 'P') {
      const parts = text.split(/\s+/);
      const newPrefix = parts[1];
      if (newPrefix && newPrefix.length <= 3) {
        configManager.setGroupPrefix(from, newPrefix);
        wizardCache.del(sessionKey);
        await sendSafeMessage(sock, from, { 
          text: t(lang, 'config.prefix_changed', { prefix: newPrefix }) 
        }, { quoted: msg });
        return true;
      }
    }

    // Troca de Idioma: [L] ou [L 1], [L pt], etc.
    if (upper === 'L' || upper.startsWith('L ')) {
      const parts = text.split(/\s+/);
      const chosen = (parts[1] || '').toLowerCase();

      let targetLang = null;
      if (['1', 'pt', 'br', 'portugues', 'português'].includes(chosen)) targetLang = 'pt';
      else if (['2', 'es', 'espanhol', 'español'].includes(chosen)) targetLang = 'es';
      else if (['3', 'en', 'ingles', 'inglês', 'english'].includes(chosen)) targetLang = 'en';

      if (targetLang) {
        configManager.setGroupLang(from, targetLang);
        wizardCache.del(sessionKey);
        await sendSafeMessage(sock, from, { 
          text: t(targetLang, 'lang.changed') 
        }, { quoted: msg });
        return true;
      }

      // Transiciona a sessão para seleção de idioma interativa sem perder o contexto
      session.type = 'lang_selection';
      const promptText = `🌐 *SELEÇÃO DE IDIOMA - HERMES*\n\n` +
        `Escolha o novo idioma do grupo:\n\n` +
        `*[1]* 🇧🇷 Português\n` +
        `*[2]* 🇪🇸 Español\n` +
        `*[3]* 🇺🇸 English\n\n` +
        `Responda com *1*, *2* ou *3* (ou *X* para cancelar).`;

      const sent = await sendSafeMessage(sock, from, { text: promptText }, { quoted: msg });
      if (sent?.key) {
        session.menuMsgKey = sent.key;
        session.promptKeys = session.promptKeys || [];
        session.promptKeys.push(sent.key);
      }
      wizardCache.set(sessionKey, session);
      return true;
    }

    // Seleção de módulo por número (suporta "1", "1 on", "1 off")
    const parts = text.split(/\s+/);
    const selectedNum = parseInt(parts[0], 10);
    if (!isNaN(selectedNum) && selectedNum >= 1 && selectedNum <= session.modules.length) {
      const mod = session.modules[selectedNum - 1];
      const subAction = (parts[1] || '').toLowerCase();

      if (subAction === 'on' || subAction === 'ativar' || subAction === 'activar') {
        configManager.setPluginEnabled(from, mod.name, true);
        wizardCache.del(sessionKey);
        await sendSafeMessage(sock, from, { 
          text: `🟢 *${mod.name.toUpperCase()}* foi *ATIVADO* no grupo.` 
        }, { quoted: msg });
        return true;
      }

      if (subAction === 'off' || subAction === 'desativar') {
        configManager.setPluginEnabled(from, mod.name, false);
        wizardCache.del(sessionKey);
        await sendSafeMessage(sock, from, { 
          text: `🔴 *${mod.name.toUpperCase()}* foi *DESATIVADO* no grupo.` 
        }, { quoted: msg });
        return true;
      }

      wizardCache.del(sessionKey);
      // Inicia o Wizard de configuração do módulo escolhido
      await this.startWizard(sock, msg, from, sender, mod.name);
      return true;
    }

    // Entrada inválida no menu
    await sendSafeMessage(sock, from, { text: t(lang, 'config.invalid_option') }, { quoted: msg });
    return true;
  }

  async _handleLangSelectionInput(sock, msg, from, sender, text, session, _lang) {
    const sessionKey = `${from}:${sender}`;
    const lower = text.toLowerCase().trim();

    let targetLang = null;
    if (['1', 'pt', 'br', 'portugues', 'português'].includes(lower)) targetLang = 'pt';
    else if (['2', 'es', 'espanhol', 'español'].includes(lower)) targetLang = 'es';
    else if (['3', 'en', 'ingles', 'inglês', 'english'].includes(lower)) targetLang = 'en';

    if (!targetLang) {
      await sendSafeMessage(sock, from, {
        text: `⚠️ Opção inválida.\nEscolha *1* (Português), *2* (Español), *3* (English) ou envie *X* para cancelar.`
      }, { quoted: msg });
      return true;
    }

    configManager.setGroupLang(from, targetLang);
    wizardCache.del(sessionKey);

    // Apaga o menu de idiomas anterior para manter o chat limpo
    if (session.menuMsgKey) {
      try {
        await safeDelete(sock, from, session.menuMsgKey);
      } catch (_) {}
    }

    await sendSafeMessage(sock, from, {
      text: t(targetLang, 'lang.changed')
    }, { quoted: msg });

    return true;
  }

  async _handleWizardStepInput(sock, msg, from, sender, text, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const currentField = session.schema.fields[session.stepIndex];
    if (!currentField) return false;

    let finalValue = null;

    // Validação por tipo de campo (sem atalho de ponto)
    switch (currentField.type) {
      case 'choice': {
        const choiceIndex = parseInt(text, 10);
        if (!isNaN(choiceIndex) && choiceIndex >= 1 && choiceIndex <= currentField.choices.length) {
          finalValue = currentField.choices[choiceIndex - 1].value;
        } else {
          // Tenta match direto por string do valor
          const found = currentField.choices.find(c => String(c.value).toLowerCase() === text.toLowerCase());
          if (found) finalValue = found.value;
        }
        break;
      }

      case 'boolean': {
        const lower = text.toLowerCase().trim();
        if (['sim', 's', 'yes', 'y', 'true', 'on', 'ativo', 'ativar', '1'].includes(lower)) {
          finalValue = true;
        } else if (['não', 'nao', 'n', 'no', 'false', 'off', 'inativo', 'desativar', '2'].includes(lower)) {
          finalValue = false;
        }
        break;
      }

      case 'number': {
        // Aceita formatos: "10m", "2h", "180" ou número bare
        let parsed = NaN;
        const lower = text.toLowerCase().trim();
        if (/^\d+h$/i.test(lower)) {
          parsed = parseInt(lower) * 60; // horas → minutos
        } else if (/^\d+m$/i.test(lower)) {
          parsed = parseInt(lower);
        } else {
          parsed = parseInt(text, 10);
        }
        if (!isNaN(parsed)) {
          const min = currentField.min !== undefined ? currentField.min : -Infinity;
          const max = currentField.max !== undefined ? currentField.max : Infinity;
          if (parsed >= min && parsed <= max) {
            finalValue = parsed;
          } else {
            // Fora do range — informa e permanece no passo
            const rangeInfo = (currentField.min !== undefined || currentField.max !== undefined)
              ? ` (mínimo: ${currentField.min || 0}, máximo: ${currentField.max || '∞'})`
              : '';
            await sendSafeMessage(sock, from, {
              text: `⚠️ Valor fora do intervalo permitido${rangeInfo}. Tente novamente.`
            }, { quoted: msg });
            return true;
          }
        }
        break;
      }

      case 'string': {
        if (text.length > 0) {
          finalValue = text;
        }
        break;
      }

      case 'domain_list': {
        // "nenhum", "todos", "bloquear" ou "bloqueartodos" → lista vazia (bloqueia tudo)
        if (['nenhum', 'todos', 'bloquear', 'bloqueartodos', 'none', 'all'].includes(text.toLowerCase().trim())) {
          finalValue = [];
        } else {
          finalValue = text.split(/[\s,;]+/)
            .map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim())
            .filter(d => d.length > 0 && d.includes('.'));
          if (finalValue.length === 0) {
            finalValue = null; // Entrada inválida
          }
        }
        break;
      }

      case 'string_list': {
        finalValue = text.split(/[\s,;]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        break;
      }

      default:
        finalValue = text;
        break;
    }

    // Se a entrada foi inválida
    if (finalValue === null || finalValue === undefined) {
      await sendSafeMessage(sock, from, { 
        text: t(lang, 'wizard.invalid_input')
      }, { quoted: msg });
      return true;
    }

    // Salva resposta do campo
    session.answers[currentField.name] = finalValue;
    session.stepIndex += 1;

    // Próximo passo ou conclusão
    if (session.stepIndex < session.schema.fields.length) {
      wizardCache.set(sessionKey, session);
      await this._sendStepPrompt(sock, msg, from, sender, session, lang);
    } else {
      // Wizard concluído! Aplica Shallow Merge Não-Destrutivo
      configManager.updatePluginConfig(from, session.pluginName, session.answers);
      wizardCache.del(sessionKey);

      let summaryText = `${t(lang, 'wizard.finished', { plugin: session.pluginName.toUpperCase() })}\n\n`;
      summaryText += `📋 *Resumo das configurações salvas:*\n`;
      for (const [key, val] of Object.entries(session.answers)) {
        const valDisplay = Array.isArray(val) ? (val.length ? val.join(', ') : 'Nenhum') : String(val);
        summaryText += `• *${key}:* \`${valDisplay}\`\n`;
      }
      summaryText += `\n${t(lang, 'common.saved')}`;

      await sendSafeMessage(sock, from, { text: summaryText }, { quoted: msg });
    }

    return true;
  }

  async _sendStepPrompt(sock, msg, from, sender, session, lang) {
    const sessionKey = `${session.groupJid}:${session.sender}`;
    const field = session.schema.fields[session.stepIndex];
    const stepNum = session.stepIndex + 1;
    const totalSteps = session.schema.fields.length;

    let prompt = `${t(lang, 'wizard.step_header', { 
      plugin: session.pluginName.toUpperCase(), 
      step: stepNum, 
      total: totalSteps 
    })}\n\n`;

    prompt += `❓ *${resolveSchemaText(field.question, lang)}*\n\n`;

    if (field.type === 'choice' && Array.isArray(field.choices)) {
      const choicesStr = field.choices.map((c, i) => `*[${i + 1}]* ${resolveSchemaText(c.label, lang)}`).join('\n');
      prompt += `${choicesStr}\n\n`;
    } else if (field.type === 'boolean') {
      prompt += `${t(lang, 'wizard.boolean_prompt')}\n\n`;
    }

    const currentVal = session.existingConfig[field.name];
    if (currentVal !== undefined) {
      const displayVal = Array.isArray(currentVal) ? (currentVal.join(', ') || 'Nenhum') : String(currentVal);
      prompt += `${t(lang, 'wizard.current_val', { current: displayVal })}\n`;
    } else if (field.default !== undefined) {
      const displayDef = Array.isArray(field.default) ? (field.default.join(', ') || 'Nenhum') : String(field.default);
      prompt += `📌 *Valor padrão:* \`${displayDef}\`\n`;
    }

    prompt += `❌ Envie *X* a qualquer momento para cancelar.`;

    const sentPrompt = await sendSafeMessage(sock, from, { text: prompt }, { quoted: msg });
    if (sentPrompt?.key) {
      session.menuMsgKey = sentPrompt.key;
      session.promptKeys = session.promptKeys || [];
      session.promptKeys.push(sentPrompt.key);
      wizardCache.set(sessionKey, session);
    }
  }
}

const wizardEngine = new WizardEngine();
module.exports = wizardEngine;
