const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Serviço de integração com a API da DeepSeek e Fallbacks Gratuitos (OpenRouter / Groq)
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

    // Configurações do OpenRouter (Fallback / Backup Gratuito)
    this.openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.AI_OPENROUTER_KEY || '').replace(/^["']|["']$/g, '').trim();
    this.openRouterBaseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    // Modelo padrão ativo verificado no OpenRouter gratuito (evita modelos extintos como deepseek/deepseek-chat:free)
    this.openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';

    // Configurações do Groq (Alternativa Gratuita de Alta Velocidade)
    this.groqKey = (process.env.GROQ_API_KEY || '').replace(/^["']|["']$/g, '').trim();
    this.groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  isConfigured() {
    this.reloadConfig();
    const hasDeepSeek = Boolean(this.apiKey && this.apiKey.length > 0);
    const hasOpenRouter = Boolean(this.openRouterKey && this.openRouterKey.length > 0);
    const hasGroq = Boolean(this.groqKey && this.groqKey.length > 0);
    return Boolean(this.enabled && (hasDeepSeek || hasOpenRouter || hasGroq));
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
   * Helper privado para requisições compatíveis com a API OpenAI
   */
  async _requestCompletion({ url, apiKey, model, messages, tools, extraHeaders = {}, timeoutMs = 15000 }) {
    const payload = {
      model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stop: ['\n\n']
    };

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, status: response.status, errorText };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) {
      return { ok: false, status: 200, errorText: 'NO_CHOICE_RETURNED' };
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

    return {
      ok: true,
      content: (message.content || '').trim(),
      toolCalls: parsedToolCalls,
      rawMessage: message
    };
  }

  /**
   * Executa chamada ao OpenRouter testando modelos gratuitos ativos com fallback inteligente
   */
  async callOpenRouter(messages, tools = null) {
    const url = `${this.openRouterBaseUrl}/chat/completions`;
    const extraHeaders = {
      'HTTP-Referer': 'https://github.com/marcos-ce/hermes',
      'X-Title': 'Hermes Bot WhatsApp'
    };

    // Lista de modelos gratuitos ativos no OpenRouter
    const freeCandidates = [
      this.openRouterModel,
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3.5-lightning:free',
      'dots-studio/dots-3-note-preview:free'
    ];

    // Remove duplicados e modelos que já não existem como free (ex: deepseek/deepseek-chat:free)
    const modelsToTry = [...new Set(freeCandidates)].filter(m => m && m !== 'deepseek/deepseek-chat:free');

    let lastError = null;

    for (const model of modelsToTry) {
      logger.info({ model }, 'Tentando modelo gratuito no OpenRouter...');
      const result = await this._requestCompletion({
        url,
        apiKey: this.openRouterKey,
        model,
        messages,
        tools: null, // Modelos gratuitos rejeitam parâmetro tools; mantemos prompt textual
        extraHeaders,
        timeoutMs: 20000
      });

      if (result.ok) {
        logger.info({ model }, 'Resposta obtida com sucesso via OpenRouter gratuito!');
        return { ...result, usedModel: model };
      }

      logger.warn({ model, status: result.status, error: result.errorText }, 'Modelo falhou no OpenRouter, tentando próximo...');
      lastError = result;
    }

    return lastError || { ok: false, status: 500, errorText: 'Todos os modelos gratuitos falharam' };
  }

  /**
   * Executa chamada à API gratuita do Groq (Llama 3.3 70B de altíssima velocidade)
   */
  async callGroq(messages) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    return await this._requestCompletion({
      url,
      apiKey: this.groqKey,
      model: this.groqModel,
      messages,
      tools: null,
      timeoutMs: 15000
    });
  }

  /**
   * Envia uma requisição de completação de chat com suporte a DeepSeek e Fallback OpenRouter/Groq
   * @param {object} params
   * @param {Array<object>} params.messages Lista de mensagens no padrão OpenAI
   * @param {Array<object>} [params.tools] Lista de ferramentas disponíveis
   * @param {string} [params.personality] Personalidade ('descontraido' | 'formal')
   * @param {string} [params.lang] Idioma ('pt' | 'es' | 'en')
   * @param {string} [params.groupName] Nome do grupo
   * @param {string} [params.prefix] Prefixo atual do grupo
   * @returns {Promise<{ success: boolean, content?: string, toolCalls?: Array, error?: string, provider?: string, fallbackUsed?: boolean }>}
   */
  async chatCompletion({ messages, tools = null, personality = 'descontraido', lang = 'pt', groupName = '', prefix = '/' }) {
    this.reloadConfig();

    if (!this.enabled) {
      return { success: false, error: 'AI_DISABLED' };
    }

    const hasDeepSeek = Boolean(this.apiKey && this.apiKey.length > 0);
    const hasOpenRouter = Boolean(this.openRouterKey && this.openRouterKey.length > 0);
    const hasGroq = Boolean(this.groqKey && this.groqKey.length > 0);

    if (!hasDeepSeek && !hasOpenRouter && !hasGroq) {
      return { success: false, error: 'API_KEY_MISSING' };
    }

    const systemPrompt = this.buildSystemPrompt(personality, lang, groupName, prefix);
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Se o usuário configurou explicitamente AI_PROVIDER=openrouter
    if (this.provider === 'openrouter' && hasOpenRouter) {
      const res = await this.callOpenRouter(fullMessages, tools);
      if (res.ok) {
        return {
          success: true,
          content: res.content,
          toolCalls: res.toolCalls,
          rawMessage: res.rawMessage,
          provider: 'openrouter',
          fallbackUsed: false
        };
      }
      return { success: false, error: `OPENROUTER_${res.status}: ${res.errorText}` };
    }

    // Se o usuário configurou explicitamente AI_PROVIDER=groq
    if (this.provider === 'groq' && hasGroq) {
      const res = await this.callGroq(fullMessages);
      if (res.ok) {
        return {
          success: true,
          content: res.content,
          rawMessage: res.rawMessage,
          provider: 'groq',
          fallbackUsed: false
        };
      }
      return { success: false, error: `GROQ_${res.status}: ${res.errorText}` };
    }

    // 1. Tenta DeepSeek primária se configurada
    if (hasDeepSeek) {
      try {
        const primaryUrl = `${this.baseUrl}/chat/completions`;
        const res = await this._requestCompletion({
          url: primaryUrl,
          apiKey: this.apiKey,
          model: this.model,
          messages: fullMessages,
          tools,
          timeoutMs: 15000
        });

        if (res.ok) {
          return {
            success: true,
            content: res.content,
            toolCalls: res.toolCalls,
            rawMessage: res.rawMessage,
            provider: 'deepseek'
          };
        }

        logger.warn({ status: res.status, error: res.errorText }, 'Falha na DeepSeek API');

        // Se DeepSeek falhou (402 Saldo Insuficiente, 401, 429, 5xx) E temos chave OpenRouter configurada
        if (hasOpenRouter) {
          logger.info('🔄 Acionando Fallback para OpenRouter gratuito...');
          const fallbackRes = await this.callOpenRouter(fullMessages, tools);
          if (fallbackRes.ok) {
            return {
              success: true,
              content: fallbackRes.content,
              toolCalls: fallbackRes.toolCalls,
              rawMessage: fallbackRes.rawMessage,
              provider: 'openrouter',
              fallbackUsed: true
            };
          }
          logger.error({ status: fallbackRes.status, error: fallbackRes.errorText }, 'Falha também no fallback OpenRouter');
        }

        // Se OpenRouter falhou ou não tem chave, mas tem Groq
        if (hasGroq) {
          logger.info('🔄 Acionando Fallback para Groq gratuito...');
          const groqRes = await this.callGroq(fullMessages);
          if (groqRes.ok) {
            return {
              success: true,
              content: groqRes.content,
              rawMessage: groqRes.rawMessage,
              provider: 'groq',
              fallbackUsed: true
            };
          }
        }

        // Sem fallback funcional: retorna o erro da DeepSeek
        return { success: false, error: `HTTP_${res.status}: ${res.errorText}` };
      } catch (err) {
        logger.warn({ err }, 'Exceção ao chamar DeepSeek API');

        if (hasOpenRouter) {
          try {
            const fallbackRes = await this.callOpenRouter(fullMessages, tools);
            if (fallbackRes.ok) {
              return {
                success: true,
                content: fallbackRes.content,
                toolCalls: fallbackRes.toolCalls,
                rawMessage: fallbackRes.rawMessage,
                provider: 'openrouter',
                fallbackUsed: true
              };
            }
          } catch (_) {}
        }

        if (hasGroq) {
          try {
            const groqRes = await this.callGroq(fullMessages);
            if (groqRes.ok) {
              return {
                success: true,
                content: groqRes.content,
                rawMessage: groqRes.rawMessage,
                provider: 'groq',
                fallbackUsed: true
              };
            }
          } catch (_) {}
        }

        if (err.name === 'TimeoutError') {
          return { success: false, error: 'TIMEOUT' };
        }
        return { success: false, error: 'CONNECTION_ERROR' };
      }
    }

    // 2. DeepSeek não configurada, mas OpenRouter configurado diretamente
    if (hasOpenRouter) {
      try {
        const fallbackRes = await this.callOpenRouter(fullMessages, tools);
        if (fallbackRes.ok) {
          return {
            success: true,
            content: fallbackRes.content,
            toolCalls: fallbackRes.toolCalls,
            rawMessage: fallbackRes.rawMessage,
            provider: 'openrouter',
            fallbackUsed: false
          };
        }
        return { success: false, error: `OPENROUTER_${fallbackRes.status}: ${fallbackRes.errorText}` };
      } catch (err) {
        if (err.name === 'TimeoutError') {
          return { success: false, error: 'TIMEOUT' };
        }
        return { success: false, error: 'CONNECTION_ERROR' };
      }
    }

    // 3. Apenas Groq configurado diretamente
    if (hasGroq) {
      try {
        const groqRes = await this.callGroq(fullMessages);
        if (groqRes.ok) {
          return {
            success: true,
            content: groqRes.content,
            rawMessage: groqRes.rawMessage,
            provider: 'groq',
            fallbackUsed: false
          };
        }
        return { success: false, error: `GROQ_${groqRes.status}: ${groqRes.errorText}` };
      } catch (err) {
        if (err.name === 'TimeoutError') {
          return { success: false, error: 'TIMEOUT' };
        }
        return { success: false, error: 'CONNECTION_ERROR' };
      }
    }

    return { success: false, error: 'API_KEY_MISSING' };
  }
}

const aiService = new AIService();
module.exports = aiService;
