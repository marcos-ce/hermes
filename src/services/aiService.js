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
    this.maxTokens = Math.max(parseInt(process.env.AI_MAX_TOKENS, 10) || 200, 180);
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
      ? 'Tom: executivo, educado, preciso e direto ao ponto, sem clichês robóticos.'
      : 'Tom: natural, humano, parceiro e direto ao ponto, como um admin experiente de WhatsApp no Brasil. Sem enrolação e sem parecer robô.';

    const commandsHelp = [
      `COMANDOS DO BOT (Prefixo do grupo: "${prefix}"):`,
      `• ${prefix}painel ou ${prefix}config : Painel geral de configurações.`,
      `• ${prefix}fechar / ${prefix}abrir : Tranca ou abre o grupo imediatamente.`,
      `• ${prefix}ban @user : Remove participante (ou responda a mensagem com ${prefix}ban).`,
      `• ${prefix}warn @user : Aplica advertência (ou ${prefix}unwarn @user para perdoar).`,
      `• ${prefix}antilink on/off/config : Proteção contra links não autorizados.`,
      `• ${prefix}antiflood on/off : Proteção contra spam de mensagens e travas.`,
      `• ${prefix}antifake on/off : Bloqueia números estrangeiros por DDI.`,
      `• ${prefix}bemvindo : Boas-vindas automáticas para novos membros.`,
      `• ${prefix}horarios : Agenda horários automáticos para abrir e fechar o grupo.`,
      `• ${prefix}automsg : Mensagens/anúncios periódicos programados.`,
      `• ${prefix}blacklist add/del <numero> : Gerencia a lista negra do grupo.`,
      `• ${prefix}hidetag [texto] : Marca todos os membros com comunicado oculto.`,
      `• ${prefix}del : Apaga a mensagem respondida.`,
      `• ${prefix}adm @user / ${prefix}rebaixar @user : Promove ou rebaixa administradores.`,
      `• ${prefix}sortear [qtd] [prêmio] : Sorteio aleatório entre membros.`,
      `• ${prefix}menu : Menu de ajuda rápida.`
    ].join('\n');

    return [
      `Você é o Hermes, o copiloto e administrador inteligente do grupo de WhatsApp${groupName ? ` "${groupName}"` : ''}.`,
      personaInstructions,
      langInstructions,
      'REGRAS ABSOLUTAS DE COMPORTAMENTO E EXECUÇÃO:',
      '1. Seja humano e direto: ao responder texto, use no máximo 1 ou 2 frases curtas (até 40 palavras). Vá direto à resposta.',
      '2. PROIBIDO usar preâmbulos ("Certamente!", "Claro!", "Compreendi sua dúvida", "Olá! Como posso ajudar?") ou despedidas de telemarketing ("Qualquer dúvida estou à disposição!", "Espero ter ajudado!").',
      '3. AÇÃO IMEDIATA VIA TOOLS: Sempre que o usuário pedir para executar uma ação (banir/remover alguém, fechar/abrir o grupo agora, mudar horários de abrir/fechar o grupo, ativar/desativar antilink/antiflood/antifake/bemvindo/automsg, dar ou tirar advertência, colocar na blacklist, apagar mensagem, promover/rebaixar admin, fazer comunicado hidetag ou sortear), ACIONE A FERRAMENTA (tool_calls) IMEDIATAMENTE. Não mande o usuário digitar comando quando você mesmo tem a ferramenta para executar!',
      '4. Quando houver "[Alvo marcado/mencionado: ...]" ou "[Respondendo ao membro: ...]" no contexto, use esse número/JID ou "quoted" no parâmetro "target" da ferramenta sem pedir confirmação.',
      '5. Se o usuário apenas perguntar uma dúvida sobre como funciona um comando (sem pedir para executar agora), explique de forma simples e direta com o prefixo correto.',
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
      temperature: this.temperature
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
