const { wizardCache } = require('../utils/cache');
const { sendSafeMessage, safeDelete } = require('../utils/antiBan');
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
      wizardCache.set(sessionKey, session);
    }
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
    const sessionKey = `${from}:${sender}`;
    const session = wizardCache.get(sessionKey);
    if (!session) return false;

    const text = (rawText || '').trim();
    const lang = configManager.getGroupLang(from);

    // Cancelamento expresso: apaga o menu e a mensagem do usuário imediatamente
    if (text.toLowerCase() === 'x' || text.toLowerCase() === 'cancelar' || text.toLowerCase() === 'sair') {
      if (session.menuMsgKey) {
        try {
          await safeDelete(sock, from, session.menuMsgKey);
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

    // Troca de Idioma: [L]
    if (upper === 'L') {
      wizardCache.del(sessionKey);
      const langPlugin = pluginLoader.findCommand('idioma');
      if (langPlugin) {
        await langPlugin.execute({ sock, msg, from, sender, args: [], text: '', reply: (txt) => sendSafeMessage(sock, from, { text: txt }, { quoted: msg }), t: (k, v) => t(lang, k, v) });
      }
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

  async _handleWizardStepInput(sock, msg, from, sender, text, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const currentField = session.schema.fields[session.stepIndex];
    if (!currentField) return false;

    let finalValue = null;

    // Atalho: Manter atual ou assumir padrão com barra (/) ou ponto (.)
    const isDefaultShortcut = ['/', '.', 'padrao', 'padrão', 'default', 'todos', 'manter', 'pular'].includes(text.toLowerCase());

    if (isDefaultShortcut) {
      const savedVal = session.existingConfig[currentField.name];
      finalValue = savedVal !== undefined ? savedVal : currentField.default;
    } else {
      // Validação por tipo de campo
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
          const num = parseInt(text, 10);
          if (num === 1 || ['sim', 's', 'yes', 'y', 'true', 'on'].includes(text.toLowerCase())) {
            finalValue = true;
          } else if (num === 2 || ['nao', 'não', 'n', 'no', 'false', 'off'].includes(text.toLowerCase())) {
            finalValue = false;
          }
          break;
        }

        case 'number': {
          const parsed = parseInt(text, 10);
          if (!isNaN(parsed)) {
            const min = currentField.min !== undefined ? currentField.min : -Infinity;
            const max = currentField.max !== undefined ? currentField.max : Infinity;
            if (parsed >= min && parsed <= max) {
              finalValue = parsed;
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
          if (text === '.' || text.toLowerCase() === 'todos') {
            finalValue = [];
          } else {
            finalValue = text.split(/[\s,;]+/)
              .map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim())
              .filter(d => d.length > 0);
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
    }

    // Se a entrada foi inválida
    if (finalValue === null || finalValue === undefined) {
      await sendSafeMessage(sock, from, { 
        text: `${t(lang, 'wizard.invalid_input')}\n${t(lang, 'wizard.default_hint')}` 
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
      const displayVal = Array.isArray(currentVal) ? (currentVal.join(', ') || 'Nenhum') : currentVal;
      prompt += `${t(lang, 'wizard.current_val', { current: displayVal })}\n`;
    } else if (field.default !== undefined) {
      const displayDef = Array.isArray(field.default) ? (field.default.join(', ') || 'Nenhum') : field.default;
      prompt += `📌 *Valor padrão:* \`${displayDef}\`\n`;
    }

    prompt += `${t(lang, 'wizard.default_hint')}\n`;
    prompt += `❌ Envie *X* a qualquer momento para cancelar.`;

    const sentPrompt = await sendSafeMessage(sock, from, { text: prompt }, { quoted: msg });
    if (sentPrompt?.key) {
      session.menuMsgKey = sentPrompt.key;
      wizardCache.set(sessionKey, session);
    }
  }
}

const wizardEngine = new WizardEngine();
module.exports = wizardEngine;
