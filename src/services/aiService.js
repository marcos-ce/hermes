const logger = require('../utils/logger');

/**
 * Serviço de integração com a API da DeepSeek / OpenAI-compatible
 * Estritamente confinado em src/services/
 */
class AIService {
  constructor() {
    this.reloadConfig();
  }

  reloadConfig() {
    this.enabled = process.env.AI_ENABLED !== 'false';
    this.provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
    this.baseUrl = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.apiKey = process.env.AI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'deepseek-chat';
    this.maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || 60;
    this.temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.6;
  }

  isConfigured() {
    return Boolean(this.enabled && this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Constrói o Prompt de Sistema com framing estrito de WhatsApp e humanização
   * @param {string} personality 'descontraido' | 'formal'
   * @param {string} lang 'pt' | 'es' | 'en'
   * @param {string} groupName Nome do grupo
   * @returns {string}
   */
  buildSystemPrompt(personality = 'descontraido', lang = 'pt', groupName = '') {
    const isFormal = personality === 'formal';
    const langInstructions = {
      pt: 'Responda sempre em Português do Brasil.',
      es: 'Responde siempre en Español.',
      en: 'Always reply in English.'
    }[lang] || 'Responda sempre em Português do Brasil.';

    const personaInstructions = isFormal
      ? 'Tom: profissional, educado, objetivo e sucinto.'
      : 'Tom: descontraído, informal, rápido e amigável, como um usuário real de WhatsApp no Brasil.';

    return [
      `Você é o Hermes, o assistente inteligente de administração e moderação do grupo de WhatsApp${groupName ? ` "${groupName}"` : ''}.`,
      personaInstructions,
      langInstructions,
      'REGRAS ABSOLUTAS DE MENSAGEM:',
      '1. Seja ultra direto: responda em no máximo 1 ou 2 frases curtas (limite de 40 palavras).',
      '2. PROIBIDO usar preâmbulos ou enrolação ("Certamente!", "Compreendi sua dúvida", "Olá!", "Como posso ajudar?").',
      '3. PROIBIDO usar despedidas de telemarketing ("Qualquer dúvida estou à disposição!", "Espero ter ajudado!").',
      '4. Nunca invente dados que você não sabe. Se não souber algo, diga em poucas palavras.',
      '5. Se um administrador pedir para executar uma ação no grupo (como banir membro, fechar/abrir grupo, advertir, sortear ou apagar mensagem), utilize as ferramentas (tool calls) fornecidas para executar a ordem.'
    ].join('\n');
  }

  /**
   * Envia uma requisição de completação de chat para a DeepSeek
   * @param {object} params
   * @param {Array<object>} params.messages Lista de mensagens no padrão OpenAI
   * @param {Array<object>} [params.tools] Lista de ferramentas disponíveis
   * @param {string} [params.personality] Personalidade ('descontraido' | 'formal')
   * @param {string} [params.lang] Idioma ('pt' | 'es' | 'en')
   * @param {string} [params.groupName] Nome do grupo
   * @returns {Promise<{ success: boolean, content?: string, toolCalls?: Array, error?: string }>}
   */
  async chatCompletion({ messages, tools = null, personality = 'descontraido', lang = 'pt', groupName = '' }) {
    if (!this.enabled) {
      return { success: false, error: 'AI_DISABLED' };
    }

    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return { success: false, error: 'API_KEY_MISSING' };
    }

    const systemPrompt = this.buildSystemPrompt(personality, lang, groupName);
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
          'Authorization': `Bearer ${this.apiKey.trim()}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, body: errorText }, 'Erro na resposta da DeepSeek API');
        return { success: false, error: `HTTP_${response.status}` };
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
