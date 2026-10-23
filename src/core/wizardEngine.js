const { wizardCache } = require('../utils/cache');
const { sendSafeMessage, safeDelete } = require('../utils/antiBan');
const { cleanJid, getGroupMetadata } = require('../utils/jidResolver');
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
   * @param {number|null} targetFieldIndex Se especificado, edita apenas a etapa solicitada
   */
  async startWizard(sock, msg, from, sender, pluginName, targetFieldIndex = null) {
    const schema = pluginLoader.schemas.get(pluginName.toLowerCase());
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      return false;
    }

    const lang = configManager.getGroupLang(from);
    const existingConfig = configManager.getPluginConfig(from, pluginName) || {};
    const sessionKey = `${from}:${sender}`;

    // Se uma etapa específica foi solicitada diretamente via parâmetro:
    if (targetFieldIndex !== null && typeof targetFieldIndex === 'number') {
      const session = {
        type: 'wizard',
        pluginName: pluginName.toLowerCase(),
        stepIndex: targetFieldIndex,
        singleStep: true,
        answers: {},
        existingConfig,
        schema,
        groupJid: from,
        sender
      };
      wizardCache.set(sessionKey, session);
      await this._sendStepPrompt(sock, msg, from, sender, session, lang);
      return true;
    }

    // Se JÁ FOI CONFIGURADO ANTERIORMENTE (configured === true) e possui mais de 1 etapa:
    // Exibe o menu para o usuário escolher qual etapa deseja alterar ou [T] para todas.
    const isAlreadyConfigured = existingConfig.configured === true;

    if (isAlreadyConfigured && schema.fields.length > 1) {
      const session = {
        type: 'wizard_select_field',
        pluginName: pluginName.toLowerCase(),
        existingConfig,
        schema,
        groupJid: from,
        sender
      };
      wizardCache.set(sessionKey, session);
      await this._sendFieldSelectionPrompt(sock, msg, from, sender, session, lang);
      return true;
    }

    // ROTEIRO PADRÃO (Primeira configuração OU módulo de apenas 1 etapa):
    // Segue o roteiro passo a passo sequencial desde o início (Passo 1 -> Passo 2 -> ...)
    const session = {
      type: 'wizard',
      pluginName: pluginName.toLowerCase(),
      stepIndex: 0,
      singleStep: false,
      answers: {},
      existingConfig,
      schema,
      groupJid: from,
      sender
    };

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

    let groupName = 'Grupo';
    let membersCount = 0;
    if (from.endsWith('@g.us')) {
      try {
        const meta = await getGroupMetadata(sock, from);
        groupName = meta?.subject || 'Grupo';
        membersCount = meta?.participants?.length || 0;
      } catch (_) {}
    }

    // Lista plugins que possuem schema ou são configuráveis
    const preferredOrder = ['antifake', 'antiflood', 'antilink', 'automsg', 'ban', 'schedule', 'warn', 'welcome'];
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

    modules.sort((a, b) => {
      const indexA = preferredOrder.indexOf(a.name);
      const indexB = preferredOrder.indexOf(b.name);
      return (indexA !== -1 ? indexA : 99) - (indexB !== -1 ? indexB : 99);
    });

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

    let menuText = `⚙️ PAINEL DE CONFIGURAÇÕES - HERMES\n\n`;
    menuText += `Responda com o NÚMERO do módulo para ativar/desativar ou configurar:\n`;
    menuText += `Ou digite:\n`;
    menuText += `* [P] [novo_prefixo] para trocar o prefixo (Ex: P /)\n`;
    menuText += `* [L] para trocar o idioma\n`;
    menuText += `* [X] para apagar e fechar o menu\n\n`;
    menuText += `📌 Prefixo atual: ${currentPrefix} | 🌐 Idioma: ${lang.toUpperCase()}\n`;
    if (from.endsWith('@g.us')) {
      menuText += `👥 *Grupo:* ${groupName} (${membersCount} membros)\n`;
    }
    menuText += `\n─────────────────────────\n`;

    const nameMap = localizedModuleNames[lang] || localizedModuleNames.pt;

    modules.forEach((mod, index) => {
      const statusIcon = mod.enabled ? '🟢 [ON]' : '🔴 [OFF]';
      const displayName = nameMap[mod.name] || mod.name.toUpperCase();
      menuText += `[${index + 1}] ${statusIcon} ${displayName}\n`;
      if (mod.desc) menuText += `    ${mod.desc}\n`;
    });

    // Coleta dinâmica dos comandos utilitários e de moderação direta
    const otherTitle = {
      pt: '🛠️ *OUTROS COMANDOS DO BOT:*',
      es: '🛠️ *OTROS COMANDOS DEL BOT:*',
      en: '🛠️ *OTHER BOT COMMANDS:*'
    }[lang] || '🛠️ *OUTROS COMANDOS DO BOT:*';

    const directCommandsOrder = ['hidetag', 'promote', 'demote', 'ban', 'mute', 'del', 'warn', 'sortear', 'blacklist', 'idioma', 'ping'];
    const directCommands = [];
    for (const [name, plugin] of pluginLoader.commands.entries()) {
      if (plugin.category === 'owner' || plugin.ownerOnly) continue;
      if (['menu', 'config'].includes(name)) continue;

      const isUtility = !plugin.configSchema || ['ban', 'warn'].includes(name);
      if (!isUtility) continue;

      const usage = plugin.usage || plugin.aliases?.[0] || plugin.name;
      const desc = typeof plugin.description === 'object' 
        ? (plugin.description[lang] || plugin.description.pt) 
        : (plugin.description || '');

      const cmdNum = plugin.cmdNumber || pluginLoader.getCommandNumber(name);
      directCommands.push({
        name,
        num: cmdNum,
        usage: `${currentPrefix}${usage}`,
        desc
      });
    }

    directCommands.sort((a, b) => {
      const idxA = directCommandsOrder.indexOf(a.name);
      const idxB = directCommandsOrder.indexOf(b.name);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    if (directCommands.length > 0) {
      menuText += `─────────────────────────\n`;
      menuText += `${otherTitle}\n`;
      directCommands.forEach(cmd => {
        const numLabel = cmd.num ? `[${cmd.num}] ` : '';
        menuText += `* ${numLabel}*${cmd.usage}* - ${cmd.desc}\n`;
      });
    }

    menuText += `─────────────────────────\n`;
    menuText += `💡 Exemplos rápidos:\n`;
    menuText += `* Digite 1 a 8 para ativar/desativar ou configurar os módulos no painel\n`;
    menuText += `* Use os números com a barra direto no chat (Ex: /5 @user dá ban, /9 aviso marca todos, /10 @user dá adm, /17 dá ping)\n`;
    menuText += `* Digite P / para mudar o prefixo para /\n`;
    menuText += `* Digite L para mudar o idioma\n`;
    menuText += `* Digite X para apagar e fechar o menu\n`;
    menuText += `* Ou mencione o bot para enviar comandos (Ex: @bot 5 @user ou @bot menu)`;

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
      session.type === 'wizard_select_field' ||
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

    if (session.type === 'wizard_select_field') {
      return await this._handleFieldSelectionInput(sock, msg, from, sender, text, session, lang);
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

  async _sendFieldSelectionPrompt(sock, msg, from, sender, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const pTitle = resolveSchemaText(session.schema.title || session.pluginName, lang);

    let text = `🧙‍♂️ *CONFIGURAÇÃO: ${pTitle.toUpperCase()}*\n\n`;
    text += `Escolha qual etapa você deseja alterar:\n\n`;

    session.schema.fields.forEach((field, idx) => {
      const qText = resolveSchemaText(field.question, lang).split('\n')[0].replace(/[?:]/g, '');
      const currentVal = session.existingConfig[field.name];
      let displayVal = 'Padrão';
      if (currentVal !== undefined) {
        if (field.type === 'choice' && Array.isArray(field.choices)) {
          const matchChoice = field.choices.find(c => c.value === currentVal);
          displayVal = matchChoice ? resolveSchemaText(matchChoice.label, lang) : String(currentVal);
        } else if (Array.isArray(currentVal)) {
          displayVal = currentVal.join(', ') || 'Nenhum';
        } else {
          displayVal = String(currentVal);
        }
      }
      text += `*[${idx + 1}]* 📝 *${qText}*\n`;
      text += `    📌 _Atual: \`${displayVal}\`_\n\n`;
    });

    text += `*[T]* 🔄 *Reconfigurar Todas as Etapas*\n`;
    text += `*[X]* ❌ *Cancelar e Fechar*\n\n`;
    text += `👉 Responda com o *NÚMERO* da etapa que deseja alterar.`;

    const sent = await sendSafeMessage(sock, from, { text }, { quoted: msg });
    if (sent?.key) {
      session.menuMsgKey = sent.key;
      session.promptKeys = session.promptKeys || [];
      session.promptKeys.push(sent.key);
      wizardCache.set(sessionKey, session);
    }
  }

  async _handleFieldSelectionInput(sock, msg, from, sender, text, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const lower = text.toLowerCase().trim();

    // Reconfigurar todas as etapas sequencialmente
    if (['t', 'todos', 'all', 'tudo', 'todas'].includes(lower)) {
      session.type = 'wizard';
      session.stepIndex = 0;
      session.singleStep = false;
      session.answers = {};
      wizardCache.set(sessionKey, session);
      await this._sendStepPrompt(sock, msg, from, sender, session, lang);
      return true;
    }

    // Seleção de etapa específica por número
    const selectedNum = parseInt(text, 10);
    if (!isNaN(selectedNum) && selectedNum >= 1 && selectedNum <= session.schema.fields.length) {
      const targetIndex = selectedNum - 1;
      session.type = 'wizard';
      session.stepIndex = targetIndex;
      session.singleStep = true;
      session.answers = {};
      wizardCache.set(sessionKey, session);
      await this._sendStepPrompt(sock, msg, from, sender, session, lang);
      return true;
    }

    await sendSafeMessage(sock, from, {
      text: `⚠️ Opção inválida. Escolha o número da etapa (1 a ${session.schema.fields.length}), *T* para todas ou *X* para cancelar.`
    }, { quoted: msg });
    return true;
  }

  async _handleWizardStepInput(sock, msg, from, sender, text, session, lang) {
    const sessionKey = `${from}:${sender}`;
    const currentField = session.schema.fields[session.stepIndex];
    if (!currentField) return false;

    let finalValue = null;
    const trimmed = text.trim();
    const isKeepCurrent = ['.', 'padrao', 'padrão', 'default', 'todos', 'manter', 'keep', 'pular', 'skip', 'ok', 'atual'].includes(trimmed.toLowerCase());

    // 1. Manter valor atual sem alterar
    if (isKeepCurrent) {
      if (session.existingConfig[currentField.name] !== undefined) {
        finalValue = session.existingConfig[currentField.name];
      } else if (currentField.default !== undefined) {
        finalValue = currentField.default;
      } else {
        finalValue = currentField.type === 'choice' ? currentField.choices?.[0]?.value : '';
      }
    } else {
      // 2. Validação por tipo de campo
      switch (currentField.type) {
        case 'choice': {
          const choiceIndex = parseInt(text, 10);
          if (!isNaN(choiceIndex) && choiceIndex >= 1 && choiceIndex <= currentField.choices.length) {
            finalValue = currentField.choices[choiceIndex - 1].value;
          } else {
            // Suporte inteligente a tempo se as choices forem de tempo (ex: 1m, 2m, 30s)
            const lowText = text.toLowerCase().trim();
            if (['1m', '1 min', '1 minuto', '60s', '60'].includes(lowText)) {
              const c = currentField.choices.find(c => c.value === 60);
              if (c) finalValue = c.value;
            } else if (['30s', '30 seg', '30 segundos', '30'].includes(lowText)) {
              const c = currentField.choices.find(c => c.value === 30);
              if (c) finalValue = c.value;
            } else if (['2m', '2 min', '2 minutos', '120s', '120'].includes(lowText)) {
              const c = currentField.choices.find(c => c.value === 120);
              if (c) finalValue = c.value;
            } else if (['5m', '5 min', '5 minutos', '300s', '300'].includes(lowText)) {
              const c = currentField.choices.find(c => c.value === 300);
              if (c) finalValue = c.value;
            } else if (['0', 'nao', 'não', 'nunca', 'desativado', 'desativar', 'permanente'].includes(lowText)) {
              const c = currentField.choices.find(c => c.value === 0);
              if (c) finalValue = c.value;
            }

            if (finalValue === null) {
              // Tenta match direto por string do valor
              const found = currentField.choices.find(c => String(c.value).toLowerCase() === text.toLowerCase());
              if (found) finalValue = found.value;
            }
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
          if (['nenhum', 'todos', 'bloquear', 'bloqueartodos', 'none', 'all'].includes(text.toLowerCase().trim())) {
            finalValue = [];
          } else {
            finalValue = text.split(/[\s,;]+/)
              .map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim())
              .filter(d => d.length > 0 && d.includes('.'));
            if (finalValue.length === 0) {
              finalValue = null;
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

    // Se era apenas uma única etapa selecionada pelo menu de etapas:
    if (session.singleStep) {
      configManager.updatePluginConfig(from, session.pluginName, session.answers);
      wizardCache.del(sessionKey);

      let summaryText = `${t(lang, 'wizard.finished', { plugin: session.pluginName.toUpperCase() })}\n\n`;
      summaryText += `📋 *Configuração atualizada com sucesso:*\n`;
      const valDisplay = Array.isArray(finalValue) ? (finalValue.length ? finalValue.join(', ') : 'Nenhum') : String(finalValue);
      summaryText += `• *${currentField.name}:* \`${valDisplay}\`\n\n`;
      summaryText += `${t(lang, 'common.saved')}`;

      await sendSafeMessage(sock, from, { text: summaryText }, { quoted: msg });
      return true;
    }

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
      let displayVal = Array.isArray(currentVal) ? (currentVal.join(', ') || 'Nenhum') : String(currentVal);
      if (field.type === 'choice' && Array.isArray(field.choices)) {
        const matchChoice = field.choices.find(c => c.value === currentVal);
        if (matchChoice) displayVal = resolveSchemaText(matchChoice.label, lang);
      }
      prompt += `${t(lang, 'wizard.current_val', { current: displayVal })}\n`;
      prompt += `💡 *Dica:* Envie *.* (ponto) para MANTER o valor atual.\n\n`;
    } else if (field.default !== undefined) {
      let displayDef = Array.isArray(field.default) ? (field.default.join(', ') || 'Nenhum') : String(field.default);
      if (field.type === 'choice' && Array.isArray(field.choices)) {
        const matchDef = field.choices.find(c => c.value === field.default);
        if (matchDef) displayDef = resolveSchemaText(matchDef.label, lang);
      }
      prompt += `📌 *Valor padrão:* \`${displayDef}\`\n`;
      prompt += `💡 *Dica:* Envie *.* (ponto) para USAR o valor padrão.\n\n`;
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
