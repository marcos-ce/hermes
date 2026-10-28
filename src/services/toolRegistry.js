const settings = require('../config/settings');
const configManager = require('../core/configManager');
const wizardEngine = require('../core/wizardEngine');
const logger = require('../utils/logger');
const { safeKick, safeDelete, sendSafeMessage } = require('../utils/antiBan');
const { resolveTarget, resolveParticipant, checkAdminStatus, getGroupMetadata, cleanJid } = require('../utils/jidResolver');
const { groupCache } = require('../utils/cache');
const { t } = require('../utils/i18n');
const pollTracker = require('../utils/pollTracker');
const pinTracker = require('../utils/pinTracker');
const memoryEngine = require('./memoryEngine');
const { parseRelativeTime, parseDuration } = require('./timeParser');
const { executeCalendarAction } = require('../plugins/admin/calendar');

/**
 * Definição dos Schemas de Ferramentas (Tool Calling) compatíveis com OpenAI / DeepSeek
 */
const TARGET_DESCRIPTION = 'Ref do histórico (ex: "m123"), número com DDI, @menção ou "quoted".';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Expulsa/bane membro do grupo imediatamente. Acione para: banir, chutar, tirar esse cara, sumir com ele, descer o martelo, passar o rodo, eliminar, kickar, mandar pastar, dar ban, botar pra fora, rapa fora, /chuta, /ban.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION },
          reason: { type: 'string', description: 'Motivo da expulsão.' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_mute',
      description: 'Tranca ("close") ou abre ("open") o grupo para mensagens (imediato ou agendado). Acione "close" para: fechar, trancar, trancar tudo, fechar a porteira, calar o grupo, ninguém fala mais, hora de dormir, fechar essa bagunça, /tranca, /fechar. Acione "open" para: abrir, liberar, destrancar, abrir a porteira, pode falar, /abrir.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['close', 'open'], description: '"close" para trancar ou "open" para abrir.' },
          duration: { type: 'string', description: 'Duração temporária para manter o grupo trancado antes de reabrir automaticamente (ex: "30m", "1h", "2h", "por 30 minutos"). Quando action for "close" e duration for fornecido, tranca o grupo imediatamente e agenda a reabertura automática após o tempo.' },
          delayMinutes: { type: 'integer', description: 'Minutos para aguardar antes da ação (ex: 15, 30, 60).' },
          time: { type: 'string', description: 'Horário ou tempo relativo (ex: "22:00", "em 1 hora", "daqui a meia hora").' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_schedule',
      description: 'Configura horários diários automáticos para fechar e abrir o grupo.',
      parameters: {
        type: 'object',
        properties: {
          closeTime: { type: 'string', description: 'Horário diário para fechar (HH:MM, ex: "23:00") ou "0".' },
          openTime: { type: 'string', description: 'Horário diário para abrir (HH:MM, ex: "07:00") ou "0".' },
          enabled: { type: 'boolean', description: 'Ativa (true) ou desativa (false) os horários diários.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_group_protection',
      description: 'Ativa, desativa ou configura plugins de proteção e moderação do grupo (antilink, antiflood, antifake, warn, welcome, automsg, etc.). Use para regras como "banimento em quem manda dois links", "bloqueia links", "limite de 3 advertências", "anti-flood com 5 mensagens".',
      parameters: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            enum: ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'mutemember', 'autoapprove'],
            description: 'Nome do plugin: "antilink", "antiflood", "antifake", "warn", "welcome", "automsg", "schedule", "ban", "hermes", "calendar", "autoapprove".'
          },
          enabled: { type: 'boolean', description: 'Ativar (true) ou desativar (false).' },
          action: { type: 'string', enum: ['delete', 'warn', 'ban'], description: 'Punição para infrações: "delete" (apenas apagar), "warn" (advertir até atingir limite de warns e banir) ou "ban" (banir imediatamente no primeiro deslize).' },
          allowedDomains: { type: 'string', description: 'Domínios liberados no antilink (ex: "youtube.com, instagram.com") ou "." para todos.' },
          maxMessages: { type: 'integer', description: 'Máximo de mensagens consecutivas em 5s no antiflood.' },
          maxChars: { type: 'integer', description: 'Limite de caracteres anti-trava.' },
          allowedDdis: { type: 'string', description: 'DDIs liberados no antifake (ex: "55, 351").' },
          welcomeMessage: { type: 'string', description: 'Texto de boas-vindas ({user}, {group}, {desc}).' },
          autoDeleteSeconds: { type: 'integer', description: 'Segundos para apagar boas-vindas (0 desativa).' },
          autoMsgText: { type: 'string', description: 'Texto do comunicado periódico.' },
          intervalMinutes: { type: 'integer', description: 'Intervalo em minutos do comunicado.' },
          maxWarns: { type: 'integer', description: 'Contagem/limite de advertências antes do ban automático (ex: 2 para banir no 2º link/aviso, 3 para banir no 3º). Pode ser passado diretamente com module "antilink", "antiflood" ou "warn".' },
          customBanMessage: { type: 'string', description: 'Mensagem personalizada de ban ({user}).' },
          personality: { type: 'string', enum: ['descontraido', 'formal'], description: 'Tom do Hermes IA: "descontraido" ou "formal".' }
        },
        required: ['module']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_settings',
      description: 'Configurações gerais: idioma, prefixo, painel interativo ou limpa memória.',
      parameters: {
        type: 'object',
        properties: {
          lang: { type: 'string', enum: ['pt', 'es', 'en'], description: 'Idioma: "pt", "es" ou "en".' },
          prefix: { type: 'string', description: 'Novo prefixo de 1 caractere (ex: "/", "!", "#").' },
          openPanel: { type: 'boolean', description: 'True para abrir o Painel Interativo (!config).' },
          clearMemory: { type: 'boolean', description: 'True para limpar histórico do Hermes neste grupo.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'warn_member',
      description: 'Aplica advertência formal a membro. No limite (padrão 3), aplica ban. Acione para: advertir, dar warn, dar puxão de orelha, chamar atenção, dar um aviso, primeiro aviso, /warn, /adv.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION },
          reason: { type: 'string', description: 'Motivo da advertência.' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unwarn_member',
      description: 'Remove 1 advertência de um membro (perdoa). Acione para: perdoar, tirar advertência, tirar aviso, unwarn, /unwarn, /perdoar.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mute_member',
      description: 'Silencia um membro temporariamente por até 24h, apagando todas as mensagens dele em tempo real. Acione para: silenciar, mutar, calar a boca dele, cala ele, deixar de molho, botar de castigo, dar timeout, não quero ouvir ele, /muta, /calar, /silenciar.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION },
          duration: { type: 'string', description: 'Tempo do silenciamento (ex: "10m", "30m", "1h", "2h", "24h"). Padrão: "15m".' },
          reason: { type: 'string', description: 'Motivo do silenciamento.' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unmute_member',
      description: 'Remove o silenciamento de um membro no grupo, permitindo que ele volte a mandar mensagens. Acione para: desmutar, tirar do molho, liberar o membro, pode falar, /desmutar, /unmute.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_blacklist',
      description: 'Adiciona ("add") ou remove ("remove") número da lista negra.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'remove'], description: '"add" (adiciona e expulsa) ou "remove".' },
          target: { type: 'string', description: TARGET_DESCRIPTION }
        },
        required: ['action', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Apaga mensagem por ref do histórico (ex: "m123") ou respondida (quoted). Acione para: apagar, deletar, limpar, tirar essa mensagem, sumir com isso, tirar esse link, apaga essa porcaria, /del, /apagar, /limpar.',
      parameters: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'Ref do histórico (ex: "m123") ou omita para a mensagem respondida.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'hidetag_announcement',
      description: 'Envia comunicado marcando todos os membros de forma oculta.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Texto do comunicado a ser transmitido.' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'promote_member',
      description: 'Promove membro comum a Administrador. Acione para: dar adm, promover, virar adm, botar de adm, /promover, /adm.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'demote_member',
      description: 'Rebaixa Administrador a membro comum. Acione para: tirar adm, rebaixar, tirar a chave dele, remover adm, /rebaixar.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: TARGET_DESCRIPTION }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_calendar',
      description: 'Gerencia lembretes, apurações de enquetes, sorteios e ações agendadas no grupo.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'list', 'delete', 'clear'], description: 'Ação: "add", "list", "delete" ou "clear".' },
          actionType: {
            type: 'string',
            enum: ['reminder', 'poll_result', 'close_group', 'open_group', 'raffle', 'unpin'],
            description: 'Tipo de ação para "add": "poll_result" (apurar e mandar resultado de enquete), "close_group" (fechar grupo), "open_group" (abrir grupo), "raffle" (sorteio), "unpin" (desafixar mensagens), "reminder" (lembrete de texto normal).'
          },
          date: { type: 'string', description: 'Data (DD/MM, "hoje" ou "amanhã").' },
          time: { type: 'string', description: 'Horário (HH:MM, "14h" ou relativo "em 30 min").' },
          delayMinutes: { type: 'integer', description: 'Minutos a partir de agora (ex: 15, 30, 60).' },
          text: { type: 'string', description: 'Texto do lembrete, prêmio do sorteio ou detalhe da ação.' },
          quantity: { type: 'integer', description: 'Quantidade de ganhadores se actionType for "raffle" (padrão: 1).' },
          eventId: { type: 'string', description: 'ID numérico do evento para "delete" (ex: "1").' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'raffle_members',
      description: 'Realiza sorteio aleatório e justo entre os membros.',
      parameters: {
        type: 'object',
        properties: {
          quantity: { type: 'integer', description: 'Quantidade de sorteados (padrão: 1).' },
          prize: { type: 'string', description: 'Nome ou descrição do prêmio.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_description',
      description: 'Altera ou limpa a descrição/regras/bio do grupo. Acione para: mudar descrição, alterar regras, trocar bio, colocar isso na descrição, usar isso de regras, /desc, /regras.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Novo texto da descrição (ou "" para limpar).' }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_picture',
      description: 'Altera ("update") ou remove ("remove") a foto de perfil do grupo. Acione para: mudar foto, foto de perfil, trocar o ícone do grupo, /foto.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['update', 'remove'], description: '"update" (usa imagem enviada/citada) ou "remove".' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_group_invite_link',
      description: 'Obtém o link oficial de convite do grupo ou revoga/gera um novo se solicitado. Acione para: mandar link, link do grupo, link de convite, cadê o link, passa o link, /link.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'revoke'],
            description: '"get" para obter o link atual, "revoke" para cancelar o antigo e gerar um novo link.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pin_group_message',
      description: 'Fixa ("pin"), desafixa ("unpin") mensagem respondida ou desafixa todas as mensagens ("unpin_all"). Acione "pin" para: fixar, pinar, pregar no topo, deixar destacado, /pin, /fixar. Acione "unpin" para: desafixar, despinar, tirar do topo, /unpin.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['pin', 'unpin', 'unpin_all'], description: '"pin" para fixar, "unpin" para desafixar a mensagem ou "unpin_all" para desafixar todas as mensagens fixadas do grupo.' },
          duration: { type: 'string', enum: ['24h', '7d', '30d'], description: 'Duração: "24h", "7d" ou "30d" (padrão: "24h").' },
          messageId: { type: 'string', description: 'Ref "m123" ou omita para a mensagem respondida.' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_group_poll',
      description: 'Cria enquete interativa oficial no WhatsApp. Acione para: criar enquete, fazer votação, abrir votação, votação entre opções, /enquete, /poll.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Pergunta ou título da enquete.' },
          options: { type: 'array', items: { type: 'string' }, description: 'Opções de voto (mínimo 2, máximo 12).' },
          multipleAnswers: { type: 'boolean', description: 'True para múltipla escolha, false para voto único.' }
        },
        required: ['title', 'options']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_poll_results',
      description: 'Consulta o resultado, opções, votos computados e vencedor da enquete do grupo. Acione para: quem ganhou, resultado da enquete, placar, apuração, parcial, como tá a votação, /resultado, /votos.',
      parameters: {
        type: 'object',
        properties: {
          pollId: { type: 'string', description: 'ID opcional da enquete a consultar (se omitido, consulta a mais recente do grupo).' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'learn_group_fact',
      description: 'Registra permanentemente fato, regra tácita, apelido ou tom do grupo.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['fact', 'rule', 'tone', 'nickname'], description: 'Categoria: "fact", "rule", "tone" ou "nickname".' },
          key: { type: 'string', description: 'Identificador ou termo (ex: "Lucas", "sexta", "tom").' },
          value: { type: 'string', description: 'O fato aprendido, regra, apelido ou tom.' }
        },
        required: ['category', 'key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forget_group_fact',
      description: 'Remove fato ou regra da memória cultural permanente do grupo.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Termo ou chave a ser esquecida.' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_join_requests',
      description: 'Gerencia as solicitações de entrada de novos membros no grupo (fila de aprovação do WhatsApp). Acione para: aceitar quem pediu para entrar, aprovar pessoas, aprovar brasileiros pendentes, ver quem está na fila para entrar, listar pedidos de aprovação, aprovar solicitações, ligar ou desligar aprovação automática de BRs.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'approve_all_br', 'enable_auto', 'disable_auto'],
            description: '"list" para consultar/contar pendentes, "approve_all_br" para aprovar todos os brasileiros da fila com filtro anti-ban seguro, "enable_auto" para ativar a aprovação automática de BRs em tempo real, "disable_auto" para desativar.'
          }
        },
        required: ['action']
      }
    }
  }
];

const MAX_ARG_STRING = 500;

// Endurece os schemas: sem propriedades extras e com target padronizado
for (const tool of TOOLS) {
  const params = tool.function.parameters;
  params.additionalProperties = false;
  if (params.properties && params.properties.target) {
    params.properties.target.description = TARGET_DESCRIPTION;
  }
  if (params.properties && params.properties.messageId) {
    params.properties.messageId.description = 'Ref da mensagem do histórico (ex: "m123"), ou omita para apagar a mensagem respondida (quoted).';
  }
}

class ToolRegistry {
  constructor() {
    this.tools = TOOLS;
  }

  /**
   * Retorna as ferramentas relevantes para a consulta atual (Dynamic Tool Pruning)
   * Reduz o overhead de schemas de 3.200 tokens para ~900 tokens por requisição,
   * aumentando a assertividade e reduzindo a dispersão de atenção do modelo.
   * Se houver dúvida ou o pedido for amplo, retorna todas as 24 ferramentas (Fail-Open seguro).
   * @param {string} [queryText]
   * @param {object} [context]
   * @returns {Array<object>}
   */
  /**
   * Retorna todas as ferramentas disponíveis (schemas de Tool Calling oficiais).
   * Mantém a lista 100% estática e idêntica entre requisições para maximizar
   * o Context Caching da DeepSeek (90% de desconto) e eliminar visão de túnel do modelo.
   * @returns {Array<object>}
   */
  getTools() {
    return this.tools;
  }

  /**
   * Valida e sanitiza os argumentos de uma tool call contra o schema JSON declarado.
   * Remove propriedades desconhecidas, coage tipos simples e rejeita enum/required inválidos
   * ANTES de executar qualquer ação (evita, por exemplo, abrir o grupo por um "action" ausente).
   * @param {string} toolName
   * @param {object} rawArgs
   * @returns {{ ok: boolean, args?: object, error?: string }}
   */
  validateArgs(toolName, rawArgs) {
    const tool = this.tools.find(t => t.function.name === toolName);
    if (!tool) return { ok: false, error: `Ferramenta "${toolName}" não reconhecida.` };

    const schema = tool.function.parameters;
    const input = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const clean = {};

    for (const [key, def] of Object.entries(schema.properties || {})) {
      let value = input[key];
      if (value === undefined || value === null || (value === '' && key !== 'description')) continue;

      if (def.type === 'string') {
        if (typeof value === 'number') value = String(value);
        if (typeof value !== 'string') return { ok: false, error: `Argumento "${key}" inválido.` };
        const maxLen = (key === 'description' || key === 'message' || key === 'text') ? 2048 : MAX_ARG_STRING;
        value = value.trim().slice(0, maxLen);
        if (!value && key !== 'description') continue;
      } else if (def.type === 'integer') {
        const num = typeof value === 'string' ? Number(value.trim()) : value;
        if (!Number.isFinite(num)) return { ok: false, error: `Argumento "${key}" inválido.` };
        value = Math.trunc(num);
      } else if (def.type === 'boolean') {
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (typeof value !== 'boolean') return { ok: false, error: `Argumento "${key}" inválido.` };
      } else if (def.type === 'array') {
        let arr = [];
        if (Array.isArray(value)) {
          arr = value;
        } else if (typeof value === 'string') {
          arr = value.split(/[\n|]/).map(s => s.trim()).filter(Boolean);
          if (arr.length <= 1) {
            arr = value.split(',').map(s => s.trim()).filter(Boolean);
          }
        }

        const cleanedOpts = [];
        const seen = new Set();
        for (const item of arr) {
          const rawStr = typeof item === 'object' && item !== null
            ? (item.optionName || item.text || item.title || item.value || JSON.stringify(item))
            : String(item || '');

          const sanitized = rawStr
            .replace(/^([0-9]{1,2}[.\-)]\s*|[-*•]\s*)/, '')
            .trim()
            .slice(0, 100);

          if (sanitized.length > 0 && !seen.has(sanitized.toLowerCase())) {
            seen.add(sanitized.toLowerCase());
            cleanedOpts.push(sanitized);
          }
        }

        if (cleanedOpts.length < 2) {
          return { ok: false, error: 'A enquete precisa de no mínimo 2 opções de voto distintas.' };
        }

        value = cleanedOpts.slice(0, 12);
      }

      if (Array.isArray(def.enum) && !def.enum.includes(value)) {
        return { ok: false, error: `Valor inválido para "${key}".` };
      }
      clean[key] = value;
    }

    for (const req of schema.required || []) {
      if (clean[req] === undefined) return { ok: false, error: `Argumento obrigatório ausente: "${req}".` };
    }

    // Ferramentas sem campos obrigatórios que não podem rodar vazias
    if (toolName === 'set_group_schedule' && !['closeTime', 'openTime', 'enabled'].some(k => clean[k] !== undefined)) {
      return { ok: false, error: 'Informe os horários de fechar/abrir ou ative/desative o agendamento.' };
    }

    return { ok: true, args: clean };
  }

  /**
   * Normaliza um horário para o formato HH:MM (ex: "7:00" -> "07:00", "23h" -> "23:00") ou "0"
   * @param {string} val
   * @returns {string|null}
   */
  _normalizeTime(val) {
    if (val === undefined || val === null) return null;
    const raw = String(val).trim().toLowerCase();
    if (raw === '0' || raw === 'off' || raw === 'nenhum' || raw === 'desativar') return '0';

    const matchHHMM = raw.match(/^([0-1]?[0-9]|2[0-3])[:h]([0-5][0-9])?$/);
    if (matchHHMM) {
      const hh = matchHHMM[1].padStart(2, '0');
      const mm = (matchHHMM[2] || '00').padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return null;
  }

  /**
   * Formata a exibição do usuário com menção @número e nome entre parênteses, se disponível
   * Ex: "559899944034 (Mello)" ou apenas "559899944034"
   * @param {string} from JID do grupo
   * @param {object} targetData Dados resolvidos do alvo
   * @returns {string}
   */
  _formatUserDisplay(from, targetData) {
    if (!targetData) return '';
    const num = targetData.displayNum || '';
    const knownName = targetData.name ||
                      (memoryEngine ? (memoryEngine.getParticipantName(from, targetData.phoneJid) || memoryEngine.getParticipantName(from, targetData.groupJid)) : null);
    if (knownName && String(knownName).trim() && !/^\d{8,15}$/.test(String(knownName).trim())) {
      return `${num} (${String(knownName).trim()})`;
    }
    return num;
  }

  /**
   * Resolve o participante alvo filtrando o próprio JID/LID do bot
   * Evita que "@Hermes bane @Infrator" ou reply ao próprio bot selecione o bot como alvo
   */
  async _resolveTargetSmart(sock, msg, from, targetArg = '') {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBotIdentity = (jidOrNum) => {
      if (!jidOrNum) return false;
      const clean = cleanJid(jidOrNum);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return (
        clean === botJid ||
        clean === botLid ||
        (botNum && num === botNum) ||
        (botLidNum && num === botLidNum)
      );
    };

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    // 0. Ref explícito do histórico ("m123"): resolvido por lookup determinístico no SQLite (autor real da mensagem)
    if (typeof targetArg === 'string' && /^m\d{1,9}$/i.test(targetArg.trim())) {
      const refData = memoryEngine.getMessageByRef(from, targetArg.trim());
      const refJid = refData ? cleanJid(refData.participant || refData.sender) : '';
      if (!refJid || isBotIdentity(refJid)) return null;
      return await resolveParticipant(sock, from, refJid);
    }

    // 1. Menções na mensagem que NÃO sejam o próprio bot
    const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    const nonBotMentions = mentions.filter(m => !isBotIdentity(m));
    if (nonBotMentions.length > 0) {
      return await resolveParticipant(sock, from, cleanJid(nonBotMentions[0]));
    }

    // 2. Número explícito passado em targetArg que NÃO seja o próprio bot
    if (targetArg && typeof targetArg === 'string') {
      const numMatch = targetArg.match(/@?(\d{8,15})/);
      if (numMatch && numMatch[1] && !isBotIdentity(numMatch[1])) {
        const candidateJid = targetArg.includes('@lid')
          ? `${numMatch[1]}@lid`
          : `${numMatch[1]}@s.whatsapp.net`;
        return await resolveParticipant(sock, from, candidateJid);
      }
    }

    // 3. Mensagem respondida (Quote), desde que não seja resposta a uma mensagem do próprio bot
    const quotedParticipant = contextInfo?.participant || contextInfo?.quotedMessage?.participant;
    if (quotedParticipant && !isBotIdentity(quotedParticipant)) {
      return await resolveParticipant(sock, from, cleanJid(quotedParticipant));
    } else if (quotedParticipant && isBotIdentity(quotedParticipant)) {
      // Se a citação foi em uma mensagem do próprio bot (ex: aviso de infração),
      // verifica se havia um participante mencionado na mensagem citada do bot
      const rawQuoted = contextInfo?.quotedMessage;
      const unwrapped = rawQuoted?.ephemeralMessage?.message ||
                        rawQuoted?.viewOnceMessage?.message ||
                        rawQuoted?.viewOnceMessageV2?.message ||
                        rawQuoted?.documentWithCaptionMessage?.message ||
                        rawQuoted;
      const botQuotedMentions = Array.isArray(unwrapped?.extendedTextMessage?.contextInfo?.mentionedJid)
        ? unwrapped.extendedTextMessage.contextInfo.mentionedJid
        : [];
      for (const m of botQuotedMentions) {
        if (m && !isBotIdentity(m)) {
          return await resolveParticipant(sock, from, cleanJid(m));
        }
      }
      const botText = (unwrapped?.conversation ||
                      unwrapped?.extendedTextMessage?.text ||
                      unwrapped?.imageMessage?.caption ||
                      unwrapped?.videoMessage?.caption || '').trim();
      const textMatches = botText.match(/@(\d{8,15})\b/g) || [];
      for (const tm of textMatches) {
        const rawNum = tm.replace('@', '');
        const jid = `${rawNum}@s.whatsapp.net`;
        if (!isBotIdentity(jid)) {
          return await resolveParticipant(sock, from, jid);
        }
      }
    }

    // 4. Busca por nome no histórico de conversas do grupo (ex: "Hermes, adverte o João")
    if (targetArg && typeof targetArg === 'string') {
      const cleanedArg = targetArg.trim().toLowerCase();
      if (cleanedArg && cleanedArg !== 'quoted' && cleanedArg !== 'mentioned') {
        const jidByName = memoryEngine.findParticipantByName(from, targetArg);
        if (jidByName && !isBotIdentity(jidByName)) {
          return await resolveParticipant(sock, from, cleanJid(jidByName));
        }
      }
    }

    // 5. Fallback padrão
    return await resolveTarget(sock, msg, from, targetArg);
  }

  /**
   * Alvos EXPLÍCITOS da mensagem do admin: pessoas marcadas (@) ou autor da mensagem respondida (reply).
   * Exclui o próprio bot. É a única origem aceita para remoções (ban / blacklist add).
   * @returns {Promise<Array<object>>} participantes resolvidos (mesmo formato de resolveParticipant)
   */
  async _getExplicitTargets(sock, msg, from) {
    const botJid = cleanJid(sock?.user?.id || '');
    const botLid = cleanJid(sock?.user?.lid || '');
    const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBot = (jid) => {
      const clean = cleanJid(jid);
      const num = clean.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return clean === botJid || clean === botLid || (botNum && num === botNum) || (botLidNum && num === botLidNum);
    };

    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message ||
                    msg?.message?.viewOnceMessageV2?.message ||
                    msg?.message?.documentWithCaptionMessage?.message ||
                    msg?.message;

    const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                        realMsg?.imageMessage?.contextInfo ||
                        realMsg?.videoMessage?.contextInfo ||
                        realMsg?.documentMessage?.contextInfo ||
                        msg?.message?.extendedTextMessage?.contextInfo;

    const candidates = [];
    const mentions = Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : [];
    for (const m of mentions) {
      if (m && !isBot(m)) candidates.push(cleanJid(m));
    }
    const quotedParticipant = contextInfo?.participant;
    if (quotedParticipant && !isBot(quotedParticipant)) {
      candidates.push(cleanJid(quotedParticipant));
    } else if (quotedParticipant && isBot(quotedParticipant)) {
      // Se respondeu a uma mensagem do próprio bot, extrai os membros mencionados naquela mensagem do bot
      const rawQuoted = contextInfo?.quotedMessage;
      const unwrapped = rawQuoted?.ephemeralMessage?.message ||
                        rawQuoted?.viewOnceMessage?.message ||
                        rawQuoted?.viewOnceMessageV2?.message ||
                        rawQuoted?.documentWithCaptionMessage?.message ||
                        rawQuoted;
      const botQuotedMentions = Array.isArray(unwrapped?.extendedTextMessage?.contextInfo?.mentionedJid)
        ? unwrapped.extendedTextMessage.contextInfo.mentionedJid
        : [];
      for (const m of botQuotedMentions) {
        if (m && !isBot(m)) candidates.push(cleanJid(m));
      }
      const botText = (unwrapped?.conversation ||
                      unwrapped?.extendedTextMessage?.text ||
                      unwrapped?.imageMessage?.caption ||
                      unwrapped?.videoMessage?.caption || '').trim();
      const textMatches = botText.match(/@(\d{8,15})\b/g) || [];
      for (const tm of textMatches) {
        const rawNum = tm.replace('@', '');
        const jid = `${rawNum}@s.whatsapp.net`;
        if (!isBot(jid)) candidates.push(jid);
      }
    }

    const resolved = [];
    for (const jid of [...new Set(candidates)]) {
      const data = await resolveParticipant(sock, from, jid);
      if (data) resolved.push(data);
    }
    return resolved;
  }

  /**
   * Garante que a remoção só atinja quem o admin marcou (@) ou a quem respondeu (reply).
   * Se o modelo escolheu o alvo só pelo contexto (ref "mNN", nome ou número), a ação é recusada.
   * @returns {Promise<{ targetData?: object, error?: string }>}
   */
  async _requireExplicitTarget(sock, msg, from, targetArg, lang) {
    const explicit = await this._getExplicitTargets(sock, msg, from);
    if (explicit.length === 0) {
      return { error: t(lang, 'hermes.need_explicit_target') };
    }

    const arg = String(targetArg || '').trim().toLowerCase();
    if (!arg || arg === 'quoted' || arg === 'mentioned') {
      return { targetData: explicit[0] };
    }

    const chosen = await this._resolveTargetSmart(sock, msg, from, targetArg);
    if (!chosen) return { error: t(lang, 'common.not_found_target') };

    const idsOf = (d) => [d.groupJid, d.phoneJid, d.displayNum].filter(Boolean).map(String);
    const chosenIds = new Set(idsOf(chosen));
    const match = explicit.find(e => idsOf(e).some(id => chosenIds.has(id)));
    if (!match) {
      return { error: t(lang, 'hermes.need_explicit_target') };
    }
    return { targetData: match };
  }

  /**
   * Executa uma ferramenta com validação determinística de permissões (Anti-Prompt Injection)
   * O LLM sugere a ação, mas o código Node.js valida e barra tentativas não autorizadas.
   * @param {object} params
   * @param {object} params.sock Baileys socket
   * @param {object} params.msg Mensagem original
   * @param {string} params.from JID do grupo
   * @param {string} params.sender JID do remetente original
   * @param {string} params.toolName Nome da ferramenta invocada
   * @param {object} params.args Argumentos passados pelo modelo
   * @returns {Promise<{ success: boolean, message?: string, error?: string, mentions?: string[] }>}
   */
  async executeTool({ sock, msg, from, sender, toolName, args }) {
    if (!from || !from.endsWith('@g.us')) {
      return { success: false, error: 'Ferramentas de moderação só podem ser executadas dentro de grupos.' };
    }

    const lang = configManager.getGroupLang(from);

    // ========================================================
    // REGRA 2: VALIDAÇÃO DETERMINÍSTICA ANTI-PROMPT INJECTION
    // O Node.js valida obrigatoriamente se o remetente original é administrador.
    // Membros comuns tentando ordens administrativas são fisicamente barrados aqui.
    // ========================================================
    const isOwner = settings.isOwner(sender, sock);
    const adminCheck = await checkAdminStatus(sock, from, sender);
    const isAdmin = Boolean(adminCheck.isAdmin || isOwner);

    if (!isAdmin) {
      logger.warn({ sender, toolName, from }, 'Tentativa de Tool Call administrativa bloqueada para membro comum (Anti-Prompt Injection)');
      return {
        success: false,
        error: t(lang, 'common.no_permission_admin')
      };
    }

    // Bot precisa ser admin para a maioria das ações administrativas no WhatsApp
    const isBotAdmin = adminCheck.isBotAdmin;

    switch (toolName) {
      case 'ban_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        // Remoção só com alvo explícito: marcado (@) ou reply (nunca inferido pelo modelo)
        const guard = await this._requireExplicitTarget(sock, msg, from, args.target, lang);
        if (guard.error) {
          return { success: false, error: guard.error };
        }
        const targetData = guard.targetData;

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_bot') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: t(lang, 'ban.cannot_ban_admin') };
        }

        const banCfg = configManager.getPluginConfig(from, 'ban') || {};
        if (banCfg.deleteMessage !== false) {
          const realMsg = msg?.message?.ephemeralMessage?.message ||
                          msg?.message?.viewOnceMessage?.message ||
                          msg?.message;

          const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                              realMsg?.imageMessage?.contextInfo ||
                              msg?.message?.extendedTextMessage?.contextInfo;

          const quotedStanzaId = contextInfo?.stanzaId;
          const quotedParticipant = contextInfo?.participant;
          if (quotedStanzaId && cleanJid(quotedParticipant) !== botJid && cleanJid(quotedParticipant) !== botLid) {
            await safeDelete(sock, from, {
              remoteJid: from,
              id: quotedStanzaId,
              participant: quotedParticipant
            });
          }
        }

        await safeKick(sock, from, targetData.groupJid);

        const banMessage =
          banCfg.customMessage && String(banCfg.customMessage).trim().length > 0 && banCfg.customMessage !== '.'
            ? String(banCfg.customMessage).replace(/\{user\}/gi, `@${this._formatUserDisplay(from, targetData)}`)
            : t(lang, 'ban.success', { user: this._formatUserDisplay(from, targetData) });

        return {
          success: true,
          message: banMessage,
          mentions: [targetData.groupJid]
        };
      }

      case 'set_group_mute': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        // Se action === 'close' e duration for fornecido (ex: "tranca por 30m", "fecha por 1 hora"):
        // Tranca o grupo imediatamente e agenda a reabertura automática após o tempo!
        const durationCandidate = args.duration || (args.action === 'close' && args.time && /(?:por|durante|\b\d+\s*(?:m|min|mins|minutos?|h|hrs?|horas?)\b)/i.test(args.time) && !/^(?:[aàá]s|\d{1,2}:\d{2})/i.test(args.time) ? args.time : null);
        if (args.action === 'close' && durationCandidate) {
          const durRel = parseRelativeTime(durationCandidate);
          if (durRel.success && durRel.delayMinutes > 0) {
            await sock.groupSettingUpdate(from, 'announcement');

            const cfg = configManager.getPluginConfig(from, 'calendar') || {};
            const events = Array.isArray(cfg.events) ? cfg.events : [];
            const maxId = events.reduce((max, e) => Math.max(max, parseInt(e.id, 10) || 0), 0);
            const newId = String(maxId + 1);

            const scheduledEvent = {
              id: newId,
              action: 'open_group',
              date: durRel.formattedDate,
              time: durRel.formattedTime,
              text: 'Reabertura automática do grupo após fechamento temporário',
              createdBy: sender.replace(/@.*$/, ''),
              createdAt: Date.now(),
              executed: false
            };

            events.push(scheduledEvent);
            configManager.updatePluginConfig(from, 'calendar', { events, enabled: true });

            if (durRel.delayMs <= 120 * 60 * 1000) {
              const timer = setTimeout(async () => {
                try {
                  const currentCfg = configManager.getPluginConfig(from, 'calendar') || {};
                  const currentEvents = Array.isArray(currentCfg.events) ? currentCfg.events : [];
                  const ev = currentEvents.find(e => String(e.id) === newId);
                  if (ev && !ev.executed) {
                    ev.executed = true;
                    ev.executedAt = Date.now();
                    configManager.updatePluginConfig(from, 'calendar', { events: currentEvents });
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sendSafeMessage(sock, from, { text: t(lang, 'mute.opened') });
                  }
                } catch (err) {
                  logger.error({ err, from, newId }, 'Erro ao reabrir grupo temporizado');
                }
              }, durRel.delayMs);
              if (timer.unref) timer.unref();
            }

            return {
              success: true,
              message: `🔒 *Grupo trancado!*\n🔓 Reabertura automática programada ${durRel.humanLabel}.`
            };
          }
        }

        const delayArg = args.delayMinutes || args.time;
        if (delayArg) {
          const rel = parseRelativeTime(delayArg);
          if (rel.success && rel.delayMinutes > 0) {
            const calendarAction = args.action === 'close' ? 'close_group' : 'open_group';
            const cfg = configManager.getPluginConfig(from, 'calendar') || {};
            const events = Array.isArray(cfg.events) ? cfg.events : [];
            const maxId = events.reduce((max, e) => Math.max(max, parseInt(e.id, 10) || 0), 0);
            const newId = String(maxId + 1);

            const isClose = args.action === 'close';
            const actionLabel = isClose ? 'Fechamento do grupo' : 'Abertura do grupo';
            const scheduledEvent = {
              id: newId,
              action: calendarAction,
              date: rel.formattedDate,
              time: rel.formattedTime,
              text: `${actionLabel} programado pelo administrador`,
              createdBy: sender.replace(/@.*$/, ''),
              createdAt: Date.now(),
              executed: false
            };

            events.push(scheduledEvent);
            configManager.updatePluginConfig(from, 'calendar', { events, enabled: true });

            // Se for atraso curto (até 120 minutos), agenda timer de alta precisão em memória
            // além da persistência no calendar.js (que garante recuperação mesmo se o bot reiniciar)
            if (rel.delayMs <= 120 * 60 * 1000) {
              const timer = setTimeout(async () => {
                try {
                  const currentCfg = configManager.getPluginConfig(from, 'calendar') || {};
                  const currentEvents = Array.isArray(currentCfg.events) ? currentCfg.events : [];
                  const ev = currentEvents.find(e => String(e.id) === newId);
                  if (ev && !ev.executed) {
                    ev.executed = true;
                    ev.executedAt = Date.now();
                    configManager.updatePluginConfig(from, 'calendar', { events: currentEvents });

                    const waAction = isClose ? 'announcement' : 'not_announcement';
                    await sock.groupSettingUpdate(from, waAction);
                    const msgKey = isClose ? 'mute.closed' : 'mute.opened';
                    await sendSafeMessage(sock, from, { text: t(lang, msgKey) });
                  }
                } catch (err) {
                  logger.error({ err, from, newId }, 'Erro ao executar fechamento/abertura temporizado do grupo');
                }
              }, rel.delayMs);
              if (timer.unref) timer.unref();
            }

            const responseText = isClose
              ? `🔒 *Fechamento Programado:*\nO grupo será fechado ${rel.humanLabel}.`
              : `🔓 *Abertura Programada:*\nO grupo será aberto ${rel.humanLabel}.`;

            return {
              success: true,
              message: responseText
            };
          }
        }

        const action = args.action === 'close' ? 'announcement' : 'not_announcement';
        await sock.groupSettingUpdate(from, action);

        return {
          success: true,
          message: action === 'announcement'
            ? t(lang, 'mute.closed')
            : t(lang, 'mute.opened')
        };
      }

      case 'set_group_schedule': {
        const currentCfg = configManager.getPluginConfig(from, 'schedule') || {};
        if (args.enabled === false) {
          configManager.setPluginEnabled(from, 'schedule', false);
          return {
            success: true,
            message: `${t(lang, 'common.saved')}\n⏰ *Horários Automáticos:* ${t(lang, 'common.disabled')}`
          };
        }

        const normClose = args.closeTime !== undefined ? this._normalizeTime(args.closeTime) : null;
        const normOpen = args.openTime !== undefined ? this._normalizeTime(args.openTime) : null;

        if (args.closeTime !== undefined && !normClose) {
          return { success: false, error: 'Formato de horário de fechamento inválido. Use HH:MM (ex: 23:00).' };
        }
        if (args.openTime !== undefined && !normOpen) {
          return { success: false, error: 'Formato de horário de abertura inválido. Use HH:MM (ex: 07:00).' };
        }

        const closeTime = normClose || currentCfg.closeTime || '23:00';
        const openTime = normOpen || currentCfg.openTime || '07:00';

        configManager.updatePluginConfig(from, 'schedule', {
          closeTime,
          openTime,
          enabled: true
        });

        return {
          success: true,
          message: t(lang, 'schedule.status', {
            status: t(lang, 'common.enabled'),
            close: closeTime === '0' ? '—' : closeTime,
            open: openTime === '0' ? '—' : openTime
          })
        };
      }

      case 'toggle_group_protection': {
        const rawMod = String(args.module || '').toLowerCase();
        const mod = rawMod === 'agenda' ? 'calendar' : rawMod;
        const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'autoapprove'];
        if (!validModules.includes(mod)) {
          return { success: false, error: `Módulo "${mod}" inválido.` };
        }

        const currentCfg = configManager.getPluginConfig(from, mod) || {};
        const enabled = args.enabled !== undefined ? Boolean(args.enabled) : (currentCfg.enabled !== false);
        const updates = { enabled };

        let extraFeedback = '';

        if (mod === 'antilink') {
          // Se especificou maxWarns (ex: "ban no 2º link", "2 links = ban"):
          // A ação do antilink é 'warn' (adverte a cada link) e o limite de warn é maxWarns
          if (args.maxWarns && Number(args.maxWarns) >= 1) {
            updates.action = 'warn';
            const warnLimit = parseInt(args.maxWarns, 10);
            configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
            extraFeedback = `\n⚠️ *Regra de Punição:* Banimento automático no ${warnLimit}º link (${warnLimit} advertências).`;
          } else if (args.action && ['delete', 'warn', 'ban'].includes(args.action)) {
            updates.action = args.action;
          }

          if (args.allowedDomains !== undefined) {
            const rawDoms = String(args.allowedDomains).trim();
            updates.allowedDomains = (rawDoms === '.' || rawDoms === '' || rawDoms === 'todos')
              ? []
              : rawDoms.split(/[\s,]+/).map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')).filter(Boolean);
          }
        }

        if (mod === 'antiflood') {
          if (args.maxWarns && Number(args.maxWarns) >= 1) {
            updates.action = 'warn';
            const warnLimit = parseInt(args.maxWarns, 10);
            configManager.updatePluginConfig(from, 'warn', { maxWarns: warnLimit, enabled: true });
            extraFeedback = `\n⚠️ *Regra de Punição:* Banimento automático na ${warnLimit}ª advertência de flood.`;
          } else if (args.action && ['warn', 'ban'].includes(args.action)) {
            updates.action = args.action;
          }
          if (args.maxMessages && Number(args.maxMessages) >= 2) {
            updates.maxMessages = parseInt(args.maxMessages, 10);
          }
          if (args.maxChars && Number(args.maxChars) >= 100) {
            updates.maxChars = parseInt(args.maxChars, 10);
          }
        }

        if (mod === 'antifake' && args.allowedDdis !== undefined) {
          const ddis = String(args.allowedDdis).split(/[\s,]+/).map(d => d.replace(/\D/g, '')).filter(Boolean);
          if (ddis.length > 0) updates.allowedDdis = ddis;
        }

        if (mod === 'welcome') {
          if (args.welcomeMessage && String(args.welcomeMessage).trim().length > 0) {
            updates.message = String(args.welcomeMessage).trim();
          }
          if (args.autoDeleteSeconds !== undefined && Number(args.autoDeleteSeconds) >= 0) {
            updates.autoDeleteSeconds = parseInt(args.autoDeleteSeconds, 10);
          }
        }

        if (mod === 'automsg') {
          if (args.autoMsgText && String(args.autoMsgText).trim().length > 0) {
            updates.message = String(args.autoMsgText).trim();
          }
          if (args.intervalMinutes && Number(args.intervalMinutes) > 0) {
            updates.intervalMinutes = Math.max(parseInt(args.intervalMinutes, 10), 5);
          }
        }

        if (mod === 'warn' && args.maxWarns && Number(args.maxWarns) >= 1) {
          updates.maxWarns = parseInt(args.maxWarns, 10);
          extraFeedback = `\n⚠️ *Limite:* Banimento configurado para ${updates.maxWarns} advertências.`;
        }

        if (mod === 'ban' && args.customBanMessage !== undefined) {
          updates.customMessage = String(args.customBanMessage).trim();
        }

        if (mod === 'hermes' && args.personality && ['descontraido', 'formal'].includes(args.personality)) {
          updates.personality = args.personality;
        }

        if (mod === 'calendar' && args.mentionAll !== undefined) {
          updates.mentionAll = Boolean(args.mentionAll);
        }

        if (Object.keys(updates).length > 1) {
          configManager.updatePluginConfig(from, mod, updates);
        } else {
          configManager.setPluginEnabled(from, mod, enabled);
        }

        const stateLabel = enabled ? t(lang, 'common.enabled') : t(lang, 'common.disabled');
        return {
          success: true,
          message: `${t(lang, 'common.saved')}\n⚙️ *${mod.toUpperCase()}:* ${stateLabel}${extraFeedback}`
        };
      }

      case 'set_group_settings': {
        const results = [];
        if (args.lang && ['pt', 'es', 'en'].includes(args.lang)) {
          configManager.setGroupLang(from, args.lang);
          results.push(t(args.lang, 'lang.changed'));
        }
        if (args.prefix && String(args.prefix).trim().length === 1) {
          const newPrefix = String(args.prefix).trim();
          configManager.setGroupPrefix(from, newPrefix);
          results.push(t(lang, 'config.prefix_changed', { prefix: newPrefix }));
        }
        if (args.clearMemory) {
          memoryEngine.clearGroupMemory(from);
          results.push('🧹 *Memória limpa:* O histórico de conversas do Hermes neste grupo foi zerado.');
        }
        if (args.openPanel) {
          await wizardEngine.startConfigPanel(sock, msg, from, sender);
          return { success: true };
        }
        if (results.length > 0) {
          return { success: true, message: results.join('\n') };
        }
        return { success: false, error: t(lang, 'common.error') };
      }

      case 'warn_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: t(lang, 'warn.cannot_warn_admin') };
        }

        const reason = args.reason || 'Comportamento inadequado';
        const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
        const maxWarns = warnCfg.maxWarns || 3;
        const count = configManager.addWarn(from, targetData.phoneJid, reason);

        if (count >= maxWarns) {
          await safeKick(sock, from, targetData.groupJid);
          configManager.resetWarns(from, targetData.phoneJid);
          return {
            success: true,
            message: t(lang, 'warn.max_reached', { user: this._formatUserDisplay(from, targetData), max: maxWarns }),
            mentions: [targetData.groupJid]
          };
        }

        return {
          success: true,
          message: t(lang, 'warn.added', { user: this._formatUserDisplay(from, targetData), reason, warns: count, max: maxWarns }),
          mentions: [targetData.groupJid]
        };
      }

      case 'unwarn_member': {
        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
        const maxWarns = warnCfg.maxWarns || 3;
        const remaining = configManager.removeWarn(from, targetData.phoneJid);

        return {
          success: true,
          message: t(lang, 'warn.removed', { user: this._formatUserDisplay(from, targetData), warns: remaining, max: maxWarns }),
          mentions: [targetData.groupJid]
        };
      }

      case 'mute_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        if (targetData.groupJid === botJid || targetData.groupJid === botLid || (botNum && targetData.displayNum === botNum)) {
          return { success: false, error: t(lang, 'mutemember.cannot_mute_bot') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'mutemember.cannot_mute_owner') };
        }

        const targetAdminCheck = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (targetAdminCheck.isAdmin) {
          return { success: false, error: t(lang, 'mutemember.cannot_mute_admin') };
        }

        let parsedDuration = parseDuration(args.duration);
        if (!parsedDuration) {
          parsedDuration = { minutes: 15, ms: 15 * 60 * 1000, formatted: '15m' };
        }

        const reason = args.reason ? String(args.reason).trim() : '';
        const until = Date.now() + parsedDuration.ms;

        configManager.muteMember(from, targetData.phoneJid, until, reason, sender);

        const adminNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
        const adminText = `\n👮 *Por:* @${adminNum}`;
        const reasonText = reason ? `\n📝 *Motivo:* ${reason}` : '';

        const muteMsg = t(lang, 'mutemember.muted', {
          user: this._formatUserDisplay(from, targetData),
          duration: parsedDuration.formatted,
          admin: adminText,
          reason: reasonText
        });

        return {
          success: true,
          message: muteMsg,
          mentions: [targetData.groupJid, sender]
        };
      }

      case 'unmute_member': {
        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const isMuted = configManager.isMemberMuted(from, targetData.phoneJid);
        if (!isMuted) {
          return {
            success: true,
            message: t(lang, 'mutemember.not_muted', { user: this._formatUserDisplay(from, targetData) }),
            mentions: [targetData.groupJid]
          };
        }

        configManager.unmuteMember(from, targetData.phoneJid);
        return {
          success: true,
          message: t(lang, 'mutemember.unmuted', { user: this._formatUserDisplay(from, targetData) }),
          mentions: [targetData.groupJid]
        };
      }

      case 'manage_blacklist': {
        let targetData;
        if (args.action === 'remove') {
          targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
          if (!targetData) {
            return { success: false, error: t(lang, 'common.not_found_target') };
          }
        } else {
          // Adicionar à blacklist expulsa o membro: exige alvo marcado (@) ou reply
          const guard = await this._requireExplicitTarget(sock, msg, from, args.target, lang);
          if (guard.error) {
            return { success: false, error: guard.error };
          }
          targetData = guard.targetData;
        }

        if (args.action === 'remove') {
          configManager.removeGroupBlacklist(from, targetData.phoneJid);
          return {
            success: true,
            message: t(lang, 'blacklist.removed', { user: this._formatUserDisplay(from, targetData) }),
            mentions: [targetData.groupJid]
          };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'ban.cannot_ban_owner') };
        }

        configManager.addGroupBlacklist(from, targetData.phoneJid);
        if (isBotAdmin) {
          try {
            await safeKick(sock, from, targetData.groupJid);
          } catch (_) {}
        }

        return {
          success: true,
          message: t(lang, 'blacklist.added', { user: this._formatUserDisplay(from, targetData) }),
          mentions: [targetData.groupJid]
        };
      }

      case 'delete_message': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const realMsg = msg?.message?.ephemeralMessage?.message ||
                        msg?.message?.viewOnceMessage?.message ||
                        msg?.message;

        const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                            realMsg?.imageMessage?.contextInfo ||
                            msg?.message?.extendedTextMessage?.contextInfo;

        let deleteId = null;
        let deleteParticipant = null;

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');

        // 1. Prioridade absoluta: mensagem citada diretamente no chat (reply)
        if (contextInfo?.stanzaId) {
          deleteId = contextInfo.stanzaId;
          deleteParticipant = contextInfo.participant;

          // Blindagem de Segurança: se a mensagem citada for do próprio bot (Hermes),
          // SÓ apaga se o admin tiver intenção explícita de apagar no texto (ex: "apaga", "deleta", "limpa").
          // NUNCA apaga mensagens do próprio bot se a resposta for apenas confirmação ("sim", "pode", etc.)!
          const isQuotingBot = deleteParticipant && (
            cleanJid(deleteParticipant) === botJid ||
            cleanJid(deleteParticipant) === botLid
          );
          const rawText = (msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '').toLowerCase().trim();
          const hasExplicitDelete = /\b(apaga|apagar|deleta|deletar|limpa|limpar|some|tira|del|exclui|excluir)\b/i.test(rawText);

          if (isQuotingBot && !hasExplicitDelete) {
            logger.warn({ from, sender, rawText }, 'delete_message bloqueada: quote ao bot sem intenção explícita de exclusão');
            return {
              success: false,
              error: 'Ação cancelada: para apagar mensagens do bot, diga expressamente "apaga" ou "deleta".'
            };
          }
        } else if (args.messageId && /^m\d{1,9}$/i.test(String(args.messageId).trim())) {
          // 2. Ref do histórico ("m123") quando NÃO houve citação direta
          const refData = memoryEngine.getMessageByRef(from, String(args.messageId).trim());
          if (!refData || !refData.msgId) {
            return { success: false, error: t(lang, 'hermes.msg_not_found') };
          }
          deleteId = refData.msgId;
          deleteParticipant = refData.participant || refData.sender;
        }

        if (!deleteId) {
          return { success: false, error: t(lang, 'clear.reply_required') };
        }

        await safeDelete(sock, from, {
          remoteJid: from,
          id: deleteId,
          participant: deleteParticipant
        });

        return { success: true, message: t(lang, 'clear.success') };
      }

      case 'hidetag_announcement': {
        const text = args.message;
        if (!text || text.trim().length === 0) {
          return { success: false, error: t(lang, 'hidetag.empty') };
        }

        const metadata = await getGroupMetadata(sock, from);
        if (!metadata || !Array.isArray(metadata.participants)) {
          return { success: false, error: t(lang, 'common.error') };
        }

        const allMembers = new Set();
        metadata.participants.forEach(p => {
          if (p.id) allMembers.add(p.id);
          if (p.jid) allMembers.add(p.jid);
          if (p.lid) allMembers.add(p.lid);
        });

        await sendSafeMessage(sock, from, {
          text: `📢 *COMUNICADO:*\n\n${text.trim()}`,
          mentions: Array.from(allMembers)
        });

        return { success: true };
      }

      case 'promote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (check.isAdmin) {
          return { success: false, error: t(lang, 'promote.already_admin') };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'promote');
        groupCache.del(from);

        return {
          success: true,
          message: t(lang, 'promote.success', { user: this._formatUserDisplay(from, targetData) }),
          mentions: [targetData.groupJid]
        };
      }

      case 'demote_member': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const targetData = await this._resolveTargetSmart(sock, msg, from, args.target || '');
        if (!targetData) {
          return { success: false, error: t(lang, 'common.not_found_target') };
        }

        if (settings.isOwner(targetData.phoneJid, sock) || settings.isOwner(targetData.groupJid, sock)) {
          return { success: false, error: t(lang, 'demote.cannot_demote_owner') };
        }

        const check = await checkAdminStatus(sock, from, targetData.phoneJid);
        if (!check.isAdmin) {
          return { success: false, error: t(lang, 'demote.already_member') };
        }

        await sock.groupParticipantsUpdate(from, [targetData.groupJid], 'demote');
        groupCache.del(from);

        return {
          success: true,
          message: t(lang, 'demote.success', { user: this._formatUserDisplay(from, targetData) }),
          mentions: [targetData.groupJid]
        };
      }

      case 'manage_calendar': {
        const action = String(args.action || '').toLowerCase();
        const cfg = configManager.getPluginConfig(from, 'calendar') || {};
        const events = Array.isArray(cfg.events) ? cfg.events : [];

        if (action === 'add') {
          let parsedDate = null;
          let parsedTime = null;
          let relDelayMs = null;

          // 1. Tentar parse relativo se houver delayMinutes ou se time/date for expressão relativa
          const relCandidate = args.delayMinutes || args.time || args.date;
          if (args.delayMinutes || (typeof relCandidate === 'string' && /(?:daqui|dq|em\s+\d+|meia\s+hora|minutos?|horas?|amanh[aã]|hoje|\+\d+)/i.test(relCandidate))) {
            const rel = parseRelativeTime(args.delayMinutes || relCandidate);
            if (rel.success) {
              parsedDate = rel.formattedDate;
              parsedTime = rel.formattedTime;
              relDelayMs = rel.delayMs;
            }
          }

          // 2. Se não foi relativo, usar parsing padrão de date/time
          if (!parsedDate || !parsedTime) {
            const lowerDate = String(args.date || 'hoje').toLowerCase().trim();
            const now = new Date();
            const tz = settings.timezone || 'America/Sao_Paulo';

            if (lowerDate === 'hoje' || lowerDate === 'today' || lowerDate === 'hoy') {
              try {
                const parts = now.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
                parsedDate = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
              } catch (_) {
                parsedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
              }
            } else if (lowerDate === 'amanha' || lowerDate === 'amanhã' || lowerDate === 'tomorrow' || lowerDate === 'mañana') {
              const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
              try {
                const parts = tomorrow.toLocaleDateString('pt-BR', { timeZone: tz }).split('/');
                parsedDate = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
              } catch (_) {
                parsedDate = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;
              }
            } else {
              const dateMatch = lowerDate.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
              if (dateMatch) {
                const d = parseInt(dateMatch[1], 10);
                const m = parseInt(dateMatch[2], 10);
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                  parsedDate = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
                }
              }
            }

            if (!parsedTime && args.time) {
              const timeMatch = String(args.time).match(/^(\d{1,2})(?:[:hH](\d{2})?)?$/);
              if (timeMatch) {
                const h = parseInt(timeMatch[1], 10);
                const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                  parsedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
              }
            }
          }

          if (!parsedDate || !parsedTime) {
            return { success: false, error: 'Data ou hora inválida. Use formatos como "daqui a meia hora", "em 1 hora", "amanhã às 10h" ou data DD/MM e hora HH:MM.' };
          }

          const reminderText = String(args.text || args.message || 'Lembrete agendado pelo administrador').trim();

          // Detecção e inferência inteligente do tipo de ação agendada:
          let actionType = String(args.actionType || args.type || '').toLowerCase();
          if (!actionType || actionType === 'reminder') {
            const combinedText = `${reminderText} ${String(args.action || '')}`.toLowerCase();
            if (/enquete|poll|resultado|voto|vota[cç][aã]o|placar|parcial|ganh|apur/i.test(combinedText)) {
              actionType = 'poll_result';
            } else if (/sorte|raffle|sortear|ganhador/i.test(combinedText)) {
              actionType = 'raffle';
            } else if (/desfix|unpin|despin/i.test(combinedText)) {
              actionType = 'unpin';
            } else if (/fech|tranc|mute|lock/i.test(combinedText) && !/abrir/i.test(combinedText)) {
              actionType = 'close_group';
            } else if (/abr|unmute|unlock/i.test(combinedText)) {
              actionType = 'open_group';
            } else {
              actionType = 'reminder';
            }
          }

          const creatorData = await resolveParticipant(sock, from, sender);
          const creatorNum = creatorData?.displayNum || sender.replace(/@.*$/, '').replace(/\D/g, '');
          const creatorDisplay = creatorData?.displayUser || creatorNum;
          const creatorJid = creatorData?.groupJid || cleanJid(sender);
          const creatorPhoneJid = creatorData?.phoneJid || null;

          const maxId = events.reduce((max, e) => Math.max(max, parseInt(e.id, 10) || 0), 0);
          const newId = String(maxId + 1);
          const newEvent = {
            id: newId,
            date: parsedDate,
            time: parsedTime,
            text: reminderText,
            action: actionType,
            raffleQuantity: args.quantity ? parseInt(args.quantity, 10) : 1,
            rafflePrize: args.text || args.prize || '',
            createdBy: creatorNum,
            creatorDisplay,
            creatorJid,
            creatorPhoneJid,
            createdAt: Date.now(),
            executed: false
          };

          events.push(newEvent);
          configManager.updatePluginConfig(from, 'calendar', { events, enabled: true });

          // Se for atraso curto com delayMs calculado (até 120 minutos), agenda timer em memória
          if (relDelayMs && relDelayMs <= 120 * 60 * 1000) {
            const timer = setTimeout(async () => {
              try {
                const currentCfg = configManager.getPluginConfig(from, 'calendar') || {};
                const currentEvents = Array.isArray(currentCfg.events) ? currentCfg.events : [];
                const ev = currentEvents.find(e => String(e.id) === newId);
                if (ev && !ev.executed) {
                  ev.executed = true;
                  ev.executedAt = Date.now();
                  configManager.updatePluginConfig(from, 'calendar', { events: currentEvents });

                  await executeCalendarAction({ sock, groupJid: from, event: ev, lang, config: currentCfg });
                }
              } catch (err) {
                logger.error({ err, from, newId }, 'Erro ao disparar ação agendada temporizada');
              }
            }, relDelayMs);
            if (timer.unref) timer.unref();
          }

          let confirmMsg = '';
          if (actionType === 'poll_result') {
            confirmMsg = `📊 Apuração da enquete agendada com sucesso para ${parsedTime} (${parsedDate}). No horário, os votos serão apurados e o resultado oficial será publicado aqui no grupo!`;
          } else if (actionType === 'raffle') {
            const prizeInfo = args.text ? ` (${args.text})` : '';
            confirmMsg = `🎲 Sorteio agendado com sucesso para ${parsedTime} (${parsedDate})${prizeInfo}. No horário marcado, o ganhador será anunciado!`;
          } else if (actionType === 'unpin') {
            confirmMsg = `📌 Desafixação de mensagens agendada com sucesso para ${parsedTime} (${parsedDate}).`;
          } else if (actionType === 'close_group') {
            confirmMsg = `🔒 Fechamento do grupo agendado com sucesso para ${parsedTime} (${parsedDate}).`;
          } else if (actionType === 'open_group') {
            confirmMsg = `🔓 Abertura do grupo agendada com sucesso para ${parsedTime} (${parsedDate}).`;
          } else {
            confirmMsg = t(lang, 'calendar.added', {
              id: newId,
              date: parsedDate,
              time: parsedTime,
              text: newEvent.text
            });
          }

          return {
            success: true,
            message: confirmMsg
          };
        }

        if (action === 'delete') {
          const targetId = String(args.eventId || '').trim().replace(/^#/, '');
          if (!targetId) return { success: false, error: 'Informe o ID do agendamento para remover.' };
          const idx = events.findIndex(e => String(e.id) === targetId);
          if (idx === -1) return { success: false, error: t(lang, 'calendar.not_found', { id: targetId }) };
          events.splice(idx, 1);
          configManager.updatePluginConfig(from, 'calendar', { events });
          return { success: true, message: t(lang, 'calendar.deleted', { id: targetId }) };
        }

        if (action === 'clear') {
          configManager.updatePluginConfig(from, 'calendar', { events: [] });
          return { success: true, message: t(lang, 'calendar.cleared') };
        }

        if (action === 'list') {
          const activeEvents = events.filter(e => !e.executed);
          if (activeEvents.length === 0) {
            return {
              success: true,
              message: t(lang, 'calendar.list_empty', { prefix: configManager.getGroupPrefix(from) || '!' })
            };
          }
          let listText = `${t(lang, 'calendar.list_title')}\n\n`;
          activeEvents.forEach(e => {
            listText += `${t(lang, 'calendar.item', { id: e.id, date: e.date, time: e.time, text: e.text })}\n`;
          });
          return { success: true, message: listText };
        }

        return { success: false, error: `Ação "${action}" desconhecida.` };
      }

      case 'raffle_members': {
        let metadata = await getGroupMetadata(sock, from);
        if (!metadata || !Array.isArray(metadata.participants)) {
          try {
            metadata = await sock.groupMetadata(from);
          } catch (_) {}
        }

        if (!metadata || !Array.isArray(metadata.participants) || metadata.participants.length <= 1) {
          return { success: false, error: t(lang, 'raffle.not_enough') };
        }

        const botJid = sock?.user?.id ? cleanJid(sock.user.id) : '';
        const botLid = sock?.user?.lid ? cleanJid(sock.user.lid) : '';
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        let pool = metadata.participants.filter(p => {
          const pId = cleanJid(p.id);
          const pLid = p.lid ? cleanJid(p.lid) : '';
          const pJid = p.jid ? cleanJid(p.jid) : '';
          const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');

          if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
          if (p.admin === 'admin' || p.admin === 'superadmin') return false;
          return true;
        });

        if (pool.length === 0) {
          pool = metadata.participants.filter(p => {
            const pId = cleanJid(p.id);
            const pLid = p.lid ? cleanJid(p.lid) : '';
            const pJid = p.jid ? cleanJid(p.jid) : '';
            const pNum = pJid.replace(/@.*$/, '').replace(/\D/g, '') || pId.replace(/@.*$/, '').replace(/\D/g, '');
            if (pId === botJid || pLid === botLid || (botNum && pNum === botNum)) return false;
            return true;
          });
        }

        if (pool.length === 0) {
          return { success: false, error: t(lang, 'raffle.not_enough') };
        }

        const count = Math.min(Math.max(parseInt(args.quantity, 10) || 1, 1), pool.length);
        const prize = args.prize || 'Sorteio do Grupo';

        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const winners = shuffled.slice(0, count);
        const mentions = [];
        let winnersText = '';

        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const resolved = await resolveParticipant(sock, from, w.id);
          const displayNum = resolved?.displayNum || cleanJid(w.id).replace(/@.*$/, '').replace(/\D/g, '');
          const targetGroup = resolved?.groupJid || cleanJid(w.id);
          mentions.push(targetGroup);
          winnersText += `🏅 *${i + 1}º Lugar:* @${displayNum}\n`;
        }

        const resultMsg = `${t(lang, 'raffle.title')}\n${t(lang, 'raffle.prize', { prize })}\n\n${t(lang, 'raffle.winners', { winners: winnersText })}`;
        await sendSafeMessage(sock, from, { text: resultMsg, mentions });

        return { success: true };
      }

      case 'set_group_description': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const realMsg = msg?.message?.ephemeralMessage?.message ||
                        msg?.message?.viewOnceMessage?.message ||
                        msg?.message?.viewOnceMessageV2?.message ||
                        msg?.message?.documentWithCaptionMessage?.message ||
                        msg?.message;

        const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                            realMsg?.imageMessage?.contextInfo ||
                            realMsg?.videoMessage?.contextInfo ||
                            realMsg?.documentMessage?.contextInfo;

        const rawQuoted = contextInfo?.quotedMessage;
        const unwrappedQuoted = rawQuoted?.ephemeralMessage?.message ||
                                rawQuoted?.viewOnceMessage?.message ||
                                rawQuoted?.viewOnceMessageV2?.message ||
                                rawQuoted?.documentWithCaptionMessage?.message ||
                                rawQuoted;

        const quotedText = (unwrappedQuoted?.conversation ||
                            unwrappedQuoted?.extendedTextMessage?.text ||
                            unwrappedQuoted?.imageMessage?.caption ||
                            unwrappedQuoted?.videoMessage?.caption ||
                            '').trim();

        let newDesc = typeof args.description === 'string' ? args.description.trim() : '';

        // Se o admin falou "coloque isso de descrição" respondendo a uma mensagem
        const isReferential = !newDesc || /^(isso|isto|essa|esse|esta|este|o texto acima|a mensagem citada|a resposta acima|o que está citado)$/i.test(newDesc);
        if (isReferential && quotedText.length > 0) {
          newDesc = quotedText;
        }

        const isClearing = !newDesc || ['limpar', 'clear', 'remover', 'del', 'apagar', '-'].includes(newDesc.toLowerCase());

        try {
          await sock.groupUpdateDescription(from, isClearing ? '' : newDesc);
          groupCache.del(from);

          return {
            success: true,
            message: isClearing ? t(lang, 'setdesc.cleared') : t(lang, 'setdesc.success')
          };
        } catch (err) {
          logger.error({ err, from }, 'Erro ao atualizar descrição via Tool Call do Hermes');
          return {
            success: false,
            error: t(lang, 'setdesc.error')
          };
        }
      }

      case 'set_group_picture': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const action = args.action || 'update';
        if (action === 'remove') {
          try {
            await sock.removeProfilePicture(from);
            return {
              success: true,
              message: t(lang, 'setpic.cleared')
            };
          } catch (err) {
            logger.error({ err, from }, 'Erro ao remover foto do grupo via Hermes');
            return { success: false, error: t(lang, 'setpic.error') };
          }
        }

        const setpicPlugin = require('../plugins/admin/setpic');
        const buffer = await setpicPlugin.extractImageBuffer(sock, msg);
        if (!buffer) {
          return {
            success: false,
            error: t(lang, 'setpic.no_image', { prefix: configManager.getGroupPrefix(from) || '!' })
          };
        }

        try {
          await sock.updateProfilePicture(from, buffer);
          return {
            success: true,
            message: t(lang, 'setpic.success')
          };
        } catch (err) {
          logger.error({ err, from }, 'Erro ao atualizar foto do grupo via Hermes');
          return { success: false, error: t(lang, 'setpic.error') };
        }
      }

      case 'pin_group_message': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const action = args.action || 'pin';

        // 1. Desafixar todas as mensagens fixadas do grupo
        if (action === 'unpin_all') {
          const pinnedList = pinTracker.getPinned(from);
          if (pinnedList.length === 0) {
            return {
              success: true,
              message: '📌 Não há mensagens fixadas registradas neste grupo.'
            };
          }
          let count = 0;
          for (const key of pinnedList) {
            try {
              await sock.sendMessage(from, { pin: key, type: 2 });
              count += 1;
              await new Promise(r => setTimeout(r, 400));
            } catch (_) {}
          }
          pinTracker.clearPins(from);
          return {
            success: true,
            message: `📌 Todas as ${count} mensagem(ns) fixada(s) foram desafixadas com sucesso!`
          };
        }

        const realMsg = msg?.message?.ephemeralMessage?.message ||
                        msg?.message?.viewOnceMessage?.message ||
                        msg?.message?.viewOnceMessageV2?.message ||
                        msg?.message?.documentWithCaptionMessage?.message ||
                        msg?.message;

        const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                            realMsg?.imageMessage?.contextInfo ||
                            realMsg?.videoMessage?.contextInfo ||
                            realMsg?.documentMessage?.contextInfo;

        let targetStanzaId = null;
        let targetParticipant = null;

        // Prioridade absoluta: mensagem citada diretamente no chat (reply)
        if (contextInfo?.stanzaId) {
          targetStanzaId = contextInfo.stanzaId;
          targetParticipant = contextInfo.participant;
        } else if (args.messageId && /^m\d{1,9}$/i.test(args.messageId.trim())) {
          // Ref explícito do histórico (ex: "m123") quando NÃO houve citação física
          const refData = memoryEngine.getMessageByRef(from, args.messageId.trim());
          if (refData?.msgId) {
            targetStanzaId = refData.msgId;
            targetParticipant = refData.participant || refData.sender;
          }
        }

        // Se pediu para desafixar mas não apontou mensagem, tenta desafixar as conhecidas do grupo
        if (action === 'unpin' && !targetStanzaId) {
          const pinnedList = pinTracker.getPinned(from);
          if (pinnedList.length > 0) {
            let count = 0;
            for (const key of pinnedList) {
              try {
                await sock.sendMessage(from, { pin: key, type: 2 });
                count += 1;
                await new Promise(r => setTimeout(r, 400));
              } catch (_) {}
            }
            pinTracker.clearPins(from);
            return {
              success: true,
              message: `📌 ${count} mensagem(ns) fixada(s) foram desafixadas com sucesso!`
            };
          }
          return { success: false, error: t(lang, 'pin.reply_required') };
        }

        if (!targetStanzaId) {
          return { success: false, error: t(lang, 'pin.reply_required') };
        }

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const botNum = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
        const botLidNum = botLid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        const cleanParticipant = cleanJid(targetParticipant || '');
        const cleanParticipantNum = cleanParticipant.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

        const isFromMe = cleanParticipant === botJid ||
                         cleanParticipant === botLid ||
                         (botNum && cleanParticipantNum === botNum) ||
                         (botLidNum && cleanParticipantNum === botLidNum);

        const targetKey = {
          remoteJid: from,
          fromMe: isFromMe,
          id: targetStanzaId,
          participant: isFromMe ? (cleanParticipant || botJid || undefined) : (targetParticipant || undefined)
        };

        if (action === 'unpin') {
          try {
            await sock.sendMessage(from, {
              pin: targetKey,
              type: 2 // 2 = UNPIN_FOR_ALL
            });
            pinTracker.removePin(from, targetKey.id);
            return {
              success: true,
              message: t(lang, 'pin.unpinned')
            };
          } catch (err) {
            logger.error({ err, from }, 'Erro ao desafixar mensagem via Hermes');
            return { success: false, error: t(lang, 'pin.error') };
          }
        }

        let durationSecs = 86400;
        let durationLabel = '24 horas';
        if (args.duration === '7d') {
          durationSecs = 604800;
          durationLabel = '7 dias';
        } else if (args.duration === '30d') {
          durationSecs = 2592000;
          durationLabel = '30 dias';
        }

        try {
          await sock.sendMessage(from, {
            pin: targetKey,
            type: 1, // 1 = PIN_FOR_ALL
            time: durationSecs
          });
          pinTracker.addPin(from, targetKey);
          return {
            success: true,
            message: t(lang, 'pin.pinned', { duration: durationLabel })
          };
        } catch (err) {
          logger.error({ err, from }, 'Erro ao fixar mensagem via Hermes');
          return { success: false, error: t(lang, 'pin.error') };
        }
      }

      case 'get_group_invite_link': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const action = args.action || 'get';
        try {
          if (action === 'revoke') {
            const code = await sock.groupRevokeInvite(from);
            return {
              success: true,
              message: t(lang, 'link.revoked', { code })
            };
          }

          const code = await sock.groupInviteCode(from);
          return {
            success: true,
            message: t(lang, 'link.success', { code })
          };
        } catch (err) {
          logger.error({ err, from, action }, 'Erro ao obter/revogar link de convite via Hermes');
          return { success: false, error: t(lang, 'link.error') };
        }
      }

      case 'create_group_poll': {
        const title = typeof args.title === 'string' ? args.title.trim().slice(0, 255) : '';
        const options = Array.isArray(args.options) ? args.options : [];
        const isMultiple = Boolean(args.multipleAnswers);

        if (!title || options.length < 2) {
          return {
            success: false,
            error: t(lang, 'poll.error_options')
          };
        }

        try {
          const sent = await sendSafeMessage(sock, from, {
            poll: {
              name: title,
              values: options.slice(0, 12),
              selectableCount: isMultiple ? 0 : 1
            }
          });

          if (sent?.key?.id) {
            pollTracker.savePoll(from, sent);
          }

          const typeLabel = isMultiple ? t(lang, 'poll.type_multi') : t(lang, 'poll.type_single');
          const confirmMsg = t(lang, 'poll.success', {
            title,
            type: typeLabel,
            count: options.length
          });

          return {
            success: true,
            message: confirmMsg
          };
        } catch (err) {
          logger.error({ err, from, title }, 'Erro ao criar enquete via Hermes');
          return {
            success: false,
            error: t(lang, 'poll.error')
          };
        }
      }

      case 'get_poll_results': {
        const targetId = typeof args.pollId === 'string' ? args.pollId.trim() : null;
        const pollResults = pollTracker.getPollResults(from, targetId);
        if (!pollResults) {
          return {
            success: true,
            message: 'Nenhuma enquete recente com votos registrados foi encontrada neste grupo.'
          };
        }

        const winnerStr = pollResults.winner
          ? `🏆 Vencedor atual: "${pollResults.winner.name}" com ${pollResults.winner.votes} voto(s)`
          : (pollResults.isTie ? '⚖️ Empate entre as opções mais votadas' : 'Nenhum voto computado ainda');

        return {
          success: true,
          message: `📊 *Resultado da Enquete: "${pollResults.title}"*\n\n${pollResults.summary.split(' | ').map(s => `• ${s}`).join('\n')}\n\n${winnerStr}\n(Total de votos apurados: ${pollResults.totalVotes})`
        };
      }

      case 'learn_group_fact': {
        const category = String(args.category || 'fact').toLowerCase();
        const key = typeof args.key === 'string' ? args.key.trim().slice(0, 100) : '';
        const value = typeof args.value === 'string' ? args.value.trim().slice(0, 300) : '';

        if (!key || !value) {
          return { success: false, error: 'Chave e valor são obrigatórios para registrar o fato.' };
        }

        if (category === 'rule') {
          configManager.addCultureRule(from, `${key}: ${value}`);
        } else if (category === 'tone') {
          configManager.updateGroupCulture(from, { tone: value, vibe: key });
        } else {
          configManager.addCultureFact(from, key, value);
        }

        const confirmMsg = t(lang, 'hermes.fact_learned', { key, value });
        return {
          success: true,
          message: confirmMsg
        };
      }

      case 'forget_group_fact': {
        const key = typeof args.key === 'string' ? args.key.trim().slice(0, 100) : '';
        if (!key) {
          return { success: false, error: 'Informe a chave do fato a ser esquecido.' };
        }

        const removed = configManager.removeCultureFact(from, key);
        const confirmMsg = removed
          ? t(lang, 'hermes.fact_forgotten', { key })
          : t(lang, 'hermes.fact_not_found', { key });

        return {
          success: true,
          message: confirmMsg
        };
      }

      case 'manage_join_requests': {
        if (!isBotAdmin) {
          return { success: false, error: t(lang, 'common.bot_not_admin') };
        }

        const autoapprovePlugin = require('../plugins/admin/autoapprove');

        if (args.action === 'enable_auto') {
          configManager.setPluginEnabled(from, 'autoapprove', true);
          return {
            success: true,
            message: '✅ *Auto-Aprovação Anti-Ban ATIVADA!*\nNovos participantes com número brasileiro (DDI 55) serão aceitos automaticamente com fila de segurança.'
          };
        }

        if (args.action === 'disable_auto') {
          configManager.setPluginEnabled(from, 'autoapprove', false);
          return {
            success: true,
            message: '🛑 *Auto-Aprovação Anti-Ban DESATIVADA!*\nSolicitações de entrada permanecerão na fila para aprovação manual dos administradores.'
          };
        }

        if (args.action === 'approve_all_br') {
          let replyMsg = '';
          const captureReply = async (text) => {
            replyMsg = text;
          };
          await autoapprovePlugin.execute({
            sock,
            msg,
            from,
            sender,
            args: ['agora'],
            reply: captureReply,
            t: (k, vars) => t(lang, k, vars),
            isGroup: true,
            prefix: configManager.getGroupPrefix(from)
          });
          return {
            success: true,
            message: replyMsg || '🚀 *Iniciando aprovação segura anti-ban de participantes brasileiros...*'
          };
        }

        // 'list' ou default
        let pendingList = [];
        try {
          pendingList = await sock.groupRequestParticipantsList(from);
        } catch (_) {
          pendingList = [];
        }

        let brCount = 0;
        let foreignCount = 0;

        for (const item of (pendingList || [])) {
          const jid = item.jid || item.user || item.id;
          const num = String(jid).replace(/@.*$/, '').replace(/\D/g, '');
          if (num.startsWith('55') && (num.length === 12 || num.length === 13)) {
            brCount++;
          } else {
            foreignCount++;
          }
        }

        const isEnabled = configManager.isPluginEnabled(from, 'autoapprove');
        return {
          success: true,
          message: `📋 *Solicitações Pendentes:* ${pendingList.length} no total\n🇧🇷 *Brasileiros:* ${brCount}\n🌍 *Estrangeiros:* ${foreignCount}\n⚙️ *Auto-Aprovação:* ${isEnabled ? 'Ativada' : 'Desativada'}`
        };
      }

      default:
        return { success: false, error: `Ferramenta "${toolName}" não reconhecida.` };
    }
  }
}

const toolRegistry = new ToolRegistry();
module.exports = toolRegistry;
