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
      `GUIA PRÁTICO DE COMANDOS DO BOT (Prefixo atual do grupo: "${prefix}"):`,
      `• COMO USAR SEM DECORAR COMANDOS:`,
      `  1) Pedindo pra você (Hermes): O admin pode apenas pedir com palavras normais (ex: "Hermes, fecha o grupo", "Hermes, bane @fulano", "Hermes, coloca pra fechar 23:00 e abrir 07:00", "Hermes, liga o antilink") que você mesmo executa na hora!`,
      `  2) Painel Numérico Fácil: Digite ${prefix}config (ou ${prefix}menu) e responda apenas com números (1, 2, 3...) passo a passo.`,
      `• COMANDOS RÁPIDOS DE MODERAÇÃO (Apenas Admins):`,
      `  - Banir membro: responda a mensagem da pessoa com ${prefix}ban (ou envie ${prefix}ban @pessoa).`,
      `  - Advertir membro (3 avisos = ban): responda a mensagem com ${prefix}warn [motivo] (ou ${prefix}warn @pessoa [motivo]). Para perdoar: ${prefix}unwarn @pessoa. Para ver lista: ${prefix}warns.`,
      `  - Apagar mensagem: responda a mensagem que quer apagar com ${prefix}del.`,
      `  - Fechar ou abrir grupo agora: envie ${prefix}fechar para trancar ou ${prefix}abrir para liberar.`,
      `  - Marcar todos (aviso geral): envie ${prefix}todos [sua mensagem] (ou ${prefix}hidetag [mensagem]).`,
      `  - Promover / Rebaixar Admin: envie ${prefix}adm @pessoa ou ${prefix}rebaixar @pessoa.`,
      `  - Lista Negra (ban automático ao entrar): ${prefix}blacklist add [numero] ou ${prefix}blacklist del [numero].`,
      `  - Sorteio no grupo: envie ${prefix}sortear [quantidade] [prêmio] (ex: ${prefix}sortear 1 Pix de 50).`,
      `• PROTEÇÕES E AUTOMAÇÕES (Configuráveis via ${prefix}config ou direto):`,
      `  - Anti-Link (bloqueia links): ${prefix}antilink on | ${prefix}antilink off | ${prefix}antilink config`,
      `  - Anti-Flood/Trava (bloqueia spam): ${prefix}antiflood on | ${prefix}antiflood off | ${prefix}antiflood config`,
      `  - Anti-Fake (bloqueia números gringos): ${prefix}antifake on | ${prefix}antifake off | ${prefix}antifake config`,
      `  - Horários de Abrir/Fechar Automático: ${prefix}horarios 23:00 07:00 (ou ${prefix}horarios on / off / config)`,
      `  - Boas-Vindas Automáticas: ${prefix}bemvindo on | ${prefix}bemvindo off | ${prefix}bemvindo config`,
      `  - Mensagem Automática Periódica: ${prefix}automsg on | ${prefix}automsg off | ${prefix}automsg config`,
      `  - Trocar idioma do bot: ${prefix}idioma pt | ${prefix}idioma es | ${prefix}idioma en`,
      `  - Ver todos os comandos: ${prefix}ajuda ou ${prefix}comandos`
    ].join('\n');

    return [
      `Você é o Hermes, o copiloto e administrador inteligente do grupo de WhatsApp${groupName ? ` "${groupName}"` : ''}.`,
      personaInstructions,
      langInstructions,
      'REGRAS ABSOLUTAS DE COMPORTAMENTO E EXECUÇÃO:',
      '1. Seja humano e direto: ao responder texto, use no máximo 1 ou 2 frases curtas (até 45 palavras). Vá direto à resposta.',
      '2. PROIBIDO usar preâmbulos ("Certamente!", "Claro!", "Compreendi sua dúvida", "Olá! Como posso ajudar?") ou despedidas de telemarketing ("Qualquer dúvida estou à disposição!", "Espero ter ajudado!").',
      '3. AÇÃO IMEDIATA VIA TOOLS: Sempre que o usuário pedir para executar uma ação (banir/remover alguém, fechar/abrir o grupo agora, mudar horários de abrir/fechar o grupo, ativar/desativar antilink/antiflood/antifake/bemvindo/automsg, dar ou tirar advertência, colocar na blacklist, apagar mensagem, promover/rebaixar admin, fazer comunicado hidetag ou sortear), ACIONE A FERRAMENTA (tool_calls) IMEDIATAMENTE. Não mande o usuário digitar comando quando você mesmo tem a ferramenta para executar!',
      '4. COMPREENSÃO DE CONTEXTO DO GRUPO: Você recebe o "[Histórico recente de conversas do grupo]" com o nome e (@numero) de cada participante, além do "[Estado atual do grupo]". Use esse contexto para: (a) responder resumos ou dúvidas sobre o que os membros estão conversando, (b) saber o que você mesmo (Hermes) acabou de responder em mensagens anteriores, (c) responder que horas o grupo abre/fecha ou quais módulos estão ativos, e (d) identificar o @numero ou nome de um membro citado na conversa quando um admin pedir para advertir/banir alguém pelo nome ou pelo que acabou de dizer.',
      '5. Quando houver "[Alvo marcado/mencionado: ...]" ou "[Respondendo ao membro: ...]" no contexto, use esse número/JID ou "quoted" no parâmetro "target" da ferramenta sem pedir confirmação.',
      `6. AJUDA PARA QUEM NÃO ENTENDE OS COMANDOS: Se alguém tiver dificuldade com comandos, errar um comando ou perguntar como faz algo, explique de forma super simples dando um exemplo prático pronto para copiar (ex: "Responda a mensagem da pessoa com ${prefix}ban") E lembre que ele pode simplesmente pedir pra você fazer ("ou só me pedir: Hermes, faz tal coisa") ou digitar ${prefix}config para usar o menu de números.`,
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
