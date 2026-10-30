/**
 * Sistema de Internacionalização Nativa (i18n)
 * Suporte completo a Português (pt), Espanhol (es) e Inglês (en)
 * Suporta templates simples (String) e pools de frases com seleção aleatória (Array) para dinamismo Anti-Ban.
 * Sem placeholders ou omissões de tradução.
 */

const i18nFormal = require('./i18nFormal');

const dictionaries = {
  pt: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': ["Pronto! Ação realizada com sucesso.","Tudo certo, comando executado.","Feito! Operação concluída com sucesso."],
    'common.error': ["Não foi possível concluir esta ação no momento. Por favor, tente novamente.","Ocorreu uma falha temporária ao executar o comando. Tente novamente em instantes."],
    'common.no_permission_admin': ["Este comando pode ser utilizado apenas por administradores do grupo.","Apenas os administradores do grupo têm permissão para usar este comando."],
    'common.no_permission_owner': ["Este comando é restrito ao desenvolvedor e proprietário do bot.","Apenas o proprietário do bot pode utilizar este comando."],
    'common.bot_not_admin': ["Para executar esta ação, você precisa me promover a administrador do grupo.","Preciso de permissão de administrador no grupo para conseguir realizar este comando."],
    'common.group_only': ["Este comando funciona exclusivamente dentro de grupos.","Este recurso pode ser utilizado apenas em grupos."],
    'common.private_disabled': ["O atendimento a comandos por mensagem privada está desativado no momento.","No momento, comandos no privado não estão disponíveis."],
    'common.not_found_target': ["Não consegui identificar o usuário. Por favor, mencione com @ ou responda à mensagem da pessoa.","Usuário não localizado. Marque a pessoa com @ ou responda à mensagem correspondente."],
    'common.invalid_args': ["Os parâmetros informados estão incorretos. Por favor, verifique o formato do comando.","Faltam informações para executar o comando. Verifique a sintaxe recomendada."],
    'common.enabled': "ATIVADO",
    'common.disabled': "DESATIVADO",
    'common.saved': ["Configurações salvas com sucesso!","Tudo pronto! As preferências foram gravadas."],
    'common.canceled': ["Operação cancelada.","Ação cancelada com sucesso."],
    'common.yes': "Sim",
    'common.no': "Não",
    'common.days': "dias",
    'common.lifetime': "Vitalício",
    'common.mention_greeting': "*Hermes Bot*\n📌 Prefixo atual: `{prefix}`\n👉 Envie *{prefix}menu* para ver os comandos ou *{prefix}config* para o painel de controle!",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "Este grupo não possui uma licença ativa do bot.",
    'saas.inactive_group_hint': "*Grupo Não Ativado*\nO bot está conectado ao grupo, mas ainda não foi ativado.\n\nPara ativar o bot neste grupo, envie:\n*{prefix}bot on*",
    'saas.license_expired': ["A licença do bot para este grupo chegou ao fim. Para renovar o acesso e manter a moderação ativa, entre em contato com o suporte.","O período de ativação deste grupo expirou. Para continuar utilizando os recursos de segurança e automação, fale com o suporte."],
    'saas.activated': ["Grupo ativado com sucesso!\nValidade: *{expiry}*\nAs configurações anteriores foram restauradas.","Tudo pronto! O bot está ativado neste grupo até *{expiry}* com as configurações restauradas."],
    'saas.days_added': "Foram adicionados *{days} dias* à licença deste grupo.\nNova validade: *{expiry}*.",
    'saas.deactivated': "Atividades pausadas neste grupo. As configurações foram preservadas para quando desejar reativar.",
    'saas.status': "📊 *Status da Licença do Grupo*\n🏷️ Identificador: `{id}`\nEstado: *{status}*\nValidade: *{expiry}*\nMódulos ativos: {modules}",
    'saas.list_header': "📋 *Grupos Registrados no Sistema:*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Restam: *{remaining}*",
    'saas.list_empty': "Nenhum grupo cadastrado no momento.",
    'saas.pv_on': "Respostas a comandos no privado foram ativadas para todos os usuários.",
    'saas.pv_off': "Respostas a comandos no privado foram desativadas (Modo de proteção ativo: apenas o proprietário pode utilizar no privado).",
    'saas.group_presentation': "Olá a todos! Eu sou o Hermes Bot, assistente de administração e segurança deste grupo.\n\n• Digite *{prefix}menu* para conhecer as funções disponíveis.\n• Administradores podem enviar *{prefix}config* para gerenciar as proteções.\n\n*Aos administradores:* lembrem-se de me promover a administrador para que eu possa aplicar a moderação corretamente.",
    'saas.liberate_success_owner': "Grupo liberado com sucesso!\n\n• Grupo: *{name}*\n• Identificador: `{id}`\n• Validade: *{expiry}*\n• Configuração: Padrões recomendados aplicados (IA e Moderação ativas).\n\nA mensagem de apresentação foi enviada ao grupo.",
    'saas.liberate_usage': "Uso correto do comando:\n• `{prefix}liberar <link_do_grupo> [dias]`\n• `{prefix}liberar <id_do_grupo> [dias]`\n\nExemplo:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "Não foi possível entrar no grupo pelo link informado. Motivo: o link é inválido, expirou, o grupo está cheio ou o bot foi bloqueado no grupo.",

    // ─── BAN GROUP ───
    'bangroup.banned': "O grupo `{id}` foi banido do sistema. O bot permanecerá inativo neste grupo.\nPara reverter: `/desbanirgrupo {id}`",
    'bangroup.unbanned': "O grupo `{id}` foi desbanido e o bot voltou a operar normalmente no grupo.",
    'bangroup.already_banned': "Este grupo já consta na lista de grupos banidos.",
    'bangroup.not_banned': "Este grupo não consta na lista de bloqueios.",
    'bangroup.list_title': "🛑 *Grupos Banidos do Sistema:*",
    'bangroup.list_empty': "Nenhum grupo está banido no momento.",

    // ─── RELOAD ───
    'reload.success': "Atualização concluída! Todos os plugins, esquemas e traduções foram recarregados com sucesso em tempo real.",
    'reload.error': "Falha ao recarregar módulos: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "⚙️ *Painel de Controle • Hermes*",
    'config.panel_desc': "Envie o número do módulo para ativar, desativar ou configurar.\nAtalhos: *[P] [novo]* prefixo • *[L]* idioma • *[X]* fechar\nComandos de moderação: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "Prefixo deste grupo alterado com sucesso para: *{prefix}*",
    'config.invalid_option': "Opção inválida. Escolha um número do menu ou [X] para fechar.",
    'config.module_toggled_on': "O módulo *{module}* foi ativado no grupo.",
    'config.module_toggled_off': "O módulo *{module}* foi desativado no grupo.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "🌐 *Seleção de Idioma*\nEscolha o idioma do grupo:\n[1] Português\n[2] Español\n[3] English\n\nResponda com 1, 2 ou 3.",
    'lang.changed': "Idioma do grupo alterado para: *Português*.",
    'lang.invalid': "Idioma inválido. Utilize: !idioma pt, !idioma es ou !idioma en.",
    'lang.invalid_option': "Opção inválida.\nEscolha *1* (Português), *2* (Español), *3* (English) ou envie *X* para cancelar.",

    // ─── ANTILINK ───
    'antilink.detected': ["@{user}, o envio de links não é permitido neste grupo. A mensagem foi apagada para manter a organização.","@{user}, não é permitido compartilhar links aqui. Removi a sua mensagem de acordo com as regras do grupo."],
    'antilink.warned': ["@{user}, o envio de links é proibido por aqui. Você recebeu uma advertência ({warns}/{max}) e a mensagem foi removida.","Atenção, @{user}: links não autorizados geram advertência. Registro atualizado para {warns}/{max}."],
    'antilink.banned': ["@{user} foi removido do grupo por insistência no envio de links não autorizados.","Remoção aplicada para @{user} por descumprimento da política de links do grupo."],
    'antilink.status': "🛡️ *AntiLink:* {status}\n🌐 *Domínios permitidos:* {domains}\n⚡ *Ação:* {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': ["Seja muito bem-vindo ao grupo *{group}*, @{user}!\nConsulte a descrição para conhecer as regras de convivência:\n\n{desc}","Olá, @{user}! Seja bem-vindo ao *{group}*.\nRecomendamos a leitura da descrição do grupo para conferir as nossas diretrizes:\n\n{desc}"],
    'welcome.status': "👋 *Boas-Vindas:* {status}\n⏱️ *Auto-delete:* {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': ["Atenção, @{user}: você recebeu uma advertência por *{reason}*.\nVocê possui {warns} de {max} advertências no grupo.","@{user}, advertência aplicada por *{reason}*.\nTotal acumulado: {warns} de {max} advertências. Por favor, colabore com as regras."],
    'warn.max_reached': ["@{user} atingiu o limite de {max} advertências e foi removido do grupo.","O limite de {max} advertências foi alcançado por @{user}, resultando em sua remoção do grupo."],
    'warn.removed': ["Uma advertência foi removida de @{user}. Total atual: {warns}/{max}.","Advertência revogada para @{user}. Contagem atual: {warns}/{max}."],
    'warn.list_title': "📋 *Membros Advertidos no Grupo:*",
    'warn.list_empty': "Nenhum membro possui advertências ativas neste grupo.",
    'warn.list_item': "• @{user}: *{count}* advertência(s)",
    'warn.cannot_warn_admin': "Administradores do grupo não podem receber advertências.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': ["@{user}, por favor, evite enviar mensagens consecutivas em curto intervalo para não sobrecarregar o grupo.","@{user}, o envio repetido de mensagens em sequência prejudica a conversa. Aguarde alguns instantes."],
    'antiflood.trava_detected': ["@{user}, mensagens excessivamente extensas ou que possam travar o aplicativo não são permitidas.","@{user}, esta mensagem excede o limite seguro de caracteres e foi removida por proteção."],
    'antiflood.banned_flood': ["@{user} foi removido do grupo por excesso repetido de mensagens consecutivas (flood).","Remoção aplicada a @{user} devido a envio excessivo de mensagens."],
    'antiflood.banned_trava': ["@{user} foi removido do grupo por envio de mensagem maliciosa com potencial de travamento.","Remoção de segurança aplicada para @{user} por envio de texto nocivo."],
    'antiflood.status': "*AntiFlood:* {status}\n⚡ *Máx Msgs:* {msgs}/5s | *Máx Caracteres:* {chars}\n⚡ *Ação:* {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "@{user}, números com este código de país (DDI) não são permitidos nas regras deste grupo.",
    'antifake.status': "*AntiFake:* {status}\n🌍 *DDIs permitidos:* {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "🛡️ *Auto-Aprovação:* {status}\nDDIs autorizados: {ddis}\nAção para estrangeiros: {foreignAction}\nNotificação no grupo: {notify}",
    'autoapprove.summary': "📋 *Solicitações de Entrada Pendentes*\n\nTotal aguardando aprovação: {total}\n• Números Nacionais (DDI 55): {brCount}\n• Números Estrangeiros: {foreignCount}\n• Identificadores LIDs: {unknownCount}\n\nProteção Anti-Ban: ATIVA (Fila Segura com Intervalo Humano)\n\nComandos disponíveis:\n• `{prefix}aprovar agora` - Aprovar {brCount} números nacionais via fila segura\n• `{prefix}aprovar todos` - Aprovar a totalidade ({total}) de participantes pendentes\n• `{prefix}aprovar <número>` - Aprovar um participante específico\n• `{prefix}aprovar on` - Ativar a auto-aprovação em tempo real\n• `{prefix}aprovar on todos` - Ativar a auto-aprovação irrestrita\n• `{prefix}aprovar off` - Desativar a auto-aprovação\n• `{prefix}aprovar config` - Configurar DDIs e ações",
    'autoapprove.no_pending': "Não há solicitações pendentes de aprovação neste grupo no momento.",
    'autoapprove.no_pending_br': "Não há solicitações de números brasileiros pendentes no momento ({foreignCount} estrangeiros e {unknownCount} LIDs aguardando análise manual).",
    'autoapprove.batch_starting': "Iniciando a aprovação segura de {count} participante(s) com intervalo humano. Por favor, aguarde a conclusão.",
    'autoapprove.batch_starting_all': "Iniciando a aprovação segura de todos os {count} participantes pendentes. Por favor, aguarde a conclusão.",
    'autoapprove.batch_finished': "Aprovação em lote concluída com sucesso.\nAprovados: *{approved}/{total}* | Falhas: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.batch_finished_all': "Aprovação geral concluída com sucesso.\nAprovados: *{approved}/{total}* | Falhas: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.batch_cancelled': "Aprovação em lote interrompida.\nAprovados: *{approved}/{total}* | Falhas: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.approved_single': "@{user} foi aprovado no grupo com sucesso. Seja bem-vindo!",
    'autoapprove.circuit_breaker_pause': "Proteção Anti-Ban: detectado volume incomum de solicitações (+{count} em menos de 1 minuto). Para proteger a conta, a auto-aprovação foi pausada por {minutes} minutos. As solicitações pendentes permanecem guardadas e podem ser aprovadas via `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "Atenção: a opção 'Aprovar novos participantes' está desativada nas configurações do WhatsApp deste grupo. Para que as solicitações entrem na fila de aprovação, ative-a nas configurações do grupo.",
    'autoapprove.target_approved': "Solicitação aprovada com sucesso!\nParticipante: +{user}\nO participante foi aceito no grupo com proteção anti-ban.",
    'autoapprove.target_failed': "Não foi possível aprovar a solicitação do participante +{user}.\nMotivo: {reason}.\nA solicitação permanece na fila para nova tentativa.",
    'autoapprove.target_ambiguous': "Mais de uma solicitação corresponde a +{user} ({count} encontradas).\nEnvie o número completo com DDI para aprovar com precisão.",
    'autoapprove.target_not_found': "Solicitação não encontrada. O número informado (+{user}) não consta na lista de solicitações pendentes deste grupo.",
    'autoapprove.queue_cancelled': "Fila de aprovação cancelada. {count} solicitação(ões) em andamento foram interrompidas.",
    'autoapprove.all_members': "Qualquer participante (Todos os países)",
    'autoapprove.activated_all': "Auto-Aprovação ativada para qualquer participante. Todos os novos membros serão aceitos automaticamente com fila segura.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': ["O grupo foi fechado automaticamente conforme o horário programado.","Horário de fechamento alcançado: o grupo está pausado para envio de mensagens."],
    'schedule.opened': ["O grupo foi aberto automaticamente conforme o horário programado. Bom diálogo a todos!","Horário de abertura: envio de mensagens liberado para todos os membros."],
    'schedule.status': "⏰ *Horários Automáticos:* {status}\n🔒 Fechar: *{close}* | 🔓 Abrir: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "📢 *AutoMsg:* {status}\n⏱️ *Intervalo:* a cada {interval}\n💬 *Mensagem:* {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "Administradores do grupo não podem ser removidos pelo bot.",
    'ban.cannot_ban_owner': "O proprietário do bot não pode ser removido.",
    'ban.cannot_ban_bot': "Não é possível aplicar a remoção a mim mesmo.",
    'ban.success': ["Pronto, @{user} foi removido do grupo.","A remoção de @{user} foi concluída com sucesso.","O participante @{user} foi removido do grupo."],

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': ["O grupo foi fechado temporariamente pela administração. Apenas administradores podem enviar mensagens no momento.","Envio de mensagens pausado pelos administradores. Em breve o grupo será aberto novamente."],
    'mute.opened': ["O grupo foi reaberto. Todos os membros podem enviar mensagens.","Envio de mensagens liberado para todos os participantes do grupo."],
    'mute.prompt': "Como deseja proceder com o grupo?\n[1] Fechar o grupo agora\n[2] Abrir o grupo agora\n\nResponda com 1 ou 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': ["@{user} foi silenciado por {duration}.{admin}{reason}\nSuas mensagens serão apagadas automaticamente durante esse período.","Silenciamento aplicado a @{user} por {duration}.{admin}{reason}\nO participante não poderá interagir no grupo temporariamente."],
    'mutemember.unmuted': ["O silenciamento de @{user} foi encerrado. O participante pode voltar a enviar mensagens normalmente.","@{user} foi desmutado e está liberado para conversar no grupo."],
    'mutemember.not_muted': "O participante @{user} não se encontra silenciado no momento.",
    'mutemember.list_empty': "Nenhum membro está silenciado neste grupo no momento.",
    'mutemember.list_title': "🔇 *Membros Silenciados no Grupo:*",
    'mutemember.cannot_mute_admin': "Administradores do grupo não podem ser silenciados.",
    'mutemember.cannot_mute_owner': "O proprietário do bot não pode ser silenciado.",
    'mutemember.cannot_mute_bot': "Não posso silenciar a mim mesmo.",
    'mutemember.abuse_banned': "@{user} foi removido do grupo por insistência no envio de mensagens durante o período em que estava silenciado.",
    'mutemember.insistence_banned': "@{user} foi removido do grupo após enviar mais de {count} mensagens enquanto se encontrava silenciado.",

    // ─── LINK DE CONVITE ───
    'link.success': "🔗 *Link de Convite do Grupo:*\n\nhttps://chat.whatsapp.com/{code}\n\nCompartilhe este link com quem deseja convidar para o grupo.",
    'link.revoked': "O link de convite anterior foi cancelado com sucesso.\n\n🔗 *Novo link:* https://chat.whatsapp.com/{code}",
    'link.error': "Não foi possível obter o link de convite. Certifique-se de que o bot possui permissão de administrador no grupo.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "A descrição do grupo foi atualizada com sucesso!",
    'setdesc.cleared': "A descrição do grupo foi removida com sucesso.",
    'setdesc.current': "📌 *Descrição Atual do Grupo:*\n\n{description}\n\nPara alterar: envie `{prefix}setdesc <novo texto>` ou responda a uma mensagem com `{prefix}setdesc`.",
    'setdesc.empty': "(O grupo não possui uma descrição definida no momento)",
    'setdesc.error': "Não foi possível atualizar a descrição do grupo. Verifique se o bot possui privilégios de administrador.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "A foto de perfil do grupo foi atualizada com sucesso!",
    'setpic.cleared': "A foto do grupo foi removida com sucesso.",
    'setpic.no_image': "Por favor, envie uma imagem com `{prefix}foto` na legenda ou responda a uma imagem existente.",
    'setpic.error': "Não foi possível atualizar a foto do grupo. Verifique se o bot é administrador.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "A mensagem foi fixada com sucesso por {duration}.",
    'pin.unpinned': "A mensagem foi desafixada com sucesso.",
    'pin.reply_required': "Por favor, responda à mensagem que deseja fixar ou desafixar acompanhada do comando.",
    'pin.error': "Não foi possível fixar ou desafixar a mensagem. Verifique os privilégios do bot no grupo.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "Enquete criada com sucesso!\n\n📝 *Pergunta:* {title}\n🔢 *Tipo:* {type}\n📋 *Opções:* {count} alternativas",
    'poll.type_single': "Escolha única (1 voto)",
    'poll.type_multi': "Múltipla escolha (vários votos)",
    'poll.usage': "📊 *Como Criar Enquetes:*\n\n1️⃣ *Em Linha (com barra |):*\n`{prefix}enquete Pergunta | Opção 1 | Opção 2 | Opção 3`\n\n2️⃣ *Múltipla Escolha (--multi):*\n`{prefix}enquete --multi Pergunta | Opção 1 | Opção 2`\n\n3️⃣ *Em Várias Linhas:*\n`{prefix}enquete Pergunta\n1. Opção A\n2. Opção B`",
    'poll.error_options': "A enquete precisa de um título e de pelo menos 2 alternativas válidas para votação.",
    'poll.error': "Não foi possível gerar a enquete. Verifique os parâmetros informados.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "Por favor, informe a mensagem do comunicado ou responda a uma mensagem existente.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "Este membro já possui privilégios de administrador no grupo.",
    'promote.need_explicit_mention': "Por motivos de segurança, mencione expressamente o membro com @ para promovê-lo a administrador.",
    'promote.success': "@{user} agora é um administrador do grupo.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "Este usuário não é um administrador do grupo.",
    'demote.cannot_demote_owner': "O proprietário do bot não pode ser rebaixado de cargo.",
    'demote.success': "@{user} foi rebaixado a membro comum.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "Por favor, responda à mensagem que deseja apagar acompanhada do comando.",
    'clear.success': "Mensagem apagada com sucesso.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "@{user} foi adicionado à Lista Negra do grupo e removido.",
    'blacklist.added_global': "@{user} foi adicionado à Lista Negra global do sistema.",
    'blacklist.removed': "@{user} foi removido da Lista Negra do grupo.",
    'blacklist.removed_global': "@{user} foi removido da Lista Negra global.",
    'blacklist.list_title': "📋 *Lista Negra do Grupo:*",
    'blacklist.list_empty': "A lista negra deste grupo está vazia no momento.",
    'blacklist.banned_entry': "Entrada bloqueada: @{user} consta na Lista Negra e foi removido automaticamente.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "Não há participantes suficientes no grupo para realizar o sorteio.",
    'raffle.title': "🎉 *Resultado do Sorteio*",
    'raffle.prize': "🎁 *Prêmio:* {prize}",
    'raffle.winners': "🏆 *Ganhador(es):*\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "🏓 *Status Operacional do Sistema*",
    'ping.latency': "⚡ *Latência:* `{latency}ms`",
    'ping.uptime': "⏱️ *Tempo Ativo:* `{uptime}`",
    'ping.ram': "💾 *Consumo de RAM:* `{ram} MB`",
    'ping.lang': "🌐 *Idioma:* `{lang}`",
    'ping.antiban': "🛡️ *Proteção Anti-Ban:* `Ativa (Presença Furtiva + Jitter + Delay Humano)`",
    'ping.license': "📅 *Licença do Grupo:* `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "🧙‍♂️ *Configuração: {plugin}* (Etapa {step}/{total})",
    'wizard.current_val': "📌 Valor atual: `{current}`",
    'wizard.invalid_input': "Resposta inválida. Por favor, leia a pergunta e tente novamente.",
    'wizard.finished': "Configuração de *{plugin}* concluída com sucesso!",
    'wizard.choice_prompt': "Escolha uma das opções abaixo enviando o número correspondente:\n{choices}",
    'wizard.boolean_prompt': "*[1]* Sim (Ativado)\n*[2]* Não (Desativado)\n\nResponda com *1* ou *2*",
    'wizard.select_field_title': "🧙‍♂️ *Configuração: {plugin}*\n\nEscolha qual etapa você deseja alterar:\n\n",
    'wizard.select_field_footer': "*[T]* Reconfigurar Todas as Etapas\n*[X]* Cancelar e Fechar\n\nResponda com o número da etapa que deseja alterar.",
    'wizard.select_field_invalid': "Opção inválida. Escolha o número da etapa (1 a {max}), *T* para todas ou *X* para cancelar.",
    'wizard.summary_single': "📋 *Configuração atualizada com sucesso:*",
    'wizard.summary_all': "📋 *Resumo das configurações salvas:*",
    'wizard.tip_keep': "Dica: Envie *.* (ponto) para manter o valor atual.",
    'wizard.tip_default': "📌 Valor padrão: `{default}`\nDica: Envie *.* (ponto) para utilizar o valor padrão.",
    'wizard.cancel_hint': "Envie *X* a qualquer momento para cancelar.",
    'wizard.out_of_range': "Valor fora do intervalo permitido{range}. Tente novamente.",
    'wizard.session_expired': "Sessão expirada. O menu de configuração ficou inativo por muito tempo e foi encerrado por segurança.",
    'wizard.focus_switch_prompt': "Você possui uma configuração ativa em andamento (*{module}*).\n\nDeseja cancelar ou continuar?\n• Digite *X* para cancelar e fechar\n• Digite *1* para continuar configurando",
    'wizard.hermes_focus_detected': "@{user}, notei que você me chamou, mas você ainda está com o menu de *{module}* aberto.\n\nDeseja cancelar a configuração ou continuar de onde parou?\n• Digite *X* para encerrar o menu\n• Digite *1* para continuar configurando",
    'wizard.cancelled': "Configuração cancelada com sucesso. Menu fechado.",
    'wizard.continued': "Continuando a configuração...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "📅 *Evento Agendado com Sucesso!*\n\nData/Hora: {date} às {time}\nCompromisso: {text}\nIdentificador: #{id}",
    'calendar.list_title': "📅 *Calendário de Agendamentos do Grupo*",
    'calendar.list_empty': "Nenhum agendamento ou evento marcado no calendário.\nPara agendar, envie: `{prefix}agenda add DD/MM HH:MM Mensagem do evento`",
    'calendar.item': "• [#{id}] {date} às {time} — {text}",
    'calendar.deleted': "Agendamento #{id} removido do calendário com sucesso.",
    'calendar.not_found': "Agendamento com ID #{id} não foi encontrado no calendário.",
    'calendar.cleared': "Todos os agendamentos do calendário foram removidos.",
    'calendar.invalid_format': "Formato inválido. Utilize: `{prefix}agenda add DD/MM HH:MM Sua mensagem aqui`\nExemplo: `{prefix}agenda add 28/10 20:00 Reunião geral`",
    'calendar.event_announcement': "📢 *[Lembrete de Agenda / Evento]*\n\n⏰ Horário: {time}\nCompromisso: {text}{creator}",
    'calendar.creator_tag': "\nSolicitado por: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "🤖 *Status do Hermes IA*\n\nEstado no grupo: *{state}*\nPersonalidade: `{personality}`\nMemória em cache: {count} mensagens registradas\nProvedor: DeepSeek Oficial (`{model}`)\nChave de API: {key}",
    'hermes.status_off_hint': "DESATIVADO (utilize {prefix}hermes on)",
    'hermes.key_ok': "Configurada (.env)",
    'hermes.key_missing_short': "Não configurada (.env)",
    'hermes.status_nokey': "Atenção: configure `AI_API_KEY` no arquivo `.env` para ativar as respostas inteligentes.",
    'hermes.status_tip': "Dica: envie *{prefix}hermes on* para ativar ou fale diretamente comigo no chat!",
    'hermes.on_ok': "Hermes IA ativado com sucesso!\nPersonalidade: {personality}\nMemória de contexto: {memory}",
    'hermes.off_ok': "Hermes IA desativado com sucesso.",
    'hermes.cleared': "Memória do Hermes limpa com sucesso. O histórico de conversas deste grupo foi redefinido.",
    'hermes.disabled_hint': "O Hermes IA está desativado neste grupo.\nPara ativar, um administrador deve enviar: *{prefix}hermes on*",
    'hermes.disabled_called': "O Hermes IA encontra-se desativado neste grupo.\nPara ativá-lo, um administrador deve enviar: *{prefix}hermes on*",
    'hermes.usage_hint': "Para falar comigo, mencione *@hermes*, digite *hermes [pergunta]* ou use *{prefix}hermes status*.",
    'hermes.key_missing': "A chave da DeepSeek não foi detectada no arquivo `.env` (`AI_API_KEY`). Por favor, adicione sua chave e reinicie a aplicação.",
    'hermes.greeting_formal': "Olá! Como posso ajudar você ou o grupo agora?",
    'hermes.greeting_casual': "Olá! Como posso ajudar na administração do grupo hoje?",
    'hermes.quota': "O limite de requisições de IA para este período foi atingido. Por favor, utilize os comandos por prefixo temporariamente.",
    'hermes.degraded': "Modo texto ativo: não é possível executar ações automáticas no momento.",
    'hermes.unclear': "Não consegui compreender claramente a solicitação. Por favor, poderia reformular?",
    'hermes.tool_failed': "Não foi possível executar esta ação no momento.",
    'hermes.msg_not_found': "Não localizei essa mensagem no histórico recente do grupo.",
    'hermes.oscillation': "Ocorreu uma oscilação momentânea na conexão com a IA. Por favor, tente novamente em alguns instantes.",
    'hermes.need_explicit_target': "Para executar ações em um participante, marque a pessoa com @ ou responda à mensagem dela.",
    'hermes.fact_learned': "Registrado na memória permanente do grupo: *{key}* = *{value}*",
    'hermes.fact_forgotten': "Registro *{key}* removido da memória do grupo com sucesso.",
    'hermes.fact_not_found': "O registro *{key}* não foi encontrado na memória do grupo.",
    'hermes.action_hallucinated': "A ação não pôde ser confirmada no grupo. Por favor, marque o membro com @ ou utilize o comando com prefixo (exemplo: {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "Grupo ativado com sucesso!\nValidade: *{expiry}*\n\nIniciaremos uma configuração inicial de 3 etapas para ajustar o bot a este grupo.",
    'onboarding.step1_header': "Configuração Inicial (Etapa 1/3)",
    'onboarding.step1_question': "Deseja ativar a IA neste grupo?\n\n*[1]* Sim - Ativar IA para conversar e executar comandos por texto, como assistente.\n*[2]* Não - Apenas moderação tradicional utilizando comandos diretos, como: /menu\n\nResponda com 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.step2_header': "Configuração Inicial (Etapa 2/3)",
    'onboarding.step2_question': "Deseja que a IA leia e se lembre do contexto das conversas do grupo?\n\n*[1]* Sim - Respostas mais precisas e comandos contextuais conforme o andamento do grupo.\n*[2]* Não - Nenhum dado de contexto é mantido pela IA.\n\nResponda com 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.step3_header': "Configuração Inicial (Etapa 3/3)",
    'onboarding.step3_question': "Qual estilo de mensagens e avisos você prefere para o bot?\n\n*[1]* Natural - Estilo amigável e comunicativo, com frases bem estruturadas.\n*[2]* Formal - Estilo corporativo com etiquetas *[Moderação]* e avisos sóbrios.\n\nResponda com 1 ou 2 (ou envie . para padrão [1])",
    'onboarding.finished': "Configuração concluída com sucesso!\nO bot está pronto para operar no grupo.\n\n• Inteligência Artificial: *{ai}*\n• Memória de Contexto: *{memory}*\n• Estilo de Mensagens: *{style}*\n\nEnvie *{prefix}menu* para consultar os comandos ou *{prefix}config* para o painel completo!"
  },

  es: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': ["¡Listo! Operación realizada con éxito.","Todo en orden, comando ejecutado.","¡Hecho! Acción completada con éxito."],
    'common.error': ["No fue posible completar esta acción en este momento. Por favor, intenta de nuevo.","Ocurrió una falla temporal al ejecutar el comando. Intenta de nuevo en unos instantes."],
    'common.no_permission_admin': ["Este comando puede ser utilizado únicamente por administradores del grupo.","Solo los administradores del grupo tienen permiso para usar este comando."],
    'common.no_permission_owner': ["Este comando está reservado para el desarrollador y propietario del bot.","Únicamente el propietario del bot puede utilizar este comando."],
    'common.bot_not_admin': ["Para realizar esta acción, necesitas promoverme a administrador del grupo.","Requiero permisos de administrador en el grupo para poder ejecutar este comando."],
    'common.group_only': ["Este comando funciona exclusivamente dentro de grupos.","Esta función solo puede ser utilizada en grupos."],
    'common.private_disabled': ["La atención a comandos por mensaje privado está deshabilitada en este momento.","Por ahora, los comandos en privado no se encuentran disponibles."],
    'common.not_found_target': ["No fue posible identificar al usuario. Por favor, menciona con @ o responde al mensaje de la persona.","Usuario no localizado. Menciona a la persona con @ o responde a su mensaje correspondiente."],
    'common.invalid_args': ["Los parámetros indicados son incorrectos. Por favor, revisa el formato del comando.","Falta información para ejecutar el comando. Verifica la sintaxis recomendada."],
    'common.enabled': "ACTIVADO",
    'common.disabled': "DESACTIVADO",
    'common.saved': ["¡Configuración guardada con éxito!","¡Todo listo! Los ajustes han sido registrados."],
    'common.canceled': ["Operación cancelada.","Acción cancelada con éxito."],
    'common.yes': "Sí",
    'common.no': "No",
    'common.days': "días",
    'common.lifetime': "Vitalicio",
    'common.mention_greeting': "🤖 *Hermes Bot*\n📌 Prefijo actual: `{prefix}`\n👉 Envía *{prefix}menu* para ver comandos o *{prefix}config* para el panel de control!",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "Este grupo no cuenta con una licencia activa del bot.",
    'saas.inactive_group_hint': "*Grupo No Activado*\nEl bot está en el grupo, pero aún no ha sido activado.\n\nPara activar el bot en este grupo, escribe:\n*{prefix}bot on*",
    'saas.license_expired': ["La licencia del bot para este grupo ha concluido. Para renovar el acceso y mantener la moderación activa, contacta a soporte.","El período de activación de este grupo ha expirado. Para continuar utilizando las herramientas de seguridad, comunícate con soporte."],
    'saas.activated': ["¡Grupo activado con éxito!\nValidez: *{expiry}*\nLas configuraciones anteriores han sido restauradas.","¡Todo listo! El bot se encuentra activo en este grupo hasta el *{expiry}* con sus ajustes restaurados."],
    'saas.days_added': "Se han añadido *{days} días* a la licencia de este grupo.\nNueva validez: *{expiry}*.",
    'saas.deactivated': "Actividades pausadas en este grupo. Las configuraciones se mantendrán guardadas para cuando desees reactivar.",
    'saas.status': "📊 *Estado de la Licencia del Grupo*\n🏷️ Identificador: `{id}`\nEstado: *{status}*\nValidez: *{expiry}*\nMódulos activos: {modules}",
    'saas.list_header': "📋 *Grupos Registrados en el Sistema:*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Restan: *{remaining}*",
    'saas.list_empty': "Ningún grupo registrado por el momento.",
    'saas.pv_on': "Las respuestas a comandos en privado han sido habilitadas para todos los usuarios.",
    'saas.pv_off': "Las respuestas a comandos en privado han sido deshabilitadas (Modo de protección activo: solo el propietario puede usar en privado).",
    'saas.group_presentation': "¡Hola a todos! Soy Hermes Bot, asistente de administración y seguridad de este grupo.\n\n• Escribe *{prefix}menu* para conocer todas las funciones.\n• Administradores pueden enviar *{prefix}config* para gestionar las protecciones.\n\n*A los administradores:* recuerden promoverme a administrador para que pueda aplicar las funciones de moderación correctamente.",
    'saas.liberate_success_owner': "¡Grupo liberado con éxito!\n\n• Grupo: *{name}*\n• Identificador: `{id}`\n• Validez: *{expiry}*\n• Configuración: Ajustes recomendados aplicados (IA y Moderación activas).\n\nEl mensaje de presentación ha sido enviado al grupo.",
    'saas.liberate_usage': "Uso correcto del comando:\n• `{prefix}liberar <enlace_del_grupo> [días]`\n• `{prefix}liberar <id_del_grupo> [días]`\n\nEjemplo:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "No fue posible ingresar al grupo mediante el enlace. Motivo: el enlace es inválido, ha expirado, el grupo está lleno o el bot fue bloqueado en el grupo.",

    // ─── BAN GROUP ───
    'bangroup.banned': "El grupo `{id}` ha sido bloqueado en el sistema. El bot permanecerá inactivo aquí.\nPara revertir: `/desbanirgrupo {id}`",
    'bangroup.unbanned': "El grupo `{id}` ha sido desbloqueado y el bot vuelve a estar activo normalmente.",
    'bangroup.already_banned': "Este grupo ya se encuentra en la lista de grupos bloqueados.",
    'bangroup.not_banned': "Este grupo no se encuentra en la lista de bloqueados.",
    'bangroup.list_title': "🛑 *Grupos Bloqueados del Sistema:*",
    'bangroup.list_empty': "Ningún grupo está bloqueado en este momento.",

    // ─── RELOAD ───
    'reload.success': "¡Actualización completada! Todos los plugins, esquemas y traducciones se recargaron con éxito en tiempo real.",
    'reload.error': "Falla al recargar módulos: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "⚙️ *Panel de Control • Hermes*",
    'config.panel_desc': "Envía el número del módulo para activar, desactivar o configurar.\nAtajos: *[P] [nuevo]* prefijo • *[L]* idioma • *[X]* cerrar\nComandos de moderación: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "Prefijo de este grupo cambiado con éxito a: *{prefix}*",
    'config.invalid_option': "Opción inválida. Elige un número del menú o [X] para cerrar.",
    'config.module_toggled_on': "El módulo *{module}* fue activado en el grupo.",
    'config.module_toggled_off': "El módulo *{module}* fue desactivado en el grupo.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "🌐 *Selección de Idioma*\nElige el idioma del grupo:\n[1] Português\n[2] Español\n[3] English\n\nResponde con 1, 2 o 3.",
    'lang.changed': "Idioma del grupo cambiado a: *Español*.",
    'lang.invalid': "Idioma inválido. Usa: !idioma pt, !idioma es o !idioma en.",
    'lang.invalid_option': "Opción inválida.\nElige *1* (Português), *2* (Español), *3* (English) o envía *X* para cancelar.",

    // ─── ANTILINK ───
    'antilink.detected': ["@{user}, el envío de enlaces no está permitido en este grupo. El mensaje fue eliminado para mantener el orden.","@{user}, no está permitido compartir enlaces aquí. Removí tu mensaje según las reglas del grupo."],
    'antilink.warned': ["@{user}, los enlaces no están autorizados aquí. Has recibido una advertencia ({warns}/{max}) y el mensaje fue eliminado.","Atención, @{user}: enviar enlaces no permitidos genera advertencia. Registro actualizado a {warns}/{max}."],
    'antilink.banned': ["@{user} fue expulsado del grupo por insistir en el envío de enlaces no autorizados.","Expulsión aplicada a @{user} por incumplir la política de enlaces del grupo."],
    'antilink.status': "🛡️ *AntiLink:* {status}\n🌐 *Dominios permitidos:* {domains}\n⚡ *Acción:* {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': ["¡Te damos la bienvenida al grupo *{group}*, @{user}!\nPor favor, consulta la descripción para conocer las normas de convivencia:\n\n{desc}","¡Hola, @{user}! Bienvenido(a) a *{group}*.\nTe recomendamos revisar la descripción del grupo para conocer nuestras directrices:\n\n{desc}"],
    'welcome.status': "👋 *Bienvenida:* {status}\n⏱️ *Auto-borrado:* {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': ["Atención, @{user}: has recibido una advertencia por *{reason}*.\nTienes {warns} de {max} advertencias en el grupo.","@{user}, advertencia aplicada por *{reason}*.\nTotal acumulado: {warns} de {max} advertencias. Por favor, colabora con las normas."],
    'warn.max_reached': ["@{user} alcanzó el límite de {max} advertencias y fue expulsado del grupo.","El límite de {max} advertencias fue alcanzado por @{user}, resultando en su expulsión del grupo."],
    'warn.removed': ["Se ha retirado una advertencia de @{user}. Total actual: {warns}/{max}.","Advertencia revocada para @{user}. Conteo actual: {warns}/{max}."],
    'warn.list_title': "📋 *Miembros Advertidos en el Grupo:*",
    'warn.list_empty': "Ningún miembro tiene advertencias activas en este grupo.",
    'warn.list_item': "• @{user}: *{count}* advertencia(s)",
    'warn.cannot_warn_admin': "Los administradores del grupo no pueden recibir advertencias.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': ["@{user}, por favor, evita enviar mensajes seguidos a gran velocidad para no saturar el grupo.","@{user}, el envío reiterado de mensajes continuos interrumpe la conversación. Espera unos momentos."],
    'antiflood.trava_detected': ["@{user}, los mensajes excesivamente largos o que puedan trabar la aplicación no están permitidos.","@{user}, este mensaje excede el límite seguro de caracteres y ha sido eliminado por protección."],
    'antiflood.banned_flood': ["@{user} fue expulsado del grupo por envío reiterado de mensajes consecutivos (flood).","Expulsión aplicada a @{user} debido a envío excesivo de mensajes continuos."],
    'antiflood.banned_trava': ["@{user} fue expulsado del grupo por enviar un mensaje potencialmente dañino (crash).","Expulsión de seguridad aplicada a @{user} por envío de texto perjudicial."],
    'antiflood.status': "🌊 *AntiFlood:* {status}\n⚡ *Máx Msgs:* {msgs}/5s | *Máx Caracteres:* {chars}\n⚡ *Acción:* {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "@{user}, los números con este prefijo de país no están permitidos según las normas del grupo.",
    'antifake.status': "🎭 *AntiFake:* {status}\n🌍 *Prefijos permitidos:* {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "🛡️ *Auto-Aprobación:* {status}\nPrefijos permitidos: {ddis}\nAcción para extranjeros: {foreignAction}\nNotificación en el grupo: {notify}",
    'autoapprove.summary': "📋 *Solicitudes de Entrada Pendientes*\n\nTotal esperando aprobación: {total}\n• Números Nacionales (DDI 55): {brCount}\n• Números Extranjeros: {foreignCount}\n• Identificadores LIDs: {unknownCount}\n\nProtección Anti-Ban: ACTIVA (Cola Segura con Intervalo Humano)\n\nComandos disponibles:\n• `{prefix}aprovar agora` - Aprobar {brCount} números nacionales vía cola segura\n• `{prefix}aprovar todos` - Aprobar la totalidad ({total}) de participantes pendientes\n• `{prefix}aprovar <número>` - Aprobar participante específico\n• `{prefix}aprovar on` - Habilitar auto-aprobación en tiempo real\n• `{prefix}aprovar on todos` - Habilitar auto-aprobación irrestricta\n• `{prefix}aprovar off` - Deshabilitar auto-aprobación\n• `{prefix}aprovar config` - Configurar prefijos y acciones",
    'autoapprove.no_pending': "No hay solicitudes pendientes de aprobación en este grupo en este momento.",
    'autoapprove.no_pending_br': "No hay solicitudes de números brasileños pendientes en este momento ({foreignCount} extranjeros y {unknownCount} LIDs en espera de revisión manual).",
    'autoapprove.batch_starting': "Iniciando la aprobación segura de {count} participante(s) con intervalo humano. Por favor, espera la conclusión.",
    'autoapprove.batch_starting_all': "Iniciando la aprobación segura de todos los {count} participantes pendientes. Por favor, espera la conclusión.",
    'autoapprove.batch_finished': "Aprobación completada con éxito.\nAprobados: *{approved}/{total}* | Fallos: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.batch_finished_all': "Aprobación general completada con éxito.\nAprobados: *{approved}/{total}* | Fallos: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.batch_cancelled': "Aprobación en lote interrumpida.\nAprobados: *{approved}/{total}* | Fallos: *{failed}* | Cancelados: *{cancelled}*.",
    'autoapprove.approved_single': "@{user} fue aprobado en el grupo con éxito. ¡Te damos la bienvenida!",
    'autoapprove.circuit_breaker_pause': "Protección Anti-Ban: se detectó un volumen inusual de solicitudes (+{count} en menos de 1 minuto). Para proteger la cuenta, la auto-aprobación fue pausada por {minutes} minutos. Las solicitudes pendientes permanecen guardadas y pueden aprobarse vía `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "Atención: la opción 'Aprobar nuevos participantes' está desactivada en la configuración de WhatsApp de este grupo. Para que las solicitudes entren en la cola, actívala en los ajustes del grupo.",
    'autoapprove.target_approved': "¡Solicitud aprobada con éxito!\nParticipante: +{user}\nEl participante fue aceptado en el grupo con protección anti-ban.",
    'autoapprove.target_failed': "No fue posible aprobar la solicitud del participante +{user}.\nMotivo: {reason}.\nLa solicitud permanece en la cola para un nuevo intento.",
    'autoapprove.target_ambiguous': "Más de una solicitud coincide con +{user} ({count} encontradas).\nEnvía el número completo con prefijo para aprobar con precisión.",
    'autoapprove.target_not_found': "Solicitud no encontrada. El número indicado (+{user}) no figura en la lista de solicitudes pendientes de este grupo.",
    'autoapprove.queue_cancelled': "Cola de aprobación cancelada. {count} solicitud(es) en curso fueron interrumpidas.",
    'autoapprove.all_members': "Cualquier participante (Todos los países)",
    'autoapprove.activated_all': "Auto-Aprobación activada para cualquier participante. Todos los nuevos miembros serán aceptados automáticamente con cola segura.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': ["El grupo fue cerrado automáticamente según el horario programado.","Horario de cierre alcanzado: el grupo ha sido pausado para envío de mensajes."],
    'schedule.opened': ["El grupo fue abierto automáticamente según el horario programado. ¡Buen diálogo a todos!","Horario de apertura: envío de mensajes habilitado para todos los miembros."],
    'schedule.status': "⏰ *Horarios Automáticos:* {status}\n🔒 Cerrar: *{close}* | 🔓 Abrir: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "📢 *AutoMsg:* {status}\n⏱️ *Intervalo:* cada {interval}\n💬 *Mensaje:* {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "Los administradores del grupo no pueden ser expulsados por el bot.",
    'ban.cannot_ban_owner': "El propietario del bot no puede ser expulsado.",
    'ban.cannot_ban_bot': "No es posible aplicar la expulsión a mí mismo.",
    'ban.success': ["Listo, @{user} fue expulsado del grupo.","La expulsión de @{user} fue completada con éxito.","El participante @{user} fue removido del grupo."],

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': ["El grupo fue cerrado temporalmente por la administración. Solo los administradores pueden enviar mensajes en este momento.","Envío de mensajes pausado por los administradores. En breve el grupo será abierto nuevamente."],
    'mute.opened': ["El grupo ha sido reabierto. Todos los miembros pueden enviar mensajes.","Envío de mensajes habilitado para todos los participantes del grupo."],
    'mute.prompt': "¿Cómo deseas proceder con el grupo?\n[1] Cerrar el grupo ahora\n[2] Abrir el grupo ahora\n\nResponde con 1 o 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': ["@{user} fue silenciado por {duration}.{admin}{reason}\nSus mensajes se eliminarán automáticamente durante este período.","Silenciamiento aplicado a @{user} por {duration}.{admin}{reason}\nEl participante no podrá interactuar en el grupo temporalmente."],
    'mutemember.unmuted': ["El silenciamiento de @{user} ha finalizado. El participante puede volver a enviar mensajes normalmente.","@{user} fue desilenciado y puede volver a conversar en el grupo."],
    'mutemember.not_muted': "El participante @{user} no se encuentra silenciado en este momento.",
    'mutemember.list_empty': "Ningún miembro se encuentra silenciado en este grupo actualmente.",
    'mutemember.list_title': "🔇 *Miembros Silenciados en el Grupo:*",
    'mutemember.cannot_mute_admin': "Los administradores del grupo no pueden ser silenciados.",
    'mutemember.cannot_mute_owner': "El propietario del bot no puede ser silenciado.",
    'mutemember.cannot_mute_bot': "No puedo silenciarme a mí mismo.",
    'mutemember.abuse_banned': "@{user} fue expulsado del grupo por insistir en el envío de mensajes mientras estaba silenciado.",
    'mutemember.insistence_banned': "@{user} fue expulsado del grupo tras enviar más de {count} mensajes mientras se encontraba silenciado.",

    // ─── LINK DE CONVITE ───
    'link.success': "🔗 *Enlace de Invitación del Grupo:*\n\nhttps://chat.whatsapp.com/{code}\n\nComparte este enlace con las personas que desees invitar al grupo.",
    'link.revoked': "El enlace de invitación anterior fue revocado con éxito.\n\n🔗 *Nuevo enlace:* https://chat.whatsapp.com/{code}",
    'link.error': "No se pudo obtener el enlace de invitación. Asegúrate de que el bot tenga permisos de administrador en el grupo.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "¡La descripción del grupo fue actualizada con éxito!",
    'setdesc.cleared': "La descripción del grupo fue eliminada con éxito.",
    'setdesc.current': "📌 *Descripción Actual del Grupo:*\n\n{description}\n\nPara modificarla: envía `{prefix}setdesc <nuevo texto>` o responde a un mensaje con `{prefix}setdesc`.",
    'setdesc.empty': "(El grupo no posee una descripción definida en este momento)",
    'setdesc.error': "No se pudo actualizar la descripción del grupo. Verifica si el bot posee permisos de administrador.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "¡La foto de perfil del grupo fue actualizada con éxito!",
    'setpic.cleared': "La foto del grupo fue eliminada con éxito.",
    'setpic.no_image': "Por favor, envía una imagen con `{prefix}foto` en la leyenda o responde a una imagen existente.",
    'setpic.error': "No fue posible actualizar la foto del grupo. Verifica si el bot es administrador.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "El mensaje fue fijado con éxito por {duration}.",
    'pin.unpinned': "El mensaje fue desfijado con éxito.",
    'pin.reply_required': "Por favor, responde al mensaje que deseas fijar o desfijar acompañado del comando.",
    'pin.error': "No fue posible fijar o desfijar el mensaje. Verifica los permisos del bot en el grupo.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "¡Encuesta creada con éxito!\n\n📝 *Pregunta:* {title}\n🔢 *Tipo:* {type}\n📋 *Opciones:* {count} alternativas",
    'poll.type_single': "Opción única (1 voto)",
    'poll.type_multi': "Múltiples opciones (varios votos)",
    'poll.usage': "📊 *Cómo Crear Encuestas:*\n\n1️⃣ *En Línea (con barra |):*\n`{prefix}poll Pregunta | Opción 1 | Opción 2 | Opción 3`\n\n2️⃣ *Múltiples Opciones (--multi):*\n`{prefix}poll --multi Pregunta | Opción 1 | Opción 2`\n\n3️⃣ *En Varias Líneas:*\n`{prefix}poll Pregunta\n1. Opción A\n2. Opción B`",
    'poll.error_options': "La encuesta requiere una pregunta y al menos 2 opciones válidas de votación.",
    'poll.error': "No fue posible generar la encuesta. Verifica los parámetros indicados.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "Por favor, escribe el mensaje del comunicado o responde a un mensaje existente.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "Este miembro ya posee privilegios de administrador en el grupo.",
    'promote.need_explicit_mention': "Por razones de seguridad, menciona expresamente al miembro con @ para promoverlo a administrador.",
    'promote.success': "@{user} ahora es un administrador del grupo.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "Este usuario no es un administrador del grupo.",
    'demote.cannot_demote_owner': "El propietario supremo del bot no puede ser degradado.",
    'demote.success': "@{user} fue degradado a miembro común.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "Por favor, responde al mensaje que deseas eliminar acompañado del comando.",
    'clear.success': "Mensaje eliminado con éxito.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "@{user} fue añadido a la Lista Negra del grupo y expulsado.",
    'blacklist.added_global': "@{user} fue añadido a la Lista Negra global del sistema.",
    'blacklist.removed': "@{user} fue eliminado de la Lista Negra del grupo.",
    'blacklist.removed_global': "@{user} fue eliminado de la Lista Negra global.",
    'blacklist.list_title': "📋 *Lista Negra del Grupo:*",
    'blacklist.list_empty': "La lista negra de este grupo está vacía en este momento.",
    'blacklist.banned_entry': "Entrada bloqueada: @{user} figura en la Lista Negra y fue expulsado automáticamente.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "No hay participantes suficientes en el grupo para realizar el sorteo.",
    'raffle.title': "🎉 *Resultado del Sorteo*",
    'raffle.prize': "🎁 *Premio:* {prize}",
    'raffle.winners': "🏆 *Ganador(es):*\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "🏓 *Estado Operativo del Sistema*",
    'ping.latency': "⚡ *Latencia:* `{latency}ms`",
    'ping.uptime': "⏱️ *Tiempo Activo:* `{uptime}`",
    'ping.ram': "💾 *Consumo de RAM:* `{ram} MB`",
    'ping.lang': "🌐 *Idioma:* `{lang}`",
    'ping.antiban': "🛡️ *Protección Anti-Ban:* `Activa (Presencia Sigilosa + Jitter + Delay Humano)`",
    'ping.license': "📅 *Licencia del Grupo:* `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "🧙‍♂️ *Configuración: {plugin}* (Paso {step}/{total})",
    'wizard.current_val': "📌 Valor actual: `{current}`",
    'wizard.invalid_input': "Respuesta inválida. Por favor, lee la pregunta e inténtalo de nuevo.",
    'wizard.finished': "¡Configuración de *{plugin}* completada con éxito!",
    'wizard.choice_prompt': "Elige una de las siguientes opciones enviando el número correspondiente:\n{choices}",
    'wizard.boolean_prompt': "*[1]* Sí (Activado)\n*[2]* No (Desactivado)\n\nResponde con *1* o *2*",
    'wizard.select_field_title': "🧙‍♂️ *Configuración: {plugin}*\n\nElige qué paso deseas modificar:\n\n",
    'wizard.select_field_footer': "*[T]* Reconfigurar Todos los Pasos\n*[X]* Cancelar y Cerrar\n\nResponde con el número del paso que deseas modificar.",
    'wizard.select_field_invalid': "Opción inválida. Elige el número del paso (1 a {max}), *T* para todos o *X* para cancelar.",
    'wizard.summary_single': "📋 *Configuración actualizada con éxito:*",
    'wizard.summary_all': "📋 *Resumen de configuraciones guardadas:*",
    'wizard.tip_keep': "Consejo: Envía *.* (punto) para mantener el valor actual.",
    'wizard.tip_default': "📌 Valor predeterminado: `{default}`\nConsejo: Envía *.* (punto) para utilizar el valor predeterminado.",
    'wizard.cancel_hint': "Envía *X* en cualquier momento para cancelar.",
    'wizard.out_of_range': "Valor fuera del rango permitido{range}. Inténtalo de nuevo.",
    'wizard.session_expired': "Sesión expirada. El menú de configuración estuvo inactivo demasiado tiempo y se cerró por seguridad.",
    'wizard.focus_switch_prompt': "Tienes una configuración activa en curso (*{module}*).\n\n¿Deseas cancelar o continuar?\n• Escribe *X* para cancelar y cerrar\n• Escribe *1* para continuar configurando",
    'wizard.hermes_focus_detected': "@{user}, noté que me llamaste, pero todavía tienes el menú de *{module}* abierto.\n\n¿Deseas cancelar la configuración o continuar donde te quedaste?\n• Escribe *X* para cerrar el menú\n• Escribe *1* para continuar configurando",
    'wizard.cancelled': "Configuración cancelada con éxito. Menú cerrado.",
    'wizard.continued': "Continuando la configuración...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "📅 *¡Evento Agendado con Éxito!*\n\nFecha/Hora: {date} a las {time}\nCompromiso: {text}\nIdentificador: #{id}",
    'calendar.list_title': "📅 *Calendario de Eventos del Grupo*",
    'calendar.list_empty': "Ningún evento o compromiso registrado en el calendario.\nPara agendar, envía: `{prefix}agenda add DD/MM HH:MM Mensaje del evento`",
    'calendar.item': "• [#{id}] {date} a las {time} — {text}",
    'calendar.deleted': "Evento #{id} eliminado del calendario con éxito.",
    'calendar.not_found': "El evento con ID #{id} no fue encontrado en el calendario.",
    'calendar.cleared': "Todos los eventos del calendario fueron eliminados.",
    'calendar.invalid_format': "Formato inválido. Usa: `{prefix}agenda add DD/MM HH:MM Tu mensaje aquí`\nEjemplo: `{prefix}agenda add 28/10 20:00 Reunión general`",
    'calendar.event_announcement': "📢 *[Recordatorio de Agenda / Evento]*\n\n⏰ Horario: {time}\nCompromiso: {text}{creator}",
    'calendar.creator_tag': "\nSolicitado por: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "🤖 *Estado de Hermes IA*\n\nEstado en el grupo: *{state}*\nPersonalidad: `{personality}`\nMemoria en caché: {count} mensajes registrados\nProveedor: DeepSeek Oficial (`{model}`)\nClave de API: {key}",
    'hermes.status_off_hint': "DESACTIVADO (utiliza {prefix}hermes on)",
    'hermes.key_ok': "Configurada (.env)",
    'hermes.key_missing_short': "No configurada (.env)",
    'hermes.status_nokey': "Atención: configura `AI_API_KEY` en el archivo `.env` para activar las respuestas inteligentes.",
    'hermes.status_tip': "Consejo: envía *{prefix}hermes on* para activar o habla directamente conmigo en el chat.",
    'hermes.on_ok': "¡Hermes IA activado con éxito!\nPersonalidad: {personality}\nMemoria de contexto: {memory}",
    'hermes.off_ok': "Hermes IA desactivado con éxito.",
    'hermes.cleared': "Memoria de Hermes limpiada con éxito. El historial de conversaciones de este grupo fue eliminado.",
    'hermes.disabled_hint': "Hermes IA está desactivado en este grupo.\nPara activarlo, un administrador debe enviar: *{prefix}hermes on*",
    'hermes.disabled_called': "El módulo Hermes IA se encuentra desactivado en este grupo.\nPara activarlo, un administrador debe enviar: *{prefix}hermes on*",
    'hermes.usage_hint': "Para interactuar conmigo, menciona a *@hermes*, escribe *hermes [pregunta]* o usa *{prefix}hermes status*.",
    'hermes.key_missing': "La clave de DeepSeek no fue detectada en el archivo `.env` (`AI_API_KEY`). Por favor, agrega tu clave y reinicia la aplicación.",
    'hermes.greeting_formal': "¡Hola! ¿Cómo puedo ayudarte a ti o al grupo ahora?",
    'hermes.greeting_casual': "¡Hola! ¿En qué puedo colaborar con la moderación del grupo hoy?",
    'hermes.quota': "El límite de solicitudes de IA para este período fue alcanzado. Por favor, usa comandos con prefijo temporalmente.",
    'hermes.degraded': "Modo texto activo: no es posible ejecutar acciones automáticas en este momento.",
    'hermes.unclear': "No pude comprender con claridad la solicitud. Por favor, ¿podrías reformularla?",
    'hermes.tool_failed': "No fue posible ejecutar esta acción en este momento.",
    'hermes.msg_not_found': "No localicé ese mensaje en el historial reciente del grupo.",
    'hermes.oscillation': "Ocurrió una oscilación momentánea en la conexión con la IA. Por favor, intenta de nuevo en unos instantes.",
    'hermes.need_explicit_target': "Para ejecutar acciones sobre un participante, menciona a la persona con @ o responde a su mensaje.",
    'hermes.fact_learned': "Registrado en la memoria permanente del grupo: *{key}* = *{value}*",
    'hermes.fact_forgotten': "Dato *{key}* eliminado de la memoria del grupo con éxito.",
    'hermes.fact_not_found': "El dato *{key}* no fue encontrado en la memoria del grupo.",
    'hermes.action_hallucinated': "La acción no pudo ser confirmada en el grupo. Por favor, menciona al miembro con @ o utiliza el comando con prefijo (ejemplo: {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "¡Grupo activado con éxito!\nValidez: *{expiry}*\n\nIniciaremos una configuración inicial de 3 pasos para ajustar el bot a este grupo.",
    'onboarding.step1_header': "Configuración Inicial (Paso 1/3)",
    'onboarding.step1_question': "¿Deseas activar la IA en este grupo?\n\n*[1]* Sí - Activar IA para conversar y ejecutar comandos por texto, como asistente.\n*[2]* No - Solo moderación tradicional mediante comandos directos, como: /menu\n\nResponde con 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.step2_header': "Configuración Inicial (Paso 2/3)",
    'onboarding.step2_question': "¿Deseas que la IA lea y recuerde el contexto de las conversaciones del grupo?\n\n*[1]* Sí - Respuestas más precisas y comandos contextuales según el desarrollo del grupo.\n*[2]* No - Ningún dato de contexto es conservado por la IA.\n\nResponde con 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.step3_header': "Configuración Inicial (Paso 3/3)",
    'onboarding.step3_question': "¿Qué estilo de mensajes y avisos prefieres para el bot?\n\n*[1]* Natural - Estilo comunicativo y empático, con frases bien estructuradas.\n*[2]* Formal - Estilo corporativo con etiquetas *[Moderación]* y avisos sobrios.\n\nResponde con 1 o 2 (o envía . para predeterminado [1])",
    'onboarding.finished': "¡Configuración completada con éxito!\nEl bot se encuentra listo para operar en el grupo.\n\n• Inteligencia Artificial: *{ai}*\n• Memoria de Contexto: *{memory}*\n• Estilo de Mensajes: *{style}*\n\nEnvía *{prefix}menu* para consultar comandos o *{prefix}config* para el panel completo!"
  },

  en: {
    // ─── COMUM ───
    'common.bot_name': "Hermes Admin Bot",
    'common.success': ["Done! Operation completed successfully.","All set! Command executed successfully.","Completed successfully."],
    'common.error': ["Unable to complete this action at the moment. Please try again.","A temporary issue occurred while executing this command. Please try again shortly."],
    'common.no_permission_admin': ["This command can only be used by group administrators.","Only group administrators have permission to use this command."],
    'common.no_permission_owner': ["This command is restricted to the bot owner.","Only the bot owner has permission to use this command."],
    'common.bot_not_admin': ["To perform this action, please promote me to a group administrator first.","I require administrator privileges in the group to execute this command."],
    'common.group_only': ["This command can only be used inside groups.","This feature is available exclusively within groups."],
    'common.private_disabled': ["Private direct message (DM) commands are currently disabled.","Direct message commands are currently turned off."],
    'common.not_found_target': ["Unable to identify the user. Please mention them with @ or reply to their message.","Target user not found. Please mention the person with @ or reply to their message."],
    'common.invalid_args': ["The arguments provided are invalid. Please check the command syntax.","Required information is missing. Please check the recommended format."],
    'common.enabled': "ENABLED",
    'common.disabled': "DISABLED",
    'common.saved': ["Settings saved successfully!","All set! Preferences have been updated."],
    'common.canceled': ["Operation canceled.","Action canceled successfully."],
    'common.yes': "Yes",
    'common.no': "No",
    'common.days': "days",
    'common.lifetime': "Lifetime",
    'common.mention_greeting': "🤖 *Hermes Bot*\n📌 Current prefix: `{prefix}`\n👉 Send *{prefix}menu* to see commands or *{prefix}config* for the control panel!",

    // ─── SAAS / LICENÇA / OWNER ───
    'saas.group_not_active': "This group does not have an active bot license.",
    'saas.inactive_group_hint': "*Group Not Activated*\nThe bot is connected to this group, but has not been activated yet.\n\nTo activate, send:\n*{prefix}bot on*",
    'saas.license_expired': ["This group's license has expired. To renew access and keep moderation active, please contact support.","The activation period for this group has ended. Please contact support to renew your license."],
    'saas.activated': ["Group activated successfully!\nValid until: *{expiry}*\nPrevious settings have been restored.","All set! The bot is active in this group until *{expiry}* with settings restored."],
    'saas.days_added': "Added *{days} days* to this group's license.\nNew expiry: *{expiry}*.",
    'saas.deactivated': "Bot operations paused in this group. Configurations have been preserved for when you wish to reactivate.",
    'saas.status': "📊 *Group License Status*\n🏷️ Identifier: `{id}`\nState: *{status}*\nExpires: *{expiry}*\nActive modules: {modules}",
    'saas.list_header': "📋 *Groups Registered in the System:*",
    'saas.list_item': "• {name} (`{id}`): *{status}* | Remaining: *{remaining}*",
    'saas.list_empty': "No groups registered at the moment.",
    'saas.pv_on': "Direct message (DM) commands have been enabled for all users.",
    'saas.pv_off': "Direct message (DM) commands have been disabled (Stealth protection mode: authorized owner only).",
    'saas.group_presentation': "Hello everyone! I am Hermes Bot, the management and security assistant for this group.\n\n• Type *{prefix}menu* to view available commands.\n• Administrators can send *{prefix}config* to manage protection settings.\n\n*To administrators:* please remember to promote me to group admin so I can properly execute moderation features.",
    'saas.liberate_success_owner': "Group authorized successfully!\n\n• Group: *{name}*\n• Identifier: `{id}`\n• Expires: *{expiry}*\n• Settings: Recommended defaults applied (AI and Moderation active).\n\nThe presentation message was delivered to the group.",
    'saas.liberate_usage': "Correct command syntax:\n• `{prefix}liberar <group_link> [days]`\n• `{prefix}liberar <group_id> [days]`\n\nExample:\n`{prefix}liberar https://chat.whatsapp.com/ABC123xyz 30`",
    'saas.liberate_invite_error': "Unable to join the group via the invite link. Reason: link is invalid, expired, group is full, or the bot was removed from this group.",

    // ─── BAN GROUP ───
    'bangroup.banned': "Group `{id}` has been banned from the system. The bot will remain inactive in this group.\nTo revert: `/unbangroup {id}`",
    'bangroup.unbanned': "Group `{id}` has been unbanned and the bot is active again.",
    'bangroup.already_banned': "This group is already on the banned list.",
    'bangroup.not_banned': "This group is not on the banned list.",
    'bangroup.list_title': "🛑 *System Banned Groups:*",
    'bangroup.list_empty': "No groups are currently banned.",

    // ─── RELOAD ───
    'reload.success': "Reload completed! All plugins, schemas, and dictionaries were successfully reloaded in real time.",
    'reload.error': "Error reloading modules: {error}",

    // ─── CONFIG / PAINEL ───
    'config.panel_title': "⚙️ *Control Panel • Hermes*",
    'config.panel_desc': "Reply with the module number to toggle or configure.\nShortcuts: *[P] [new]* prefix • *[L]* language • *[X]* close\nModeration commands: {prefix}menu",
    'config.panel_item': "[{num}] {status} *{name}* - {desc}",
    'config.prefix_changed': "This group's prefix has been successfully changed to: *{prefix}*",
    'config.invalid_option': "Invalid option. Choose a number from the menu or [X] to close.",
    'config.module_toggled_on': "Module *{module}* has been enabled in the group.",
    'config.module_toggled_off': "Module *{module}* has been disabled in the group.",

    // ─── IDIOMA / LANG ───
    'lang.prompt': "🌐 *Language Selection*\nChoose group language:\n[1] Português\n[2] Español\n[3] English\n\nReply with 1, 2, or 3.",
    'lang.changed': "Group language changed to: *English*.",
    'lang.invalid': "Invalid language. Use: !idioma pt, !idioma es, or !idioma en.",
    'lang.invalid_option': "Invalid option.\nChoose *1* (Português), *2* (Español), *3* (English) or send *X* to cancel.",

    // ─── ANTILINK ───
    'antilink.detected': ["@{user}, links are not permitted in this group. The message was removed to keep the group organized.","@{user}, sharing links is not allowed here. Your message was removed in accordance with group rules."],
    'antilink.warned': ["@{user}, links are not authorized here. You received a warning ({warns}/{max}) and the message was removed.","Notice, @{user}: unauthorized links result in a warning. Your total is now {warns}/{max}."],
    'antilink.banned': ["@{user} was removed from the group for repeated unauthorized link sharing.","Removal applied to @{user} for violating group link policies."],
    'antilink.status': "🛡️ *AntiLink:* {status}\n🌐 *Allowed domains:* {domains}\n⚡ *Action:* {action}",

    // ─── BOAS-VINDAS / WELCOME ───
    'welcome.default': ["Welcome to *{group}*, @{user}!\nPlease review the group description for community guidelines:\n\n{desc}","Hello, @{user}! Welcome to *{group}*.\nWe recommend reading the group description to familiarize yourself with our guidelines:\n\n{desc}"],
    'welcome.status': "👋 *Welcome:* {status}\n⏱️ *Auto-delete:* {time}",

    // ─── ADVERTÊNCIAS / WARN ───
    'warn.added': ["Notice, @{user}: you received a warning for *{reason}*.\nYou currently have {warns} of {max} warnings in this group.","@{user}, warning applied for *{reason}*.\nTotal accumulated: {warns} of {max} warnings. Please observe group rules."],
    'warn.max_reached': ["@{user} reached the limit of {max} warnings and was removed from the group.","The warning threshold of {max} was reached by @{user}, resulting in removal from the group."],
    'warn.removed': ["One warning was removed from @{user}. Current total: {warns}/{max}.","Warning revoked for @{user}. Current count: {warns}/{max}."],
    'warn.list_title': "📋 *Warned Members in the Group:*",
    'warn.list_empty': "No members have active warnings in this group.",
    'warn.list_item': "• @{user}: *{count}* warning(s)",
    'warn.cannot_warn_admin': "Group administrators cannot receive warnings.",

    // ─── ANTIFLOOD ───
    'antiflood.flood_detected': ["@{user}, please avoid sending consecutive messages rapidly to avoid flooding the group.","@{user}, rapid consecutive messaging disrupts the conversation. Please wait a moment."],
    'antiflood.trava_detected': ["@{user}, excessively long messages or potential crash payloads are not allowed.","@{user}, this message exceeds safe character limits and was removed for protection."],
    'antiflood.banned_flood': ["@{user} was removed from the group for repeated rapid message flooding.","Removal applied to @{user} due to excessive message flooding."],
    'antiflood.banned_trava': ["@{user} was removed from the group for sending a malicious crash payload.","Security removal applied to @{user} for sending a harmful message payload."],
    'antiflood.status': "🌊 *AntiFlood:* {status}\n⚡ *Max Msgs:* {msgs}/5s | *Max Chars:* {chars}\n⚡ *Action:* {action}",

    // ─── ANTIFAKE ───
    'antifake.detected': "@{user}, phone numbers with this country calling code are not permitted under group rules.",
    'antifake.status': "🎭 *AntiFake:* {status}\n🌍 *Allowed country codes:* {ddis}",

    // ─── AUTO-APROVAÇÃO (AUTOAPPROVE) ───
    'autoapprove.status': "🛡️ *Auto-Approve:* {status}\nAllowed country codes: {ddis}\nForeign action: {foreignAction}\nGroup notification: {notify}",
    'autoapprove.summary': "📋 *Pending Join Requests*\n\nTotal awaiting approval: {total}\n• National Numbers (DDI 55): {brCount}\n• Foreign Numbers: {foreignCount}\n• Unresolved LIDs: {unknownCount}\n\nAnti-Ban Protection: ACTIVE (Safe Queue with Human Jitter)\n\nAvailable commands:\n• `{prefix}aprovar agora` - Approve {brCount} national members via safe queue\n• `{prefix}aprovar todos` - Approve ALL {total} pending participants\n• `{prefix}aprovar <number>` - Approve a specific participant\n• `{prefix}aprovar on` - Enable real-time auto-approval\n• `{prefix}aprovar on todos` - Enable unrestricted auto-approval\n• `{prefix}aprovar off` - Disable auto-approval\n• `{prefix}aprovar config` - Configure country codes and actions",
    'autoapprove.no_pending': "There are no pending join requests in this group at the moment.",
    'autoapprove.no_pending_br': "There are no Brazilian numbers pending approval at the moment ({foreignCount} foreign and {unknownCount} LIDs awaiting manual review).",
    'autoapprove.batch_starting': "Starting safe approval of {count} participant(s) with human jitter. Please wait for completion.",
    'autoapprove.batch_starting_all': "Starting safe approval of all {count} pending participants. Please wait for completion.",
    'autoapprove.batch_finished': "Batch approval completed successfully.\nApproved: *{approved}/{total}* | Failed: *{failed}* | Cancelled: *{cancelled}*.",
    'autoapprove.batch_finished_all': "General approval completed successfully.\nApproved: *{approved}/{total}* | Failed: *{failed}* | Cancelled: *{cancelled}*.",
    'autoapprove.batch_cancelled': "Batch approval interrupted.\nApproved: *{approved}/{total}* | Failed: *{failed}* | Cancelled: *{cancelled}*.",
    'autoapprove.approved_single': "@{user} was successfully approved into the group. Welcome!",
    'autoapprove.circuit_breaker_pause': "Anti-Ban Protection: abnormal join request surge detected (+{count} in less than 1 minute). To protect the account, auto-approval was paused for {minutes} minutes. Pending requests remain saved and can be processed via `{prefix}aprovar agora`.",
    'autoapprove.approval_mode_warning': "Notice: the 'Approve new participants' setting is disabled in this WhatsApp group. Enable it in WhatsApp settings for requests to enter the approval queue.",
    'autoapprove.target_approved': "Join request approved successfully!\nParticipant: +{user}\nThe participant was accepted into the group with anti-ban protection.",
    'autoapprove.target_failed': "Unable to approve request for participant +{user}.\nReason: {reason}.\nThe request remains in the queue for another attempt.",
    'autoapprove.target_ambiguous': "Multiple requests match +{user} ({count} found).\nSend the complete number with country code to approve accurately.",
    'autoapprove.target_not_found': "Request not found. The specified number (+{user}) is not in the pending queue for this group.",
    'autoapprove.queue_cancelled': "Approval queue cancelled. {count} in-flight request(s) were cancelled.",
    'autoapprove.all_members': "Any participant (All countries)",
    'autoapprove.activated_all': "Auto-Approve enabled for any participant. All incoming members will be accepted automatically with safe queueing.",

    // ─── AGENDAMENTO DE HORÁRIOS (SCHEDULE) ───
    'schedule.closed': ["The group was closed automatically according to the scheduled time.","Scheduled closing reached: the group is now paused for message sending."],
    'schedule.opened': ["The group was opened automatically according to the scheduled time. Enjoy the conversation!","Scheduled opening reached: message sending enabled for all members."],
    'schedule.status': "⏰ *Automated Schedule:* {status}\n🔒 Close: *{close}* | 🔓 Open: *{open}*",

    // ─── MENSAGENS PERIÓDICAS (AUTOMSG) ───
    'automsg.status': "📢 *AutoMsg:* {status}\n⏱️ *Interval:* every {interval}\n💬 *Message:* {msg}",

    // ─── BAN / EXPULSÃO ───
    'ban.cannot_ban_admin': "Group administrators cannot be removed by the bot.",
    'ban.cannot_ban_owner': "The bot owner cannot be removed.",
    'ban.cannot_ban_bot': "I cannot remove myself from the group.",
    'ban.success': ["Done, @{user} was removed from the group.","Removal of @{user} completed successfully.","Participant @{user} was removed from the group."],

    // ─── MUTE / FECHAMENTO DE GRUPO ───
    'mute.closed': ["The group was closed temporarily by administration. Only administrators can send messages at this time.","Message sending paused by administrators. The group will reopen shortly."],
    'mute.opened': ["The group has been reopened. All members can send messages.","Message sending enabled for all group participants."],
    'mute.prompt': "How would you like to proceed with the group?\n[1] Close group now\n[2] Open group now\n\nReply with 1 or 2.",

    // ─── MUTE MEMBER / SILENCIAMENTO INDIVIDUAL ───
    'mutemember.muted': ["@{user} was muted for {duration}.{admin}{reason}\nTheir messages will be automatically deleted during this period.","Mute applied to @{user} for {duration}.{admin}{reason}\nThe participant cannot interact in the group temporarily."],
    'mutemember.unmuted': ["Mute period for @{user} has ended. The participant may now send messages normally.","@{user} was unmuted and is free to participate in the group."],
    'mutemember.not_muted': "Participant @{user} is not currently muted.",
    'mutemember.list_empty': "No members are currently muted in this group.",
    'mutemember.list_title': "🔇 *Muted Members in the Group:*",
    'mutemember.cannot_mute_admin': "Group administrators cannot be muted.",
    'mutemember.cannot_mute_owner': "The bot owner cannot be muted.",
    'mutemember.cannot_mute_bot': "I cannot mute myself.",
    'mutemember.abuse_banned': "@{user} was removed from the group for repeated messaging attempts while muted.",
    'mutemember.insistence_banned': "@{user} was removed from the group after sending over {count} messages while muted.",

    // ─── LINK DE CONVITE ───
    'link.success': "🔗 *Group Invite Link:*\n\nhttps://chat.whatsapp.com/{code}\n\nShare this link with anyone you wish to invite to the group.",
    'link.revoked': "The previous invite link was successfully revoked.\n\n🔗 *New link:* https://chat.whatsapp.com/{code}",
    'link.error': "Unable to retrieve the group invite link. Please ensure the bot has administrator privileges in this group.",

    // ─── DESCRIÇÃO DO GRUPO (SETDESC) ───
    'setdesc.success': "The group description was updated successfully!",
    'setdesc.cleared': "The group description was removed successfully.",
    'setdesc.current': "📌 *Current Group Description:*\n\n{description}\n\nTo modify: send `{prefix}setdesc <new text>` or reply to a message with `{prefix}setdesc`.",
    'setdesc.empty': "(The group does not currently have a description set)",
    'setdesc.error': "Unable to update the group description. Please verify that the bot has administrator privileges.",

    // ─── FOTO DO GRUPO (SETPIC) ───
    'setpic.success': "The group profile picture was updated successfully!",
    'setpic.cleared': "The group profile picture was removed successfully.",
    'setpic.no_image': "Please send an image with `{prefix}foto` in the caption or reply to an existing image.",
    'setpic.error': "Unable to update the group profile picture. Please verify that the bot is an administrator.",

    // ─── FIXAR MENSAGEM (PIN) ───
    'pin.pinned': "The message was successfully pinned for {duration}.",
    'pin.unpinned': "The message was successfully unpinned.",
    'pin.reply_required': "Please reply to the message you wish to pin or unpin with the command.",
    'pin.error': "Unable to pin or unpin the message. Please check the bot's privileges in this group.",

    // ─── ENQUETES (POLL) ───
    'poll.success': "Poll created successfully!\n\n📝 *Question:* {title}\n🔢 *Type:* {type}\n📋 *Options:* {count} alternatives",
    'poll.type_single': "Single choice (1 vote)",
    'poll.type_multi': "Multiple choice (multiple votes)",
    'poll.usage': "📊 *How to Create Polls:*\n\n1️⃣ *Single-Line (with pipe |):*\n`{prefix}poll Question | Option 1 | Option 2 | Option 3`\n\n2️⃣ *Multiple Choice (--multi):*\n`{prefix}poll --multi Question | Option 1 | Option 2`\n\n3️⃣ *Multi-Line Format:*\n`{prefix}poll Question\n1. Option A\n2. Option B`",
    'poll.error_options': "The poll requires a question and at least 2 valid voting options.",
    'poll.error': "Unable to create the poll. Please check the provided information.",

    // ─── MARCAÇÃO GERAL (HIDETAG) ───
    'hidetag.empty': "Please enter the announcement text or reply to an existing message.",

    // ─── PROMOÇÃO / PROMOVER ───
    'promote.already_admin': "This member already has administrator privileges in the group.",
    'promote.need_explicit_mention': "For security reasons, explicitly mention the member with @ to promote them to administrator.",
    'promote.success': "@{user} is now a group administrator.",

    // ─── REBAIXAMENTO / DEMOTE ───
    'demote.already_member': "This user is not an administrator of the group.",
    'demote.cannot_demote_owner': "The supreme bot owner cannot be demoted.",
    'demote.success': "@{user} was demoted to regular member.",

    // ─── LIMPEZA DE MENSAGEM (CLEAR) ───
    'clear.reply_required': "Please reply to the message you wish to delete with the command.",
    'clear.success': "Message deleted successfully.",

    // ─── LISTA NEGRA (BLACKLIST) ───
    'blacklist.added': "@{user} was added to the group Blacklist and removed.",
    'blacklist.added_global': "@{user} was added to the system global Blacklist.",
    'blacklist.removed': "@{user} was removed from the group Blacklist.",
    'blacklist.removed_global': "@{user} was removed from the global Blacklist.",
    'blacklist.list_title': "📋 *Group Blacklist:*",
    'blacklist.list_empty': "The blacklist for this group is currently empty.",
    'blacklist.banned_entry': "Access blocked: @{user} is on the Blacklist and was automatically removed.",

    // ─── SORTEIO (RAFFLE) ───
    'raffle.not_enough': "There are not enough participants in the group to conduct a raffle.",
    'raffle.title': "🎉 *Raffle Results*",
    'raffle.prize': "🎁 *Prize:* {prize}",
    'raffle.winners': "🏆 *Winner(s):*\n{winners}",

    // ─── DIAGNÓSTICO E STATUS (PING) ───
    'ping.title': "🏓 *System Operational Status*",
    'ping.latency': "⚡ *Latency:* `{latency}ms`",
    'ping.uptime': "⏱️ *Uptime:* `{uptime}`",
    'ping.ram': "💾 *RAM Usage:* `{ram} MB`",
    'ping.lang': "🌐 *Language:* `{lang}`",
    'ping.antiban': "🛡️ *Anti-Ban Protection:* `Active (Stealth Presence + Jitter + Human Delay)`",
    'ping.license': "📅 *Group License:* `{expiry}`",

    // ─── ENGINE DO WIZARD ───
    'wizard.step_header': "🧙‍♂️ *Configuration: {plugin}* (Step {step}/{total})",
    'wizard.current_val': "📌 Current value: `{current}`",
    'wizard.invalid_input': "Invalid response. Please read the prompt and try again.",
    'wizard.finished': "Configuration for *{plugin}* completed successfully!",
    'wizard.choice_prompt': "Choose one of the options below by sending the corresponding number:\n{choices}",
    'wizard.boolean_prompt': "*[1]* Yes (Enabled)\n*[2]* No (Disabled)\n\nReply with *1* or *2*",
    'wizard.select_field_title': "🧙‍♂️ *Configuration: {plugin}*\n\nChoose which step you want to modify:\n\n",
    'wizard.select_field_footer': "*[T]* Reconfigure All Steps\n*[X]* Cancel and Close\n\nReply with the number of the step you wish to modify.",
    'wizard.select_field_invalid': "Invalid option. Choose the step number (1 to {max}), *T* for all, or *X* to cancel.",
    'wizard.summary_single': "📋 *Configuration updated successfully:*",
    'wizard.summary_all': "📋 *Saved settings summary:*",
    'wizard.tip_keep': "Tip: Send *.* (dot) to keep the current value.",
    'wizard.tip_default': "📌 Default value: `{default}`\nTip: Send *.* (dot) to use the default value.",
    'wizard.cancel_hint': "Send *X* at any time to cancel.",
    'wizard.out_of_range': "Value out of allowed range{range}. Please try again.",
    'wizard.session_expired': "Session expired. The configuration menu remained inactive for too long and was closed for security.",
    'wizard.focus_switch_prompt': "You have an active configuration session in progress (*{module}*).\n\nDo you want to cancel or continue?\n• Send *X* to cancel and close\n• Send *1* to continue configuring",
    'wizard.hermes_focus_detected': "@{user}, I noticed you called me, but you still have the *{module}* menu open.\n\nDo you want to cancel the configuration or continue where you left off?\n• Send *X* to close the menu\n• Send *1* to continue configuring",
    'wizard.cancelled': "Configuration cancelled successfully. Menu closed.",
    'wizard.continued': "Continuing configuration...",

    // ─── AGENDA / CALENDÁRIO ───
    'calendar.added': "📅 *Event Scheduled Successfully!*\n\nDate/Time: {date} at {time}\nEvent: {text}\nIdentifier: #{id}",
    'calendar.list_title': "📅 *Group Scheduled Events Calendar*",
    'calendar.list_empty': "No scheduled events or reminders recorded in the calendar.\nTo schedule, send: `{prefix}agenda add DD/MM HH:MM Event announcement text`",
    'calendar.item': "• [#{id}] {date} at {time} — {text}",
    'calendar.deleted': "Scheduled event #{id} removed from the calendar successfully.",
    'calendar.not_found': "Scheduled event with ID #{id} was not found in the calendar.",
    'calendar.cleared': "All scheduled events have been cleared from the calendar.",
    'calendar.invalid_format': "Invalid format. Use: `{prefix}agenda add DD/MM HH:MM Your message here`\nExample: `{prefix}agenda add 28/10 20:00 General meeting`",
    'calendar.event_announcement': "📢 *[Calendar Reminder / Event]*\n\n⏰ Time: {time}\nEvent: {text}{creator}",
    'calendar.creator_tag': "\nRequested by: @{user}",

    // ─── HERMES IA ───
    'hermes.status': "🤖 *Hermes AI Status*\n\nState in group: *{state}*\nPersonality: `{personality}`\nCached memory: {count} messages recorded\nProvider: DeepSeek Official (`{model}`)\nAPI Key: {key}",
    'hermes.status_off_hint': "DISABLED (use {prefix}hermes on)",
    'hermes.key_ok': "Configured (.env)",
    'hermes.key_missing_short': "Not configured (.env)",
    'hermes.status_nokey': "Notice: please configure `AI_API_KEY` in `.env` to enable intelligent responses.",
    'hermes.status_tip': "Tip: send *{prefix}hermes on* to activate or speak directly with me in chat.",
    'hermes.on_ok': "Hermes AI activated successfully!\nPersonality: {personality}\nContext memory: {memory}",
    'hermes.off_ok': "Hermes AI disabled successfully.",
    'hermes.cleared': "Hermes memory cleared successfully. This group's conversation history has been reset.",
    'hermes.disabled_hint': "Hermes AI is disabled in this group.\nTo activate, an administrator must send: *{prefix}hermes on*",
    'hermes.disabled_called': "Hermes AI is currently disabled in this group.\nTo activate, an administrator must send: *{prefix}hermes on*",
    'hermes.usage_hint': "To interact with me, mention *@hermes*, type *hermes [question]* or use *{prefix}hermes status*.",
    'hermes.key_missing': "The DeepSeek API key was not detected in `.env` (`AI_API_KEY`). Please add your key and restart the application.",
    'hermes.greeting_formal': "Hello! How may I assist you or the group today?",
    'hermes.greeting_casual': "Hello! How can I assist with group moderation today?",
    'hermes.quota': "The AI request quota for this period has been reached. Please use prefix commands temporarily.",
    'hermes.degraded': "Text mode active: automated actions are temporarily unavailable.",
    'hermes.unclear': "I could not clearly understand the request. Could you please rephrase?",
    'hermes.tool_failed': "Unable to execute this action at the moment.",
    'hermes.msg_not_found': "I could not locate that message in recent group history.",
    'hermes.oscillation': "A brief connection fluctuation occurred with the AI service. Please try again in a few moments.",
    'hermes.need_explicit_target': "To execute actions on a participant, mention them with @ or reply to their message.",
    'hermes.fact_learned': "Recorded in group permanent memory: *{key}* = *{value}*",
    'hermes.fact_forgotten': "Record *{key}* removed from group memory successfully.",
    'hermes.fact_not_found': "Record *{key}* was not found in group memory.",
    'hermes.action_hallucinated': "The action could not be confirmed in the group. Please mention the member with @ or use the prefix command (e.g. {prefix}ban, {prefix}warn).",

    // ─── ONBOARDING WIZARD ───
    'onboarding.welcome': "Group activated successfully!\nValidity: *{expiry}*\n\nWe will now run a quick 3-step initial setup to configure the bot for this group.",
    'onboarding.step1_header': "Initial Setup (Step 1/3)",
    'onboarding.step1_question': "Would you like to activate AI in this group?\n\n*[1]* Yes - Enable AI to chat and execute text commands as an assistant.\n*[2]* No - Traditional moderation only using direct commands like: /menu\n\nReply with 1 or 2 (or send . for default [1])",
    'onboarding.step2_header': "Initial Setup (Step 2/3)",
    'onboarding.step2_question': "Allow the AI to read and remember group conversation context?\n\n*[1]* Yes - More accurate responses and contextual commands as the group progresses.\n*[2]* No - No context data is retained by the AI.\n\nReply with 1 or 2 (or send . for default [1])",
    'onboarding.step3_header': "Initial Setup (Step 3/3)",
    'onboarding.step3_question': "Which message and alert style do you prefer for the bot?\n\n*[1]* Natural - Friendly and communicative style with well-structured phrases.\n*[2]* Formal - Corporate style with bold *[Moderation]* tags and clean phrasing.\n\nReply with 1 or 2 (or send . for default [1])",
    'onboarding.finished': "Configuration completed successfully!\nThe bot is ready to operate in the group.\n\n• Artificial Intelligence: *{ai}*\n• Context Memory: *{memory}*\n• Message Style: *{style}*\n\nSend *{prefix}menu* to view commands or *{prefix}config* for the full panel!"
  }
};

/**
 * Traduz uma chave para o idioma solicitado com interpolação de variáveis, suporte a estilo e phrase pools
 * Suporta assinaturas:
 * - t(lang, key, vars, style)
 * - t(key, vars, style)
 * @param {string} langOrKey Idioma ('pt', 'es', 'en') ou chave da mensagem
 * @param {string|object} [keyOrVars] Chave da mensagem ou objeto de variáveis
 * @param {object|string} [varsOrStyle] Variáveis dinâmicas ou estilo
 * @param {string} [maybeStyle] Estilo ('natural' | 'formal')
 * @returns {string} Texto formatado com fallback para português
 */
function t(langOrKey = 'pt', keyOrVars, varsOrStyle = {}, maybeStyle = null) {
  let lang = 'pt';
  let key = '';
  let vars = {};
  let style = null;

  // Overload 1: t('common.saved', { ... }, 'formal')
  if (typeof langOrKey === 'string' && (langOrKey.includes('.') || !['pt', 'es', 'en'].includes(langOrKey.toLowerCase()))) {
    key = langOrKey;
    lang = 'pt';
    vars = (keyOrVars && typeof keyOrVars === 'object') ? keyOrVars : {};
    style = typeof varsOrStyle === 'string' ? varsOrStyle : (maybeStyle || null);
  } else {
    // Normal: t(lang, key, vars, style)
    lang = langOrKey || 'pt';
    key = keyOrVars;
    vars = (varsOrStyle && typeof varsOrStyle === 'object') ? varsOrStyle : {};
    style = maybeStyle;
  }

  const targetLang = (lang || 'pt').toLowerCase();

  // Resolve estilo ('natural' ou 'formal')
  let resolvedStyle = style || vars?._style || (['natural', 'formal'].includes(vars?.style) ? vars.style : null);

  // Se o estilo não foi informado explicitamente, busca pelo grupo caso groupJid ou from esteja nas variáveis
  if (!resolvedStyle && (vars?.groupJid || vars?.from)) {
    try {
      const configManager = require('../core/configManager');
      resolvedStyle = configManager.getGroupStyle(vars.groupJid || vars.from);
    } catch (_) {}
  }

  if (!resolvedStyle) resolvedStyle = 'natural';

  let text = null;
  if (resolvedStyle === 'formal') {
    text = i18nFormal.dictionaries[targetLang]?.[key];
  }

  if (!text) {
    const dict = dictionaries[targetLang] || dictionaries.pt;
    text = dict[key] || dictionaries.pt[key] || key;
  }

  // Suporte a Array de frases (Pool humanizado com seleção aleatória)
  if (Array.isArray(text)) {
    text = text[Math.floor(Math.random() * text.length)];
  }

  // Substituição de placeholders dinâmicos: {variavel}
  if (vars && typeof vars === 'object') {
    for (const [varKey, varValue] of Object.entries(vars)) {
      if (varKey === '_style') continue;
      const regex = new RegExp(`\\{${varKey}\\}`, 'g');
      text = text.replace(regex, String(varValue !== undefined && varValue !== null ? varValue : ''));
    }
  }

  return text;
}

/**
 * Resolve textos dinâmicos de schemas ou escolhas com suporte a multilíngue e phrase pools
 * Se o objeto for { pt: '...', es: '...', en: '...' }, retorna a string do idioma.
 * Se for uma string direta, retorna a própria string.
 * @param {string|object|Array} fieldOrChoice 
 * @param {string} lang 
 * @returns {string}
 */
function resolveSchemaText(fieldOrChoice, lang = 'pt') {
  if (!fieldOrChoice) return '';
  if (typeof fieldOrChoice === 'string') return fieldOrChoice;
  if (Array.isArray(fieldOrChoice)) {
    return fieldOrChoice[Math.floor(Math.random() * fieldOrChoice.length)];
  }

  if (typeof fieldOrChoice === 'object') {
    const targetLang = (lang || 'pt').toLowerCase();
    let val = fieldOrChoice[targetLang] || fieldOrChoice.pt || fieldOrChoice.en || fieldOrChoice.es || '';
    if (Array.isArray(val)) {
      return val[Math.floor(Math.random() * val.length)];
    }
    return val;
  }

  return String(fieldOrChoice);
}

module.exports = {
  t,
  resolveSchemaText,
  dictionaries
};
