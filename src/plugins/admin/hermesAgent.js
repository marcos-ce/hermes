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
  adminOnly: true,
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

    // 1. Abrir o assistente interativo: /hermes config ou sem argumentos
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
    }

    // 2. Ativar o Hermes no grupo: /hermes on
    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'hermes', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'hermes');
      }

      const personality = cfg.personality || 'descontraido';
      const memStatus = cfg.memoryEnabled !== false ? 'Ativa' : 'Desativada';

      return reply(
        `🤖 *Hermes IA:* ATIVADO\n` +
        `🎭 *Personalidade:* \`${personality}\`\n` +
        `🧠 *Memória Local:* \`${memStatus}\`\n\n` +
        `👉 Marque *@hermes* em qualquer mensagem ou responda a uma mensagem minha para interagir!`
      );
    }

    // 3. Desativar o Hermes no grupo: /hermes off (Soft toggle - preserva configurações)
    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'hermes', false);
      return reply('🛑 *Hermes IA:* DESATIVADO neste grupo.\nAs configurações foram preservadas.');
    }

    // 4. Limpar memória de contexto do grupo: /hermes limpar
    if (['limpar', 'clear', 'reset', 'zerar'].includes(sub)) {
      memoryEngine.clearGroupMemory(from);
      return reply('🧹 *Memória limpa:* O histórico de contexto deste grupo foi zerado.');
    }

    // 5. Exibir status detalhado: /hermes status
    if (sub === 'status' || sub === 'info') {
      const isEnabled = configManager.isPluginEnabled(from, 'hermes');
      const stats = memoryEngine.getGroupStats(from);
      const isConfigured = aiService.isConfigured();

      let info = `🤖 *STATUS DO HERMES IA*\n\n`;
      info += `🟢 *Estado no grupo:* ${isEnabled ? 'ATIVADO' : 'DESATIVADO'}\n`;
      info += `🎭 *Personalidade:* \`${cfg.personality || 'descontraido'}\`\n`;
      info += `🧠 *Buffer de Memória:* ${stats.count} mensagens registradas\n`;
      info += `🔌 *Provedor:* \`${aiService.provider.toUpperCase()}\`\n`;
      info += `🧠 *Modelo:* \`${aiService.model}\`\n`;
      info += `🔑 *Chave de API:* ${isConfigured ? '✅ Configurada' : '❌ Não Configurada (.env)'}\n\n`;
      info += `💡 *Dica:* Envie *${t('common.prefix') || '/'}hermes config* para alterar a personalidade.`;

      return reply(info);
    }

    // 6. Se o usuário enviou uma pergunta direta como comando: /hermes <pergunta>
    const question = text.trim();
    if (question.length > 0) {
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

    return reply('👉 Use `/hermes on` para ativar, `/hermes off` para desativar ou `/hermes config` para configurar.');
  },

  /**
   * Hook passivo: monitora mensagens em tempo real no grupo
   * 1. Salva mensagens no buffer de memória local (R$ 0,00)
   * 2. Intercepta menções a @hermes ou respostas ao bot
   */
  async onMessage({ sock, msg, from, sender, text, reply, lang }) {
    if (!from || !from.endsWith('@g.us')) return false;

    // 1. Grava no buffer deslizante local silenciosamente
    const senderName = msg.pushName || '';
    memoryEngine.saveMessage(from, sender, text, msg.messageTimestamp, senderName);

    // 2. Se o plugin estiver desativado no grupo, encerra silenciosamente
    if (!configManager.isPluginEnabled(from, 'hermes')) {
      return false;
    }

    // 3. Verificação de endereçamento ao bot (Silêncio Absoluto por Padrão)
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

    // A. É resposta direta (quote) a uma mensagem do bot?
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

    // B. É menção expressa a @hermes?
    const lowerText = (text || '').toLowerCase();
    const hasHermesMention = lowerText.includes('@hermes');

    // C. O bot foi mencionado nos metadados e o texto chama "hermes" ou "bot"?
    const mentionedJids = contextInfo?.mentionedJid || [];
    const isBotMentionedMeta = Array.isArray(mentionedJids) && mentionedJids.some(j => {
      const clean = cleanJid(j);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return clean === botJid || clean === botLid || (botNum && num === botNum);
    });

    const isAddressed = isReplyToBot || hasHermesMention || (isBotMentionedMeta && (lowerText.includes('hermes') || lowerText.includes('bot')));

    // Se o bot não foi expressamente chamado, silêncio absoluto (não interfere nas conversas)
    if (!isAddressed) {
      return false;
    }

    // Anti-Spam / Rate Limit de 2s por usuário
    if (checkCooldown(sender, 2000)) {
      return true;
    }

    // Remove a tag de menção para extrair apenas a consulta real
    let cleanQuery = text
      .replace(/@hermes\b/gi, '')
      .replace(/@bot\b/gi, '')
      .replace(/@\d{8,15}\b/g, '')
      .trim();

    // Se o usuário apenas marcou "@hermes" sem escrever nada
    if (cleanQuery.length === 0 && !contextInfo?.quotedMessage) {
      const cfg = configManager.getPluginConfig(from, 'hermes') || {};
      const greeting = cfg.personality === 'formal'
        ? 'Olá! Como posso ajudar você na moderação ou no grupo?'
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
    if (!aiService.isConfigured()) {
      return reply(
        '⚠️ *Hermes IA:* Nenhuma chave de API configurada no `.env` (`AI_API_KEY`).\n' +
        'Cadastre sua chave gratuita da DeepSeek no arquivo `.env` para ativar as respostas de IA.'
      );
    }

    const personality = cfg?.personality || 'descontraido';
    const memoryEnabled = cfg?.memoryEnabled !== false;

    // Busca o nome do grupo para o framing do sistema
    let groupName = '';
    try {
      const meta = await getGroupMetadata(sock, from);
      groupName = meta?.subject || '';
    } catch (_) {}

    // Monta mensagens de contexto
    const messages = [];

    // Se a mensagem cita outra mensagem anterior, adiciona o trecho citado
    if (contextInfo?.quotedMessage) {
      const qm = contextInfo.quotedMessage;
      const quotedContent = qm.conversation ||
                            qm.extendedTextMessage?.text ||
                            qm.imageMessage?.caption ||
                            qm.videoMessage?.caption || '';
      if (quotedContent) {
        messages.push({
          role: 'user',
          content: `[Mensagem anterior respondida]: "${quotedContent}"`
        });
      }
    }

    // Se a memória local estiver ativada, adiciona o histórico recente
    if (memoryEnabled) {
      const history = memoryEngine.getRecentMessages(from, 20);
      if (history.length > 0) {
        const historyText = history
          .map(h => `${h.name}: ${h.text}`)
          .join('\n');
        messages.push({
          role: 'user',
          content: `[Histórico recente de mensagens do grupo]:\n${historyText}`
        });
      }
    }

    // Mensagem atual do usuário com identificador
    const senderDisplay = msg.pushName || sender.replace(/@.*$/, '').replace(/\D/g, '');
    messages.push({
      role: 'user',
      content: `${senderDisplay}: ${queryText}`
    });

    try {
      // 1ª Chamada à API da DeepSeek
      const aiResponse = await aiService.chatCompletion({
        messages,
        tools: toolRegistry.getTools(),
        personality,
        lang,
        groupName
      });

      if (!aiResponse.success) {
        logger.warn({ error: aiResponse.error }, 'Falha na resposta da DeepSeek');
        return reply('Ops, tive um imprevisto ao processar sua resposta agora. Tenta de novo!');
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
