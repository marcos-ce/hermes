const settings = require('../config/settings');
const configManager = require('../core/configManager');
const wizardEngine = require('../core/wizardEngine');
const logger = require('../utils/logger');
const { safeKick, safeDelete, sendSafeMessage } = require('../utils/antiBan');
const { resolveTarget, resolveParticipant, checkAdminStatus, getGroupMetadata, cleanJid } = require('../utils/jidResolver');
const { groupCache } = require('../utils/cache');
const { t } = require('../utils/i18n');
const memoryEngine = require('./memoryEngine');
const { parseRelativeTime } = require('./timeParser');

/**
 * Definição dos Schemas de Ferramentas (Tool Calling) compatíveis com OpenAI / DeepSeek
 */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Remove/expulsa um membro infrator do grupo de WhatsApp imediatamente.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" se estiver respondendo a uma mensagem do infrator.'
          },
          reason: {
            type: 'string',
            description: 'Motivo da expulsão do membro.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_mute',
      description: 'Tranca o grupo para apenas administradores falarem, ou abre o grupo para todos os membros (pode ser imediato ou programado para daqui a X minutos / horário específico).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['close', 'open'],
            description: '"close" para trancar/fechar o grupo ou "open" para abrir o grupo.'
          },
          delayMinutes: {
            type: 'integer',
            description: 'Quantidade de minutos para esperar antes de fechar ou abrir o grupo (ex: 30 para "daqui a meia hora", 60 para "em 1 hora", 15 para "em 15 minutos"). Use para ações futuras.'
          },
          time: {
            type: 'string',
            description: 'Horário ou tempo relativo para fechar ou abrir o grupo (ex: "18:00", "22h", "daqui a meia hora", "em 1 hora").'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_schedule',
      description: 'Configura, altera ou desativa os horários automáticos diários para fechar e abrir o grupo.',
      parameters: {
        type: 'object',
        properties: {
          closeTime: {
            type: 'string',
            description: 'Horário diário para fechar o grupo no formato HH:MM (ex: "23:00", "22:30", "00:00") ou "0" para não fechar.'
          },
          openTime: {
            type: 'string',
            description: 'Horário diário para abrir o grupo no formato HH:MM (ex: "07:00", "08:00") ou "0" para não abrir.'
          },
          enabled: {
            type: 'boolean',
            description: 'True para ativar os horários agendados ou false para desativar o agendamento automático.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_group_protection',
      description: 'Ativa, desativa ou configura detalhadamente os plugins do grupo (antilink, antiflood, antifake, welcome, automsg, schedule, warn, ban, hermes, calendar).',
      parameters: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            enum: ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar'],
            description: 'Nome do plugin a ser ativado, desativado ou configurado.'
          },
          enabled: {
            type: 'boolean',
            description: 'True para ativar o módulo ou false para desativar.'
          },
          action: {
            type: 'string',
            enum: ['delete', 'warn', 'ban'],
            description: 'Punição para antilink ("delete", "warn" ou "ban") ou antiflood ("warn" ou "ban").'
          },
          allowedDomains: {
            type: 'string',
            description: 'Sites liberados no antilink separados por vírgula (ex: "youtube.com, instagram.com") ou "." para bloquear todos.'
          },
          maxMessages: {
            type: 'integer',
            description: 'Máximo de mensagens em 5s para o antiflood (ex: 6).'
          },
          maxChars: {
            type: 'integer',
            description: 'Limite máximo de caracteres anti-trava no antiflood (ex: 2500).'
          },
          allowedDdis: {
            type: 'string',
            description: 'DDIs permitidos no antifake separados por vírgula (ex: "55, 351").'
          },
          welcomeMessage: {
            type: 'string',
            description: 'Texto de boas-vindas (quando module="welcome", suporta {user}, {group}, {desc}).'
          },
          autoDeleteSeconds: {
            type: 'integer',
            description: 'Segundos para apagar boas-vindas automaticamente (quando module="welcome", 0 para não apagar).'
          },
          autoMsgText: {
            type: 'string',
            description: 'Texto do anúncio periódico automático (quando module="automsg").'
          },
          intervalMinutes: {
            type: 'integer',
            description: 'Intervalo em minutos para o anúncio periódico (quando module="automsg").'
          },
          maxWarns: {
            type: 'integer',
            description: 'Limite de advertências antes do banimento automático (quando module="warn", padrão 3).'
          },
          customBanMessage: {
            type: 'string',
            description: 'Mensagem personalizada ao banir membro (quando module="ban", suporta {user}).'
          },
          personality: {
            type: 'string',
            enum: ['descontraido', 'formal'],
            description: 'Personalidade do Hermes IA (quando module="hermes").'
          }
        },
        required: ['module']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_settings',
      description: 'Altera configurações gerais do grupo: idioma (pt/es/en), prefixo de comandos (!, /, #, .), abre o painel interativo (!config) ou limpa a memória da IA.',
      parameters: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['pt', 'es', 'en'],
            description: 'Novo idioma do grupo ("pt", "es" ou "en").'
          },
          prefix: {
            type: 'string',
            description: 'Novo prefixo de 1 caractere do grupo (ex: "!", "/", "#", ".").'
          },
          openPanel: {
            type: 'boolean',
            description: 'True para abrir o Painel Interativo de Configurações (!config) para o administrador.'
          },
          clearMemory: {
            type: 'boolean',
            description: 'True para limpar o histórico de memória de conversas do Hermes neste grupo.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'warn_member',
      description: 'Aplica uma advertência formal a um membro do grupo. Ao atingir o limite configurado (padrão 3), o membro é banido automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do membro a ser advertido.'
          },
          reason: {
            type: 'string',
            description: 'Motivo da advertência.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unwarn_member',
      description: 'Remove 1 advertência (perdoa) de um membro do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do membro a ser perdoado.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_blacklist',
      description: 'Adiciona ou remove um número/membro da Lista Negra (blacklist) do grupo.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove'],
            description: '"add" para adicionar à lista negra (e expulsar se estiver no grupo) ou "remove" para remover da lista negra.'
          },
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @ ou "quoted" do alvo.'
          }
        },
        required: ['action', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Apaga uma mensagem específica ou a mensagem que foi respondida (quoted) no chat.',
      parameters: {
        type: 'object',
        properties: {
          messageId: {
            type: 'string',
            description: 'ID da mensagem a ser apagada, ou omita para apagar a mensagem respondida.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'hidetag_announcement',
      description: 'Envia um comunicado oficial no grupo marcando todos os membros de forma invisível/oculta.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Texto do comunicado a ser transmitido para todos os membros.'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'promote_member',
      description: 'Promove um membro comum a Administrador do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @, nome do membro ou "quoted" se o admin estiver respondendo à mensagem do membro a ser promovido.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'demote_member',
      description: 'Rebaixa um administrador a membro comum do grupo.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Número de telefone, menção com @, nome do administrador ou "quoted" se o admin estiver respondendo à mensagem do membro a ser rebaixado.'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_calendar',
      description: 'Adiciona, lista ou remove eventos/agendamentos e lembretes do calendário do grupo com avisos automáticos na data e hora marcada ou tempo relativo.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'list', 'delete', 'clear'],
            description: 'Ação a ser executada no calendário: "add" (agendar), "list" (listar), "delete" (remover por ID) ou "clear" (limpar tudo).'
          },
          date: {
            type: 'string',
            description: 'Data do evento (ex: "25/10", "28/10/2026", "amanhã" ou "hoje"). Opcional se delayMinutes for informado.'
          },
          time: {
            type: 'string',
            description: 'Horário do evento no formato HH:MM (ex: "14:30", "19:00" ou "19h") ou relativo (ex: "daqui a meia hora", "em 1 hora").'
          },
          delayMinutes: {
            type: 'integer',
            description: 'Minutos a partir de agora para o lembrete/evento (ex: 30 para meia hora, 60 para 1 hora, 15 para 15 minutos). Use quando o pedido for relativo.'
          },
          text: {
            type: 'string',
            description: 'Descrição ou comunicado do lembrete/evento a ser divulgado no grupo. Obrigatório para action="add".'
          },
          eventId: {
            type: 'string',
            description: 'ID numérico do evento a ser removido (ex: "1", "2"). Obrigatório para action="delete".'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'raffle_members',
      description: 'Realiza um sorteio aleatório e justo entre os membros do grupo.',
      parameters: {
        type: 'object',
        properties: {
          quantity: {
            type: 'integer',
            description: 'Quantidade de membros a serem sorteados (padrão: 1).'
          },
          prize: {
            type: 'string',
            description: 'Nome do prêmio do sorteio.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_description',
      description: 'Altera, define ou limpa a descrição/bio/regras do grupo no WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Novo texto completo para a descrição ou regras do grupo (ou "" para limpar/remover).'
          }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_picture',
      description: 'Altera ou remove a foto/ícone de perfil do grupo usando uma imagem enviada na mensagem ou citada (reply).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['update', 'remove'],
            description: '"update" para atualizar com a imagem enviada/citada ou "remove" para remover a foto atual.'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pin_group_message',
      description: 'Fixa ou desafixa uma mensagem no chat do grupo. Requer responder à mensagem (quoted) ou informar o ref do histórico (ex: "m123").',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['pin', 'unpin'],
            description: '"pin" para fixar a mensagem ou "unpin" para desafixar.'
          },
          duration: {
            type: 'string',
            enum: ['24h', '7d', '30d'],
            description: 'Duração da fixação: "24h" (1 dia), "7d" (7 dias) ou "30d" (30 dias). Padrão: "24h".'
          },
          messageId: {
            type: 'string',
            description: 'Ref da mensagem do histórico (ex: "m123") ou omita para usar a mensagem respondida (quoted).'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_group_poll',
      description: 'Cria e envia uma enquete oficial interativa no grupo do WhatsApp com título e opções de voto.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Pergunta ou título da enquete (claro e objetivo).'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista com as opções de voto da enquete (mínimo 2, máximo 12 opções curtas e objetivas).'
          },
          multipleAnswers: {
            type: 'boolean',
            description: 'True se os membros puderem votar em mais de uma opção ao mesmo tempo (múltipla escolha), ou false para voto único (padrão false).'
          }
        },
        required: ['title', 'options']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'learn_group_fact',
      description: 'Registra ou atualiza permanentemente um fato, regra tácita, apelido de membro, tom ou preferência cultural do grupo. Use quando o admin ensinar algo sobre o grupo, membros, regras ou estilo.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['fact', 'rule', 'tone', 'nickname'],
            description: 'Categoria do aprendizado: "fact" (fato geral), "rule" (regra tácita do grupo), "tone" (tom de fala/vibe), "nickname" (apelido de membro).'
          },
          key: {
            type: 'string',
            description: 'Identificador do fato ou nome do membro (ex: "Lucas", "sexta-feira", "vibe").'
          },
          value: {
            type: 'string',
            description: 'O fato aprendido, regra, apelido ou descrição do tom (ex: "é o designer e apelido é Alemão", "sem reuniões de trabalho").'
          }
        },
        required: ['category', 'key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forget_group_fact',
      description: 'Remove um fato ou regra da memória cultural permanente do grupo. Use quando o admin pedir para esquecer ou remover algo que havia sido ensinado.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Identificador ou termo do fato a ser esquecido.'
          }
        },
        required: ['key']
      }
    }
  }
];

// Descrição unificada (curta) para todo parâmetro "target": economiza tokens e reforça o uso de refs reais
const TARGET_DESCRIPTION = 'Ref da mensagem do histórico (ex: "m123"), número com DDI, @menção ou "quoted". Nunca invente.';
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
    if (quotedParticipant && !isBot(quotedParticipant)) candidates.push(cleanJid(quotedParticipant));

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
        const validModules = ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar'];
        if (!validModules.includes(mod)) {
          return { success: false, error: `Módulo "${mod}" inválido.` };
        }

        const currentCfg = configManager.getPluginConfig(from, mod) || {};
        const enabled = args.enabled !== undefined ? Boolean(args.enabled) : (currentCfg.enabled !== false);
        const updates = { enabled };

        if (mod === 'antilink') {
          if (args.action && ['delete', 'warn', 'ban'].includes(args.action)) {
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
          if (args.action && ['warn', 'ban'].includes(args.action)) {
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
          message: `${t(lang, 'common.saved')}\n⚙️ *${mod.toUpperCase()}:* ${stateLabel}`
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
          results.push(t(lang, 'wizard.prefix_changed', { prefix: newPrefix }));
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

        let deleteId = contextInfo?.stanzaId;
        let deleteParticipant = contextInfo?.participant;

        // Ref do histórico ("m123"): chave real (id + participante) vem do SQLite; IDs inventados são ignorados
        if (args.messageId && /^m\d{1,9}$/i.test(String(args.messageId).trim())) {
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
          if (args.delayMinutes || (typeof relCandidate === 'string' && /(?:daqui|em\s+\d+|meia\s+hora|minutos?|horas?|amanh[aã]|hoje|\+\d+)/i.test(relCandidate))) {
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

                  let creatorMention = '';
                  let eventCreatorJid = ev.creatorJid || '';
                  if (!eventCreatorJid && ev.createdBy) {
                    eventCreatorJid = ev.createdBy.includes('@') ? ev.createdBy : `${ev.createdBy}@s.whatsapp.net`;
                  }

                  const eventCreatorDisplay = ev.creatorDisplay || ev.createdBy || '';
                  if (eventCreatorDisplay) {
                    creatorMention = t(lang, 'calendar.creator_tag', { user: eventCreatorDisplay });
                  }

                  const body = t(lang, 'calendar.event_announcement', {
                    time: parsedTime,
                    text: reminderText,
                    creator: creatorMention
                  });

                  let mentions = [];
                  if (Boolean(currentCfg.mentionAll)) {
                    const meta = await getGroupMetadata(sock, from);
                    if (meta && Array.isArray(meta.participants)) {
                      const allMembers = new Set();
                      meta.participants.forEach(p => {
                        if (p.id) allMembers.add(p.id);
                        if (p.jid) allMembers.add(p.jid);
                        if (p.lid) allMembers.add(p.lid);
                      });
                      mentions = Array.from(allMembers);
                    }
                  }

                  if (eventCreatorJid && !mentions.includes(eventCreatorJid)) {
                    mentions.push(eventCreatorJid);
                  }
                  if (ev.creatorPhoneJid && !mentions.includes(ev.creatorPhoneJid)) {
                    mentions.push(ev.creatorPhoneJid);
                  }

                  await sendSafeMessage(sock, from, { text: body, mentions });
                }
              } catch (err) {
                logger.error({ err, from, newId }, 'Erro ao disparar lembrete agendado temporizado');
              }
            }, relDelayMs);
            if (timer.unref) timer.unref();
          }

          return {
            success: true,
            message: t(lang, 'calendar.added', {
              id: newId,
              date: parsedDate,
              time: parsedTime,
              text: newEvent.text
            })
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

        const newDesc = typeof args.description === 'string' ? args.description.trim() : '';
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

        let targetStanzaId = null;
        let targetParticipant = null;

        // 1. Ref explícito do histórico (ex: "m123")
        if (args.messageId && /^m\d{1,9}$/i.test(args.messageId.trim())) {
          const refData = memoryEngine.getMessageByRef(from, args.messageId.trim());
          if (refData?.msgId) {
            targetStanzaId = refData.msgId;
            targetParticipant = refData.participant || refData.sender;
          }
        }

        // 2. Fallback: mensagem respondida (quoted)
        if (!targetStanzaId) {
          const realMsg = msg?.message?.ephemeralMessage?.message ||
                          msg?.message?.viewOnceMessage?.message ||
                          msg?.message?.viewOnceMessageV2?.message ||
                          msg?.message?.documentWithCaptionMessage?.message ||
                          msg?.message;

          const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                              realMsg?.imageMessage?.contextInfo ||
                              realMsg?.videoMessage?.contextInfo ||
                              realMsg?.documentMessage?.contextInfo;

          if (contextInfo?.stanzaId) {
            targetStanzaId = contextInfo.stanzaId;
            targetParticipant = contextInfo.participant;
          }
        }

        if (!targetStanzaId) {
          return { success: false, error: t(lang, 'pin.reply_required') };
        }

        const botJid = cleanJid(sock?.user?.id || '');
        const botLid = cleanJid(sock?.user?.lid || '');
        const cleanParticipant = cleanJid(targetParticipant || '');
        const isFromMe = cleanParticipant === botJid || cleanParticipant === botLid;

        const targetKey = {
          remoteJid: from,
          fromMe: isFromMe,
          id: targetStanzaId,
          participant: targetParticipant || (isFromMe ? (sock?.user?.id || undefined) : undefined)
        };

        const action = args.action || 'pin';
        if (action === 'unpin') {
          try {
            await sock.sendMessage(from, {
              pin: targetKey,
              type: 2 // 2 = UNPIN_FOR_ALL
            });
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
          return {
            success: true,
            message: t(lang, 'pin.pinned', { duration: durationLabel })
          };
        } catch (err) {
          logger.error({ err, from }, 'Erro ao fixar mensagem via Hermes');
          return { success: false, error: t(lang, 'pin.error') };
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
          await sendSafeMessage(sock, from, {
            poll: {
              name: title,
              values: options.slice(0, 12),
              selectableCount: isMultiple ? 0 : 1
            }
          });

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

      default:
        return { success: false, error: `Ferramenta "${toolName}" não reconhecida.` };
    }
  }
}

const toolRegistry = new ToolRegistry();
module.exports = toolRegistry;
