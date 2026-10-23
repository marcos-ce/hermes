/**
 * Sistema de Internacionalização Nativa (i18n)
 * Suporte completo a Português (pt), Espanhol (es) e Inglês (en)
 * Sem placeholders ou omissões de tradução.
 */

const dictionaries = {
  pt: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': '✅ Operação realizada com sucesso!',
    'common.error': '❌ Ocorreu um erro ao executar este comando.',
    'common.no_permission_admin': '⚠️ Este comando é exclusivo para Administradores do grupo.',
    'common.no_permission_owner': '⛔ Este comando é restrito ao Dono do bot.',
    'common.bot_not_admin': '⚠️ O bot precisa ser Administrador do grupo para executar esta ação.',
    'common.group_only': 'ℹ️ Este comando só pode ser utilizado dentro de grupos.',
    'common.private_disabled': '🔇 Comandos no privado estão desativados no momento.',
    'common.not_found_target': '⚠️ Usuário não identificado. Mencione alguém, responda a uma mensagem ou digite o número.',
    'common.invalid_args': '⚠️ Argumentos inválidos. Verifique a sintaxe correta.',
    'common.enabled': 'ATIVADO',
    'common.disabled': 'DESATIVADO',
    'common.saved': '💾 Configurações salvas com sucesso!',
    'common.canceled': '❌ Operação cancelada.',
    'common.yes': 'Sim',
    'common.no': 'Não',
    'common.days': 'dias',
    'common.lifetime': 'Vitalício',

    // Licença / SaaS
    'saas.group_not_active': '⛔ Este grupo não possui uma licença ativa do bot.',
    'saas.license_expired': '⚠️ *LICENÇA EXPIRADA*\nA licença deste grupo expirou. Entre em contato com o suporte/dono para renovar o acesso.',
    'saas.activated': '🎉 *GRUPO ATIVADO COM SUCESSO!*\nValidade: *{expiry}*\nConfigs anteriores restauradas.',
    'saas.days_added': '📅 Foram adicionados *{days} dias* à licença deste grupo.\nNova validade: *{expiry}*.',
    'saas.deactivated': '🛑 *BOT DESATIVADO NESTE GRUPO*\nO bot pausou suas atividades aqui. As configurações foram preservadas.',
    'saas.status': '📊 *STATUS DA LICENÇA DO GRUPO*\n🏷️ *ID:* `{id}`\n🟢 *Estado:* {status}\n⏳ *Validade:* {expiry}\n⚙️ *Módulos ativos:* {modules}',
    'saas.list_header': '📋 *GRUPOS CADASTRADOS NO SISTEMA:*',
    'saas.list_item': '▫️ {name} (`{id}`): *{status}* | Restam: *{remaining}*',
    'saas.list_empty': 'Nenhum grupo cadastrado no momento.',
    'saas.pv_on': '🔓 Respostas a comandos no privado (DM) foram *ATIVADAS* para todos.',
    'saas.pv_off': '🔒 Respostas a comandos no privado (DM) foram *DESATIVADAS* (Modo Anti-Ban ativado: apenas o Dono pode usar no PV).',

    // Banir Grupos
    'bangroup.banned': '🛑 *GRUPO BANIDO COM SUCESSO*\nO grupo `{id}` foi banido. O bot está 100% mudo e invisível neste grupo.\n\n💡 Para reverter: `/desbanirgrupo {id}`',
    'bangroup.unbanned': '🟢 *GRUPO DESBANIDO COM SUCESSO*\nO grupo `{id}` foi desbanido e o bot voltou a reconhecer o grupo.',
    'bangroup.already_banned': '⚠️ Este grupo já está na lista de grupos banidos.',
    'bangroup.not_banned': '⚠️ Este grupo não está banido.',
    'bangroup.list_title': '🛑 *GRUPOS BANIDOS DO BOT:*',
    'bangroup.list_empty': 'Nenhum grupo está banido no momento.',

    // Reload
    'reload.success': '🔄 *HOT-RELOAD CONCLUÍDO!*\nTodos os plugins, schemas e traduções foram recarregados com sucesso em tempo real.',
    'reload.error': '❌ Erro ao recarregar módulos: {error}',

    // Painel !config
    'config.panel_title': '⚙️ *PAINEL DE CONFIGURAÇÕES - HERMES*',
    'config.panel_desc': 'Responda com o *NÚMERO* do módulo para ativar/desativar ou configurar:\nOu digite:\n• *[P] [novo_prefixo]* para trocar o prefixo (Ex: P /)\n• *[L]* para trocar o idioma\n• *[X]* para apagar e fechar o menu',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': '✅ Prefixo deste grupo alterado com sucesso para: *{prefix}*',
    'config.invalid_option': '⚠️ Opção inválida. Escolha um número do menu ou [X] para fechar.',

    // Idioma (!idioma)
    'lang.prompt': '🌐 *SELEÇÃO DE IDIOMA*\nEscolha o idioma do grupo:\n[1] 🇧🇷 Português\n[2] 🇪🇸 Español\n[3] 🇺🇸 English\n\nResponda com 1, 2 ou 3.',
    'lang.changed': '🌐 Idioma do grupo alterado para: *Português (Brasil)*.',
    'lang.invalid': '⚠️ Idioma inválido. Use: !idioma pt, !idioma es ou !idioma en.',

    // AntiLink
    'antilink.detected': '🚫 @{user}, links não são permitidos neste grupo!',
    'antilink.warned': '🚫 @{user} enviou um link não autorizado e recebeu uma advertência ({warns}/{max}).',
    'antilink.banned': '🚫 @{user} foi banido por enviar links não autorizados.',
    'antilink.status': '🛡️ *AntiLink:* {status}\n🌐 *Domínios permitidos:* {domains}\n⚡ *Ação:* {action}',

    // Welcome
    'welcome.default': '👋 Olá @{user}, seja muito bem-vindo(a) ao *{group}*!\n\n📋 *Descrição:* {desc}',
    'welcome.status': '👋 *Boas-Vindas:* {status}\n⏱️ *Auto-delete:* {seconds}s',

    // Warn
    'warn.added': '⚠️ @{user} recebeu uma advertência!\nMotivo: *{reason}*\nAdvertências: *{warns}/{max}*',
    'warn.max_reached': '🚫 @{user} atingiu o limite de advertências ({max}/{max}) e foi removido do grupo.',
    'warn.removed': '✅ Uma advertência foi removida de @{user}. Advertências atuais: *{warns}/{max}*.',
    'warn.list_title': '📋 *MEMBROS ADVERTIDOS NO GRUPO:*',
    'warn.list_empty': 'Nenhum membro possui advertências ativas neste grupo.',
    'warn.list_item': '▫️ @{user}: *{count}* advertência(s)',
    'warn.cannot_warn_admin': '⚠️ Não é permitido aplicar advertências a administradores.',

    // AntiFlood
    'antiflood.flood_detected': '⚠️ @{user}, não envie mensagens repetidas tão rápido!',
    'antiflood.trava_detected': '⚠️ @{user}, mensagens excessivamente longas (anti-trava) são proibidas!',
    'antiflood.banned_flood': '🚫 @{user} foi banido por envio excessivo de mensagens (flood).',
    'antiflood.banned_trava': '🚫 @{user} foi banido por enviar mensagem excessivamente longa (trava).',
    'antiflood.status': '🌊 *AntiFlood:* {status}\n⚡ *Máx Msgs:* {msgs}/5s | *Máx Caracteres:* {chars}\n⚡ *Ação:* {action}',

    // AntiFake
    'antifake.detected': '🚫 @{user}, números com este código de país (DDI) não são permitidos neste grupo.',
    'antifake.status': '🎭 *AntiFake:* {status}\n🌍 *DDIs permitidos:* {ddis}',

    // Schedule
    'schedule.closed': '🔒 *GRUPO FECHADO*\nO grupo foi fechado automaticamente conforme o horário programado.',
    'schedule.opened': '🔓 *GRUPO ABERTO*\nO grupo foi aberto automaticamente conforme o horário programado.',
    'schedule.status': '⏰ *Horários Automáticos:* {status}\n🔒 Fechar: *{close}* | 🔓 Abrir: *{open}*',

    // AutoMsg
    'automsg.status': '📢 *AutoMsg:* {status}\n⏱️ *Intervalo:* a cada {minutes} minutos\n💬 *Mensagem:* {msg}',

    // Ban
    'ban.cannot_ban_admin': '⚠️ Não é permitido banir administradores do grupo.',
    'ban.cannot_ban_owner': '⚠️ Não é permitido banir o Dono do bot.',
    'ban.cannot_ban_bot': '⚠️ Não posso banir a mim mesmo.',
    'ban.success': '👋 O usuário @{user} foi removido do grupo.',

    // Mute
    'mute.closed': '🔒 O grupo foi *FECHADO* por um administrador. Apenas admins podem enviar mensagens.',
    'mute.opened': '🔓 O grupo foi *ABERTO* por um administrador. Todos os membros podem enviar mensagens.',
    'mute.prompt': '❓ O que deseja fazer?\n[1] Fechar o grupo agora\n[2] Abrir o grupo agora\n\nResponda com 1 ou 2.',

    // Hidetag
    'hidetag.empty': '⚠️ Digite o comunicado que deseja enviar para todos ou responda a uma mensagem.',

    // Promote / Demote
    'promote.already_admin': '⚠️ Este membro já é um administrador.',
    'promote.success': '⬆️ @{user} agora é um *Administrador* do grupo!',
    'demote.already_member': '⚠️ Este usuário não é um administrador.',
    'demote.cannot_demote_owner': '⚠️ O Dono supremo não pode ser rebaixado.',
    'demote.success': '⬇️ @{user} foi rebaixado a membro comum.',

    // Clear
    'clear.reply_required': '⚠️ Responda à mensagem que você deseja apagar com o comando.',
    'clear.success': '🗑️ Mensagem apagada com sucesso.',

    // Blacklist
    'blacklist.added': '⛔ @{user} foi adicionado à Lista Negra do grupo e banido.',
    'blacklist.added_global': '⛔ @{user} foi adicionado à Lista Negra GLOBAL de todos os grupos.',
    'blacklist.removed': '✅ @{user} foi removido da Lista Negra do grupo.',
    'blacklist.removed_global': '✅ @{user} foi removido da Lista Negra GLOBAL.',
    'blacklist.list_title': '📋 *LISTA NEGRA DO GRUPO:*',
    'blacklist.list_empty': 'A lista negra deste grupo está vazia.',
    'blacklist.banned_entry': '⛔ @{user} está na Lista Negra e foi removido automaticamente.',

    // Raffle
    'raffle.not_enough': '⚠️ Não há participantes suficientes no grupo para realizar o sorteio.',
    'raffle.title': '🎉 *RESULTADO DO SORTEIO* 🎉',
    'raffle.prize': '🎁 *Prêmio:* {prize}',
    'raffle.winners': '🏆 *Ganhador(es):*\n{winners}',

    // Ping
    'ping.title': '🏓 *PONG! STATUS DO SISTEMA*',
    'ping.latency': '⚡ *Latência:* `{latency}ms`',
    'ping.uptime': '⏱️ *Uptime:* `{uptime}`',
    'ping.ram': '💾 *Consumo RAM:* `{ram} MB`',
    'ping.lang': '🌐 *Idioma:* `{lang}`',
    'ping.antiban': '🛡️ *Modo Furtivo / Anti-Ban:* `ATIVO (Presença Furtiva + Jitter + Delay Humano)`',
    'ping.license': '📅 *Licença do Grupo:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': '🧙‍♂️ *CONFIGURAÇÃO: {plugin}* (Passo {step}/{total})',
    'wizard.current_val': '📌 *Valor atual:* `{current}`',
    'wizard.invalid_input': '⚠️ Resposta inválida. Por favor, leia a pergunta e tente novamente.',
    'wizard.finished': '🎉 *Configuração de {plugin} concluída com sucesso!*',
    'wizard.choice_prompt': 'Escolha uma das opções abaixo:\n{choices}',
    'wizard.boolean_prompt': 'Responda com *Sim* ou *Não*.'
  },

  es: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': '✅ ¡Operación realizada con éxito!',
    'common.error': '❌ Ocurrió un error al ejecutar este comando.',
    'common.no_permission_admin': '⚠️ Este comando es exclusivo para Administradores del grupo.',
    'common.no_permission_owner': '⛔ Este comando está restringido al Dueño del bot.',
    'common.bot_not_admin': '⚠️ El bot necesita ser Administrador del grupo para realizar esta acción.',
    'common.group_only': 'ℹ️ Este comando solo se puede usar dentro de grupos.',
    'common.private_disabled': '🔇 Los comandos en privado están deshabilitados en este momento.',
    'common.not_found_target': '⚠️ Usuario no identificado. Menciona a alguien, responde a un mensaje o escribe el número.',
    'common.invalid_args': '⚠️ Argumentos inválidos. Comprueba la sintaxis correcta.',
    'common.enabled': 'ACTIVADO',
    'common.disabled': 'DESACTIVADO',
    'common.saved': '💾 ¡Configuración guardada con éxito!',
    'common.canceled': '❌ Operación cancelada.',
    'common.yes': 'Sí',
    'common.no': 'No',
    'common.days': 'días',
    'common.lifetime': 'Vitalicio',

    // Licença / SaaS
    'saas.group_not_active': '⛔ Este grupo no tiene una licencia activa del bot.',
    'saas.license_expired': '⚠️ *LICENCIA EXPIRADA*\nLa licencia de este grupo ha expirado. Contacta al soporte/dueño para renovar el acceso.',
    'saas.activated': '🎉 *¡GRUPO ACTIVADO CON ÉXITO!*\nValidez: *{expiry}*\nConfiguraciones anteriores restauradas.',
    'saas.days_added': '📅 Se han añadido *{days} días* a la licencia de este grupo.\nNueva validez: *{expiry}*.',
    'saas.deactivated': '🛑 *BOT DESACTIVADO EN ESTE GRUPO*\nEl bot pausó sus actividades aquí. Las configuraciones se han conservado.',
    'saas.status': '📊 *ESTADO DE LA LICENCIA DEL GRUPO*\n🏷️ *ID:* `{id}`\n🟢 *Estado:* {status}\n⏳ *Validez:* {expiry}\n⚙️ *Módulos activos:* {modules}',
    'saas.list_header': '📋 *GRUPOS REGISTRADOS EN EL SISTEMA:*',
    'saas.list_item': '▫️ {name} (`{id}`): *{status}* | Restan: *{remaining}*',
    'saas.list_empty': 'Ningún grupo registrado por el momento.',
    'saas.pv_on': '🔓 Las respuestas a comandos en privado (DM) han sido *ACTIVADAS* para todos.',
    'saas.pv_off': '🔒 Las respuestas a comandos en privado (DM) han sido *DESACTIVADAS* (Modo Anti-Ban: solo el Dueño puede usar en privado).',

    // Bloquear Grupos
    'bangroup.banned': '🛑 *GRUPO BLOQUEADO CON ÉXITO*\nEl grupo `{id}` ha sido bloqueado. El bot está 100% mudo e invisible en este grupo.\n\n💡 Para revertir: `/desbanirgrupo {id}`',
    'bangroup.unbanned': '🟢 *GRUPO DESBLOQUEADO CON ÉXITO*\nEl grupo `{id}` ha sido desbloqueado y el bot vuelve a estar activo.',
    'bangroup.already_banned': '⚠️ Este grupo ya se encuentra en la lista de grupos bloqueados.',
    'bangroup.not_banned': '⚠️ Este grupo no está bloqueado.',
    'bangroup.list_title': '🛑 *GRUPOS BLOQUEADOS DEL BOT:*',
    'bangroup.list_empty': 'Ningún grupo está bloqueado en este momento.',

    // Reload
    'reload.success': '🔄 *¡HOT-RELOAD COMPLETADO!*\nTodos los plugins, esquemas y traducciones se recargaron con éxito en tiempo real.',
    'reload.error': '❌ Error al recargar módulos: {error}',

    // Painel !config
    'config.panel_title': '⚙️ *PANEL DE CONFIGURACIONES - HERMES*',
    'config.panel_desc': 'Responde con el *NÚMERO* del módulo para activar/desactivar o configurar:\nO escribe:\n• *[P] [nuevo_prefijo]* para cambiar el prefijo (Ej: P /)\n• *[L]* para cambiar el idioma\n• *[X]* para borrar y cerrar el menú',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': '✅ Prefijo de este grupo cambiado con éxito a: *{prefix}*',
    'config.invalid_option': '⚠️ Opción inválida. Elige un número del menú o [X] para cerrar.',

    // Idioma (!idioma)
    'lang.prompt': '🌐 *SELECCIÓN DE IDIOMA*\nElige el idioma del grupo:\n[1] 🇧🇷 Português\n[2] 🇪🇸 Español\n[3] 🇺🇸 English\n\nResponde con 1, 2 o 3.',
    'lang.changed': '🌐 Idioma del grupo cambiado a: *Español*.',
    'lang.invalid': '⚠️ Idioma inválido. Usa: !idioma pt, !idioma es o !idioma en.',

    // AntiLink
    'antilink.detected': '🚫 @{user}, ¡los enlaces no están permitidos en este grupo!',
    'antilink.warned': '🚫 @{user} envió un enlace no autorizado y recibió una advertencia ({warns}/{max}).',
    'antilink.banned': '🚫 @{user} fue expulsado por enviar enlaces no autorizados.',
    'antilink.status': '🛡️ *AntiLink:* {status}\n🌐 *Dominios permitidos:* {domains}\n⚡ *Acción:* {action}',

    // Welcome
    'welcome.default': '👋 Hola @{user}, ¡bienvenido(a) a *{group}*!\n\n📋 *Descripción:* {desc}',
    'welcome.status': '👋 *Bienvenida:* {status}\n⏱️ *Auto-borrado:* {seconds}s',

    // Warn
    'warn.added': '⚠️ @{user} recibió una advertencia.\nMotivo: *{reason}*\nAdvertencias: *{warns}/{max}*',
    'warn.max_reached': '🚫 @{user} alcanzó el límite de advertencias ({max}/{max}) y fue expulsado del grupo.',
    'warn.removed': '✅ Se eliminó una advertencia de @{user}. Advertencias actuales: *{warns}/{max}*.',
    'warn.list_title': '📋 *MIEMBROS ADVERTIDOS EN EL GRUPO:*',
    'warn.list_empty': 'Ningún miembro tiene advertencias activas en este grupo.',
    'warn.list_item': '▫️ @{user}: *{count}* advertencia(s)',
    'warn.cannot_warn_admin': '⚠️ No está permitido aplicar advertencias a administradores.',

    // AntiFlood
    'antiflood.flood_detected': '⚠️ @{user}, ¡no envíes mensajes tan rápido!',
    'antiflood.trava_detected': '⚠️ @{user}, ¡los mensajes excesivamente largos están prohibidos!',
    'antiflood.banned_flood': '🚫 @{user} fue expulsado por enviar demasiados mensajes en poco tiempo.',
    'antiflood.banned_trava': '🚫 @{user} fue expulsado por enviar un mensaje excesivamente largo.',
    'antiflood.status': '🌊 *AntiFlood:* {status}\n⚡ *Máx Msgs:* {msgs}/5s | *Máx Caracteres:* {chars}\n⚡ *Acción:* {action}',

    // AntiFake
    'antifake.detected': '🚫 @{user}, los números con este prefijo de país no están permitidos en este grupo.',
    'antifake.status': '🎭 *AntiFake:* {status}\n🌍 *Prefijos permitidos:* {ddis}',

    // Schedule
    'schedule.closed': '🔒 *GRUPO CERRADO*\nEl grupo fue cerrado automáticamente según el horario programado.',
    'schedule.opened': '🔓 *GRUPO ABIERTO*\nEl grupo fue abierto automáticamente según el horario programado.',
    'schedule.status': '⏰ *Horarios Automáticos:* {status}\n🔒 Cerrar: *{close}* | 🔓 Abrir: *{open}*',

    // AutoMsg
    'automsg.status': '📢 *AutoMsg:* {status}\n⏱️ *Intervalo:* cada {minutes} minutos\n💬 *Mensaje:* {msg}',

    // Ban
    'ban.cannot_ban_admin': '⚠️ No está permitido expulsar administradores del grupo.',
    'ban.cannot_ban_owner': '⚠️ No está permitido expulsar al Dueño del bot.',
    'ban.cannot_ban_bot': '⚠️ No puedo expulsarme a mí mismo.',
    'ban.success': '👋 El usuario @{user} fue expulsado del grupo.',

    // Mute
    'mute.closed': '🔒 El grupo fue *CERRADO* por un administrador. Solo los admins pueden enviar mensajes.',
    'mute.opened': '🔓 El grupo fue *ABIERTO* por un administrador. Todos los miembros pueden enviar mensajes.',
    'mute.prompt': '❓ ¿Qué deseas hacer?\n[1] Cerrar el grupo ahora\n[2] Abrir el grupo ahora\n\nResponde con 1 o 2.',

    // Hidetag
    'hidetag.empty': '⚠️ Escribe el mensaje que deseas enviar a todos o responde a un mensaje.',

    // Promote / Demote
    'promote.already_admin': '⚠️ Este miembro ya es un administrador.',
    'promote.success': '⬆️ ¡@{user} ahora es un *Administrador* del grupo!',
    'demote.already_member': '⚠️ Este usuario no es un administrador.',
    'demote.cannot_demote_owner': '⚠️ El Dueño supremo no puede ser degradado.',
    'demote.success': '⬇️ @{user} fue degradado a miembro común.',

    // Clear
    'clear.reply_required': '⚠️ Responde al mensaje que deseas eliminar con el comando.',
    'clear.success': '🗑️ Mensaje eliminado con éxito.',

    // Blacklist
    'blacklist.added': '⛔ @{user} fue añadido a la Lista Negra del grupo y expulsado.',
    'blacklist.added_global': '⛔ @{user} fue añadido a la Lista Negra GLOBAL de todos los grupos.',
    'blacklist.removed': '✅ @{user} fue eliminado de la Lista Negra del grupo.',
    'blacklist.removed_global': '✅ @{user} fue eliminado de la Lista Negra GLOBAL.',
    'blacklist.list_title': '📋 *LISTA NEGRA DEL GRUPO:*',
    'blacklist.list_empty': 'La lista negra de este grupo está vacía.',
    'blacklist.banned_entry': '⛔ @{user} está en la Lista Negra y fue expulsado automáticamente.',

    // Raffle
    'raffle.not_enough': '⚠️ No hay suficientes participantes en el grupo para realizar el sorteo.',
    'raffle.title': '🎉 *RESULTADO DEL SORTEO* 🎉',
    'raffle.prize': '🎁 *Premio:* {prize}',
    'raffle.winners': '🏆 *Ganador(es):*\n{winners}',

    // Ping
    'ping.title': '🏓 *¡PONG! ESTADO DEL SISTEMA*',
    'ping.latency': '⚡ *Latencia:* `{latency}ms`',
    'ping.uptime': '⏱️ *Tiempo en línea:* `{uptime}`',
    'ping.ram': '💾 *Consumo RAM:* `{ram} MB`',
    'ping.lang': '🌐 *Idioma:* `{lang}`',
    'ping.antiban': '🛡️ *Modo Sigiloso / Anti-Ban:* `ACTIVO (Presencia Furtiva + Jitter + Delay Humano)`',
    'ping.license': '📅 *Licencia del Grupo:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': '🧙‍♂️ *CONFIGURACIÓN: {plugin}* (Paso {step}/{total})',
    'wizard.current_val': '📌 *Valor actual:* `{current}`',
    'wizard.invalid_input': '⚠️ Respuesta inválida. Por favor, lee la pregunta e inténtalo de nuevo.',
    'wizard.finished': '🎉 *¡Configuración de {plugin} finalizada con éxito!*',
    'wizard.choice_prompt': 'Elige una de las siguientes opciones:\n{choices}',
    'wizard.boolean_prompt': '[1] Sí (Activado)\n[2] No (Desactivado)'
  },

  en: {
    // Sistema / Geral
    'common.bot_name': 'Hermes Admin Bot',
    'common.success': '✅ Operation completed successfully!',
    'common.error': '❌ An error occurred while executing this command.',
    'common.no_permission_admin': '⚠️ This command is exclusive to Group Admins.',
    'common.no_permission_owner': '⛔ This command is restricted to the Bot Owner.',
    'common.bot_not_admin': '⚠️ The bot must be a Group Admin to perform this action.',
    'common.group_only': 'ℹ️ This command can only be used inside groups.',
    'common.private_disabled': '🔇 Private (DM) commands are currently disabled.',
    'common.not_found_target': '⚠️ User not identified. Mention someone, reply to a message, or type the number.',
    'common.invalid_args': '⚠️ Invalid arguments. Please check the correct syntax.',
    'common.enabled': 'ENABLED',
    'common.disabled': 'DISABLED',
    'common.saved': '💾 Settings saved successfully!',
    'common.canceled': '❌ Operation canceled.',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.days': 'days',
    'common.lifetime': 'Lifetime',

    // Licença / SaaS
    'saas.group_not_active': '⛔ This group does not have an active bot license.',
    'saas.license_expired': '⚠️ *LICENSE EXPIRED*\nThis group\'s license has expired. Please contact support/owner to renew access.',
    'saas.activated': '🎉 *GROUP ACTIVATED SUCCESSFULLY!*\nExpires: *{expiry}*\nPrevious settings restored.',
    'saas.days_added': '📅 Added *{days} days* to this group\'s license.\nNew expiry: *{expiry}*.',
    'saas.deactivated': '🛑 *BOT DEACTIVATED IN THIS GROUP*\nThe bot paused its activities here. Configurations have been preserved.',
    'saas.status': '📊 *GROUP LICENSE STATUS*\n🏷️ *ID:* `{id}`\n🟢 *Status:* {status}\n⏳ *Expires:* {expiry}\n⚙️ *Active modules:* {modules}',
    'saas.list_header': '📋 *GROUPS REGISTERED IN THE SYSTEM:*',
    'saas.list_item': '▫️ {name} (`{id}`): *{status}* | Remaining: *{remaining}*',
    'saas.list_empty': 'No groups registered at the moment.',
    'saas.pv_on': '🔓 Private commands (DM) are now *ENABLED* for everyone.',
    'saas.pv_off': '🔒 Private commands (DM) are now *DISABLED* (Anti-Ban mode: only Owner can use in DM).',

    // Ban Groups
    'bangroup.banned': '🛑 *GROUP BANNED SUCCESSFULLY*\nThe group `{id}` has been banned. The bot is 100% mute and invisible in this group.\n\n💡 To revert: `/unbangroup {id}`',
    'bangroup.unbanned': '🟢 *GROUP UNBANNED SUCCESSFULLY*\nThe group `{id}` has been unbanned and the bot is active again.',
    'bangroup.already_banned': '⚠️ This group is already banned.',
    'bangroup.not_banned': '⚠️ This group is not banned.',
    'bangroup.list_title': '🛑 *BANNED GROUPS:*',
    'bangroup.list_empty': 'No groups are currently banned.',

    // Reload
    'reload.success': '🔄 *HOT-RELOAD COMPLETED!*\nAll plugins, schemas, and translations were reloaded in real time.',
    'reload.error': '❌ Error reloading modules: {error}',

    // Painel !config
    'config.panel_title': '⚙️ *SETTINGS PANEL - HERMES*',
    'config.panel_desc': 'Reply with the module *NUMBER* to toggle or configure:\nOr type:\n• *[P] [new_prefix]* to change prefix (e.g., P /)\n• *[L]* to change language\n• *[X]* to delete and close the menu',
    'config.panel_item': '[{num}] {status} *{name}* - {desc}',
    'config.prefix_changed': '✅ This group\'s prefix has been successfully changed to: *{prefix}*',
    'config.invalid_option': '⚠️ Invalid option. Choose a number from the menu or [X] to close.',

    // Idioma (!idioma)
    'lang.prompt': '🌐 *LANGUAGE SELECTION*\nChoose group language:\n[1] 🇧🇷 Português\n[2] 🇪🇸 Español\n[3] 🇺🇸 English\n\nReply with 1, 2, or 3.',
    'lang.changed': '🌐 Group language changed to: *English*.',
    'lang.invalid': '⚠️ Invalid language. Use: !idioma pt, !idioma es, or !idioma en.',

    // AntiLink
    'antilink.detected': '🚫 @{user}, links are not allowed in this group!',
    'antilink.warned': '🚫 @{user} sent an unauthorized link and received a warning ({warns}/{max}).',
    'antilink.banned': '🚫 @{user} was banned for sending unauthorized links.',
    'antilink.status': '🛡️ *AntiLink:* {status}\n🌐 *Allowed domains:* {domains}\n⚡ *Action:* {action}',

    // Welcome
    'welcome.default': '👋 Hello @{user}, welcome to *{group}*!\n\n📋 *Description:* {desc}',
    'welcome.status': '👋 *Welcome:* {status}\n⏱️ *Auto-delete:* {seconds}s',

    // Warn
    'warn.added': '⚠️ @{user} received a warning.\nReason: *{reason}*\nWarnings: *{warns}/{max}*',
    'warn.max_reached': '🚫 @{user} reached the warning limit ({max}/{max}) and was removed from the group.',
    'warn.removed': '✅ One warning removed from @{user}. Current warnings: *{warns}/{max}*.',
    'warn.list_title': '📋 *WARNED MEMBERS IN GROUP:*',
    'warn.list_empty': 'No members have active warnings in this group.',
    'warn.list_item': '▫️ @{user}: *{count}* warning(s)',
    'warn.cannot_warn_admin': '⚠️ Warnings cannot be applied to group administrators.',

    // AntiFlood
    'antiflood.flood_detected': '⚠️ @{user}, please do not send repeated messages so quickly!',
    'antiflood.trava_detected': '⚠️ @{user}, excessively long messages are prohibited!',
    'antiflood.banned_flood': '🚫 @{user} was banned for sending too many messages too quickly (flood).',
    'antiflood.banned_trava': '🚫 @{user} was banned for sending an excessively long message.',
    'antiflood.status': '🌊 *AntiFlood:* {status}\n⚡ *Max Msgs:* {msgs}/5s | *Max Chars:* {chars}\n⚡ *Action:* {action}',

    // AntiFake
    'antifake.detected': '🚫 @{user}, numbers with this country calling code are not allowed in this group.',
    'antifake.status': '🎭 *AntiFake:* {status}\n🌍 *Allowed country codes:* {ddis}',

    // Schedule
    'schedule.closed': '🔒 *GROUP CLOSED*\nThe group was automatically closed according to the schedule.',
    'schedule.opened': '🔓 *GROUP OPENED*\nThe group was automatically opened according to the schedule.',
    'schedule.status': '⏰ *Automated Schedule:* {status}\n🔒 Close: *{close}* | 🔓 Open: *{open}*',

    // AutoMsg
    'automsg.status': '📢 *AutoMsg:* {status}\n⏱️ *Interval:* every {minutes} minutes\n💬 *Message:* {msg}',

    // Ban
    'ban.cannot_ban_admin': '⚠️ You cannot ban group administrators.',
    'ban.cannot_ban_owner': '⚠️ You cannot ban the Bot Owner.',
    'ban.cannot_ban_bot': '⚠️ I cannot ban myself.',
    'ban.success': '👋 User @{user} was removed from the group.',

    // Mute
    'mute.closed': '🔒 The group was *CLOSED* by an administrator. Only admins can send messages.',
    'mute.opened': '🔓 The group was *OPENED* by an administrator. All members can send messages.',
    'mute.prompt': '❓ What would you like to do?\n[1] Close group now\n[2] Open group now\n\nReply with 1 or 2.',

    // Hidetag
    'hidetag.empty': '⚠️ Enter the announcement you want to send or reply to a message.',

    // Promote / Demote
    'promote.already_admin': '⚠️ This member is already an administrator.',
    'promote.success': '⬆️ @{user} is now a Group *Administrator*!',
    'demote.already_member': '⚠️ This user is not an administrator.',
    'demote.cannot_demote_owner': '⚠️ The Supreme Owner cannot be demoted.',
    'demote.success': '⬇️ @{user} was demoted to regular member.',

    // Clear
    'clear.reply_required': '⚠️ Reply to the message you want to delete with this command.',
    'clear.success': '🗑️ Message deleted successfully.',

    // Blacklist
    'blacklist.added': '⛔ @{user} was added to the group Blacklist and removed.',
    'blacklist.added_global': '⛔ @{user} was added to the GLOBAL Blacklist for all groups.',
    'blacklist.removed': '✅ @{user} was removed from the group Blacklist.',
    'blacklist.removed_global': '✅ @{user} was removed from the GLOBAL Blacklist.',
    'blacklist.list_title': '📋 *GROUP BLACKLIST:*',
    'blacklist.list_empty': 'The blacklist for this group is empty.',
    'blacklist.banned_entry': '⛔ @{user} is on the Blacklist and was automatically removed.',

    // Raffle
    'raffle.not_enough': '⚠️ There are not enough participants in the group to hold a raffle.',
    'raffle.title': '🎉 *RAFFLE RESULTS* 🎉',
    'raffle.prize': '🎁 *Prize:* {prize}',
    'raffle.winners': '🏆 *Winner(s):*\n{winners}',

    // Ping
    'ping.title': '🏓 *PONG! SYSTEM STATUS*',
    'ping.latency': '⚡ *Latency:* `{latency}ms`',
    'ping.uptime': '⏱️ *Uptime:* `{uptime}`',
    'ping.ram': '💾 *RAM Usage:* `{ram} MB`',
    'ping.lang': '🌐 *Language:* `{lang}`',
    'ping.antiban': '🛡️ *Stealth Mode / Anti-Ban:* `ACTIVE (Stealth Presence + Jitter + Human Delay)`',
    'ping.license': '📅 *Group License:* `{expiry}`',

    // Wizard Prompts & Questions
    'wizard.step_header': '🧙‍♂️ *CONFIGURATION: {plugin}* (Step {step}/{total})',
    'wizard.current_val': '📌 *Current value:* `{current}`',
    'wizard.invalid_input': '⚠️ Invalid response. Please read the prompt and try again.',
    'wizard.finished': '🎉 *Configuration for {plugin} completed successfully!*',
    'wizard.choice_prompt': 'Choose one of the options below:\n{choices}',
    'wizard.boolean_prompt': '[1] Yes (Enabled)\n[2] No (Disabled)'
  }
};

/**
 * Traduz uma chave para o idioma especificado com suporte a interpolação {variavel}
 * Fallback automático para Português (pt) se a chave não existir no idioma alvo.
 * @param {string} lang Idioma ('pt', 'es', 'en')
 * @param {string} key Chave no formato 'categoria.item'
 * @param {object} vars Variáveis para interpolação
 * @returns {string}
 */
function t(lang = 'pt', key = '', vars = {}) {
  const targetLang = (lang || 'pt').toLowerCase();
  const dict = dictionaries[targetLang] || dictionaries.pt;
  
  let text = dict[key] || dictionaries.pt[key] || key;

  // Substituição de placeholders dinâmicos: {variavel}
  if (vars && typeof vars === 'object') {
    for (const [varKey, varValue] of Object.entries(vars)) {
      const regex = new RegExp(`\\{${varKey}\\}`, 'g');
      text = text.replace(regex, String(varValue !== undefined && varValue !== null ? varValue : ''));
    }
  }

  return text;
}

/**
 * Resolve textos dinâmicos de schemas ou escolhas com suporte a multilíngue
 * Se o objeto for { pt: '...', es: '...', en: '...' }, retorna a string do idioma.
 * Se for uma string direta, retorna a própria string.
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
