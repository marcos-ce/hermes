const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Serviço de integração com a API oficial da DeepSeek
 * Estritamente confinado em src/services/
 */
class AIService {
  constructor() {
    this.reloadConfig();
  }

  reloadConfig() {
    try {
      dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
    } catch (_) {}

    this.enabled = process.env.AI_ENABLED !== 'false';
    this.provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
    this.baseUrl = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.apiKey = (process.env.AI_API_KEY || '').replace(/^["']|["']$/g, '').trim();
    this.model = process.env.AI_MODEL || 'deepseek-chat';
    this.maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || 60;
    this.temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.6;
  }

  isConfigured() {
    this.reloadConfig();
    return Boolean(this.enabled && this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Constrói o Prompt de Sistema com framing estrito de WhatsApp, comandos e humanização
   * @param {string} personality 'descontraido' | 'formal'
   * @param {string} lang 'pt' | 'es' | 'en'
   * @param {string} groupName Nome do grupo
   * @param {string} prefix Prefixo atual do grupo
   * @returns {string}
   */
  buildSystemPrompt(personality = 'descontraido', lang = 'pt', groupName = '', prefix = '/') {
    const isFormal = personality === 'formal';
    const langInstructions = {
      pt: 'Responda sempre em Português do Brasil.',
      es: 'Responde siempre en Español.',
      en: 'Always reply in English.'
    }[lang] || 'Responda sempre em Português do Brasil.';

    const personaInstructions = isFormal
      ? 'Tom: profissional, educado, objetivo e sucinto.'
      : 'Tom: descontraído, informal, rápido e amigável, como um usuário real de WhatsApp no Brasil.';

    const commandsHelp = [
      `COMANDOS DO BOT (Prefixo do grupo: "${prefix}"):`,
      `• ${prefix}painel ou ${prefix}config : Painel geral de configurações.`,
      `• ${prefix}fechar / ${prefix}abrir : Tranca ou abre o grupo para mensagens.`,
      `• ${prefix}ban @user : Remove participante (ou responda a mensagem com ${prefix}ban).`,
      `• ${prefix}warn @user : Aplica advertência (ou ${prefix}unwarn para perdoar).`,
      `• ${prefix}antilink on/off/config : Proteção contra links não autorizados.`,
      `• ${prefix}antiflood on/off : Proteção contra spam de mensagens e travas.`,
      `• ${prefix}antifake on/off : Bloqueia números estrangeiros por DDI.`,
      `• ${prefix}bemvindo : Boas-vindas automáticas para novos membros.`,
      `• ${prefix}horarios : Agenda horários automáticos para abrir e fechar o grupo.`,
      `• ${prefix}automsg : Mensagens/anúncios periódicos programados.`,
      `• ${prefix}hidetag [texto] : Marca todos os membros com comunicado oculto.`,
      `• ${prefix}del : Apaga a mensagem respondida.`,
      `• ${prefix}adm @user / ${prefix}rebaixar @user : Promove ou rebaixa administradores.`,
      `• ${prefix}sortear [qtd] [prêmio] : Sorteio aleatório entre membros.`,
      `• ${prefix}menu : Menu de ajuda rápida.`
    ].join('\n');

    return [
      `Você é o Hermes, o copiloto e assistente inteligente de administração do grupo de WhatsApp${groupName ? ` "${groupName}"` : ''}.`,
      personaInstructions,
      langInstructions,
      'REGRAS ABSOLUTAS DE MENSAGEM:',
      '1. Seja ultra direto: responda em no máximo 1 ou 2 frases curtas (limite de 40 palavras).',
      '2. PROIBIDO usar preâmbulos ou enrolação ("Certamente!", "Compreendi sua dúvida", "Olá!", "Como posso ajudar?").',
      '3. PROIBIDO usar despedidas de telemarketing ("Qualquer dúvida estou à disposição!", "Espero ter ajudado!").',
      '4. SUPORTE A DÚVIDAS DE COMANDOS: Se qualquer membro ou admin perguntar como usar o bot, tiver dificuldade com comandos ou pedir ajuda, ensine de forma simples e direta o comando exato com o prefixo correto.',
      '5. Se um administrador pedir para você mesmo executar uma ação no grupo (como banir membro, fechar/abrir grupo, advertir, sortear ou apagar mensagem), utilize as ferramentas (tool calls) disponíveis.',
      commandsHelp
    ].join('\n');
  }

  /**
   * Envia uma requisição de completação de chat para a DeepSeek oficial com Tool Calling
   * @param {object} params
   * @param {Array<object>} params.messages Lista de mensagens no padrão OpenAI
   * @param {Array<object>} [params.tools] Lista de ferramentas disponíveis
   * @param {string} [params.personality] Personalidade ('descontraido' | 'formal')
   * @param {string} [params.lang] Idioma ('pt' | 'es' | 'en')
   * @param {string} [params.groupName] Nome do grupo
   * @param {string} [params.prefix] Prefixo atual do grupo
   * @returns {Promise<{ success: boolean, content?: string, toolCalls?: Array, error?: string, rawMessage?: object }>}
   */
  async chatCompletion({ messages, tools = null, personality = 'descontraido', lang = 'pt', groupName = '', prefix = '/' }) {
    this.reloadConfig();

    if (!this.enabled) {
      return { success: false, error: 'AI_DISABLED' };
    }

    if (!this.apiKey || this.apiKey.length === 0) {
      return { success: false, error: 'API_KEY_MISSING' };
    }

    const systemPrompt = this.buildSystemPrompt(personality, lang, groupName, prefix);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages: fullMessages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stop: ['\n\n']
    };

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, body: errorText }, 'Erro na resposta da DeepSeek API');
        return { success: false, error: `HTTP_${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const message = choice?.message;

      if (!message) {
        return { success: false, error: 'NO_CHOICE_RETURNED' };
      }

      // Processa chamadas de ferramenta (Tool Calls)
      let parsedToolCalls = null;
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        parsedToolCalls = message.tool_calls.map(tc => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch (_) {
            parsedArgs = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs
          };
        });
      }

      const content = (message.content || '').trim();

      return {
        success: true,
        content,
        toolCalls: parsedToolCalls,
        rawMessage: message
      };
    } catch (err) {
      if (err.name === 'TimeoutError') {
        logger.warn('Timeout na requisição para a DeepSeek API');
        return { success: false, error: 'TIMEOUT' };
      }
      logger.error({ err }, 'Erro ao conectar com a DeepSeek API');
      return { success: false, error: 'CONNECTION_ERROR' };
    }
  }
}

const aiService = new AIService();
module.exports = aiService;
