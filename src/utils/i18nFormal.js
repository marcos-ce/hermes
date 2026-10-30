/**
 * Dicionário Formal de Mensagens e Templates (i18nFormal)
 * Padrão Corporativo / Auto-Mod: Etiquetas em negrito *[Tag]*, estilo sóbrio e sem poluição de emojis.
 * Estrutura 100% espelhada do i18n.js original (PT / ES / EN - 227 chaves cada).
 */

const dictionaries = {
  pt: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': "*[OK]* Operação concluída com sucesso.",
    'common.error': "*[Erro]* Ocorreu uma falha ao processar o comando.",
    'common.no_permission_admin': "*[Acesso Negado]* Comando restrito a administradores do grupo.",
    'common.no_permission_owner': "*[Acesso Negado]* Comando restrito ao proprietário do sistema.",
    'common.bot_not_admin': "*[Erro]* O bot requer privilégios de administrador para executar esta ação.",
    'common.group_only': "*[Aviso]* Este comando opera exclusivamente dentro de grupos.",
    'common.private_disabled': "*[Sistema]* Comandos via chat privado desativados.",
    'common.not_found_target': "*[Parâmetro Ausente]* Alvo não identificado. Marque o usuário (@), responda a uma mensagem ou informe o número.",
    'common.invalid_args': "*[Sintaxe Inválida]* Argumentos incorretos. Verifique a sintaxe informada.",
    'common.enabled': "ATIVADO",
    'common.disabled': "DESATIVADO",
    'common.saved': "*[Sistema]* Configurações gravadas com sucesso.",
    'common.canceled': "*[Sistema]* Operação cancelada.",
    'common.yes': "Sim",
    'common.no': "Não",
    'common.days': "dias",
    'common.lifetime': "Vitalício",
    'common.mention_greeting': "*[Hermes AutoMod]*\nPrefixo ativo: `{prefix}`\nComandos: `{prefix}menu` | Painel: `{prefix}config`",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "*[Acesso Negado]* Este grupo não possui uma licença ativa.",
    'saas.inactive_group_hint': "*[Grupo Não Ativado]*\nO bot está presente no grupo, mas requer ativação.\n\nPara ativar o bot neste grupo, envie:\n*{prefix}bot on*",
    'saas.license_expired': "*[Licença Expirada]*\nA licença deste grupo expirou. Contate o suporte/administração para renovação.",
    'saas.activated': "*[Ativação do Sistema]*\nGrupo ativado com sucesso. Validade: *{expiry}*.",
    'saas.days_added': "*[Licença Atualizada]*\nAdicionados *{days} dias* à licença deste grupo. Nova validade: *{expiry}*.",
    'saas.deactivated': "*[Sistema]* Atividades pausadas neste grupo. Configurações preservadas.",
    'saas.status': "*[Status da Licença]*\nIdentificador: `{id}`\nEstado: {status}\nValidade: {expiry}\nMódulos ativos: {modules}",
    'saas.list_header': "*[Grupos Registrados no Sistema]*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Restam: *{remaining}*",
    'saas.list_empty': "Nenhum grupo cadastrado no momento.",
    'saas.pv_on': "*[Sistema]* Comandos via chat privado liberados para todos os usuários.",
    'saas.pv_off': "*[Sistema]* Comandos via chat privado desativados (Apenas proprietário autorizado).",
    'saas.group_presentation': "*[Hermes AutoMod - Apresentação Operacional]*\nSistema de administração, moderação e conformidade ativo neste grupo.\n\n• Envie `{prefix}menu` para consultar os comandos disponíveis.\n• Administradores podem enviar `{prefix}config` para gerenciar diretrizes de segurança (antilink, boas-vindas, filtros).\n\n*[Aviso aos Administradores]* O bot requer privilégios de administrador para atuar nas rotinas de segurança do grupo.",
    'saas.liberate_success_owner': "*[Ativação do Sistema]*\nGrupo autorizado com sucesso.\n\n• Grupo: *{name}*\n• Identificador: `{id}`\n• Validade: *{expiry}*\n• Configuração: Diretrizes padrão aplicadas (IA e Moderação ativas).\n\nMensagem operacional de apresentação enviada ao grupo.",
    'saas.liberate_usage': "*[Sintaxe do Comando]*\n• `{prefix}liberar <link_do_grupo> [dias]`\n• `{prefix}liberar <id_do_grupo> [dias]`\n\nExemplo:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "*[Erro de Acesso]* Falha ao ingressar no grupo via link. Motivo: convite inválido, expirado, grupo lotado ou bloqueio ativo.",

    // ─── BAN GROUP ───
    'bangroup.banned': "*[Moderação]* O grupo `{id}` foi banido do sistema. Operações desativadas.",
    'bangroup.unbanned': "*[Moderação]* O grupo `{id}` foi desbanido e reativado no sistema.",
    'bangroup.already_banned': "*[Aviso]* Este grupo já consta na lista de bloqueios.",
    'bangroup.not_banned': "*[Aviso]* Este grupo não consta na lista de bloqueios.",
    'bangroup.list_title': "*[Registro de Grupos Bloqueados]*",
    'bangroup.list_empty': "Nenhum grupo bloqueado no momento.",

    // ─── RELOAD ───
    'reload.success': "*[Sistema]* Módulos, esquemas e dicionários recarregados com sucesso em tempo real.",
    'reload.error': "*[Erro]* Falha ao recarregar módulos: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "*[Painel de Controle - Hermes AutoMod]*",
    'config.panel_desc': "Envie o número do módulo para alternar estado ou reconfigurar.\nAtalhos: [P] Prefixo | [L] Idioma | [X] Fechar\nComandos de moderação: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "*[Sistema]* Prefixo do grupo alterado para: *{prefix}*",
    'config.invalid_option': "*[Opção Inválida]* Selecione um número válido do menu ou [X] para fechar.",
    'config.module_toggled_on': "*[Sistema]* Módulo *{module}* ativado com sucesso.",
    'config.module_toggled_off': "*[Sistema]* Módulo *{module}* desativado com sucesso.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "*[Seleção de Idioma]*\nEscolha o idioma do grupo:\n[1] Português\n[2] Español\n[3] English\n\nEnvie 1, 2 ou 3.",
    'lang.changed': "*[Sistema]* Idioma do grupo alterado para: *Português*.",
    'lang.invalid': "*[Opção Inválida]* Parâmetro incorreto. Utilize: !idioma pt, !idioma es ou !idioma en.",
    'lang.invalid_option': "*[Opção Inválida]* Envie 1 (PT), 2 (ES), 3 (EN) ou X para cancelar.",

    // ─── ANTILINK ───
    'antilink.detected': "*[AutoMod]* Link detectado e removido. Infrator: @{user}",
    'antilink.warned': "*[AutoMod]* Link não autorizado removido. Advertência registrada para @{user} ({warns}/{max}).",
    'antilink.banned': "*[AutoMod]* @{user} foi expulso do grupo por violação da política de links.",
    'antilink.status': "*[AutoMod - AntiLink]*\nEstado: {status}\nDomínios autorizados: {domains}\nAção: {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': "*[Novo Membro]* @{user} ingressou em *{group}*.\nDiretrizes e regras do grupo: {desc}",
    'welcome.status': "*[Boas-Vindas]*\nEstado: {status}\nAuto-exclusão: {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': "*[Moderação]* Advertência registrada para @{user} ({warns}/{max}).\nMotivo: {reason}",
    'warn.max_reached': "*[Moderação]* Limite de advertências atingido ({max}/{max}). @{user} foi expulso do grupo.",
    'warn.removed': "*[Moderação]* Advertência revogada para @{user}. Total ativo: {warns}/{max}.",
    'warn.list_title': "*[Registro de Advertências Ativas]*",
    'warn.list_empty': "Nenhum membro possui advertências ativas neste grupo.",
    'warn.list_item': "• @{user}: *{count}* advertência(s)",
    'warn.cannot_warn_admin': "*[Ação Inválida]* Administradores possuem imunidade a advertências.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': "*[AutoMod]* Frequência excessiva de mensagens detectada (Flood): @{user}",
    'antiflood.trava_detected': "*[AutoMod]* Mensagem com tamanho excedente bloqueada (Anti-Trava): @{user}",
    'antiflood.banned_flood': "*[AutoMod]* @{user} foi expulso do grupo por envio excessivo de mensagens (Flood).",
    'antiflood.banned_trava': "*[AutoMod]* @{user} foi expulso do grupo por envio de mensagem maliciosa (Trava).",
    'antiflood.status': "*[AutoMod - AntiFlood]*\nEstado: {status}\nLimite: {msgs} msgs/5s | Trava: {chars} caracteres\nAção: {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "*[AutoMod]* @{user} removido: DDI não autorizado pelas regras do grupo.",
    'antifake.status': "*[AutoMod - AntiFake]*\nEstado: {status}\nDDIs autorizados: {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "*[AutoMod - Auto-Aprovação]*\nEstado: {status}\nDDIs autorizados: {ddis}\nAção para estrangeiros: {foreignAction}\nNotificação no grupo: {notify}",
    'autoapprove.summary': "*[Solicitações de Entrada Pendentes]*\n\nTotal em espera: {total}\n• Números Nacionais (DDI 55): {brCount}\n• Números Internacionais: {foreignCount}\n• Identificadores LIDs: {unknownCount}\n\nProteção Anti-Ban: ATIVA (Fila Segura e Intervalo Humano)\n\nComandos operacionais:\n• `{prefix}aprovar agora` - Aprovar {brCount} membros nacionais via fila segura\n• `{prefix}aprovar todos` - Aprovar a totalidade ({total}) de pendências\n• `{prefix}aprovar <número>` - Aprovar participante específico\n• `{prefix}aprovar on` - Ativar auto-aprovação em tempo real\n• `{prefix}aprovar on todos` - Ativar auto-aprovação irrestrita\n• `{prefix}aprovar off` - Desativar auto-aprovação\n• `{prefix}aprovar config` - Ajustar parâmetros e ações",
    'autoapprove.no_pending': "*[Status]* Não há solicitações de entrada pendentes de aprovação neste grupo.",
    'autoapprove.no_pending_br': "*[Status]* Não há solicitações pendentes com DDI nacional no momento ({foreignCount} internacionais e {unknownCount} LIDs aguardando validação manual).",
    'autoapprove.batch_starting': "*[Processamento em Lote]* Iniciando aprovação segura de {count} participante(s) com intervalo humano. Aguarde a conclusão.",
    'autoapprove.batch_starting_all': "*[Processamento em Lote]* Iniciando aprovação segura de {count} participante(s) pendentes. Aguarde a conclusão.",
    'autoapprove.batch_finished': "*[Aprovação Concluída]*\nProcessados: {approved}/{total} aprovados | Falhas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.batch_finished_all': "*[Aprovação Geral Concluída]*\nProcessados: {approved}/{total} aprovados | Falhas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.batch_cancelled': "*[Operação Interrompida]* Processamento em lote cancelado. Aprovados: {approved}/{total} | Falhas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.approved_single': "*[AutoMod]* Entrada aprovada automaticamente para @{user}.",
    'autoapprove.circuit_breaker_pause': "*[Segurança Anti-Ban]* Volume anômalo de solicitações detectado (+{count}/min). Auto-aprovação temporariamente pausada por {minutes} minutos para proteção da conta. Solicitações retidas para liberação manual via `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "*[Aviso]* O modo 'Aprovar novos participantes' encontra-se desativado nas configurações do WhatsApp deste grupo. Para enfileiramento prévio, ative o recurso nos ajustes do grupo.",
    'autoapprove.target_approved': "*[Solicitação Aprovada]* Participante +{user} aprovado no grupo via fila segura.",
    'autoapprove.target_failed': "*[Erro]* Falha ao aprovar participante +{user}. Motivo: {reason}. O registro permanece retido na fila.",
    'autoapprove.target_ambiguous': "*[Ambiguidade]* Múltiplos registros localizados para +{user} ({count} ocorrências). Especifique o número completo com DDI.",
    'autoapprove.target_not_found': "*[Não Localizado]* O número informado (+{user}) não consta na fila de solicitações pendentes deste grupo.",
    'autoapprove.queue_cancelled': "*[Operação Cancelada]* Fila de processamento interrompida. {count} solicitação(ões) em espera foram canceladas.",
    'autoapprove.all_members': "Qualquer participante (Todos os países)",
    'autoapprove.activated_all': "*[AutoMod - Auto-Aprovação Irrestrita]* Auto-aprovação ativada para todas as origens geográficas via fila segura anti-ban.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': "*[Horário Automático]* Chat fechado para envio de mensagens.",
    'schedule.opened': "*[Horário Automático]* Chat aberto. Envio de mensagens liberado.",
    'schedule.status': "*[Horários Automáticos]*\nEstado: {status}\nFechamento: *{close}* | Abertura: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "*[Comunicados Periódicos]*\nEstado: {status}\nIntervalo: a cada {interval}\nMensagem: {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "*[Ação Inválida]* Não é permitido expulsar administradores do grupo.",
    'ban.cannot_ban_owner': "*[Ação Inválida]* O proprietário do bot não pode ser expulso.",
    'ban.cannot_ban_bot': "*[Ação Inválida]* O bot não pode expulsar a si mesmo.",
    'ban.success': "*[Moderação]* @{user} foi removido do grupo.",

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': "*[Moderação]* Chat fechado por um administrador. Apenas administradores podem enviar mensagens.",
    'mute.opened': "*[Moderação]* Chat aberto por um administrador. Envio de mensagens liberado.",
    'mute.prompt': "*[Moderação - Controle de Chat]*\n[1] Fechar o grupo agora\n[2] Abrir o grupo agora\n\nEnvie 1 ou 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': "*[Moderação]* @{user} silenciado por {duration}.{admin}{reason}\nMensagens enviadas serão automaticamente deletadas durante o período.",
    'mutemember.unmuted': "*[Moderação]* Silenciamento de @{user} revogado. Envio de mensagens liberado.",
    'mutemember.not_muted': "*[Status]* @{user} não consta na lista de membros silenciados.",
    'mutemember.list_empty': "Nenhum membro está silenciado neste grupo no momento.",
    'mutemember.list_title': "*[Membros Silenciados no Grupo]*",
    'mutemember.cannot_mute_admin': "*[Ação Inválida]* Administradores não podem ser silenciados.",
    'mutemember.cannot_mute_owner': "*[Ação Inválida]* O proprietário do bot não pode ser silenciado.",
    'mutemember.cannot_mute_bot': "*[Ação Inválida]* O bot não pode silenciar a si mesmo.",
    'mutemember.abuse_banned': "*[AutoMod]* @{user} foi expulso por spam contínuo enquanto estava silenciado.",
    'mutemember.insistence_banned': "*[AutoMod]* @{user} foi expulso do grupo após insistir e enviar mais de {count} mensagens durante período de silenciamento.",

    // ─── LINK DE CONVITE ───
    'link.success': "*[Link de Acesso ao Grupo]*\nhttps://chat.whatsapp.com/{code}",
    'link.revoked': "*[Link Redefinido]*\nNovo link: https://chat.whatsapp.com/{code}\nO link anterior foi cancelado.",
    'link.error': "*[Erro]* Não foi possível obter o link de convite. Verifique os privilégios do bot.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "*[Sistema]* Descrição do grupo atualizada com sucesso.",
    'setdesc.cleared': "*[Sistema]* Descrição do grupo removida com sucesso.",
    'setdesc.current': "*[Descrição Atual do Grupo]*\n\n{description}\n\nPara alterar: envie `{prefix}setdesc <novo texto>` ou responda a uma mensagem com `{prefix}setdesc`.",
    'setdesc.empty': "(O grupo não possui uma descrição definida)",
    'setdesc.error': "*[Erro]* Falha ao atualizar descrição. Verifique os privilégios do bot.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "*[Sistema]* Foto do grupo atualizada com sucesso.",
    'setpic.cleared': "*[Sistema]* Foto do grupo removida com sucesso.",
    'setpic.no_image': "*[Parâmetro Ausente]* Envie uma imagem com `{prefix}foto` na legenda ou responda a uma imagem.",
    'setpic.error': "*[Erro]* Falha ao atualizar a foto do grupo. Verifique os privilégios do bot.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "*[Moderação]* Mensagem fixada no topo por {duration}.",
    'pin.unpinned': "*[Moderação]* Mensagem desafixada do topo.",
    'pin.reply_required': "*[Parâmetro Ausente]* Responda à mensagem que deseja fixar ou desafixar.",
    'pin.error': "*[Erro]* Falha ao fixar/desafixar mensagem. Verifique os privilégios do bot.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "*[Enquete Registrada]*\nTítulo: {title}\nModo: {type} | Opções: {count}",
    'poll.type_single': "Escolha única",
    'poll.type_multi': "Múltipla escolha",
    'poll.usage': "*[Instruções de Criação de Enquetes]*\n\n1) Em Linha (com barra |):\n`{prefix}enquete Título | Opção 1 | Opção 2`\n\n2) Múltipla Escolha (--multi):\n`{prefix}enquete --multi Título | Opção 1 | Opção 2`\n\n3) Múltiplas Linhas:\n`{prefix}enquete Título\n1. Opção A\n2. Opção B`",
    'poll.error_options': "*[Parâmetro Inválido]* A enquete requer um título e no mínimo 2 alternativas válidas.",
    'poll.error': "*[Erro]* Falha ao gerar a enquete. Verifique os dados enviados.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "*[Parâmetro Ausente]* Informe o texto do comunicado ou responda a uma mensagem.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "*[Status]* O membro informado já possui privilégios de administrador.",
    'promote.need_explicit_mention': "*[Segurança]* Apenas membros marcados expressamente com @ podem ser promovidos a administrador.",
    'promote.success': "*[Moderação]* @{user} foi promovido a Administrador do grupo.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "*[Status]* O usuário informado não é um administrador.",
    'demote.cannot_demote_owner': "*[Ação Inválida]* O proprietário do bot não pode ser rebaixado.",
    'demote.success': "*[Moderação]* @{user} foi rebaixado a membro comum.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "*[Parâmetro Ausente]* Responda à mensagem que deseja remover.",
    'clear.success': "*[Moderação]* Mensagem removida do chat.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "*[Blacklist]* @{user} inserido na lista negra do grupo e removido.",
    'blacklist.added_global': "*[Blacklist Global]* @{user} cadastrado na lista negra global do sistema.",
    'blacklist.removed': "*[Blacklist]* @{user} removido da lista negra do grupo.",
    'blacklist.removed_global': "*[Blacklist Global]* @{user} removido da lista negra global.",
    'blacklist.list_title': "*[Lista Negra do Grupo]*",
    'blacklist.list_empty': "A lista negra deste grupo está vazia.",
    'blacklist.banned_entry': "*[AutoMod]* Entrada bloqueada: @{user} consta na lista negra.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "*[Aviso]* Não há membros elegíveis suficientes para realização do sorteio.",
    'raffle.title': "*[Sorteio Finalizado]*",
    'raffle.prize': "Prêmio: {prize}",
    'raffle.winners': "Ganhador(es):\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "*[Diagnóstico de Operação - Hermes]*",
    'ping.latency': "Latência: `{latency}ms`",
    'ping.uptime': "Tempo ativo: `{uptime}`",
    'ping.ram': "Memória RAM: `{ram} MB`",
    'ping.lang': "Idioma: `{lang}`",
    'ping.antiban': "Proteção Furtiva: `ATIVA`",
    'ping.license': "Licença: `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "*[Configuração: {plugin}]* (Etapa {step}/{total})",
    'wizard.current_val': "Valor atual: `{current}`",
    'wizard.invalid_input': "*[Resposta Inválida]* Verifique os parâmetros solicitados e envie novamente.",
    'wizard.finished': "*[Configuração Concluída]* Parâmetros de {plugin} atualizados e operacionais.",
    'wizard.choice_prompt': "Selecione uma das opções abaixo enviando o número correspondente:\n{choices}",
    'wizard.boolean_prompt': "[1] Ativado\n[2] Desativado\n\nEnvie 1 ou 2 para confirmar.",
    'wizard.select_field_title': "*[Configuração: {plugin}]*\n\nSelecione a etapa que deseja editar:\n\n",
    'wizard.select_field_footer': "[T] Reconfigurar Todas as Etapas\n[X] Cancelar e Fechar\n\nEnvie o número da etapa desejada.",
    'wizard.select_field_invalid': "*[Opção Inválida]* Selecione o número da etapa (1 a {max}), [T] para todas ou [X] para fechar.",
    'wizard.summary_single': "*[Configuração Atualizada]*",
    'wizard.summary_all': "*[Resumo de Configurações Salvas]*",
    'wizard.tip_keep': "Dica: Envie *.* (ponto) para MANTER o valor atual.",
    'wizard.tip_default': "Valor padrão: `{default}`\nDica: Envie *.* (ponto) para USAR o valor padrão.",
    'wizard.cancel_hint': "Envie *X* a qualquer momento para cancelar.",
    'wizard.out_of_range': "*[Valor Fora dos Limites]* Parâmetro inválido{range}. Tente novamente.",
    'wizard.session_expired': "*[Sessão Expirada]* O menu de configuração ficou inativo e foi encerrado por segurança.",
    'wizard.focus_switch_prompt': "*[Aviso]* Existe uma sessão de configuração ativa em andamento (*{module}*).\n\n• Envie *X* para cancelar\n• Envie *1* para continuar",
    'wizard.hermes_focus_detected': "*[Aviso]* @{user}, existe um menu de configuração aberto (*{module}*).\n\n• Envie *X* para encerrar o menu\n• Envie *1* para continuar a configuração",
    'wizard.cancelled': "*[Sistema]* Configuração cancelada. Sessão encerrada.",
    'wizard.continued': "*[Sistema]* Continuando configuração...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "*[Agendamento Registrado]*\nData/Hora: {date} às {time}\nCompromisso: {text}\nID: #{id}",
    'calendar.list_title': "*[Cronograma de Agendamentos do Grupo]*",
    'calendar.list_empty': "Nenhum evento ou agendamento registrado no cronograma.\nPara agendar, envie: `{prefix}agenda add DD/MM HH:MM Mensagem do evento`",
    'calendar.item': "• [#{id}] {date} às {time} — {text}",
    'calendar.deleted': "*[Sistema]* Agendamento #{id} excluído com sucesso.",
    'calendar.not_found': "*[Aviso]* Agendamento #{id} não localizado no cronograma.",
    'calendar.cleared': "*[Sistema]* Todos os agendamentos foram removidos.",
    'calendar.invalid_format': "*[Formato Inválido]* Utilize: `{prefix}agenda add DD/MM HH:MM Mensagem do evento`",
    'calendar.event_announcement': "*[Aviso Programado - Agenda]*\nHorário: {time}\nCompromisso: {text}{creator}",
    'calendar.creator_tag': "\nSolicitante: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "*[Hermes IA - Diagnóstico de Operação]*\nEstado: {state}\nPersonalidade: `{personality}`\nMemória em cache: {count} registros\nProvedor: DeepSeek Oficial (`{model}`)\nChave de API: {key}",
    'hermes.status_off_hint': "DESATIVADO (utilize {prefix}hermes on)",
    'hermes.key_ok': "Configurada (.env)",
    'hermes.key_missing_short': "Não configurada (.env)",
    'hermes.status_nokey': "*[Atenção]* Configure `AI_API_KEY` no arquivo `.env` para habilitar respostas inteligentes.",
    'hermes.status_tip': "Dica: Envie *{prefix}hermes on* para ativar o assistente.",
    'hermes.on_ok': "*[Hermes IA]* Módulo ativado.\nPersonalidade: {personality}\nMemória de contexto: {memory}",
    'hermes.off_ok': "*[Hermes IA]* Módulo desativado.",
    'hermes.cleared': "*[Memória Limpa]* O histórico de conversação do grupo foi redefinido com sucesso.",
    'hermes.disabled_hint': "*[Aviso]* O Hermes IA está desativado neste grupo.\nPara ativar, envie: *{prefix}hermes on*",
    'hermes.disabled_called': "*[Sistema]* O módulo Hermes IA está desativado neste grupo.\nPara ativar, um administrador deve enviar: *{prefix}hermes on*",
    'hermes.usage_hint': "Para interagir, mencione *@hermes*, digite *hermes [pergunta]* ou use *{prefix}hermes status*.",
    'hermes.key_missing': "*[Falha de Configuração]* A chave da API DeepSeek não foi detectada no arquivo `.env` (`AI_API_KEY`).",
    'hermes.greeting_formal': "Olá. Como posso auxiliá-lo na administração do grupo?",
    'hermes.greeting_casual': "Olá. Em que posso ajudar na moderação do grupo?",
    'hermes.quota': "*[Limite Atingido]* Cota horária de requisições de IA excedida. Utilize comandos diretos por prefixo.",
    'hermes.degraded': "*[Modo Texto]* Ações automáticas temporariamente indisponíveis.",
    'hermes.unclear': "*[Não Compreendido]* Não foi possível processar a solicitação com clareza. Por favor, reformule.",
    'hermes.tool_failed': "*[Falha na Operação]* Não foi possível executar a ação solicitada neste momento.",
    'hermes.msg_not_found': "*[Não Localizado]* A mensagem citada não foi encontrada no histórico recente.",
    'hermes.oscillation': "*[Falha de Conexão]* A API de IA não respondeu a tempo. Tente novamente em instantes.",
    'hermes.need_explicit_target': "*[Parâmetro Ausente]* Para executar ações em membros, mencione o usuário (@) ou responda à mensagem correspondente.",
    'hermes.fact_learned': "*[Memória Gravada]* Registrado na memória permanente do grupo: *{key}* = *{value}*",
    'hermes.fact_forgotten': "*[Memória Atualizada]* Registro *{key}* removido com sucesso.",
    'hermes.fact_not_found': "*[Aviso]* O registro *{key}* não foi localizado na memória do grupo.",
    'hermes.action_hallucinated': "*[Ação Não Executada]* A operação não pôde ser confirmada no grupo. Mencione o membro com @ ou utilize o comando administrativo com prefixo (ex: {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "*[Ativação do Sistema]*\nGrupo ativado com sucesso. Licença: *{expiry}*.\n\nIniciando configuração inicial de 3 etapas.",
    'onboarding.step1_header': "*[Configuração Inicial - Etapa 1/3]*",
    'onboarding.step1_question': "Deseja ativar a IA neste grupo?\n\n*[1]* *Sim* - Ativar IA para conversar e executar comandos por texto, como um assistente.\n*[2]* *Não* - Apenas moderação tradicional usando prefixos, como por exemplo: /menu\n\n• Envie 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.step2_header': "*[Configuração Inicial - Etapa 2/3]*",
    'onboarding.step2_question': "Deseja que a IA leia e lembre o contexto das conversas do grupo?\n\n*[1]* *Sim* - Respostas mais inteligentes e comandos por contexto, a IA entende e aprende a dinâmica do grupo.\n*[2]* *Não* - Nenhum dado é coletado pela IA.\n\n• Envie 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.step3_header': "*[Configuração Inicial - Etapa 3/3]*",
    'onboarding.step3_question': "Qual estilo de mensagens e avisos você prefere para o bot?\n\n*[1]* *Natural* - Estilo amigável com emojis e avisos visuais.\n*[2]* *Formal* - Mais robótico com etiquetas *[Moderação]* e avisos limpos e diretos.\n\n• Envie 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.finished': "*[Configuração Concluída]*\nSistema pronto e operacional para este grupo.\n\n• Inteligência Artificial: *{ai}*\n• Memória de Contexto: *{memory}*\n• Estilo de Mensagens: *{style}*\n\nComandos: *{prefix}menu* | Painel: *{prefix}config*"
  },

  es: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': "*[OK]* Operación completada con éxito.",
    'common.error': "*[Error]* Ocurrió una falla al procesar el comando.",
    'common.no_permission_admin': "*[Acceso Denegado]* Comando restringido a administradores del grupo.",
    'common.no_permission_owner': "*[Acceso Denegado]* Comando restringido al propietario del sistema.",
    'common.bot_not_admin': "*[Error]* El bot requiere permisos de administrador para ejecutar esta acción.",
    'common.group_only': "*[Aviso]* Este comando opera exclusivamente dentro de grupos.",
    'common.private_disabled': "*[Sistema]* Comandos por mensaje privado deshabilitados.",
    'common.not_found_target': "*[Parámetro Ausente]* Usuario no identificado. Menciona al usuario (@), responde a su mensaje o escribe su número.",
    'common.invalid_args': "*[Sintaxis Inválida]* Parámetros incorrectos. Verifica la sintaxis.",
    'common.enabled': "ACTIVADO",
    'common.disabled': "DESACTIVADO",
    'common.saved': "*[Sistema]* Configuración guardada con éxito.",
    'common.canceled': "*[Sistema]* Operación cancelada.",
    'common.yes': "Sí",
    'common.no': "No",
    'common.days': "días",
    'common.lifetime': "Vitalicio",
    'common.mention_greeting': "*[Hermes AutoMod]*\nPrefijo activo: `{prefix}`\nComandos: `{prefix}menu` | Panel: `{prefix}config`",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "*[Acceso Denegado]* Este grupo no cuenta con una licencia activa.",
    'saas.inactive_group_hint': "*[Grupo No Activado]*\nEl bot está en el grupo pero requiere activación previa.\n\nPara activarlo, escribe:\n*{prefix}bot on*",
    'saas.license_expired': "*[Licencia Expirada]*\nLa licencia de este grupo ha expirado. Contacta con soporte para renovarla.",
    'saas.activated': "*[Activación del Sistema]*\nGrupo activado con éxito. Validez: *{expiry}*.",
    'saas.days_added': "*[Licencia Actualizada]*\nAñadidos *{days} días* a la licencia del grupo. Nueva validez: *{expiry}*.",
    'saas.deactivated': "*[Sistema]* Actividad pausada en este grupo. Configuraciones conservadas.",
    'saas.status': "*[Estado de Licencia]*\nIdentificador: `{id}`\nEstado: {status}\nValidez: {expiry}\nMódulos: {modules}",
    'saas.list_header': "*[Grupos Registrados en el Sistema]*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Restan: *{remaining}*",
    'saas.list_empty': "Ningún grupo registrado por el momento.",
    'saas.pv_on': "*[Sistema]* Comandos por mensaje privado habilitados para todos los usuarios.",
    'saas.pv_off': "*[Sistema]* Comandos por mensaje privado deshabilitados (Solo propietario autorizado).",
    'saas.group_presentation': "*[Hermes AutoMod - Presentación Operativa]*\nSistema de administración, moderación y seguridad activo en este grupo.\n\n• Envía `{prefix}menu` para consultar comandos disponibles.\n• Administradores pueden enviar `{prefix}config` para ajustar directivas de seguridad.\n\n*[Aviso a Administradores]* El bot requiere privilegios de administrador para operar correctamente.",
    'saas.liberate_success_owner': "*[Activación del Sistema]*\nGrupo autorizado con éxito.\n\n• Grupo: *{name}*\n• Identificador: `{id}`\n• Validez: *{expiry}*\n• Configuración: Directivas predeterminadas aplicadas (IA y Moderación activas).\n\nMensaje operativo de presentación enviado al grupo.",
    'saas.liberate_usage': "*[Sintaxis del Comando]*\n• `{prefix}liberar <enlace_del_grupo> [días]`\n• `{prefix}liberar <id_del_grupo> [días]`\n\nEjemplo:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "*[Error de Acceso]* No fue posible ingresar al grupo mediante el enlace. Motivo: invitación inválida, expirada, grupo lleno o bloqueo activo.",

    // ─── BAN GROUP ───
    'bangroup.banned': "*[Moderación]* El grupo `{id}` ha sido bloqueado en el sistema. Operaciones desactivadas.",
    'bangroup.unbanned': "*[Moderación]* El grupo `{id}` ha sido desbloqueado y reactivado en el sistema.",
    'bangroup.already_banned': "*[Aviso]* Este grupo ya se encuentra en la lista de bloqueados.",
    'bangroup.not_banned': "*[Aviso]* Este grupo no se encuentra en la lista de bloqueados.",
    'bangroup.list_title': "*[Registro de Grupos Bloqueados]*",
    'bangroup.list_empty': "Ningún grupo bloqueado en este momento.",

    // ─── RELOAD ───
    'reload.success': "*[Sistema]* Módulos, esquemas y diccionarios recargados con éxito en tiempo real.",
    'reload.error': "*[Error]* Falla al recargar módulos: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "*[Panel de Control - Hermes AutoMod]*",
    'config.panel_desc': "Envía el número del módulo para alternar estado o reconfigurar.\nAtajos: [P] Prefijo | [L] Idioma | [X] Cerrar\nComandos de moderación: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "*[Sistema]* Prefijo del grupo modificado a: *{prefix}*",
    'config.invalid_option': "*[Opción Inválida]* Selecciona un número válido del menú o [X] para cerrar.",
    'config.module_toggled_on': "*[Sistema]* Módulo *{module}* activado con éxito.",
    'config.module_toggled_off': "*[Sistema]* Módulo *{module}* desactivado con éxito.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "*[Selección de Idioma]*\nSelecciona el idioma del grupo:\n[1] Português\n[2] Español\n[3] English\n\nEnvía 1, 2 o 3.",
    'lang.changed': "*[Sistema]* Idioma del grupo modificado a: *Español*.",
    'lang.invalid': "*[Opción Inválida]* Parámetro incorrecto. Usa: !idioma pt, !idioma es o !idioma en.",
    'lang.invalid_option': "*[Opción Inválida]* Envía 1 (PT), 2 (ES), 3 (EN) o X para cancelar.",

    // ─── ANTILINK ───
    'antilink.detected': "*[AutoMod]* Enlace detectado y eliminado. Infractor: @{user}",
    'antilink.warned': "*[AutoMod]* Enlace no autorizado eliminado. Advertencia registrada para @{user} ({warns}/{max}).",
    'antilink.banned': "*[AutoMod]* @{user} fue expulsado del grupo por violación de política de enlaces.",
    'antilink.status': "*[AutoMod - AntiLink]*\nEstado: {status}\nDominios autorizados: {domains}\nAcción: {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': "*[Nuevo Miembro]* @{user} ingresó a *{group}*.\nDirectivas y reglas del grupo: {desc}",
    'welcome.status': "*[Bienvenida]*\nEstado: {status}\nAuto-eliminación: {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': "*[Moderación]* Advertencia registrada para @{user} ({warns}/{max}).\nMotivo: {reason}",
    'warn.max_reached': "*[Moderación]* Límite de advertencias alcanzado ({max}/{max}). @{user} fue expulsado del grupo.",
    'warn.removed': "*[Moderación]* Advertencia revocada para @{user}. Total activo: {warns}/{max}.",
    'warn.list_title': "*[Registro de Advertencias Activas]*",
    'warn.list_empty': "Ningún miembro tiene advertencias activas en este grupo.",
    'warn.list_item': "• @{user}: *{count}* advertencia(s)",
    'warn.cannot_warn_admin': "*[Acción Inválida]* Los administradores poseen inmunidad a advertencias.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': "*[AutoMod]* Frecuencia excesiva de mensajes detectada (Flood): @{user}",
    'antiflood.trava_detected': "*[AutoMod]* Mensaje con longitud excedente bloqueado: @{user}",
    'antiflood.banned_flood': "*[AutoMod]* @{user} fue expulsado del grupo por envío excesivo de mensajes (Flood).",
    'antiflood.banned_trava': "*[AutoMod]* @{user} fue expulsado del grupo por envío de mensaje malicioso (Crash).",
    'antiflood.status': "*[AutoMod - AntiFlood]*\nEstado: {status}\nLímite: {msgs} msgs/5s | Longitud máx: {chars} caracteres\nAcción: {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "*[AutoMod]* @{user} expulsado: prefijo de país no autorizado en este grupo.",
    'antifake.status': "*[AutoMod - AntiFake]*\nEstado: {status}\nPrefijos autorizados: {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "*[AutoMod - Auto-Aprobación]*\nEstado: {status}\nPrefijos autorizados: {ddis}\nAcción para extranjeros: {foreignAction}\nNotificación en el grupo: {notify}",
    'autoapprove.summary': "*[Solicitudes de Entrada Pendientes]*\n\nTotal en espera: {total}\n• Números Nacionales (DDI 55): {brCount}\n• Números Internacionales: {foreignCount}\n• Identificadores LIDs: {unknownCount}\n\nProtección Anti-Ban: ACTIVA (Cola Segura e Intervalo Humano)\n\nComandos disponibles:\n• `{prefix}aprovar agora` - Aprobar {brCount} números nacionales vía cola segura\n• `{prefix}aprovar todos` - Aprobar la totalidad ({total}) de participantes pendientes\n• `{prefix}aprovar <número>` - Aprobar participante específico\n• `{prefix}aprovar on` - Habilitar auto-aprobación en tiempo real\n• `{prefix}aprovar on todos` - Habilitar auto-aprobación irrestricta\n• `{prefix}aprovar off` - Deshabilitar auto-aprobación\n• `{prefix}aprovar config` - Configurar prefijos y acciones",
    'autoapprove.no_pending': "*[Estado]* No hay solicitudes pendientes de aprobación en este grupo.",
    'autoapprove.no_pending_br': "*[Estado]* No hay solicitudes pendientes de números brasileños en este momento ({foreignCount} extranjeros y {unknownCount} LIDs en espera de revisión manual).",
    'autoapprove.batch_starting': "*[Procesamiento en Lote]* Iniciando aprobación segura de {count} participante(s) con intervalo humano. Espera la conclusión.",
    'autoapprove.batch_starting_all': "*[Procesamiento en Lote]* Iniciando aprobación segura de {count} participante(s) pendientes. Espera la conclusión.",
    'autoapprove.batch_finished': "*[Aprobación Concluida]*\nProcesados: {approved}/{total} aprobados | Fallas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.batch_finished_all': "*[Aprobación General Concluida]*\nProcesados: {approved}/{total} aprobados | Fallas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.batch_cancelled': "*[Operación Interrumpida]* Procesamiento en lote cancelado. Aprobados: {approved}/{total} | Fallas: {failed} | Cancelados: {cancelled}.",
    'autoapprove.approved_single': "*[AutoMod]* Entrada aprobada automáticamente para @{user}.",
    'autoapprove.circuit_breaker_pause': "*[Seguridad Anti-Ban]* Volumen inusual de solicitudes detectado (+{count}/min). Auto-aprobación pausada temporalmente por {minutes} minutos para protección de la cuenta. Solicitudes retenidas para aprobación manual con `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "*[Aviso]* El ajuste 'Aprobar nuevos participantes' está desactivado en la configuración de WhatsApp de este grupo. Actívalo en los ajustes del grupo para requerir aprobación previa.",
    'autoapprove.target_approved': "*[Solicitud Aprobada]* Participante +{user} aprobado en el grupo vía cola segura.",
    'autoapprove.target_failed': "*[Error]* Falla al aprobar participante +{user}. Motivo: {reason}. La solicitud permanece en la cola.",
    'autoapprove.target_ambiguous': "*[Ambigüedad]* Múltiples solicitudes encontradas para +{user} ({count} coincidencias). Envía el número completo con prefijo de país.",
    'autoapprove.target_not_found': "*[No Localizado]* El número indicado (+{user}) no se encuentra en la lista de solicitudes pendientes de este grupo.",
    'autoapprove.queue_cancelled': "*[Operación Cancelada]* Cola de procesamiento interrumpida. {count} solicitud(es) en espera fueron canceladas.",
    'autoapprove.all_members': "Cualquier participante (Todos los países)",
    'autoapprove.activated_all': "*[AutoMod - Auto-Aprobación Irrestricta]* Auto-aprobación habilitada para cualquier procedencia geográfica vía cola segura anti-ban.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': "*[Horario Automático]* Chat cerrado para envío de mensajes.",
    'schedule.opened': "*[Horario Automático]* Chat abierto. Envío de mensajes habilitado.",
    'schedule.status': "*[Horarios Automáticos]*\nEstado: {status}\nCierre: *{close}* | Apertura: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "*[Comunicados Periódicos]*\nEstado: {status}\nIntervalo: cada {interval}\nMensaje: {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "*[Acción Inválida]* No está permitido expulsar a administradores del grupo.",
    'ban.cannot_ban_owner': "*[Acción Inválida]* El propietario del bot no puede ser expulsado.",
    'ban.cannot_ban_bot': "*[Acción Inválida]* El bot no puede expulsarse a sí mismo.",
    'ban.success': "*[Moderación]* @{user} fue expulsado del grupo.",

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': "*[Moderación]* Chat cerrado por administrador. Solo administradores pueden enviar mensajes.",
    'mute.opened': "*[Moderación]* Chat abierto por administrador. Envío habilitado para todos.",
    'mute.prompt': "*[Moderación - Control de Chat]*\n[1] Cerrar el grupo ahora\n[2] Abrir el grupo ahora\n\nEnvía 1 o 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': "*[Moderación]* @{user} silenciado por {duration}.{admin}{reason}\nLos mensajes enviados serán eliminados automáticamente.",
    'mutemember.unmuted': "*[Moderación]* Silenciamiento de @{user} revocado. Envío de mensajes habilitado.",
    'mutemember.not_muted': "*[Estado]* @{user} no figura en la lista de miembros silenciados.",
    'mutemember.list_empty': "Ningún miembro se encuentra silenciado en este grupo actualmente.",
    'mutemember.list_title': "*[Miembros Silenciados en el Grupo]*",
    'mutemember.cannot_mute_admin': "*[Acción Inválida]* Los administradores no pueden ser silenciados.",
    'mutemember.cannot_mute_owner': "*[Acción Inválida]* El propietario del bot no puede ser silenciado.",
    'mutemember.cannot_mute_bot': "*[Acción Inválida]* El bot no puede silenciarse a sí mismo.",
    'mutemember.abuse_banned': "*[AutoMod]* @{user} fue expulsado por spam reiterado mientras estaba silenciado.",
    'mutemember.insistence_banned': "*[AutoMod]* @{user} fue expulsado tras insistir y enviar más de {count} mensajes durante el período de silenciamiento.",

    // ─── LINK DE CONVITE ───
    'link.success': "*[Enlace de Acceso al Grupo]*\nhttps://chat.whatsapp.com/{code}",
    'link.revoked': "*[Enlace Restablecido]*\nNuevo enlace: https://chat.whatsapp.com/{code}\nEl enlace anterior fue revocado.",
    'link.error': "*[Error]* No se pudo obtener el enlace de invitación. Verifica los permisos de administrador del bot.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "*[Sistema]* Descripción del grupo actualizada con éxito.",
    'setdesc.cleared': "*[Sistema]* Descripción del grupo eliminada con éxito.",
    'setdesc.current': "*[Descripción Actual del Grupo]*\n\n{description}\n\nPara cambiarla: envía `{prefix}setdesc <nuevo texto>` o responde a un mensaje con `{prefix}setdesc`.",
    'setdesc.empty': "(El grupo no posee una descripción definida)",
    'setdesc.error': "*[Error]* Falla al actualizar la descripción. Verifica los permisos del bot.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "*[Sistema]* Foto de perfil del grupo actualizada con éxito.",
    'setpic.cleared': "*[Sistema]* Foto de perfil del grupo eliminada con éxito.",
    'setpic.no_image': "*[Parámetro Ausente]* Envía una imagen con `{prefix}foto` en la leyenda o responde a una imagen.",
    'setpic.error': "*[Error]* Falla al actualizar la foto del grupo. Verifica los permisos del bot.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "*[Moderación]* Mensaje fijado en el chat por {duration}.",
    'pin.unpinned': "*[Moderación]* Mensaje desfijado del chat.",
    'pin.reply_required': "*[Parámetro Ausente]* Responde al mensaje que deseas fijar o desfijar.",
    'pin.error': "*[Error]* Falla al fijar/desfijar mensaje. Verifica los permisos del bot.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "*[Encuesta Registrada]*\nTítulo: {title}\nModo: {type} | Opciones: {count}",
    'poll.type_single': "Elección única",
    'poll.type_multi': "Múltiples opciones",
    'poll.usage': "*[Instrucciones para Crear Encuestas]*\n\n1) En Línea (con barra |):\n`{prefix}poll Pregunta | Opción 1 | Opción 2`\n\n2) Múltiple Elección (--multi):\n`{prefix}poll --multi Pregunta | Opción 1 | Opción 2`\n\n3) Varias Líneas:\n`{prefix}poll Pregunta\n1. Opción A\n2. Opción B`",
    'poll.error_options': "*[Parámetro Inválido]* La encuesta requiere una pregunta y al menos 2 alternativas válidas.",
    'poll.error': "*[Error]* Falla al generar la encuesta. Verifica los datos enviados.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "*[Parámetro Ausente]* Escribe el comunicado que deseas enviar o responde a un mensaje.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "*[Estado]* El miembro indicado ya posee privilegios de administrador.",
    'promote.need_explicit_mention': "*[Seguridad]* Solo miembros mencionados expresamente con @ pueden ser promovidos a administrador.",
    'promote.success': "*[Moderación]* @{user} fue promovido a Administrador del grupo.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "*[Estado]* El usuario indicado no es un administrador.",
    'demote.cannot_demote_owner': "*[Acción Inválida]* El propietario supremo no puede ser degradado.",
    'demote.success': "*[Moderación]* @{user} fue degradado a miembro regular.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "*[Parámetro Ausente]* Responde al mensaje que deseas eliminar.",
    'clear.success': "*[Moderación]* Mensaje eliminado del chat.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "*[Lista Negra]* @{user} registrado en la lista negra del grupo y expulsado.",
    'blacklist.added_global': "*[Lista Negra Global]* @{user} registrado en la lista negra global del sistema.",
    'blacklist.removed': "*[Lista Negra]* @{user} eliminado de la lista negra del grupo.",
    'blacklist.removed_global': "*[Lista Negra Global]* @{user} eliminado de la lista negra global.",
    'blacklist.list_title': "*[Lista Negra del Grupo]*",
    'blacklist.list_empty': "La lista negra de este grupo está vacía.",
    'blacklist.banned_entry': "*[AutoMod]* Entrada denegada: @{user} figura en la lista negra.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "*[Aviso]* No hay miembros elegibles suficientes para realizar el sorteo.",
    'raffle.title': "*[Sorteio Finalizado]*",
    'raffle.prize': "Premio: {prize}",
    'raffle.winners': "Ganador(es):\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "*[Diagnóstico Operativo - Hermes]*",
    'ping.latency': "Latencia: `{latency}ms`",
    'ping.uptime': "Tiempo activo: `{uptime}`",
    'ping.ram': "Memoria RAM: `{ram} MB`",
    'ping.lang': "Idioma: `{lang}`",
    'ping.antiban': "Protección Sigilosa: `ACTIVA`",
    'ping.license': "Licencia: `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "*[Configuración: {plugin}]* (Etapa {step}/{total})",
    'wizard.current_val': "Valor actual: `{current}`",
    'wizard.invalid_input': "*[Respuesta Inválida]* Revisa los parámetros solicitados y envíalos nuevamente.",
    'wizard.finished': "*[Configuración Concluida]* Parámetros de {plugin} actualizados y operativos.",
    'wizard.choice_prompt': "Selecciona una opción enviando el número correspondiente:\n{choices}",
    'wizard.boolean_prompt': "[1] Activado\n[2] Desactivado\n\nEnvía 1 o 2 para confirmar.",
    'wizard.select_field_title': "*[Configuración: {plugin}]*\n\nSelecciona el paso que deseas editar:\n\n",
    'wizard.select_field_footer': "[T] Reconfigurar Todos los Pasos\n[X] Cancelar y Cerrar\n\nEnvía el número del paso deseado.",
    'wizard.select_field_invalid': "*[Opción Inválida]* Selecciona el número del paso (1 a {max}), [T] para todos o [X] para cerrar.",
    'wizard.summary_single': "*[Configuración Actualizada]*",
    'wizard.summary_all': "*[Resumen de Configuraciones Guardadas]*",
    'wizard.tip_keep': "Dica: Envía *.* (punto) para MANTENER el valor actual.",
    'wizard.tip_default': "Valor predeterminado: `{default}`\nDica: Envía *.* (punto) para USAR el valor predeterminado.",
    'wizard.cancel_hint': "Envía *X* en cualquier momento para cancelar.",
    'wizard.out_of_range': "*[Valor Fuera de Rango]* Parámetro inválido{range}. Inténtalo de nuevo.",
    'wizard.session_expired': "*[Sesión Expirada]* El menú de configuración estuvo inactivo y se cerró por seguridad.",
    'wizard.focus_switch_prompt': "*[Aviso]* Existe una sesión de configuración activa en curso (*{module}*).\n\n• Envía *X* para cancelar\n• Envía *1* para continuar",
    'wizard.hermes_focus_detected': "*[Aviso]* @{user}, existe un menú de configuración abierto (*{module}*).\n\n• Envía *X* para cerrar el menú\n• Envía *1* para continuar con la configuración",
    'wizard.cancelled': "*[Sistema]* Configuración cancelada. Sesión cerrada.",
    'wizard.continued': "*[Sistema]* Continuando configuración...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "*[Evento Programado]*\nFecha/Hora: {date} a las {time}\nCompromiso: {text}\nID: #{id}",
    'calendar.list_title': "*[Cronograma de Eventos del Grupo]*",
    'calendar.list_empty': "Ningún evento o compromiso registrado en el cronograma.\nPara agendar, envía: `{prefix}agenda add DD/MM HH:MM Mensaje del evento`",
    'calendar.item': "• [#{id}] {date} a las {time} — {text}",
    'calendar.deleted': "*[Sistema]* Evento #{id} eliminado con éxito.",
    'calendar.not_found': "*[Aviso]* Evento #{id} no encontrado en el cronograma.",
    'calendar.cleared': "*[Sistema]* Todos los eventos fueron eliminados.",
    'calendar.invalid_format': "*[Formato Inválido]* Usa: `{prefix}agenda add DD/MM HH:MM Mensaje del evento`",
    'calendar.event_announcement': "*[Aviso Programado - Agenda]*\nHorario: {time}\nCompromiso: {text}{creator}",
    'calendar.creator_tag': "\nSolicitante: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "*[Hermes IA - Diagnóstico Operativo]*\nEstado: {state}\nPersonalidad: `{personality}`\nMemoria en caché: {count} registros\nProveedor: DeepSeek Oficial (`{model}`)\nClave de API: {key}",
    'hermes.status_off_hint': "DESACTIVADO (utiliza {prefix}hermes on)",
    'hermes.key_ok': "Configurada (.env)",
    'hermes.key_missing_short': "No configurada (.env)",
    'hermes.status_nokey': "*[Aviso]* Configura `AI_API_KEY` en el archivo `.env` para habilitar respuestas inteligentes.",
    'hermes.status_tip': "Dica: Envía *{prefix}hermes on* para habilitar el asistente.",
    'hermes.on_ok': "*[Hermes IA]* Módulo activado.\nPersonalidad: {personality}\nMemoria de contexto: {memory}",
    'hermes.off_ok': "*[Hermes IA]* Módulo desactivado.",
    'hermes.cleared': "*[Memoria Limpia]* El historial de conversación del grupo fue restablecido con éxito.",
    'hermes.disabled_hint': "*[Aviso]* Hermes IA está desactivado en este grupo.\nPara habilitarlo, envía: *{prefix}hermes on*",
    'hermes.disabled_called': "*[Sistema]* El módulo Hermes IA está desactivado en este grupo.\nPara habilitarlo, un administrador debe enviar: *{prefix}hermes on*",
    'hermes.usage_hint': "Para interactuar, menciona a *@hermes*, escribe *hermes [consulta]* o usa *{prefix}hermes status*.",
    'hermes.key_missing': "*[Falla de Configuración]* La clave de API DeepSeek no fue detectada en el archivo `.env` (`AI_API_KEY`).",
    'hermes.greeting_formal': "Hola. ¿Cómo puedo asistirte en la administración del grupo?",
    'hermes.greeting_casual': "Hola. ¿En qué puedo colaborar con la moderación del grupo?",
    'hermes.quota': "*[Límite Alcanzado]* Cuota horaria de solicitudes de IA excedida. Utiliza comandos directos por prefijo.",
    'hermes.degraded': "*[Modo Texto]* Acciones automáticas temporalmente no disponibles.",
    'hermes.unclear': "*[No Comprendido]* No fue posible procesar la solicitud con claridad. Por favor, reformula.",
    'hermes.tool_failed': "*[Falla Operativa]* No fue posible ejecutar la acción solicitada en este momento.",
    'hermes.msg_not_found': "*[No Encontrado]* El mensaje citado no fue localizado en el historial reciente.",
    'hermes.oscillation': "*[Falla de Conexión]* La API de IA no respondió oportunamente. Inténtalo de nuevo en unos instantes.",
    'hermes.need_explicit_target': "*[Parámetro Ausente]* Para ejecutar acciones sobre miembros, menciona al usuario (@) o responde a su mensaje.",
    'hermes.fact_learned': "*[Memoria Guardada]* Registrado en la memoria permanente del grupo: *{key}* = *{value}*",
    'hermes.fact_forgotten': "*[Memoria Actualizada]* Registro *{key}* eliminado con éxito.",
    'hermes.fact_not_found': "*[Aviso]* El registro *{key}* no fue localizado en la memoria del grupo.",
    'hermes.action_hallucinated': "*[Acción No Ejecutada]* La operación no pudo ser confirmada en el grupo. Menciona al miembro con @ o utiliza el comando administrativo con prefijo (ej: {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "*[Activación del Sistema]*\nGrupo activado con éxito. Licencia: *{expiry}*.\n\nIniciando configuración inicial de 3 pasos.",
    'onboarding.step1_header': "*[Configuración Inicial - Paso 1/3]*",
    'onboarding.step1_question': "¿Deseas activar las funciones de Inteligencia Artificial (Hermes IA)?\n\n[1] Sí (Habilitar IA para lenguaje natural y comandos)\n[2] No (Solo moderación tradicional sin IA)\n\n• Envía 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.step2_header': "*[Configuración Inicial - Paso 2/3]*",
    'onboarding.step2_question': "¿La IA debe leer y recordar el contexto de las conversaciones del grupo?\n\n[1] Sí (Respuestas y comandos por contexto)\n[2] No (Sin recopilación de contexto)\n\n• Envía 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.step3_header': "*[Configuración Inicial - Paso 3/3]*",
    'onboarding.step3_question': "¿Qué estilo de mensajes y avisos debe adoptar el bot?\n\n[1] Natural (Estilo amigable con emojis y avisos visuales)\n[2] Formal (Estilo corporativo con etiquetas *[Moderación]* y lenguaje sobrio)\n\n• Envía 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.finished': "*[Configuración Finalizada]*\nSistema operativo para este grupo.\n\n• Inteligencia Artificial: *{ai}*\n• Memoria de Contexto: *{memory}*\n• Estilo de Mensajes: *{style}*\n\nComandos: *{prefix}menu* | Panel: *{prefix}config*"
  },

  en: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': "*[OK]* Operation completed successfully.",
    'common.error': "*[Error]* An error occurred while processing the command.",
    'common.no_permission_admin': "*[Access Denied]* Command restricted to group administrators.",
    'common.no_permission_owner': "*[Access Denied]* Command restricted to the system owner.",
    'common.bot_not_admin': "*[Error]* The bot requires administrator privileges to perform this action.",
    'common.group_only': "*[Notice]* This command operates exclusively inside groups.",
    'common.private_disabled': "*[System]* Direct message (DM) commands are disabled.",
    'common.not_found_target': "*[Missing Parameter]* Target user not identified. Mention the user (@), reply to their message, or specify their number.",
    'common.invalid_args': "*[Invalid Syntax]* Incorrect arguments. Please verify syntax.",
    'common.enabled': "ENABLED",
    'common.disabled': "DISABLED",
    'common.saved': "*[System]* Settings saved successfully.",
    'common.canceled': "*[System]* Operation canceled.",
    'common.yes': "Yes",
    'common.no': "No",
    'common.days': "days",
    'common.lifetime': "Lifetime",
    'common.mention_greeting': "*[Hermes AutoMod]*\nActive prefix: `{prefix}`\nCommands: `{prefix}menu` | Panel: `{prefix}config`",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "*[Access Denied]* This group does not have an active license.",
    'saas.inactive_group_hint': "*[Group Not Activated]*\nThe bot is in this group but requires activation.\n\nTo activate, send:\n*{prefix}bot on*",
    'saas.license_expired': "*[License Expired]*\nThis group's license has expired. Please contact support to renew.",
    'saas.activated': "*[System Activation]*\nGroup activated successfully. Expiration: *{expiry}*.",
    'saas.days_added': "*[License Updated]*\nAdded *{days} days* to group license. New expiration: *{expiry}*.",
    'saas.deactivated': "*[System]* Bot operations paused in this group. Settings preserved.",
    'saas.status': "*[License Status]*\nID: `{id}`\nState: {status}\nExpires: {expiry}\nModules: {modules}",
    'saas.list_header': "*[Groups Registered in System]*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Remaining: *{remaining}*",
    'saas.list_empty': "No groups registered at the moment.",
    'saas.pv_on': "*[System]* Direct message (DM) commands enabled for all users.",
    'saas.pv_off': "*[System]* Direct message (DM) commands disabled (Authorized owner only).",
    'saas.group_presentation': "*[Hermes AutoMod - Operational Overview]*\nAdministration, moderation, and compliance system active in this group.\n\n• Send `{prefix}menu` to view available commands.\n• Administrators can send `{prefix}config` to manage security policies.\n\n*[Notice to Administrators]* The bot requires group administrator privileges to enforce security routines.",
    'saas.liberate_success_owner': "*[System Activation]*\nGroup authorized successfully.\n\n• Group: *{name}*\n• Identifier: `{id}`\n• Expiration: *{expiry}*\n• Configuration: Recommended defaults applied (AI and Moderation active).\n\nOperational presentation message delivered to group.",
    'saas.liberate_usage': "*[Command Syntax]*\n• `{prefix}liberar <group_link> [days]`\n• `{prefix}liberar <group_id> [days]`\n\nExample:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "*[Access Error]* Failed to join group via link. Reason: invalid or expired invite, group full, or active ban.",

    // ─── BAN GROUP ───
    'bangroup.banned': "*[Moderation]* Group `{id}` has been banned from the system. Operations disabled.",
    'bangroup.unbanned': "*[Moderation]* Group `{id}` has been unbanned and reactivated in the system.",
    'bangroup.already_banned': "*[Notice]* This group is already present in the block list.",
    'bangroup.not_banned': "*[Notice]* This group is not present in the block list.",
    'bangroup.list_title': "*[Banned Groups Registry]*",
    'bangroup.list_empty': "No groups are currently banned.",

    // ─── RELOAD ───
    'reload.success': "*[System]* Plugins, schemas, and dictionaries reloaded successfully in real time.",
    'reload.error': "*[Error]* Failed to reload modules: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "*[Control Panel - Hermes AutoMod]*",
    'config.panel_desc': "Send the module number to toggle state or reconfigure.\nShortcuts: [P] Prefix | [L] Language | [X] Close\nModeration commands: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "*[System]* Group prefix updated to: *{prefix}*",
    'config.invalid_option': "*[Invalid Option]* Select a valid menu option or [X] to close.",
    'config.module_toggled_on': "*[System]* Module *{module}* enabled successfully.",
    'config.module_toggled_off': "*[System]* Module *{module}* disabled successfully.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "*[Language Selection]*\nSelect group language:\n[1] Português\n[2] Español\n[3] English\n\nSend 1, 2, or 3.",
    'lang.changed': "*[System]* Group language changed to: *English*.",
    'lang.invalid': "*[Invalid Option]* Incorrect parameter. Use: !idioma pt, !idioma es, or !idioma en.",
    'lang.invalid_option': "*[Invalid Option]* Send 1 (PT), 2 (ES), 3 (EN), or X to cancel.",

    // ─── ANTILINK ───
    'antilink.detected': "*[AutoMod]* Link detected and deleted. Offender: @{user}",
    'antilink.warned': "*[AutoMod]* Unauthorized link deleted. Warning logged for @{user} ({warns}/{max}).",
    'antilink.banned': "*[AutoMod]* @{user} was removed for violating the link policy.",
    'antilink.status': "*[AutoMod - AntiLink]*\nState: {status}\nAllowed domains: {domains}\nAction: {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': "*[New Member]* @{user} has joined *{group}*.\nGroup rules and description: {desc}",
    'welcome.status': "*[Welcome]*\nState: {status}\nAuto-delete: {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': "*[Moderation]* Warning logged for @{user} ({warns}/{max}).\nReason: {reason}",
    'warn.max_reached': "*[Moderation]* Warning threshold reached ({max}/{max}). @{user} was removed from the group.",
    'warn.removed': "*[Moderation]* Warning revoked for @{user}. Active total: {warns}/{max}.",
    'warn.list_title': "*[Active Warnings Registry]*",
    'warn.list_empty': "No members have active warnings in this group.",
    'warn.list_item': "• @{user}: *{count}* warning(s)",
    'warn.cannot_warn_admin': "*[Invalid Action]* Administrators are immune to warnings.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': "*[AutoMod]* Excessive message frequency detected (Flood): @{user}",
    'antiflood.trava_detected': "*[AutoMod]* Oversized message payload blocked: @{user}",
    'antiflood.banned_flood': "*[AutoMod]* @{user} was removed for flooding.",
    'antiflood.banned_trava': "*[AutoMod]* @{user} was removed for sending a malicious crash payload.",
    'antiflood.status': "*[AutoMod - AntiFlood]*\nState: {status}\nLimit: {msgs} msgs/5s | Max length: {chars} characters\nAction: {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "*[AutoMod]* @{user} removed: country code not authorized in this group.",
    'antifake.status': "*[AutoMod - AntiFake]*\nState: {status}\nAllowed country codes: {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "*[AutoMod - Auto-Approve]*\nState: {status}\nAllowed country codes: {ddis}\nForeign action: {foreignAction}\nGroup notification: {notify}",
    'autoapprove.summary': "*[Pending Join Requests]*\n\nTotal pending: {total}\n• National Numbers (DDI 55): {brCount}\n• International Numbers: {foreignCount}\n• Unresolved LIDs: {unknownCount}\n\nAnti-Ban Protection: ACTIVE (Safe Queue and Human Jitter)\n\nAvailable commands:\n• `{prefix}aprovar agora` - Approve {brCount} national members via safe queue\n• `{prefix}aprovar todos` - Approve ALL {total} pending requests\n• `{prefix}aprovar <number>` - Approve specific participant\n• `{prefix}aprovar on` - Enable real-time auto-approval\n• `{prefix}aprovar on todos` - Enable unrestricted auto-approval\n• `{prefix}aprovar off` - Disable auto-approval\n• `{prefix}aprovar config` - Configure country codes and actions",
    'autoapprove.no_pending': "*[Status]* There are no pending join requests in this group.",
    'autoapprove.no_pending_br': "*[Status]* No pending Brazilian requests at this time ({foreignCount} international and {unknownCount} LIDs awaiting manual review).",
    'autoapprove.batch_starting': "*[Batch Processing]* Initiating safe approval of {count} participant(s) with human jitter. Please wait for completion.",
    'autoapprove.batch_starting_all': "*[Batch Processing]* Initiating safe approval of {count} pending participant(s). Please wait for completion.",
    'autoapprove.batch_finished': "*[Approval Completed]*\nProcessed: {approved}/{total} approved | Failed: {failed} | Cancelled: {cancelled}.",
    'autoapprove.batch_finished_all': "*[General Approval Completed]*\nProcessed: {approved}/{total} approved | Failed: {failed} | Cancelled: {cancelled}.",
    'autoapprove.batch_cancelled': "*[Operation Interrupted]* Batch approval cancelled. Approved: {approved}/{total} | Failed: {failed} | Cancelled: {cancelled}.",
    'autoapprove.approved_single': "*[AutoMod]* Join request automatically approved for @{user}.",
    'autoapprove.circuit_breaker_pause': "*[Anti-Ban Security]* Abnormal join request volume detected (+{count}/min). Auto-approval paused for {minutes} minutes to protect bot account. Pending requests held for manual processing via `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "*[Notice]* The 'Approve new participants' setting is disabled in this WhatsApp group. Enable it in WhatsApp settings to place incoming requests into the queue.",
    'autoapprove.target_approved': "*[Request Approved]* Participant +{user} approved into group via safe queue.",
    'autoapprove.target_failed': "*[Error]* Failed to approve participant +{user}. Reason: {reason}. Request remains in queue.",
    'autoapprove.target_ambiguous': "*[Ambiguity]* Multiple requests match +{user} ({count} found). Provide full number with country code.",
    'autoapprove.target_not_found': "*[Not Found]* The specified number (+{user}) is not present in this group's pending queue.",
    'autoapprove.queue_cancelled': "*[Operation Cancelled]* Processing queue interrupted. {count} pending request(s) cancelled.",
    'autoapprove.all_members': "Any participant (All countries)",
    'autoapprove.activated_all': "*[AutoMod - Unrestricted Auto-Approve]* Auto-approval enabled for all geographic origins via anti-ban safe queue.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': "*[Automated Schedule]* Chat closed for regular messages.",
    'schedule.opened': "*[Automated Schedule]* Chat opened. Message sending enabled.",
    'schedule.status': "*[Automated Schedule]*\nState: {status}\nClose: *{close}* | Open: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "*[Periodic Announcements]*\nState: {status}\nInterval: every {interval}\nMessage: {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "*[Invalid Action]* Group administrators cannot be banned.",
    'ban.cannot_ban_owner': "*[Invalid Action]* The bot owner cannot be banned.",
    'ban.cannot_ban_bot': "*[Invalid Action]* The bot cannot ban itself.",
    'ban.success': "*[Moderation]* @{user} was removed from the group.",

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': "*[Moderation]* Chat locked by administrator. Only admins may send messages.",
    'mute.opened': "*[Moderation]* Chat unlocked by administrator. Message sending enabled for all members.",
    'mute.prompt': "*[Moderation - Chat Control]*\n[1] Lock the group now\n[2] Unlock the group now\n\nSend 1 or 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': "*[Moderation]* @{user} muted for {duration}.{admin}{reason}\nSent messages will be automatically removed.",
    'mutemember.unmuted': "*[Moderation]* Mute revoked for @{user}. Message sending restored.",
    'mutemember.not_muted': "*[Status]* @{user} is not currently in the muted list.",
    'mutemember.list_empty': "No members are currently muted in this group.",
    'mutemember.list_title': "*[Muted Members in Group]*",
    'mutemember.cannot_mute_admin': "*[Invalid Action]* Administrators cannot be muted.",
    'mutemember.cannot_mute_owner': "*[Invalid Action]* The bot owner cannot be muted.",
    'mutemember.cannot_mute_bot': "*[Invalid Action]* The bot cannot mute itself.",
    'mutemember.abuse_banned': "*[AutoMod]* @{user} was removed for repeated spam while muted.",
    'mutemember.insistence_banned': "*[AutoMod]* @{user} was removed after insisting and sending over {count} messages while muted.",

    // ─── LINK DE CONVITE ───
    'link.success': "*[Group Access Link]*\nhttps://chat.whatsapp.com/{code}",
    'link.revoked': "*[Link Reset]*\nNew link: https://chat.whatsapp.com/{code}\nThe previous link was revoked.",
    'link.error': "*[Error]* Failed to retrieve group invite link. Verify bot administrator privileges.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "*[System]* Group description updated successfully.",
    'setdesc.cleared': "*[System]* Group description removed successfully.",
    'setdesc.current': "*[Current Group Description]*\n\n{description}\n\nTo change it: send `{prefix}setdesc <new text>` or reply to a message with `{prefix}setdesc`.",
    'setdesc.empty': "(The group does not currently have a description set)",
    'setdesc.error': "*[Error]* Failed to update group description. Verify bot administrator privileges.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "*[System]* Group profile picture updated successfully.",
    'setpic.cleared': "*[System]* Group profile picture removed successfully.",
    'setpic.no_image': "*[Missing Parameter]* Send an image with `{prefix}foto` in the caption or reply to an image.",
    'setpic.error': "*[Error]* Failed to update group profile picture. Verify bot administrator privileges.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "*[Moderation]* Message pinned to chat top for {duration}.",
    'pin.unpinned': "*[Moderation]* Message unpinned from chat top.",
    'pin.reply_required': "*[Missing Parameter]* Reply to the message you wish to pin or unpin.",
    'pin.error': "*[Error]* Failed to pin/unpin message. Verify bot administrator privileges.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "*[Poll Registered]*\nTitle: {title}\nMode: {type} | Options: {count}",
    'poll.type_single': "Single choice",
    'poll.type_multi': "Multiple choice",
    'poll.usage': "*[Poll Creation Instructions]*\n\n1) Single-Line (with pipe |):\n`{prefix}poll Question | Option 1 | Option 2`\n\n2) Multiple Choice (--multi):\n`{prefix}poll --multi Question | Option 1 | Option 2`\n\n3) Multi-Line:\n`{prefix}poll Question\n1. Option A\n2. Option B`",
    'poll.error_options': "*[Invalid Parameter]* The poll requires a question and at least 2 valid options.",
    'poll.error': "*[Error]* Failed to generate poll. Please check the provided data.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "*[Missing Parameter]* Enter announcement text or reply to a message.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "*[Status]* The specified member already has administrator privileges.",
    'promote.need_explicit_mention': "*[Security]* Only members explicitly mentioned with @ can be promoted to administrator.",
    'promote.success': "*[Moderation]* @{user} was promoted to Group Administrator.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "*[Status]* The specified user is not an administrator.",
    'demote.cannot_demote_owner': "*[Invalid Action]* The supreme owner cannot be demoted.",
    'demote.success': "*[Moderation]* @{user} was demoted to regular member.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "*[Missing Parameter]* Reply to the message you wish to delete.",
    'clear.success': "*[Moderation]* Message deleted from chat.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "*[Blacklist]* @{user} added to group blacklist and removed.",
    'blacklist.added_global': "*[Global Blacklist]* @{user} registered in system global blacklist.",
    'blacklist.removed': "*[Blacklist]* @{user} removed from group blacklist.",
    'blacklist.removed_global': "*[Global Blacklist]* @{user} removed from system global blacklist.",
    'blacklist.list_title': "*[Group Blacklist]*",
    'blacklist.list_empty': "The blacklist for this group is empty.",
    'blacklist.banned_entry': "*[AutoMod]* Access blocked: @{user} is on the blacklist.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "*[Notice]* Insufficient eligible members to conduct a raffle.",
    'raffle.title': "*[Raffle Completed]*",
    'raffle.prize': "Prize: {prize}",
    'raffle.winners': "Winner(s):\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "*[System Diagnostics - Hermes]*",
    'ping.latency': "Latency: `{latency}ms`",
    'ping.uptime': "Uptime: `{uptime}`",
    'ping.ram': "RAM Usage: `{ram} MB`",
    'ping.lang': "Language: `{lang}`",
    'ping.antiban': "Stealth Protection: `ACTIVE`",
    'ping.license': "License: `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "*[Configuration: {plugin}]* (Step {step}/{total})",
    'wizard.current_val': "Current value: `{current}`",
    'wizard.invalid_input': "*[Invalid Input]* Review the required parameters and send again.",
    'wizard.finished': "*[Configuration Completed]* Parameters for {plugin} updated and operational.",
    'wizard.choice_prompt': "Select an option by sending the corresponding number:\n{choices}",
    'wizard.boolean_prompt': "[1] Enabled\n[2] Disabled\n\nSend 1 or 2 to confirm.",
    'wizard.select_field_title': "*[Configuration: {plugin}]*\n\nSelect the step you wish to edit:\n\n",
    'wizard.select_field_footer': "[T] Reconfigure All Steps\n[X] Cancel and Close\n\nSend the number of the desired step.",
    'wizard.select_field_invalid': "*[Invalid Option]* Select step number (1 to {max}), [T] for all, or [X] to close.",
    'wizard.summary_single': "*[Configuration Updated]*",
    'wizard.summary_all': "*[Saved Settings Summary]*",
    'wizard.tip_keep': "Tip: Send *.* (dot) to KEEP current value.",
    'wizard.tip_default': "Default value: `{default}`\nTip: Send *.* (dot) to USE default value.",
    'wizard.cancel_hint': "Send *X* at any time to cancel.",
    'wizard.out_of_range': "*[Value Out of Range]* Invalid parameter{range}. Please try again.",
    'wizard.session_expired': "*[Session Expired]* Configuration menu timed out and was closed for security.",
    'wizard.focus_switch_prompt': "*[Notice]* An active configuration session is currently in progress (*{module}*).\n\n• Send *X* to cancel\n• Send *1* to continue",
    'wizard.hermes_focus_detected': "*[Notice]* @{user}, a configuration menu is currently open (*{module}*).\n\n• Send *X* to close menu\n• Send *1* to continue configuration",
    'wizard.cancelled': "*[System]* Configuration cancelled. Session closed.",
    'wizard.continued': "*[System]* Continuing configuration...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "*[Event Scheduled]*\nDate/Time: {date} at {time}\nEvent: {text}\nID: #{id}",
    'calendar.list_title': "*[Group Scheduled Events Registry]*",
    'calendar.list_empty': "No events or reminders recorded in the schedule.\nTo schedule, send: `{prefix}agenda add DD/MM HH:MM Event announcement text`",
    'calendar.item': "• [#{id}] {date} at {time} — {text}",
    'calendar.deleted': "*[System]* Scheduled event #{id} deleted successfully.",
    'calendar.not_found': "*[Notice]* Event #{id} not found in the schedule.",
    'calendar.cleared': "*[System]* All scheduled events were cleared.",
    'calendar.invalid_format': "*[Invalid Format]* Use: `{prefix}agenda add DD/MM HH:MM Event text`",
    'calendar.event_announcement': "*[Scheduled Notice - Calendar]*\nTime: {time}\nEvent: {text}{creator}",
    'calendar.creator_tag': "\nRequested by: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "*[Hermes AI - Operational Diagnostics]*\nState: {state}\nPersonality: `{personality}`\nCached memory: {count} records\nProvider: DeepSeek Official (`{model}`)\nAPI Key: {key}",
    'hermes.status_off_hint': "DISABLED (use {prefix}hermes on)",
    'hermes.key_ok': "Configured (.env)",
    'hermes.key_missing_short': "Not configured (.env)",
    'hermes.status_nokey': "*[Notice]* Configure `AI_API_KEY` in `.env` to enable AI responses.",
    'hermes.status_tip': "Tip: Send *{prefix}hermes on* to activate the assistant.",
    'hermes.on_ok': "*[Hermes AI]* Module enabled.\nPersonality: {personality}\nContext memory: {memory}",
    'hermes.off_ok': "*[Hermes AI]* Module disabled.",
    'hermes.cleared': "*[Memory Cleared]* Group chat history reset successfully.",
    'hermes.disabled_hint': "*[Notice]* Hermes AI is disabled in this group.\nTo enable, send: *{prefix}hermes on*",
    'hermes.disabled_called': "*[System]* Hermes AI module is disabled in this group.\nTo enable, an administrator must send: *{prefix}hermes on*",
    'hermes.usage_hint': "To interact, mention *@hermes*, type *hermes [query]* or use *{prefix}hermes status*.",
    'hermes.key_missing': "*[Configuration Failure]* DeepSeek API key was not detected in `.env` (`AI_API_KEY`).",
    'hermes.greeting_formal': "Hello. How may I assist you with group administration?",
    'hermes.greeting_casual': "Hello. How can I assist with group moderation today?",
    'hermes.quota': "*[Quota Exceeded]* Hourly AI request limit reached. Please use direct prefix commands.",
    'hermes.degraded': "*[Text Mode]* Automated actions are temporarily unavailable.",
    'hermes.unclear': "*[Not Understood]* Request could not be clearly resolved. Please rephrase.",
    'hermes.tool_failed': "*[Operational Failure]* Unable to execute requested action at this time.",
    'hermes.msg_not_found': "*[Not Found]* Quoted message was not located in recent history.",
    'hermes.oscillation': "*[Connection Error]* AI API did not respond in time. Please try again shortly.",
    'hermes.need_explicit_target': "*[Missing Parameter]* To target members, mention the user (@) or reply to their message.",
    'hermes.fact_learned': "*[Memory Saved]* Learned to group permanent memory: *{key}* = *{value}*",
    'hermes.fact_forgotten': "*[Memory Updated]* Record *{key}* removed successfully.",
    'hermes.fact_not_found': "*[Notice]* Record *{key}* was not located in group memory.",
    'hermes.action_hallucinated': "*[Action Not Executed]* Operation could not be confirmed in the group. Mention the member with @ or use the prefix command (e.g. {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "*[System Activation]*\nGroup activated successfully. License: *{expiry}*.\n\nStarting 3-step initial configuration.",
    'onboarding.step1_header': "*[Initial Setup - Step 1/3]*",
    'onboarding.step1_question': "Enable Artificial Intelligence (Hermes AI) features in this group?\n\n[1] Yes (Enable AI for natural language commands and assistance)\n[2] No (Traditional moderation only, without AI)\n\n• Send 1 or 2 (or send . for default [1])",
    'onboarding.step2_header': "*[Initial Setup - Step 2/3]*",
    'onboarding.step2_question': "Should the AI read and remember conversation history for group context?\n\n[1] Yes (Context-aware responses and actions)\n[2] No (No context data collected)\n\n• Send 1 or 2 (or send . for default [1])",
    'onboarding.step3_header': "*[Initial Setup - Step 3/3]*",
    'onboarding.step3_question': "Which message and alert style should the bot adopt in this group?\n\n[1] Natural (Friendly visual with emojis and visual alerts)\n[2] Formal (Corporate visual with *[Moderation]* tags and clean phrasing)\n\n• Send 1 or 2 (or send . for default [1])",
    'onboarding.finished': "*[Configuration Completed]*\nSystem operational for this group.\n\n• Artificial Intelligence: *{ai}*\n• Context Memory: *{memory}*\n• Message Style: *{style}*\n\nCommands: *{prefix}menu* | Panel: *{prefix}config*"
  }
};

module.exports = {
  dictionaries
};
