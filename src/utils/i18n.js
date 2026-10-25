/**
 * Sistema de InternacionalizaÃ§Ã£o Nativa (i18n)
 * Suporte completo a PortuguÃªs (pt), Espanhol (es) e InglÃªs (en)
 * Sem placeholders ou omissÃµes de traduÃ§Ã£o.
 */

const dictionaries = {
  pt: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': 'âœ… OperaÃ§Ã£o realizada com sucesso!',
    'common.error': 'âŒ Ocorreu um erro ao executar este comando.',
    'common.no_permission_admin': 'âš ï¸ Este comando Ã© exclusivo para Administradores do grupo.',
    'common.no_permission_owner': 'â›” Este comando Ã© restrito ao Dono do bot.',
    'common.bot_not_admin': 'âš ï¸ O bot precisa ser Administrador do grupo para executar esta aÃ§Ã£o.',
    'common.group_only': 'â„¹ï¸ Este comando sÃ³ pode ser utilizado dentro de grupos.',
    'common.private_disabled': 'ðŸ”‡ Comandos no privado estÃ£o desativados no momento.',
    'common.not_found_target': 'âš ï¸ UsuÃ¡rio nÃ£o identificado. Mencione alguÃ©m, responda a uma mensagem ou digite o nÃºmero.',
    'common.invalid_args': 'âš ï¸ Argumentos invÃ¡lidos. Verifique a sintaxe correta.',
    'common.enabled': 'ATIVADO',
    'common.disabled': 'DESATIVADO',
    'common.saved': 'ðŸ’¾ ConfiguraÃ§Ãµes salvas com sucesso!',
    'common.canceled': 'âŒ OperaÃ§Ã£o cancelada.',
    'common.yes': 'Sim',
    'common.no': 'NÃ£o',
    'common.days': 'dias',
    'common.lifetime': 'VitalÃ­cio',
    'common.mention_greeting': 'ðŸ¤– *Hermes Bot*\nðŸ“Œ *Prefixo atual:* `{prefix}`\nðŸ‘‰ Envie *{prefix}menu* ou *@bot menu* para abrir o painel de configuraÃ§Ãµes e comandos!',

    // LicenÃ§a / SaaS
    'saas.group_not_active': 'â›” Este grupo nÃ£o possui uma licenÃ§a ativa do bot.',
    'saas.inactive_group_hint': 'âš ï¸ *Grupo NÃ£o Ativado*\nO bot estÃ¡ conectado ao grupo, mas ainda nÃ£o foi ativado.\n\nðŸ‘‰ Para ativar o bot neste grupo, digite:\n*{prefix}bot on* (ou *{prefix}ativar*)',
    'saas.license_expired': 'âš ï¸ *LICENÃ‡A EXPIRADA*\nA licenÃ§a deste grupo expirou. Entre em contato com o suporte/dono para renovar o acesso.',
    'saas.activated': 'ðŸŽ‰ *GRUPO ATIVADO COM SUCESSO!*\nValidade: *{expiry}*\nConfigs anteriores restauradas.',
    'saas.days_added': 'ðŸ“… Foram adicionados *{days} dias* Ã  licenÃ§a deste grupo.\nNova validade: *{expiry}*.',
    'saas.deactivated': 'ðŸ›‘ *BOT DESATIVADO NESTE GRUPO*\nO bot pausou suas atividades aqui. As configuraÃ§Ãµes foram preservadas.',
    'saas.status': 'ðŸ“Š *STATUS DA LICENÃ‡A DO GRUPO*\nðŸ·ï¸ *ID:* `{id}`\nðŸŸ¢ *Estado:* {status}\nâ³ *Validade:* {expiry}\nâš™ï¸ *MÃ³dulos ativos:* {modules}',
    'saas.list_header': 'ðŸ“‹ *GRUPOS CADASTRADOS NO SISTEMA:*',
    'saas.list_item': 'â–«ï¸ {name} (`{id}`): *{status}* | Restam: *{remaining}*',
    'saas.list_empty': 'Nenhum grupo cadastrado no momento.',
    'saas.pv_on': 'ðŸ”“ Respostas a comandos no privado (DM) foram *ATIVADAS* para todos.',
    'saas.pv_off': 'ðŸ”’ Respostas a comandos no privado (DM) foram *DESATIVADAS* (Modo Anti-Ban ativado: apenas o Dono pode usar no PV).',

    // Banir Grupos
    'bangroup.banned': 'ðŸ›‘ *GRUPO BANIDO COM SUCESSO*\nO grupo `{id}` foi banido. O bot estÃ¡ 100% mudo e invisÃ­vel neste grupo.\n\nðŸ’¡ Para reverter: `/desbanirgrupo {id}`',
    'bangroup.unbanned': 'ðŸŸ¢ *GRUPO DESBANIDO COM SUCESSO*\nO grupo `{id}` foi desbanido e o bot voltou a reconhecer o grupo.',
    'bangroup.already_banned': 'âš ï¸ Este grupo jÃ¡ estÃ¡ na lista de grupos banidos.',
    'bangroup.not_banned': 'âš ï¸ Este grupo nÃ£o estÃ¡ banido.',
    'bangroup.list_title': 'ðŸ›‘ *GRUPOS BANIDOS DO BOT:*',
    'bangroup.list_empty': 'Nenhum grupo estÃ¡ banido no momento.',

    // Reload
    'reload.success': 'ðŸ”„ *HOT-RELOAD CONCLUÃDO!*\nTodos os plugins, schemas e traduÃ§Ãµes foram recarregados com sucesso em tempo real.',
    'reload.error': 'âŒ Erro ao recarregar mÃ³dulos: {error}',

    // Painel !config
    'config.panel_title': 'âš™ï¸ *PAINEL DE CONFIGURAÃ‡Ã•ES - HERMES*',
    'config.panel_desc': 'Responda com o *NÃšMERO* do mÃ³dulo para ativar/desativar ou configurar:\nOu digite:\nâ€¢ *[P] [novo_prefixo]* para trocar o prefixo (Ex: P /)\nâ€¢ *[L]* para trocar o idioma\nâ€¢ *[X]* para apagar e fechar o menu',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': 'âœ… Prefixo deste grupo alterado com sucesso para: *{prefix}*',
    'config.invalid_option': 'âš ï¸ OpÃ§Ã£o invÃ¡lida. Escolha um nÃºmero do menu ou [X] para fechar.',
    'config.module_toggled_on': 'ðŸŸ¢ *{module}* foi *ATIVADO* no grupo.',
    'config.module_toggled_off': 'ðŸ”´ *{module}* foi *DESATIVADO* no grupo.',

    // Idioma (!idioma)
    'lang.prompt': 'ðŸŒ *SELEÃ‡ÃƒO DE IDIOMA*\nEscolha o idioma do grupo:\n[1] ðŸ‡§ðŸ‡· PortuguÃªs\n[2] ðŸ‡ªðŸ‡¸ EspaÃ±ol\n[3] ðŸ‡ºðŸ‡¸ English\n\nResponda com 1, 2 ou 3.',
    'lang.changed': 'ðŸŒ Idioma do grupo alterado para: *PortuguÃªs (Brasil)*.',
    'lang.invalid': 'âš ï¸ Idioma invÃ¡lido. Use: !idioma pt, !idioma es ou !idioma en.',
    'lang.invalid_option': 'âš ï¸ OpÃ§Ã£o invÃ¡lida.\nEscolha *1* (PortuguÃªs), *2* (EspaÃ±ol), *3* (English) ou envie *X* para cancelar.',

    // AntiLink
    'antilink.detected': 'ðŸš« @{user}, links nÃ£o sÃ£o permitidos neste grupo!',
    'antilink.warned': 'ðŸš« @{user} enviou um link nÃ£o autorizado e recebeu uma advertÃªncia ({warns}/{max}).',
    'antilink.banned': 'ðŸš« @{user} foi banido por enviar links nÃ£o autorizados.',
    'antilink.status': 'ðŸ›¡ï¸ *AntiLink:* {status}\nðŸŒ *DomÃ­nios permitidos:* {domains}\nâš¡ *AÃ§Ã£o:* {action}',

    // Welcome
    'welcome.default': 'ðŸ‘‹ OlÃ¡ @{user}, seja muito bem-vindo(a) ao *{group}*!\n\nðŸ“‹ *DescriÃ§Ã£o:* {desc}',
    'welcome.status': 'ðŸ‘‹ *Boas-Vindas:* {status}\nâ±ï¸ *Auto-delete:* {time}',

    // Warn
    'warn.added': 'âš ï¸ @{user} recebeu uma advertÃªncia!\nMotivo: *{reason}*\nAdvertÃªncias: *{warns}/{max}*',
    'warn.max_reached': 'ðŸš« @{user} atingiu o limite de advertÃªncias ({max}/{max}) e foi removido do grupo.',
    'warn.removed': 'âœ… Uma advertÃªncia foi removida de @{user}. AdvertÃªncias atuais: *{warns}/{max}*.',
    'warn.list_title': 'ðŸ“‹ *MEMBROS ADVERTIDOS NO GRUPO:*',
    'warn.list_empty': 'Nenhum membro possui advertÃªncias ativas neste grupo.',
    'warn.list_item': 'â–«ï¸ @{user}: *{count}* advertÃªncia(s)',
    'warn.cannot_warn_admin': 'âš ï¸ NÃ£o Ã© permitido aplicar advertÃªncias a administradores.',

    // AntiFlood
    'antiflood.flood_detected': 'âš ï¸ @{user}, nÃ£o envie mensagens repetidas tÃ£o rÃ¡pido!',
    'antiflood.trava_detected': 'âš ï¸ @{user}, mensagens excessivamente longas (anti-trava) sÃ£o proibidas!',
    'antiflood.banned_flood': 'ðŸš« @{user} foi banido por envio excessivo de mensagens (flood).',
    'antiflood.banned_trava': 'ðŸš« @{user} foi banido por enviar mensagem excessivamente longa (trava).',
    'antiflood.status': 'ðŸŒŠ *AntiFlood:* {status}\nâš¡ *MÃ¡x Msgs:* {msgs}/5s | *MÃ¡x Caracteres:* {chars}\nâš¡ *AÃ§Ã£o:* {action}',

    // AntiFake
    'antifake.detected': 'ðŸš« @{user}, nÃºmeros com este cÃ³digo de paÃ­s (DDI) nÃ£o sÃ£o permitidos neste grupo.',
    'antifake.status': 'ðŸŽ­ *AntiFake:* {status}\nðŸŒ *DDIs permitidos:* {ddis}',

    // Schedule
    'schedule.closed': 'ðŸ”’ *GRUPO FECHADO*\nO grupo foi fechado automaticamente conforme o horÃ¡rio programado.',
    'schedule.opened': 'ðŸ”“ *GRUPO ABERTO*\nO grupo foi aberto automaticamente conforme o horÃ¡rio programado.',
    'schedule.status': 'â° *HorÃ¡rios AutomÃ¡ticos:* {status}\nðŸ”’ Fechar: *{close}* | ðŸ”“ Abrir: *{open}*',

    // AutoMsg
    'automsg.status': 'ðŸ“¢ *AutoMsg:* {status}\nâ±ï¸ *Intervalo:* a cada {interval}\nðŸ’¬ *Mensagem:* {msg}',

    // Ban
    'ban.cannot_ban_admin': 'âš ï¸ NÃ£o Ã© permitido banir administradores do grupo.',
    'ban.cannot_ban_owner': 'âš ï¸ NÃ£o Ã© permitido banir o Dono do bot.',
    'ban.cannot_ban_bot': 'âš ï¸ NÃ£o posso banir a mim mesmo.',
    'ban.success': 'ðŸ‘‹ O usuÃ¡rio @{user} foi removido do grupo.',

    // Mute
    'mute.closed': 'ðŸ”’ O grupo foi *FECHADO* por um administrador. Apenas admins podem enviar mensagens.',
    'mute.opened': 'ðŸ”“ O grupo foi *ABERTO* por um administrador. Todos os membros podem enviar mensagens.',
    'mute.prompt': 'â“ O que deseja fazer?\n[1] Fechar o grupo agora\n[2] Abrir o grupo agora\n\nResponda com 1 ou 2.',

    // Hidetag
    'hidetag.empty': 'âš ï¸ Digite o comunicado que deseja enviar para todos ou responda a uma mensagem.',

    // Promote / Demote
    'promote.already_admin': 'âš ï¸ Este membro jÃ¡ Ã© um administrador.',
    'promote.success': 'â¬†ï¸ @{user} agora Ã© um *Administrador* do grupo!',
    'demote.already_member': 'âš ï¸ Este usuÃ¡rio nÃ£o Ã© um administrador.',
    'demote.cannot_demote_owner': 'âš ï¸ O Dono supremo nÃ£o pode ser rebaixado.',
    'demote.success': 'â¬‡ï¸ @{user} foi rebaixado a membro comum.',

    // Clear
    'clear.reply_required': 'âš ï¸ Responda Ã  mensagem que vocÃª deseja apagar com o comando.',
    'clear.success': 'ðŸ—‘ï¸ Mensagem apagada com sucesso.',

    // Blacklist
    'blacklist.added': 'â›” @{user} foi adicionado Ã  Lista Negra do grupo e banido.',
    'blacklist.added_global': 'â›” @{user} foi adicionado Ã  Lista Negra GLOBAL de todos os grupos.',
    'blacklist.removed': 'âœ… @{user} foi removido da Lista Negra do grupo.',
    'blacklist.removed_global': 'âœ… @{user} foi removido da Lista Negra GLOBAL.',
    'blacklist.list_title': 'ðŸ“‹ *LISTA NEGRA DO GRUPO:*',
    'blacklist.list_empty': 'A lista negra deste grupo estÃ¡ vazia.',
    'blacklist.banned_entry': 'â›” @{user} estÃ¡ na Lista Negra e foi removido automaticamente.',

    // Raffle
    'raffle.not_enough': 'âš ï¸ NÃ£o hÃ¡ participantes suficientes no grupo para realizar o sorteio.',
    'raffle.title': 'ðŸŽ‰ *RESULTADO DO SORTEIO* ðŸŽ‰',
    'raffle.prize': 'ðŸŽ *PrÃªmio:* {prize}',
    'raffle.winners': 'ðŸ† *Ganhador(es):*\n{winners}',

    // Ping
    'ping.title': 'ðŸ“ *PONG! STATUS DO SISTEMA*',
    'ping.latency': 'âš¡ *LatÃªncia:* `{latency}ms`',
    'ping.uptime': 'â±ï¸ *Uptime:* `{uptime}`',
    'ping.ram': 'ðŸ’¾ *Consumo RAM:* `{ram} MB`',
    'ping.lang': 'ðŸŒ *Idioma:* `{lang}`',
    'ping.antiban': 'ðŸ›¡ï¸ *Modo Furtivo / Anti-Ban:* `ATIVO (PresenÃ§a Furtiva + Jitter + Delay Humano)`',
    'ping.license': 'ðŸ“… *LicenÃ§a do Grupo:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': 'ðŸ§™â€â™‚ï¸ *CONFIGURAÃ‡ÃƒO: {plugin}* (Passo {step}/{total})',
    'wizard.current_val': 'ðŸ“Œ *Valor atual:* `{current}`',
    'wizard.invalid_input': 'âš ï¸ Resposta invÃ¡lida. Por favor, leia a pergunta e tente novamente.',
    'wizard.finished': 'ðŸŽ‰ *ConfiguraÃ§Ã£o de {plugin} concluÃ­da com sucesso!*',
    'wizard.choice_prompt': 'Escolha uma das opÃ§Ãµes abaixo:\n{choices}',
    'wizard.boolean_prompt': '*[1]* âœ… Sim (Ativado)\n*[2]* âŒ NÃ£o (Desativado)\n\nðŸ‘‰ Responda com *1* (Sim) ou *2* (NÃ£o)',
    'wizard.select_field_title': 'ðŸ§™â€â™‚ï¸ *CONFIGURAÃ‡ÃƒO: {plugin}*\n\nEscolha qual etapa vocÃª deseja alterar:\n\n',
    'wizard.select_field_footer': '*[T]* ðŸ”„ *Reconfigurar Todas as Etapas*\n*[X]* âŒ *Cancelar e Fechar*\n\nðŸ‘‰ Responda com o *NÃšMERO* da etapa que deseja alterar.',
    'wizard.select_field_invalid': 'âš ï¸ OpÃ§Ã£o invÃ¡lida. Escolha o nÃºmero da etapa (1 a {max}), *T* para todas ou *X* para cancelar.',
    'wizard.summary_single': 'ðŸ“‹ *ConfiguraÃ§Ã£o atualizada com sucesso:*',
    'wizard.summary_all': 'ðŸ“‹ *Resumo das configuraÃ§Ãµes salvas:*',
    'wizard.tip_keep': 'ðŸ’¡ *Dica:* Envie *.* (ponto) para MANTER o valor atual.',
    'wizard.tip_default': 'ðŸ“Œ *Valor padrÃ£o:* `{default}`\nðŸ’¡ *Dica:* Envie *.* (ponto) para USAR o valor padrÃ£o.',
    'wizard.cancel_hint': 'âŒ Envie *X* a qualquer momento para cancelar.',
    'wizard.out_of_range': 'âš ï¸ Valor fora do intervalo permitido{range}. Tente novamente.',
    'wizard.session_expired': '⏱️ *Sessão expirada!* O menu de configuração ficou inativo por muito tempo e foi encerrado. Use o comando novamente quando quiser configurar.',
    'wizard.focus_switch_prompt': '⚠️ Você está com uma configuração ativa em andamento (*{module}*).\n\nDeseja cancelar ou continuar?\n• Digite *X* para cancelar e fechar\n• Digite *1* para continuar configurando',
    'wizard.hermes_focus_detected': '⚠️ @{user}, notei que você me chamou, mas você ainda está com o menu de *{module}* aberto!\n\nDeseja cancelar a configuração ou continuar de onde parou?\n• Digite *X* para cancelar o menu e liberar a conversa\n• Digite *1* para continuar configurando',
    'wizard.cancelled': '✅ *Configuração cancelada com sucesso.* Menu fechado!',
    'wizard.continued': '👍 *Continuando configuração...*',

    // Calendar & Agendamentos
    'calendar.added': '📅 *Evento agendado com sucesso!*\n\n📌 *Data/Hora:* {date} às {time}\n📝 *Compromisso:* {text}\n🆔 *ID:* #{id}',
    'calendar.list_title': '📅 *CALENDÁRIO DE AGENDAMENTOS DO GRUPO*',
    'calendar.list_empty': '📅 Nenhum agendamento ou evento marcado no calendário.\n\n💡 Para agendar, use:\n{prefix}agenda add DD/MM HH:MM Mensagem do evento',
    'calendar.item': '🔹 *[#{id}]* 🗓️ {date} às {time} — {text}',
    'calendar.deleted': '🗑️ *Agendamento #{id} removido do calendário.*',
    'calendar.not_found': '⚠️ Agendamento #{id} não encontrado no calendário.',
    'calendar.cleared': '🧹 *Todos os agendamentos do calendário foram removidos.*',
    'calendar.invalid_format': '⚠️ Formato inválido.\nUse: {prefix}agenda add DD/MM HH:MM Sua mensagem aqui\nExemplo: {prefix}agenda add 28/10 20:00 Aula ao vivo da mentoria',
    'calendar.event_announcement': '📅 *[LEMBRETE DA AGENDA / EVENTO]*\n\n⏰ *Horário:* {time}\n📌 *Compromisso:* {text}',

    // Hermes IA
    'hermes.on_ok': 'ðŸ¤– *Hermes IA:* ATIVADO com sucesso!\nðŸŽ­ *Personalidade:* `{personality}`\nðŸ§  *MemÃ³ria Local:* `{memory}`\n\nðŸ‘‰ Para conversar, envie *@hermes*, chame por *hermes* ou responda a qualquer mensagem minha!',
    'hermes.off_ok': 'ðŸ›‘ *Hermes IA:* DESATIVADO neste grupo.\nAs configuraÃ§Ãµes foram preservadas.',
    'hermes.cleared': 'ðŸ§¹ *MemÃ³ria limpa:* O histÃ³rico de contexto deste grupo foi zerado.',
    'hermes.status': 'ðŸ¤– *STATUS DO HERMES IA*\n\nðŸŸ¢ *Estado no grupo:* {state}\nðŸŽ­ *Personalidade:* `{personality}`\nðŸ§  *Buffer de MemÃ³ria:* {count} mensagens registradas\nðŸ”Œ *Provedor:* DeepSeek Oficial (`{model}`)\nðŸ”‘ *Chave de API:* {key}',
    'hermes.status_off_hint': 'DESATIVADO (use {prefix}hermes on)',
    'hermes.key_ok': 'âœ… Configurada (.env)',
    'hermes.key_missing_short': 'âŒ NÃ£o configurada (.env)',
    'hermes.status_nokey': 'âš ï¸ *AtenÃ§Ã£o:* Configure `AI_API_KEY` no arquivo `.env` para ativar as respostas.',
    'hermes.status_tip': 'ðŸ’¡ *Dica:* Envie *{prefix}hermes on* para ativar ou fale diretamente comigo no chat!',
    'hermes.disabled_hint': 'âš ï¸ O Hermes IA estÃ¡ desativado neste grupo.\nðŸ‘‰ PeÃ§a a um administrador para ativar enviando: *{prefix}hermes on*',
    'hermes.disabled_called': 'ðŸ¤– *Hermes IA estÃ¡ desativado neste grupo.*\n\nðŸ‘‰ Para ativÃ¡-lo, um administrador deve enviar:\n*{prefix}hermes on* (ou *{prefix}ia on*)',
    'hermes.usage_hint': 'ðŸ‘‰ Para falar comigo, mencione *@hermes*, digite *hermes [pergunta]* ou use *{prefix}hermes status*.',
    'hermes.key_missing': 'âš ï¸ *Hermes IA:* A chave da DeepSeek nÃ£o foi detectada no arquivo `.env` (`AI_API_KEY`).\n\nðŸ‘‰ Adicione sua chave em `AI_API_KEY=sk-...` no `.env` e reinicie a aplicaÃ§Ã£o na hospedagem.',
    'hermes.greeting_formal': 'OlÃ¡! Como posso ajudar vocÃª ou o grupo agora?',
    'hermes.greeting_casual': 'E aÃ­! Fala comigo, como posso ajudar?',
    'hermes.quota': 'Muitos pedidos Ã  IA nesta hora. Use os comandos com prefixo por enquanto ou tente mais tarde.',
    'hermes.degraded': 'âš ï¸ _Modo texto: nÃ£o consigo executar aÃ§Ãµes agora._',
    'hermes.unclear': 'NÃ£o consegui entender direito o pedido. Pode reformular?',
    'hermes.tool_failed': 'NÃ£o consegui executar essa aÃ§Ã£o agora.',
    'hermes.msg_not_found': 'NÃ£o encontrei essa mensagem no histÃ³rico recente.',
    'hermes.oscillation': 'Tive uma oscilaÃ§Ã£o momentÃ¢nea na conexÃ£o com minha IA. Tente novamente em alguns instantes!',
    'hermes.need_explicit_target': 'âš ï¸ Para remover alguÃ©m, marque a pessoa (@) ou responda Ã  mensagem dela com o pedido.'
  },

  es: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': 'âœ… Â¡OperaciÃ³n realizada con Ã©xito!',
    'common.error': 'âŒ OcurriÃ³ un error al ejecutar este comando.',
    'common.no_permission_admin': 'âš ï¸ Este comando es exclusivo para Administradores del grupo.',
    'common.no_permission_owner': 'â›” Este comando estÃ¡ restringido al DueÃ±o del bot.',
    'common.bot_not_admin': 'âš ï¸ El bot necesita ser Administrador del grupo para realizar esta acciÃ³n.',
    'common.group_only': 'â„¹ï¸ Este comando solo se puede usar dentro de grupos.',
    'common.private_disabled': 'ðŸ”‡ Los comandos en privado estÃ¡n deshabilitados en este momento.',
    'common.not_found_target': 'âš ï¸ Usuario no identificado. Menciona a alguien, responde a un mensaje o escribe el nÃºmero.',
    'common.invalid_args': 'âš ï¸ Argumentos invÃ¡lidos. Comprueba la sintaxis correcta.',
    'common.enabled': 'ACTIVADO',
    'common.disabled': 'DESACTIVADO',
    'common.saved': 'ðŸ’¾ Â¡ConfiguraciÃ³n guardada con Ã©xito!',
    'common.canceled': 'âŒ OperaciÃ³n cancelada.',
    'common.yes': 'SÃ­',
    'common.no': 'No',
    'common.days': 'dÃ­as',
    'common.lifetime': 'Vitalicio',
    'common.mention_greeting': 'ðŸ¤– *Hermes Bot*\nðŸ“Œ *Prefijo actual:* `{prefix}`\nðŸ‘‰ Â¡EnvÃ­a *{prefix}menu* o *@bot menu* para abrir el panel de configuraciones y comandos!',

    // LicenÃ§a / SaaS
    'saas.group_not_active': 'â›” Este grupo no tiene una licencia activa del bot.',
    'saas.inactive_group_hint': 'âš ï¸ *Grupo No Activado*\nEl bot estÃ¡ conectado al grupo, pero aÃºn no ha sido activado.\n\nðŸ‘‰ Para activar el bot en este grupo, escribe:\n*{prefix}bot on* (o *{prefix}activar*)',
    'saas.license_expired': 'âš ï¸ *LICENCIA EXPIRADA*\nLa licencia de este grupo ha expirado. Contacta al soporte/dueÃ±o para renovar el acceso.',
    'saas.activated': 'ðŸŽ‰ *Â¡GRUPO ACTIVADO CON Ã‰XITO!*\nValidez: *{expiry}*\nConfiguraciones anteriores restauradas.',
    'saas.days_added': 'ðŸ“… Se han aÃ±adido *{days} dÃ­as* a la licencia de este grupo.\nNueva validez: *{expiry}*.',
    'saas.deactivated': 'ðŸ›‘ *BOT DESACTIVADO EN ESTE GRUPO*\nEl bot pausÃ³ sus actividades aquÃ­. Las configuraciones se han conservado.',
    'saas.status': 'ðŸ“Š *ESTADO DE LA LICENCIA DEL GRUPO*\nðŸ·ï¸ *ID:* `{id}`\nðŸŸ¢ *Estado:* {status}\nâ³ *Validez:* {expiry}\nâš™ï¸ *MÃ³dulos activos:* {modules}',
    'saas.list_header': 'ðŸ“‹ *GRUPOS REGISTRADOS EN EL SISTEMA:*',
    'saas.list_item': 'â–«ï¸ {name} (`{id}`): *{status}* | Restan: *{remaining}*',
    'saas.list_empty': 'NingÃºn grupo registrado por el momento.',
    'saas.pv_on': 'ðŸ”“ Las respuestas a comandos en privado (DM) han sido *ACTIVADAS* para todos.',
    'saas.pv_off': 'ðŸ”’ Las respuestas a comandos en privado (DM) han sido *DESACTIVADAS* (Modo Anti-Ban: solo el DueÃ±o puede usar en privado).',

    // Bloquear Grupos
    'bangroup.banned': 'ðŸ›‘ *GRUPO BLOQUEADO CON Ã‰XITO*\nEl grupo `{id}` ha sido bloqueado. El bot estÃ¡ 100% mudo e invisible en este grupo.\n\nðŸ’¡ Para revertir: `/desbanirgrupo {id}`',
    'bangroup.unbanned': 'ðŸŸ¢ *GRUPO DESBLOQUEADO CON Ã‰XITO*\nEl grupo `{id}` ha sido desbloqueado y el bot vuelve a estar activo.',
    'bangroup.already_banned': 'âš ï¸ Este grupo ya se encuentra en la lista de grupos bloqueados.',
    'bangroup.not_banned': 'âš ï¸ Este grupo no estÃ¡ bloqueado.',
    'bangroup.list_title': 'ðŸ›‘ *GRUPOS BLOQUEADOS DEL BOT:*',
    'bangroup.list_empty': 'NingÃºn grupo estÃ¡ bloqueado en este momento.',

    // Reload
    'reload.success': 'ðŸ”„ *Â¡HOT-RELOAD COMPLETADO!*\nTodos los plugins, esquemas y traducciones se recargaron con Ã©xito en tiempo real.',
    'reload.error': 'âŒ Error al recargar mÃ³dulos: {error}',

    // Painel !config
    'config.panel_title': 'âš™ï¸ *PANEL DE CONFIGURACIONES - HERMES*',
    'config.panel_desc': 'Responde con el *NÃšMERO* del mÃ³dulo para activar/desactivar o configurar:\nO escribe:\nâ€¢ *[P] [nuevo_prefijo]* para cambiar el prefijo (Ej: P /)\nâ€¢ *[L]* para cambiar el idioma\nâ€¢ *[X]* para borrar y cerrar el menÃº',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': 'âœ… Prefijo de este grupo cambiado con Ã©xito a: *{prefix}*',
    'config.invalid_option': 'âš ï¸ OpciÃ³n invÃ¡lida. Elige un nÃºmero del menÃº o [X] para cerrar.',
    'config.module_toggled_on': 'ðŸŸ¢ *{module}* fue *ACTIVADO* en el grupo.',
    'config.module_toggled_off': 'ðŸ”´ *{module}* fue *DESACTIVADO* en el grupo.',

    // Idioma (!idioma)
    'lang.prompt': 'ðŸŒ *SELECCIÃ“N DE IDIOMA*\nElige el idioma del grupo:\n[1] ðŸ‡§ðŸ‡· PortuguÃªs\n[2] ðŸ‡ªðŸ‡¸ EspaÃ±ol\n[3] ðŸ‡ºðŸ‡¸ English\n\nResponde con 1, 2 o 3.',
    'lang.changed': 'ðŸŒ Idioma del grupo cambiado a: *EspaÃ±ol*.',
    'lang.invalid': 'âš ï¸ Idioma invÃ¡lido. Usa: !idioma pt, !idioma es o !idioma en.',
    'lang.invalid_option': 'âš ï¸ OpciÃ³n invÃ¡lida.\nElige *1* (PortuguÃªs), *2* (EspaÃ±ol), *3* (English) o envÃ­a *X* para cancelar.',

    // AntiLink
    'antilink.detected': 'ðŸš« @{user}, Â¡los enlaces no estÃ¡n permitidos en este grupo!',
    'antilink.warned': 'ðŸš« @{user} enviÃ³ un enlace no autorizado y recibiÃ³ una advertencia ({warns}/{max}).',
    'antilink.banned': 'ðŸš« @{user} fue expulsado por enviar enlaces no autorizados.',
    'antilink.status': 'ðŸ›¡ï¸ *AntiLink:* {status}\nðŸŒ *Dominios permitidos:* {domains}\nâš¡ *AcciÃ³n:* {action}',

    // Welcome
    'welcome.default': 'ðŸ‘‹ Hola @{user}, Â¡bienvenido(a) a *{group}*!\n\nðŸ“‹ *DescripciÃ³n:* {desc}',
    'welcome.status': 'ðŸ‘‹ *Bienvenida:* {status}\nâ±ï¸ *Auto-borrado:* {time}',

    // Warn
    'warn.added': 'âš ï¸ @{user} recibiÃ³ una advertencia.\nMotivo: *{reason}*\nAdvertencias: *{warns}/{max}*',
    'warn.max_reached': 'ðŸš« @{user} alcanzÃ³ el lÃ­mite de advertencias ({max}/{max}) y fue expulsado del grupo.',
    'warn.removed': 'âœ… Se eliminÃ³ una advertencia de @{user}. Advertencias actuales: *{warns}/{max}*.',
    'warn.list_title': 'ðŸ“‹ *MIEMBROS ADVERTIDOS EN EL GRUPO:*',
    'warn.list_empty': 'NingÃºn miembro tiene advertencias activas en este grupo.',
    'warn.list_item': 'â–«ï¸ @{user}: *{count}* advertencia(s)',
    'warn.cannot_warn_admin': 'âš ï¸ No estÃ¡ permitido aplicar advertencias a administradores.',

    // AntiFlood
    'antiflood.flood_detected': 'âš ï¸ @{user}, Â¡no envÃ­es mensajes tan rÃ¡pido!',
    'antiflood.trava_detected': 'âš ï¸ @{user}, Â¡los mensajes excesivamente largos estÃ¡n prohibidos!',
    'antiflood.banned_flood': 'ðŸš« @{user} fue expulsado por enviar demasiados mensajes en poco tiempo.',
    'antiflood.banned_trava': 'ðŸš« @{user} fue expulsado por enviar un mensaje excesivamente largo.',
    'antiflood.status': 'ðŸŒŠ *AntiFlood:* {status}\nâš¡ *MÃ¡x Msgs:* {msgs}/5s | *MÃ¡x Caracteres:* {chars}\nâš¡ *AcciÃ³n:* {action}',

    // AntiFake
    'antifake.detected': 'ðŸš« @{user}, los nÃºmeros con este prefijo de paÃ­s no estÃ¡n permitidos en este grupo.',
    'antifake.status': 'ðŸŽ­ *AntiFake:* {status}\nðŸŒ *Prefijos permitidos:* {ddis}',

    // Schedule
    'schedule.closed': 'ðŸ”’ *GRUPO CERRADO*\nEl grupo fue cerrado automÃ¡ticamente segÃºn el horario programado.',
    'schedule.opened': 'ðŸ”“ *GRUPO ABIERTO*\nEl grupo fue abierto automÃ¡ticamente segÃºn el horario programado.',
    'schedule.status': 'â° *Horarios AutomÃ¡ticos:* {status}\nðŸ”’ Cerrar: *{close}* | ðŸ”“ Abrir: *{open}*',

    // AutoMsg
    'automsg.status': 'ðŸ“¢ *AutoMsg:* {status}\nâ±ï¸ *Intervalo:* cada {interval}\nðŸ’¬ *Mensaje:* {msg}',

    // Ban
    'ban.cannot_ban_admin': 'âš ï¸ No estÃ¡ permitido expulsar administradores del grupo.',
    'ban.cannot_ban_owner': 'âš ï¸ No estÃ¡ permitido expulsar al DueÃ±o del bot.',
    'ban.cannot_ban_bot': 'âš ï¸ No puedo expulsarme a mÃ­ mismo.',
    'ban.success': 'ðŸ‘‹ El usuario @{user} fue expulsado del grupo.',

    // Mute
    'mute.closed': 'ðŸ”’ El grupo fue *CERRADO* por un administrador. Solo los admins pueden enviar mensajes.',
    'mute.opened': 'ðŸ”“ El grupo fue *ABIERTO* por un administrador. Todos los miembros pueden enviar mensajes.',
    'mute.prompt': 'â“ Â¿QuÃ© deseas hacer?\n[1] Cerrar el grupo ahora\n[2] Abrir el grupo ahora\n\nResponde con 1 o 2.',

    // Hidetag
    'hidetag.empty': 'âš ï¸ Escribe el mensaje que deseas enviar a todos o responde a un mensaje.',

    // Promote / Demote
    'promote.already_admin': 'âš ï¸ Este miembro ya es un administrador.',
    'promote.success': 'â¬†ï¸ Â¡@{user} ahora es un *Administrador* del grupo!',
    'demote.already_member': 'âš ï¸ Este usuario no es un administrador.',
    'demote.cannot_demote_owner': 'âš ï¸ El DueÃ±o supremo no puede ser degradado.',
    'demote.success': 'â¬‡ï¸ @{user} fue degradado a miembro comÃºn.',

    // Clear
    'clear.reply_required': 'âš ï¸ Responde al mensaje que deseas eliminar con el comando.',
    'clear.success': 'ðŸ—‘ï¸ Mensaje eliminado con Ã©xito.',

    // Blacklist
    'blacklist.added': 'â›” @{user} fue aÃ±adido a la Lista Negra del grupo y expulsado.',
    'blacklist.added_global': 'â›” @{user} fue aÃ±adido a la Lista Negra GLOBAL de todos los grupos.',
    'blacklist.removed': 'âœ… @{user} fue eliminado de la Lista Negra del grupo.',
    'blacklist.removed_global': 'âœ… @{user} fue eliminado de la Lista Negra GLOBAL.',
    'blacklist.list_title': 'ðŸ“‹ *LISTA NEGRA DEL GRUPO:*',
    'blacklist.list_empty': 'La lista negra de este grupo estÃ¡ vacÃ­a.',
    'blacklist.banned_entry': 'â›” @{user} estÃ¡ en la Lista Negra y fue expulsado automÃ¡ticamente.',

    // Raffle
    'raffle.not_enough': 'âš ï¸ No hay suficientes participantes en el grupo para realizar el sorteo.',
    'raffle.title': 'ðŸŽ‰ *RESULTADO DEL SORTEO* ðŸŽ‰',
    'raffle.prize': 'ðŸŽ *Premio:* {prize}',
    'raffle.winners': 'ðŸ† *Ganador(es):*\n{winners}',

    // Ping
    'ping.title': 'ðŸ“ *Â¡PONG! ESTADO DEL SISTEMA*',
    'ping.latency': 'âš¡ *Latencia:* `{latency}ms`',
    'ping.uptime': 'â±ï¸ *Tiempo en lÃ­nea:* `{uptime}`',
    'ping.ram': 'ðŸ’¾ *Consumo RAM:* `{ram} MB`',
    'ping.lang': 'ðŸŒ *Idioma:* `{lang}`',
    'ping.antiban': 'ðŸ›¡ï¸ *Modo Sigiloso / Anti-Ban:* `ACTIVO (Presencia Furtiva + Jitter + Delay Humano)`',
    'ping.license': 'ðŸ“… *Licencia del Grupo:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': 'ðŸ§™â€â™‚ï¸ *CONFIGURACIÃ“N: {plugin}* (Paso {step}/{total})',
    'wizard.current_val': 'ðŸ“Œ *Valor actual:* `{current}`',
    'wizard.invalid_input': 'âš ï¸ Respuesta invÃ¡lida. Por favor, lee la pregunta e intÃ©ntalo de nuevo.',
    'wizard.finished': 'ðŸŽ‰ *Â¡ConfiguraciÃ³n de {plugin} finalizada con Ã©xito!*',
    'wizard.choice_prompt': 'Elige una de las siguientes opciones:\n{choices}',
    'wizard.boolean_prompt': '*[1]* âœ… SÃ­ (Activado)\n*[2]* âŒ No (Desactivado)\n\nðŸ‘‰ Responde con *1* (SÃ­) o *2* (No)',
    'wizard.select_field_title': 'ðŸ§™â€â™‚ï¸ *CONFIGURACIÃ“N: {plugin}*\n\nElige quÃ© paso deseas modificar:\n\n',
    'wizard.select_field_footer': '*[T]* ðŸ”„ *Reconfigurar Todos los Pasos*\n*[X]* âŒ *Cancelar y Cerrar*\n\nðŸ‘‰ Responde con el *NÃšMERO* del paso que deseas modificar.',
    'wizard.select_field_invalid': 'âš ï¸ OpciÃ³n invÃ¡lida. Elige el nÃºmero del paso (1 a {max}), *T* para todos o *X* para cancelar.',
    'wizard.summary_single': 'ðŸ“‹ *ConfiguraciÃ³n actualizada con Ã©xito:*',
    'wizard.summary_all': 'ðŸ“‹ *Resumen de configuraciones guardadas:*',
    'wizard.tip_keep': 'ðŸ’¡ *Consejo:* EnvÃ­a *.* (punto) para MANTENER el valor actual.',
    'wizard.tip_default': 'ðŸ“Œ *Valor predeterminado:* `{default}`\nðŸ’¡ *Consejo:* EnvÃ­a *.* (punto) para USAR el valor predeterminado.',
    'wizard.cancel_hint': 'âŒ EnvÃ­a *X* en cualquier momento para cancelar.',
    'wizard.out_of_range': 'âš ï¸ Valor fuera del rango permitido{range}. IntÃ©ntalo de nuevo.',

    // Hermes IA
    'hermes.on_ok': 'ðŸ¤– *Hermes IA:* Â¡ACTIVADO con Ã©xito!\nðŸŽ­ *Personalidad:* `{personality}`\nðŸ§  *Memoria Local:* `{memory}`\n\nðŸ‘‰ Para conversar, envÃ­a *@hermes*, llama por *hermes* o responde a cualquier mensaje mÃ­o.',
    'hermes.off_ok': 'ðŸ›‘ *Hermes IA:* DESACTIVADO en este grupo.\nLas configuraciones fueron preservadas.',
    'hermes.cleared': 'ðŸ§¹ *Memoria limpia:* El historial de contexto de este grupo fue reiniciado.',
    'hermes.status': 'ðŸ¤– *ESTADO DE HERMES IA*\n\nðŸŸ¢ *Estado en el grupo:* {state}\nðŸŽ­ *Personalidad:* `{personality}`\nðŸ§  *Buffer de Memoria:* {count} mensajes registrados\nðŸ”Œ *Proveedor:* DeepSeek Oficial (`{model}`)\nðŸ”‘ *Clave de API:* {key}',
    'hermes.status_off_hint': 'DESACTIVADO (usa {prefix}hermes on)',
    'hermes.key_ok': 'âœ… Configurada (.env)',
    'hermes.key_missing_short': 'âŒ No configurada (.env)',
    'hermes.status_nokey': 'âš ï¸ *AtenciÃ³n:* Configura `AI_API_KEY` en el archivo `.env` para activar las respuestas.',
    'hermes.status_tip': 'ðŸ’¡ *Consejo:* Â¡EnvÃ­a *{prefix}hermes on* para activar o hÃ¡blame directamente en el chat!',
    'hermes.disabled_hint': 'âš ï¸ Hermes IA estÃ¡ desactivado en este grupo.\nðŸ‘‰ Pide a un administrador que lo active enviando: *{prefix}hermes on*',
    'hermes.disabled_called': 'ðŸ¤– *Hermes IA estÃ¡ desactivado en este grupo.*\n\nðŸ‘‰ Para activarlo, un administrador debe enviar:\n*{prefix}hermes on* (o *{prefix}ia on*)',
    'hermes.usage_hint': 'ðŸ‘‰ Para hablar conmigo, menciona *@hermes*, escribe *hermes [pregunta]* o usa *{prefix}hermes status*.',
    'hermes.key_missing': 'âš ï¸ *Hermes IA:* No se detectÃ³ la clave de DeepSeek en el archivo `.env` (`AI_API_KEY`).\n\nðŸ‘‰ Agrega tu clave en `AI_API_KEY=sk-...` en el `.env` y reinicia la aplicaciÃ³n.',
    'hermes.greeting_formal': 'Â¡Hola! Â¿CÃ³mo puedo ayudarte a ti o al grupo ahora?',
    'hermes.greeting_casual': 'Â¡Hola! Dime, Â¿en quÃ© te ayudo?',
    'hermes.quota': 'Demasiadas solicitudes a la IA en esta hora. Usa los comandos con prefijo por ahora o intenta mÃ¡s tarde.',
    'hermes.degraded': 'âš ï¸ _Modo texto: no puedo ejecutar acciones ahora._',
    'hermes.unclear': 'No logrÃ© entender bien el pedido. Â¿Puedes reformularlo?',
    'hermes.tool_failed': 'No pude ejecutar esa acciÃ³n ahora.',
    'hermes.msg_not_found': 'No encontrÃ© ese mensaje en el historial reciente.',
    'hermes.oscillation': 'Tuve una oscilaciÃ³n momentÃ¡nea en la conexiÃ³n con mi IA. Â¡IntÃ©ntalo de nuevo en unos instantes!',
    'hermes.need_explicit_target': 'âš ï¸ Para expulsar a alguien, menciona a la persona (@) o responde a su mensaje con la orden.'
  },

  en: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': 'âœ… Operation completed successfully!',
    'common.error': 'âŒ An error occurred while executing this command.',
    'common.no_permission_admin': 'âš ï¸ This command is exclusive to Group Admins.',
    'common.no_permission_owner': 'â›” This command is restricted to the Bot Owner.',
    'common.bot_not_admin': 'âš ï¸ The bot must be a Group Admin to perform this action.',
    'common.group_only': 'â„¹ï¸ This command can only be used inside groups.',
    'common.private_disabled': 'ðŸ”‡ Private (DM) commands are currently disabled.',
    'common.not_found_target': 'âš ï¸ User not identified. Mention someone, reply to a message, or type the number.',
    'common.invalid_args': 'âš ï¸ Invalid arguments. Please check the correct syntax.',
    'common.enabled': 'ENABLED',
    'common.disabled': 'DISABLED',
    'common.saved': 'ðŸ’¾ Settings saved successfully!',
    'common.canceled': 'âŒ Operation canceled.',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.days': 'days',
    'common.lifetime': 'Lifetime',
    'common.mention_greeting': 'ðŸ¤– *Hermes Bot*\nðŸ“Œ *Current prefix:* `{prefix}`\nðŸ‘‰ Send *{prefix}menu* or *@bot menu* to open the settings and commands panel!',

    // LicenÃ§a / SaaS
    'saas.group_not_active': 'â›” This group does not have an active bot license.',
    'saas.inactive_group_hint': 'âš ï¸ *Group Not Activated*\nThe bot is in the group, but has not been activated yet.\n\nðŸ‘‰ To activate the bot in this group, type:\n*{prefix}bot on* (or *{prefix}activate*)',
    'saas.license_expired': 'âš ï¸ *LICENSE EXPIRED*\nThis group\'s license has expired. Please contact support/owner to renew access.',
    'saas.activated': 'ðŸŽ‰ *GROUP ACTIVATED SUCCESSFULLY!*\nExpires: *{expiry}*\nPrevious settings restored.',
    'saas.days_added': 'ðŸ“… Added *{days} days* to this group\'s license.\nNew expiry: *{expiry}*.',
    'saas.deactivated': 'ðŸ›‘ *BOT DEACTIVATED IN THIS GROUP*\nThe bot paused its activities here. Configurations have been preserved.',
    'saas.status': 'ðŸ“Š *GROUP LICENSE STATUS*\nðŸ·ï¸ *ID:* `{id}`\nðŸŸ¢ *Status:* {status}\nâ³ *Expires:* {expiry}\nâš™ï¸ *Active modules:* {modules}',
    'saas.list_header': 'ðŸ“‹ *GROUPS REGISTERED IN THE SYSTEM:*',
    'saas.list_item': 'â–«ï¸ {name} (`{id}`): *{status}* | Remaining: *{remaining}*',
    'saas.list_empty': 'No groups registered at the moment.',
    'saas.pv_on': 'ðŸ”“ Private commands (DM) are now *ENABLED* for everyone.',
    'saas.pv_off': 'ðŸ”’ Private commands (DM) are now *DISABLED* (Anti-Ban mode: only Owner can use in DM).',

    // Ban Groups
    'bangroup.banned': 'ðŸ›‘ *GROUP BANNED SUCCESSFULLY*\nThe group `{id}` has been banned. The bot is 100% mute and invisible in this group.\n\nðŸ’¡ To revert: `/unbangroup {id}`',
    'bangroup.unbanned': 'ðŸŸ¢ *GROUP UNBANNED SUCCESSFULLY*\nThe group `{id}` has been unbanned and the bot is active again.',
    'bangroup.already_banned': 'âš ï¸ This group is already banned.',
    'bangroup.not_banned': 'âš ï¸ This group is not banned.',
    'bangroup.list_title': 'ðŸ›‘ *BANNED GROUPS:*',
    'bangroup.list_empty': 'No groups are currently banned.',

    // Reload
    'reload.success': 'ðŸ”„ *HOT-RELOAD COMPLETED!*\nAll plugins, schemas, and translations were reloaded in real time.',
    'reload.error': 'âŒ Error reloading modules: {error}',

    // Painel !config
    'config.panel_title': 'âš™ï¸ *SETTINGS PANEL - HERMES*',
    'config.panel_desc': 'Reply with the module *NUMBER* to toggle or configure:\nOr type:\nâ€¢ *[P] [new_prefix]* to change prefix (e.g., P /)\nâ€¢ *[L]* to change language\nâ€¢ *[X]* to delete and close the menu',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': 'âœ… This group\'s prefix has been successfully changed to: *{prefix}*',
    'config.invalid_option': 'âš ï¸ Invalid option. Choose a number from the menu or [X] to close.',
    'config.module_toggled_on': 'ðŸŸ¢ *{module}* has been *ENABLED* in the group.',
    'config.module_toggled_off': 'ðŸ”´ *{module}* has been *DISABLED* in the group.',

    // Idioma (!idioma)
    'lang.prompt': 'ðŸŒ *LANGUAGE SELECTION*\nChoose group language:\n[1] ðŸ‡§ðŸ‡· PortuguÃªs\n[2] ðŸ‡ªðŸ‡¸ EspaÃ±ol\n[3] ðŸ‡ºðŸ‡¸ English\n\nReply with 1, 2, or 3.',
    'lang.changed': 'ðŸŒ Group language changed to: *English*.',
    'lang.invalid': 'âš ï¸ Invalid language. Use: !idioma pt, !idioma es, or !idioma en.',
    'lang.invalid_option': 'âš ï¸ Invalid option.\nChoose *1* (PortuguÃªs), *2* (EspaÃ±ol), *3* (English) or send *X* to cancel.',

    // AntiLink
    'antilink.detected': 'ðŸš« @{user}, links are not allowed in this group!',
    'antilink.warned': 'ðŸš« @{user} sent an unauthorized link and received a warning ({warns}/{max}).',
    'antilink.banned': 'ðŸš« @{user} was banned for sending unauthorized links.',
    'antilink.status': 'ðŸ›¡ï¸ *AntiLink:* {status}\nðŸŒ *Allowed domains:* {domains}\nâš¡ *Action:* {action}',

    // Welcome
    'welcome.default': 'ðŸ‘‹ Hello @{user}, welcome to *{group}*!\n\nðŸ“‹ *Description:* {desc}',
    'welcome.status': 'ðŸ‘‹ *Welcome:* {status}\nâ±ï¸ *Auto-delete:* {time}',

    // Warn
    'warn.added': 'âš ï¸ @{user} received a warning.\nReason: *{reason}*\nWarnings: *{warns}/{max}*',
    'warn.max_reached': 'ðŸš« @{user} reached the warning limit ({max}/{max}) and was removed from the group.',
    'warn.removed': 'âœ… One warning removed from @{user}. Current warnings: *{warns}/{max}*.',
    'warn.list_title': 'ðŸ“‹ *WARNED MEMBERS IN GROUP:*',
    'warn.list_empty': 'No members have active warnings in this group.',
    'warn.list_item': 'â–«ï¸ @{user}: *{count}* warning(s)',
    'warn.cannot_warn_admin': 'âš ï¸ Warnings cannot be applied to group administrators.',

    // AntiFlood
    'antiflood.flood_detected': 'âš ï¸ @{user}, please do not send repeated messages so quickly!',
    'antiflood.trava_detected': 'âš ï¸ @{user}, excessively long messages are prohibited!',
    'antiflood.banned_flood': 'ðŸš« @{user} was banned for sending too many messages too quickly (flood).',
    'antiflood.banned_trava': 'ðŸš« @{user} was banned for sending an excessively long message.',
    'antiflood.status': 'ðŸŒŠ *AntiFlood:* {status}\nâš¡ *Max Msgs:* {msgs}/5s | *Max Chars:* {chars}\nâš¡ *Action:* {action}',

    // AntiFake
    'antifake.detected': 'ðŸš« @{user}, numbers with this country calling code are not allowed in this group.',
    'antifake.status': 'ðŸŽ­ *AntiFake:* {status}\nðŸŒ *Allowed country codes:* {ddis}',

    // Schedule
    'schedule.closed': 'ðŸ”’ *GROUP CLOSED*\nThe group was automatically closed according to the schedule.',
    'schedule.opened': 'ðŸ”“ *GROUP OPENED*\nThe group was automatically opened according to the schedule.',
    'schedule.status': 'â° *Automated Schedule:* {status}\nðŸ”’ Close: *{close}* | ðŸ”“ Open: *{open}*',

    // AutoMsg
    'automsg.status': 'ðŸ“¢ *AutoMsg:* {status}\nâ±ï¸ *Interval:* every {interval}\nðŸ’¬ *Message:* {msg}',

    // Ban
    'ban.cannot_ban_admin': 'âš ï¸ You cannot ban group administrators.',
    'ban.cannot_ban_owner': 'âš ï¸ You cannot ban the Bot Owner.',
    'ban.cannot_ban_bot': 'âš ï¸ I cannot ban myself.',
    'ban.success': 'ðŸ‘‹ User @{user} was removed from the group.',

    // Mute
    'mute.closed': 'ðŸ”’ The group was *CLOSED* by an administrator. Only admins can send messages.',
    'mute.opened': 'ðŸ”“ The group was *OPENED* by an administrator. All members can send messages.',
    'mute.prompt': 'â“ What would you like to do?\n[1] Close group now\n[2] Open group now\n\nReply with 1 or 2.',

    // Hidetag
    'hidetag.empty': 'âš ï¸ Enter the announcement you want to send or reply to a message.',

    // Promote / Demote
    'promote.already_admin': 'âš ï¸ This member is already an administrator.',
    'promote.success': 'â¬†ï¸ @{user} is now a Group *Administrator*!',
    'demote.already_member': 'âš ï¸ This user is not an administrator.',
    'demote.cannot_demote_owner': 'âš ï¸ The Supreme Owner cannot be demoted.',
    'demote.success': 'â¬‡ï¸ @{user} was demoted to regular member.',

    // Clear
    'clear.reply_required': 'âš ï¸ Reply to the message you want to delete with this command.',
    'clear.success': 'ðŸ—‘ï¸ Message deleted successfully.',

    // Blacklist
    'blacklist.added': 'â›” @{user} was added to the group Blacklist and removed.',
    'blacklist.added_global': 'â›” @{user} was added to the GLOBAL Blacklist for all groups.',
    'blacklist.removed': 'âœ… @{user} was removed from the group Blacklist.',
    'blacklist.removed_global': 'âœ… @{user} was removed from the GLOBAL Blacklist.',
    'blacklist.list_title': 'ðŸ“‹ *GROUP BLACKLIST:*',
    'blacklist.list_empty': 'The blacklist for this group is empty.',
    'blacklist.banned_entry': 'â›” @{user} is on the Blacklist and was automatically removed.',

    // Raffle
    'raffle.not_enough': 'âš ï¸ There are not enough participants in the group to hold a raffle.',
    'raffle.title': 'ðŸŽ‰ *RAFFLE RESULTS* ðŸŽ‰',
    'raffle.prize': 'ðŸŽ *Prize:* {prize}',
    'raffle.winners': 'ðŸ† *Winner(s):*\n{winners}',

    // Ping
    'ping.title': 'ðŸ“ *PONG! SYSTEM STATUS*',
    'ping.latency': 'âš¡ *Latency:* `{latency}ms`',
    'ping.uptime': 'â±ï¸ *Uptime:* `{uptime}`',
    'ping.ram': 'ðŸ’¾ *RAM Usage:* `{ram} MB`',
    'ping.lang': 'ðŸŒ *Language:* `{lang}`',
    'ping.antiban': 'ðŸ›¡ï¸ *Stealth Mode / Anti-Ban:* `ACTIVE (Stealth Presence + Jitter + Human Delay)`',
    'ping.license': 'ðŸ“… *Group License:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': 'ðŸ§™â€â™‚ï¸ *CONFIGURATION: {plugin}* (Step {step}/{total})',
    'wizard.current_val': 'ðŸ“Œ *Current value:* `{current}`',
    'wizard.invalid_input': 'âš ï¸ Invalid response. Please read the prompt and try again.',
    'wizard.finished': 'ðŸŽ‰ *Configuration for {plugin} completed successfully!*',
    'wizard.choice_prompt': 'Choose one of the options below:\n{choices}',
    'wizard.boolean_prompt': '*[1]* âœ… Yes (Enabled)\n*[2]* âŒ No (Disabled)\n\nðŸ‘‰ Reply with *1* (Yes) or *2* (No)',
    'wizard.select_field_title': 'ðŸ§™â€â™‚ï¸ *CONFIGURATION: {plugin}*\n\nChoose which step you want to edit:\n\n',
    'wizard.select_field_footer': '*[T]* ðŸ”„ *Reconfigure All Steps*\n*[X]* âŒ *Cancel and Close*\n\nðŸ‘‰ Reply with the *NUMBER* of the step you want to edit.',
    'wizard.select_field_invalid': 'âš ï¸ Invalid option. Choose the step number (1 to {max}), *T* for all, or *X* to cancel.',
    'wizard.summary_single': 'ðŸ“‹ *Configuration updated successfully:*',
    'wizard.summary_all': 'ðŸ“‹ *Saved settings summary:*',
    'wizard.tip_keep': 'ðŸ’¡ *Tip:* Send *.* (dot) to KEEP the current value.',
    'wizard.tip_default': 'ðŸ“Œ *Default value:* `{default}`\nðŸ’¡ *Tip:* Send *.* (dot) to USE the default value.',
    'wizard.cancel_hint': 'âŒ Send *X* at any time to cancel.',
    'wizard.out_of_range': 'âš ï¸ Value out of allowed range{range}. Please try again.',
    'wizard.session_expired': '⏱️ *Session expired!* The configuration menu was inactive for too long and was closed. Use the command again whenever you want to configure.',
    'wizard.focus_switch_prompt': '⚠️ You have an active configuration session in progress (*{module}*).\n\nDo you want to cancel or continue?\n• Type *X* to cancel and exit\n• Type *1* to continue configuring',
    'wizard.hermes_focus_detected': '⚠️ @{user}, I noticed you called me, but you still have the *{module}* menu open.\n\nDo you want to cancel the configuration or continue where you left off?\n• Type *X* to cancel the menu\n• Type *1* to continue configuring',
    'wizard.cancelled': '✅ *Configuration successfully cancelled.* Menu closed!',
    'wizard.continued': '👍 *Continuing configuration...*',

    // Calendar & Agendamentos
    'calendar.added': '📅 *Event scheduled successfully!*\n\n📌 *Date/Time:* {date} at {time}\n📝 *Event:* {text}\n🆔 *ID:* #{id}',
    'calendar.list_title': '📅 *GROUP CALENDAR & SCHEDULED EVENTS*',
    'calendar.list_empty': '📅 No scheduled events in the calendar.\n\n💡 To schedule, use:\n{prefix}agenda add DD/MM HH:MM Event announcement text',
    'calendar.item': '🔹 *[#{id}]* 🗓️ {date} at {time} — {text}',
    'calendar.deleted': '🗑️ *Scheduled event #{id} removed from calendar.*',
    'calendar.not_found': '⚠️ Event #{id} not found in the calendar.',
    'calendar.cleared': '🧹 *All scheduled calendar events have been cleared.*',
    'calendar.invalid_format': '⚠️ Invalid format.\nUse: {prefix}agenda add DD/MM HH:MM Your announcement message here\nExample: {prefix}agenda add 28/10 20:00 Live mentoring call',
    'calendar.event_announcement': '📅 *[CALENDAR REMINDER / EVENT]*\n\n⏰ *Time:* {time}\n📌 *Event:* {text}',

    // Hermes IA
    'hermes.on_ok': 'ðŸ¤– *Hermes AI:* ENABLED successfully!\nðŸŽ­ *Personality:* `{personality}`\nðŸ§  *Local Memory:* `{memory}`\n\nðŸ‘‰ To chat, send *@hermes*, call *hermes* or reply to any of my messages!',
    'hermes.off_ok': 'ðŸ›‘ *Hermes AI:* DISABLED in this group.\nSettings were preserved.',
    'hermes.cleared': 'ðŸ§¹ *Memory cleared:* This group\'s context history was reset.',
    'hermes.status': 'ðŸ¤– *HERMES AI STATUS*\n\nðŸŸ¢ *Group state:* {state}\nðŸŽ­ *Personality:* `{personality}`\nðŸ§  *Memory Buffer:* {count} messages stored\nðŸ”Œ *Provider:* Official DeepSeek (`{model}`)\nðŸ”‘ *API Key:* {key}',
    'hermes.status_off_hint': 'DISABLED (use {prefix}hermes on)',
    'hermes.key_ok': 'âœ… Configured (.env)',
    'hermes.key_missing_short': 'âŒ Not configured (.env)',
    'hermes.status_nokey': 'âš ï¸ *Warning:* Set `AI_API_KEY` in the `.env` file to enable replies.',
    'hermes.status_tip': 'ðŸ’¡ *Tip:* Send *{prefix}hermes on* to enable, or talk to me directly in the chat!',
    'hermes.disabled_hint': 'âš ï¸ Hermes AI is disabled in this group.\nðŸ‘‰ Ask an admin to enable it by sending: *{prefix}hermes on*',
    'hermes.disabled_called': 'ðŸ¤– *Hermes AI is disabled in this group.*\n\nðŸ‘‰ To enable it, an admin must send:\n*{prefix}hermes on* (or *{prefix}ia on*)',
    'hermes.usage_hint': 'ðŸ‘‰ To talk to me, mention *@hermes*, type *hermes [question]* or use *{prefix}hermes status*.',
    'hermes.key_missing': 'âš ï¸ *Hermes AI:* The DeepSeek key was not found in the `.env` file (`AI_API_KEY`).\n\nðŸ‘‰ Add your key as `AI_API_KEY=sk-...` in `.env` and restart the application.',
    'hermes.greeting_formal': 'Hello! How can I help you or the group right now?',
    'hermes.greeting_casual': 'Hey! Tell me, how can I help?',
    'hermes.quota': 'Too many AI requests this hour. Use prefix commands for now or try again later.',
    'hermes.degraded': 'âš ï¸ _Text mode: I can\'t run actions right now._',
    'hermes.unclear': 'I couldn\'t quite understand the request. Could you rephrase it?',
    'hermes.tool_failed': 'I couldn\'t run that action right now.',
    'hermes.msg_not_found': 'I couldn\'t find that message in the recent history.',
    'hermes.oscillation': 'I had a brief glitch connecting to my AI. Please try again in a moment!',
    'hermes.need_explicit_target': 'âš ï¸ To remove someone, tag the person (@) or reply to their message with the request.'
  }
};

/**
 * Traduz uma chave para o idioma especificado com suporte a interpolaÃ§Ã£o {variavel}
 * Fallback automÃ¡tico para PortuguÃªs (pt) se a chave nÃ£o existir no idioma alvo.
 * @param {string} lang Idioma ('pt', 'es', 'en')
 * @param {string} key Chave no formato 'categoria.item'
 * @param {object} vars VariÃ¡veis para interpolaÃ§Ã£o
 * @returns {string}
 */
function t(lang = 'pt', key = '', vars = {}) {
  const targetLang = (lang || 'pt').toLowerCase();
  const dict = dictionaries[targetLang] || dictionaries.pt;
  
  let text = dict[key] || dictionaries.pt[key] || key;

  // SubstituiÃ§Ã£o de placeholders dinÃ¢micos: {variavel}
  if (vars && typeof vars === 'object') {
    for (const [varKey, varValue] of Object.entries(vars)) {
      const regex = new RegExp(`\\{${varKey}\\}`, 'g');
      text = text.replace(regex, String(varValue !== undefined && varValue !== null ? varValue : ''));
    }
  }

  return text;
}

/**
 * Resolve textos dinÃ¢micos de schemas ou escolhas com suporte a multilÃ­ngue
 * Se o objeto for { pt: '...', es: '...', en: '...' }, retorna a string do idioma.
 * Se for uma string direta, retorna a prÃ³pria string.
 * @param {string|object} fieldOrChoice 
 * @param {string} lang 
 * @returns {string}
 */
function resolveSchemaText(fieldOrChoice, lang = 'pt') {
  if (!fieldOrChoice) return '';
  if (typeof fieldOrChoice === 'string') return fieldOrChoice;

  if (typeof fieldOrChoice === 'object') {
    const targetLang = (lang || 'pt').toLowerCase();
    return fieldOrChoice[targetLang] || fieldOrChoice.pt || fieldOrChoice.en || fieldOrChoice.es || '';
  }

  return String(fieldOrChoice);
}

module.exports = {
  t,
  resolveSchemaText,
  dictionaries
};
