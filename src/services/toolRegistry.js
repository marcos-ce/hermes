const settings = require('../config/settings');
const configManager = require('../core/configManager');
const logger = require('../utils/logger');
const { checkAdminStatus } = require('../utils/jidResolver');
const toolHandlers = require('./tools');
const { t } = require('../utils/i18n');

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
            enum: ['antilink', 'antiflood', 'antifake', 'welcome', 'automsg', 'schedule', 'warn', 'ban', 'hermes', 'calendar', 'mutemember', 'autoapprove', 'antistatus', 'autolockflood', 'milestone'],
            description: 'Nome do plugin: "antilink", "antiflood", "antifake", "warn", "welcome", "automsg", "schedule", "ban", "hermes", "calendar", "autoapprove", "antistatus" (apaga @status), "autolockflood" (fecha grupo por excesso de msgs), "milestone" (metas de membros).'
          },
          enabled: { type: 'boolean', description: 'Ativar (true) ou desativar (false).' },
          action: { type: 'string', enum: ['delete', 'warn', 'ban'], description: 'Punição para infrações: "delete" (apenas apagar), "warn" (advertir até atingir limite de warns e banir) ou "ban" (banir imediatamente no primeiro deslize).' },
          allowedDomains: { type: 'string', description: 'Domínios liberados no antilink (ex: "youtube.com, instagram.com") ou "." para todos.' },
          maxMessages: { type: 'integer', description: 'Máximo de mensagens consecutivas em 5s no antiflood.' },
          maxChars: { type: 'integer', description: 'Limite de caracteres anti-trava.' },
          allowedDdis: { type: 'string', description: 'DDIs liberados no antifake ou no autoapprove (ex: "55, 351" ou "351" ou "todos").' },
          welcomeMessage: { type: 'string', description: 'Texto de boas-vindas ({user}, {group}, {desc}).' },
          autoDeleteSeconds: { type: 'integer', description: 'Segundos para apagar boas-vindas (0 desativa).' },
          autoMsgText: { type: 'string', description: 'Texto do comunicado periódico.' },
          intervalMinutes: { type: 'integer', description: 'Intervalo em minutos do comunicado.' },
          maxWarns: { type: 'integer', description: 'Contagem/limite de advertências antes do ban automático (ex: 2 para banir no 2º link/aviso, 3 para banir no 3º). Pode ser passado diretamente com module "antilink", "antiflood" ou "warn".' },
          customBanMessage: { type: 'string', description: 'Mensagem personalizada de ban ({user}).' },
          personality: { type: 'string', enum: ['descontraido', 'formal'], description: 'Tom do Hermes IA: "descontraido" ou "formal".' },
          warnOnStatus: { type: 'boolean', description: 'antistatus: true para avisar publicamente após apagar a menção @status; false para silêncio.' },
          groupMsgLimit: { type: 'integer', description: 'autolockflood: quantas mensagens coletivas do grupo na janela ativam o fechamento automático (padrão: 20).' },
          windowSeconds: { type: 'integer', description: 'autolockflood: janela de tempo em segundos para contagem coletiva (padrão: 10).' },
          lockMinutes: { type: 'integer', description: 'autolockflood: minutos que o grupo fica fechado após o gatilho (0 = sem reabertura automática, padrão: 5).' },
          ignoreAdmins: { type: 'boolean', description: 'autolockflood: true para não contar mensagens de admins no gatilho (padrão: true).' }
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
      name: 'promote_member',
      description: 'Promove membro comum a Administrador. TRAVA DE SEGURANÇA: Só acione se o membro estiver EXPRESSAMENTE MARCADO COM @ na mensagem do admin ([Alvo marcado com @: ...]). NUNCA acione para reply sem @ ou nomes avulsos. Acione para: dar adm, promover, virar adm, botar de adm, /promover, /adm.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Número ou JID do membro expressamente marcado com @ na mensagem do admin.' }
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
          multipleAnswers: { type: 'boolean', description: 'True para múltipla escolha, false para voto único.' },
          conditionalActions: { type: 'object', description: 'Mapa agentico de ações condicionais: { "Opção vencedora": "ação" }. Ações suportadas: "close_group", "open_group". Use APENAS quando o admin pedir que o bot execute automaticamente a decisão da enquete (ex: "se ganhar fechar, fecha o grupo"). Omita para enquetes de opinião simples.' }
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
      description: 'Gerencia as solicitações de entrada de novos membros no grupo (fila de aprovação do WhatsApp) e configurações de países/DDIs permitidos. Acione para: ver quem está na fila para entrar, aceitar pedidos pendentes, aprovar pessoas específicas por número ou menção, liberar mais países/DDIs (ex: Portugal 351, EUA 1, etc.), ligar ou desligar auto-aprovação.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'approve_all', 'approve_all_br', 'approve_single', 'enable_auto', 'disable_auto', 'set_allowed_ddis'],
            description: '"list" para consultar/contar pendentes e ver DDIs ativos, "approve_all" ou "approve_all_br" para aprovar membros autorizados pendentes em fila segura (1 a 2 min), "approve_single" para aprovar participante específico (usando "target"), "enable_auto" para ativar auto-aprovação em tempo real, "disable_auto" para desativar, "set_allowed_ddis" para liberar ou adicionar novos DDIs/países.'
          },
          allowed_ddis: {
            type: 'string',
            description: 'DDIs que o admin deseja autorizar/liberar para entrada automática (ex: "55, 351" para Brasil e Portugal, "351" para adicionar Portugal, "1" para EUA, ou "todos").'
          },
          target: {
            type: 'string',
            description: 'Número de telefone, LID ou menção do participante específico a ser aprovado quando action for "approve_single" (ex: "5511999998888" ou "@fulano").'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_group_info',
      description: 'Obtém informações atuais do grupo: total de membros, admins, descrição, histórico de mensagens, advertências ativas e licença. Acione para: "quantos membros tem o grupo?", "qual o tamanho do grupo?", "quem são os admins?", "me dá um resumo do grupo", "dados do grupo", "quantas pessoas estão aqui?", "qual o nome do grupo?", "há alguém silenciado?", "quanto tempo de licença resta?".',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_milestone',
      description: 'Configura uma meta progressiva de quantidade de membros no grupo. Acione para: "quando chegar a 100 membros celebre", "ao bater 500 membros faça sorteio", "meta de 50 membros: abrir o grupo", "configure meta de crescimento", "ao atingir 200 pessoas diga X", "quando completar 1000 membros". Tags dinâmicas suportadas na mensagem: {user} (marca o novo membro), {count} (número da meta), {group} (nome do grupo).',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', description: 'Número de membros alvo da meta (ex: 50, 100, 500, 1000).' },
          message: { type: 'string', description: 'Texto da mensagem ao atingir a meta. Use {user} para marcar o novo membro, {count} para o número da meta, {group} para o nome do grupo. Ex: "🎉 Chegamos a {count} membros! Bem-vindo(a), {user}!"' },
          action: { type: 'string', enum: ['announce', 'pin', 'open_group'], description: 'Ação extra ao atingir a meta: "announce" (apenas envia a mensagem, padrão), "pin" (envia e fixa a mensagem), "open_group" (envia e abre o grupo para todos falarem).' },
          clearAll: { type: 'boolean', description: 'Se true, remove TODAS as metas configuradas antes de adicionar a nova.' }
        },
        required: ['count']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_automsg_media',
      description: 'Anexa a foto/imagem que o admin ENVIOU nesta mensagem ou CITOU (respondeu/encaminhou) como o anúncio periódico automático do grupo (automsg). Por segurança Anti-Ban, apenas fotos leves (máx 2.5 MB) são aceitas; vídeos e áudios são bloqueados. Acione quando o admin pedir algo como: "bota essa foto no anúncio", "usa essa imagem no anúncio automático", "coloca esse banner no comunicado", "essa foto é o anúncio". A imagem é extraída automaticamente da mensagem atual do admin.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['attach', 'remove'], description: '"attach" para anexar a mídia enviada/citada ao anúncio; "remove" para remover a mídia atual do anúncio periódico.' },
          caption: { type: 'string', description: 'Legenda/texto que acompanha a mídia quando ela for enviada no anúncio periódico (ex: "Assista agora!", "Confira o link na bio"). Opcional.' }
        },
        required: []
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

    const handler = toolHandlers.get(toolName);
    if (!handler) {
      return { success: false, error: `Ferramenta "${toolName}" não reconhecida.` };
    }

    return await handler({ sock, msg, from, sender, isBotAdmin, lang, args });
  }
}

const toolRegistry = new ToolRegistry();
module.exports = toolRegistry;
