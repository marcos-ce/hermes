const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const aiService = require('../../services/aiService');
const memoryEngine = require('../../services/memoryEngine');
const toolRegistry = require('../../services/toolRegistry');
const { cleanJid, getGroupMetadata } = require('../../utils/jidResolver');
const { checkCooldown } = require('../../utils/antiBan');
const logger = require('../../utils/logger');

module.exports = {
  name: 'hermes',
  cmdNumber: 23,
  aliases: ['hermes', 'ia', 'ai', 'agente', 'agent'],
  usage: 'hermes [on|off|config|status|pergunta]',
  description: 'Agente de Inteligência Artificial oficial DeepSeek para auxílio e moderação',
  ownerOnly: false,
  adminOnly: false, // Permite perguntas via /ia <pergunta>; subcomandos de config checam admin internamente
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Agente de IA Hermes (DeepSeek)',
      es: 'Agente de IA Hermes (DeepSeek)',
      en: 'Hermes AI Agent (DeepSeek)'
    },
    description: {
      pt: 'Inteligência Artificial oficial da DeepSeek com Tool Calling e memória contextual',
      es: 'Inteligencia Artificial oficial de DeepSeek con Tool Calling y memoria contextual',
      en: 'Official DeepSeek AI with Tool Calling and contextual memory'
    },
    fields: [
      {
        name: 'personality',
        type: 'choice',
        question: {
          pt: 'Qual personalidade o Hermes deve adotar no grupo?',
          es: '¿Qué personalidad debe adoptar Hermes en el grupo?',
          en: 'What personality should Hermes adopt in the group?'
        },
        choices: [
          {
            value: 'descontraido',
            label: {
              pt: 'Descontraído (rápido, informal, gírias leves do WhatsApp)',
              es: 'Relajado (rápido, informal, estilo WhatsApp)',
              en: 'Casual (fast, informal, WhatsApp style)'
            }
          },
          {
            value: 'formal',
            label: {
              pt: 'Formal (educado, objetivo e profissional)',
              es: 'Formal (educado, objetivo y profesional)',
              en: 'Formal (polite, objective and professional)'
            }
          }
        ],
        default: 'descontraido'
      },
      {
        name: 'memoryEnabled',
        type: 'boolean',
        question: {
          pt: 'Manter memória local das últimas conversas do grupo?',
          es: '¿Mantener memoria local de las últimas conversaciones del grupo?',
          en: 'Maintain local memory of recent group conversations?'
        },
        default: true
      }
    ]
  },

  /**
   * Execução de comandos manuais do plugin (!hermes, !ia)
   */
  async execute({ sock, msg, from, sender, args, text, reply, t, lang, isGroup, isAdmin, isOwner }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'hermes') || {};
    const groupPrefix = configManager.getGroupPrefix(from) || '!';

    // 1. Subcomandos restritos a administradores
    if (['on', 'ativar', 'activar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      configManager.setPluginEnabled(from, 'hermes', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
      }

      const personality = cfg.personality || 'descontraido';
      const memStatus = cfg.memoryEnabled !== false ? 'Ativa' : 'Desativada';

      return reply(
        `🤖 *Hermes IA:* ATIVADO com sucesso!\n` +
        `🎭 *Personalidade:* \`${personality}\`\n` +
        `🧠 *Memória Local:* \`${memStatus}\`\n\n` +
        `👉 Para conversar, envie *@hermes*, chame por *hermes* ou responda a qualquer mensagem minha!`
      );
    }

    if (['off', 'desativar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      configManager.setPluginEnabled(from, 'hermes', false);
      return reply('🛑 *Hermes IA:* DESATIVADO neste grupo.\nAs configurações foram preservadas.');
    }

    if (['config', 'wizard', 'setup'].includes(sub) || (!sub && (isAdmin || isOwner))) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
    }

    if (['limpar', 'clear', 'reset', 'zerar'].includes(sub)) {
      if (!isAdmin && !isOwner) return reply(t('common.no_permission_admin'));
      memoryEngine.clearGroupMemory(from);
      return reply('🧹 *Memória limpa:* O histórico de contexto deste grupo foi zerado.');
    }

    // 2. Exibir status detalhado: /hermes status
    if (sub === 'status' || sub === 'info') {
      const isEnabled = configManager.isPluginEnabled(from, 'hermes');
      const stats = memoryEngine.getGroupStats(from);
      const isConfigured = aiService.isConfigured();

      let info = `🤖 *STATUS DO HERMES IA*\n\n`;
      info += `🟢 *Estado no grupo:* ${isEnabled ? '✅ ATIVADO' : '❌ DESATIVADO (use ' + groupPrefix + 'hermes on)'}\n`;
      info += `🎭 *Personalidade:* \`${cfg.personality || 'descontraido'}\`\n`;
      info += `🧠 *Buffer de Memória:* ${stats.count} mensagens registradas\n`;
      info += `🔌 *Provedor:* \`${aiService.provider.toUpperCase()}\`\n`;
      info += `🧠 *Modelo:* \`${aiService.model}\`\n`;
      info += `🔑 *Chave de API:* ${isConfigured ? '✅ Configurada' : '❌ Não Configurada (.env)'}\n\n`;
      info += `💡 *Dica:* Envie *${groupPrefix}hermes on* para ativar ou *${groupPrefix}hermes config* para configurar.`;

      return reply(info);
    }

    // 3. Se o usuário enviou uma pergunta direta como comando: /hermes <pergunta> ou /ia <pergunta>
    const question = text.trim();
    if (question.length > 0) {
      if (!configManager.isPluginEnabled(from, 'hermes')) {
        return reply(`⚠️ O Hermes IA está desativado neste grupo.\n👉 Peça a um administrador para ativar enviando: *${groupPrefix}hermes on*`);
      }

      await this.processAIInteraction({
        sock,
        msg,
        from,
        sender,
        queryText: question,
        reply,
        lang,
        cfg
      });
      return;
    }

    return reply(`👉 Para falar comigo, mencione *@hermes*, digite *hermes [pergunta]* ou use *${groupPrefix}hermes status*.`);
  },

  /**
   * Hook passivo: monitora mensagens em tempo real no grupo
   * 1. Salva mensagens no buffer de memória local (R$ 0,00)
   * 2. Intercepta menções a @hermes, nome hermes ou respostas ao bot
   */
  async onMessage({ sock, msg, from, sender, text, reply, lang }) {
    if (!from || !from.endsWith('@g.us')) return false;

    // 1. Grava no buffer deslizante local silenciosamente (já passa pelo filtro anti-ruído)
    const senderName = msg.pushName || '';
    memoryEngine.saveMessage(from, sender, text, msg.messageTimestamp, senderName);

    // 2. Verificação ampla de endereçamento ao bot
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo;

    // A. Resposta direta (quote) a uma mensagem do bot:
    const quotedParticipant = cleanJid(contextInfo?.participant || '');
    const quotedNum = quotedParticipant.replace(/@.*$/, '').replace(/\D/g, '');
    const isReplyToBot = Boolean(
      contextInfo?.stanzaId && (
        quotedParticipant === botJid ||
        quotedParticipant === botLid ||
        (botNum && quotedNum === botNum) ||
        (botLidNum && quotedNum === botLidNum)
      )
    );

    // B. Menção nos metadados do WhatsApp (quando o usuário clica no contato do bot na lista)
    const mentionedJids = contextInfo?.mentionedJid || [];
    const isBotMentionedMeta = Array.isArray(mentionedJids) && mentionedJids.some(j => {
      const clean = cleanJid(j);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return clean === botJid || clean === botLid || (botNum && num === botNum);
    });

    // C. Menção no texto por nome: "@hermes", "@bot", ou iniciando por "hermes"
    const lowerText = (text || '').toLowerCase().trim();
    const hasNameTag = lowerText.includes('@hermes') || lowerText.includes('@bot');
    const startsWithName = /^hermes[\s,.:!?-]/i.test(lowerText) || lowerText === 'hermes';

    const isAddressed = isReplyToBot || isBotMentionedMeta || hasNameTag || startsWithName;

    // Se o bot não foi expressamente chamado, silêncio absoluto (não interfere nas conversas)
    if (!isAddressed) {
      return false;
    }

    const groupPrefix = configManager.getGroupPrefix(from) || '!';

    // 3. Se foi chamado expressamente MAS o plugin está desativado no grupo:
    if (!configManager.isPluginEnabled(from, 'hermes')) {
      await reply(
        `🤖 *Hermes IA está desativado neste grupo.*\n\n` +
        `👉 Para ativá-lo, um administrador deve enviar:\n` +
        `*${groupPrefix}hermes on* (ou *${groupPrefix}ia on*)`
      );
      return true;
    }

    // 4. Se a chave da API não estiver configurada no .env:
    if (!aiService.isConfigured()) {
      await reply(
        '⚠️ *Hermes IA:* A chave da DeepSeek não foi detectada no arquivo `.env` (`AI_API_KEY`).\n\n' +
        '👉 Adicione sua chave em `AI_API_KEY=sk-...` no `.env` e reinicie a aplicação na hospedagem.'
      );
      return true;
    }

    // 5. Anti-Spam / Rate Limit de 2s por usuário
    if (checkCooldown(sender, 2000)) {
      return true;
    }

    // 6. Limpa prefixos de chamada para enviar apenas a dúvida real ao modelo
    let cleanQuery = text
      .replace(/^hermes[\s,.:!?-]*/i, '')
      .replace(/@hermes\b/gi, '')
      .replace(/@bot\b/gi, '')
      .replace(/@\d{8,15}\b/g, '')
      .trim();

    // Se o usuário apenas chamou "hermes" ou "@hermes" sem escrever nada
    if (cleanQuery.length === 0 && !contextInfo?.quotedMessage) {
      const cfg = configManager.getPluginConfig(from, 'hermes') || {};
      const greeting = cfg.personality === 'formal'
        ? 'Olá! Como posso ajudar você ou o grupo agora?'
        : 'E aí! Fala comigo, como posso ajudar?';
      await reply(greeting);
      return true;
    }

    const cfg = configManager.getPluginConfig(from, 'hermes') || {};

    await this.processAIInteraction({
      sock,
      msg,
      from,
      sender,
      queryText: cleanQuery,
      reply,
      lang,
      cfg,
      contextInfo
    });

    return true; // Interrompe o pipeline com sucesso
  },

  /**
   * Processa a consulta com IA, contexto recente e execução de ferramentas
   */
  async processAIInteraction({ sock, msg, from, sender, queryText, reply, lang, cfg, contextInfo = null }) {
    const personality = cfg?.personality || 'descontraido';
    const memoryEnabled = cfg?.memoryEnabled !== false;

    // Busca o nome do grupo para o framing do sistema
    let groupName = '';
    try {
      const meta = await getGroupMetadata(sock, from);
      groupName = meta?.subject || '';
    } catch (_) {}

    // Monta o prompt do usuário com contexto e histórico limpos em uma única mensagem de diálogo
    const userPromptParts = [];

    // Se a mensagem cita outra mensagem anterior, adiciona o trecho citado
    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      const quotedContent = qm.conversation ||
                            qm.extendedTextMessage?.text ||
                            qm.imageMessage?.caption ||
                            qm.videoMessage?.caption || '';
      if (quotedContent) {
        userPromptParts.push(`[Mensagem citada/respondida]: "${quotedContent}"`);
      }
    }

    // Se a memória local estiver ativada, adiciona o histórico recente
    if (memoryEnabled) {
      const history = memoryEngine.getRecentMessages(from, 15);
      if (history.length > 0) {
        const historyText = history
          .map(h => `${h.name}: ${h.text}`)
          .join('\n');
        userPromptParts.push(`[Histórico recente de conversas]:\n${historyText}`);
      }
    }

    // Mensagem atual do usuário com identificador
    const senderDisplay = msg.pushName || sender.replace(/@.*$/, '').replace(/\D/g, '');
    userPromptParts.push(`${senderDisplay}: ${queryText}`);

    const messages = [
      {
        role: 'user',
        content: userPromptParts.join('\n\n')
      }
    ];

    try {
      // 1ª Chamada à API da DeepSeek com prefixo do grupo
      const prefix = configManager.getGroupPrefix(from) || '!';
      let aiResponse = await aiService.chatCompletion({
        messages,
        tools: toolRegistry.getTools(),
        personality,
        lang,
        groupName,
        prefix
      });

      // Se falhar e o erro for HTTP 400 (ex: formato de tools), tenta fallback sem tools
      if (!aiResponse.success && String(aiResponse.error).includes('400')) {
        logger.warn('DeepSeek retornou 400 com tools. Tentando fallback sem tools...');
        aiResponse = await aiService.chatCompletion({
          messages,
          tools: null,
          personality,
          lang,
          groupName,
          prefix
        });
      }

      if (!aiResponse.success) {
        logger.warn({ error: aiResponse.error }, 'Falha na resposta da DeepSeek');
        const err = String(aiResponse.error || '');

        if (err.includes('402') || err.toLowerCase().includes('insufficient') || err.toLowerCase().includes('balance')) {
          return reply(
            '⚠️ *DeepSeek API (402): Saldo Insuficiente!*\n\n' +
            'A sua conta na plataforma da DeepSeek precisa de recarga de créditos.\n' +
            '👉 Acesse *platform.deepseek.com/top_up* e adicione saldo para liberar as respostas da IA.'
          );
        }

        if (err.includes('401') || err.toLowerCase().includes('unauthorized') || err.toLowerCase().includes('invalid')) {
          return reply(
            '⚠️ *DeepSeek API (401): Chave Inválida!*\n\n' +
            'A chave `AI_API_KEY` configurada no `.env` foi rejeitada pela DeepSeek.\n' +
            '👉 Verifique se copiou a chave corretamente em *platform.deepseek.com/api_keys*.'
          );
        }

        if (err.includes('TIMEOUT')) {
          return reply('⏱️ A DeepSeek demorou mais de 15 segundos para responder (Timeout). Tente novamente!');
        }

        return reply(`⚠️ *Falha na DeepSeek:* ${err.slice(0, 150)}`);
      }

      // Se o modelo solicitou Tool Calls (ações no grupo)
      if (Array.isArray(aiResponse.toolCalls) && aiResponse.toolCalls.length > 0) {
        for (const toolCall of aiResponse.toolCalls) {
          logger.info({ toolCall, sender, from }, 'Executando Tool Call do Hermes');
          const execResult = await toolRegistry.executeTool({
            sock,
            msg,
            from,
            sender,
            toolName: toolCall.name,
            args: toolCall.arguments
          });

          // Se a ferramenta retornou mensagem de sucesso ou erro determinístico
          if (execResult.message) {
            await reply(`⚡ *Hermes:* ${execResult.message}`);
          } else if (execResult.error) {
            await reply(`⚠️ *Hermes:* ${execResult.error}`);
          }
        }
        return;
      }

      // Se o modelo gerou texto direto
      if (aiResponse.content && aiResponse.content.trim().length > 0) {
        await reply(aiResponse.content.trim());
      }
    } catch (err) {
      logger.error({ err }, 'Erro inesperado na interação do Hermes IA');
      return reply('Tive uma oscilação na conexão com minha IA. Tenta novamente em instantes!');
    }
  }
};
