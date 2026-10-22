const wizardEngine = require('../../core/wizardEngine');

function getHelpMenu(p, lang) {
  if (lang === 'pt') {
    return `🤖 *HERMES BOT - GUIA DE COMANDOS DIRETOS*
📌 *Prefixo atual:* \`${p}\` | 🌐 *Idioma:* \`Português\`

🛡️ *MODERAÇÃO & PROTEÇÃO:*
• *${p}adv @membro [motivo]* - Aplica advertência (3/3 = ban)
• *${p}adv del @membro* - Remove 1 advertência
• *${p}adv lista* - Lista membros advertidos
• *${p}adv max [qtd]* - Define limite de advertências (Ex: ${p}adv max 3)
• *${p}adv zerar @membro* - Zera advertências do membro
• *${p}ban @membro* - Expulsa membro imediatamente
• *${p}apagar* (respondendo) - Apaga a mensagem respondida do chat
• *${p}antilink on / off* - Liga/desliga filtro de links
• *${p}antilink ban / del / adv* - Define punição direta
• *${p}antilink permitir site.com* - Permite sites na whitelist
• *${p}antiflood on / off* - Liga/desliga anti-spam e trava
• *${p}antiflood [msgs] [carac]* - Define limites (Ex: ${p}antiflood 5 2000)
• *${p}antifake on / off* - Bloqueia números estrangeiros
• *${p}antifake 55 351* - Define DDIs autorizados
• *${p}listanegra add @membro* - Adiciona à lista negra
• *${p}listanegra del @membro* - Remove da lista negra

⏰ *AUTOMAÇÃO & ROTINA:*
• *${p}fechar* ou *${p}mutar* - Fecha o grupo para membros
• *${p}abrir* ou *${p}desmutar* - Abre o grupo para todos
• *${p}horarios [fechar] [abrir]* - Programa horários (Ex: ${p}horarios 23:00 07:00)
• *${p}horarios on / off* - Liga/desliga agendamento
• *${p}automsg [minutos] [texto]* - Comunicado periódico (Ex: ${p}automsg 120 Atenção!)
• *${p}automsg on / off* - Liga/desliga mensagem periódica
• *${p}bemvindo [texto]* - Boas-vindas com foto do grupo (Ex: ${p}bemvindo Olá {user}!)
• *${p}bemvindo tempo [seg]* - Auto-delete da mensagem (Ex: ${p}bemvindo tempo 15)
• *${p}bemvindo on / off* - Liga/desliga boas-vindas

👥 *UTILITÁRIOS & ADMINISTRAÇÃO:*
• *${p}marcar [aviso]* - Marca todos os membros de forma oculta
• *${p}promover @membro* - Torna o membro administrador
• *${p}rebaixar @membro* - Rebaixa administrador a membro comum
• *${p}sortear [qtd] [prêmio]* - Realiza sorteio rápido entre membros
• *${p}ping* - Latência, RAM, tempo online e licença
• *${p}idioma pt / es / en* - Altera idioma do grupo
• *${p}painel* - Abre o painel interativo (digite X para apagar e fechar)`;
  }
  if (lang === 'es') {
    return `🤖 *HERMES BOT - GUÍA DE COMANDOS DIRECTOS*
📌 *Prefijo actual:* \`${p}\` | 🌐 *Idioma:* \`Español\`

🛡️ *MODERACIÓN & PROTECCIÓN:*
• *${p}adv @miembro [motivo]* - Aplica advertencia (3/3 = ban)
• *${p}adv del @miembro* - Elimina advertencia
• *${p}adv lista* - Lista miembros con advertencias
• *${p}adv max [cant]* - Límite de advertencias (Ej: ${p}adv max 3)
• *${p}ban @miembro* - Expulsa miembro inmediatamente
• *${p}borrar* (respondiendo) - Borra mensaje del chat
• *${p}antilink on / off* - Activa/desactiva filtro de enlaces
• *${p}antilink ban / del / adv* - Configura castigo directo
• *${p}antiflood on / off* - Anti-spam y anti-trava
• *${p}antifake on / off* - Bloquea números extranjeros
• *${p}blacklist add @miembro* - Añade a la lista negra

⏰ *AUTOMATIZACIÓN & RUTINA:*
• *${p}cerrar* - Cierra el grupo inmediatamente
• *${p}abrir* - Abre el grupo inmediatamente
• *${p}horarios [cerrar] [abrir]* - Programa horarios (Ej: ${p}horarios 23:00 07:00)
• *${p}automsg [minutos] [texto]* - Mensaje periódico
• *${p}bienvenida [texto]* - Mensaje de bienvenida con foto del grupo

👥 *ADMINISTRACIÓN & GESTIÓN:*
• *${p}marcar [aviso]* - Menciona a todos en el grupo
• *${p}promover @miembro* - Hace admin al miembro
• *${p}demote @miembro* - Quita admin al miembro
• *${p}sorteo [cant] [premio]* - Sorteo rápido
• *${p}ping* - Estado, latencia y licencia
• *${p}idioma [pt/es/en]* - Cambia el idioma
• *${p}panel* - Abre el panel interactivo (escribe X para borrar y cerrar)`;
  }
  return `🤖 *HERMES BOT - DIRECT COMMANDS GUIDE*
📌 *Current prefix:* \`${p}\` | 🌐 *Language:* \`English\`

🛡️ *MODERATION & PROTECTION:*
• *${p}warn @member [reason]* - Issues a warning (3/3 = ban)
• *${p}warn del @member* - Removes a warning
• *${p}warn list* - Lists warned members
• *${p}warn max [count]* - Sets max warnings (e.g. ${p}warn max 3)
• *${p}ban @member* - Immediately removes member
• *${p}del* (replying) - Deletes message from chat
• *${p}antilink on / off* - Toggles link filter
• *${p}antilink ban / del / warn* - Sets link action
• *${p}antiflood on / off* - Toggles anti-spam & anti-crash
• *${p}antifake on / off* - Blocks foreign numbers
• *${p}blacklist add @member* - Adds to blacklist

⏰ *AUTOMATION & ROUTINE:*
• *${p}mute* - Closes group to members
• *${p}unmute* - Opens group to all
• *${p}schedule [close] [open]* - Daily schedule (e.g. ${p}schedule 23:00 07:00)
• *${p}automsg [minutes] [text]* - Periodic announcement
• *${p}welcome [text]* - Custom welcome with group photo

👥 *ADMINISTRATION & UTILITIES:*
• *${p}hidetag [announcement]* - Mentions all members
• *${p}promote @member* - Makes member an admin
• *${p}demote @member* - Demotes admin to member
• *${p}raffle [count] [prize]* - Quick member giveaway
• *${p}ping* - Latency, RAM, uptime and license
• *${p}lang [pt/es/en]* - Changes group language
• *${p}config* - Opens interactive panel (type X to delete and close)`;
}

module.exports = {
  name: 'config',
  aliases: ['config', 'painel', 'panel', 'settings', 'menu', 'cfg', 'wizard', 'ajuda', 'help', 'comandos'],
  description: 'Painel Interativo de Configurações ou Guia Completo de Comandos',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, command, prefix, lang, reply, t, isGroup }) {
    if (!isGroup) {
      return reply(t('common.group_only'));
    }

    const cmd = (command || '').toLowerCase();
    const isMenuOrHelp = ['menu', 'ajuda', 'help', 'comandos'].includes(cmd);

    if (isMenuOrHelp) {
      const helpText = getHelpMenu(prefix || '/', lang || 'pt');
      return reply(helpText);
    }

    // Se chamado como !config, !painel, !settings, !wizard -> abre painel interativo
    await wizardEngine.startConfigPanel(sock, msg, from, sender);
  }
};
