const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');

module.exports = {
  name: 'automsg',
  aliases: ['automsg', 'anuncio', 'lembrete', 'recordatorio', 'autoannounce', 'timermsg'],
  description: 'Mensagens e anúncios periódicos inteligentes (só envia se houver movimento)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Mensagens Automáticas Periódicas',
      es: 'Mensajes Automáticos Periódicos',
      en: 'Periodic Automated Messages'
    },
    description: {
      pt: 'Envia avisos e anúncios em intervalos regulares sem floodar grupos parados',
      es: 'Envía avisos y anuncios en intervalos regulares sin saturar grupos inactivos',
      en: 'Sends announcements at regular intervals without spamming inactive groups'
    },
    fields: [
      {
        name: 'message',
        type: 'string',
        question: {
          pt: 'Digite o texto do comunicado/anúncio periódico:',
          es: 'Escribe el texto del comunicado/anuncio periódico:',
          en: 'Enter the periodic announcement text:'
        },
        default: '📢 *Comunicado Importante:* Fiquem atentos às regras do grupo!'
      },
      {
        name: 'intervalMinutes',
        type: 'number',
        question: {
          pt: 'Qual o intervalo em minutos entre cada envio? (Ex: 180 para 3 horas):',
          es: '¿Cuál es el intervalo en minutos entre cada envío? (Ej: 180 para 3 horas):',
          en: 'What is the interval in minutes between messages? (e.g. 180 for 3 hours):'
        },
        default: 180,
        min: 15,
        max: 1440
      },
      {
        name: 'onlyIfActive',
        type: 'boolean',
        question: {
          pt: 'Enviar apenas se tiver havido movimentação de membros desde o último aviso?',
          es: '¿Enviar solo si hubo actividad de miembros desde el último aviso?',
          en: 'Only send if there was member activity since the last announcement?'
        },
        default: true
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'automsg') || {};

    // Digitar /automsg sem argumentos (ou /automsg config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'automsg', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
      }
      const minutes = cfg.intervalMinutes || 180;
      const alertMsg = cfg.message || 'Nenhuma mensagem configurada';
      return reply(`${t('common.saved')}\n📢 *AutoMsg:* ATIVADO\n⏱️ *Intervalo:* a cada ${minutes} min\n💬 *Mensagem:* ${alertMsg}`);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'automsg', false);
      return reply(t('common.saved') + '\n📢 *AutoMsg:* DESATIVADO');
    }

    // Configuração direta: /automsg 120 <texto...> (primeiro arg é um número)
    const parsedMinutes = parseInt(sub, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes >= 5) {
      const customText = args.slice(1).join(' ').trim();
      if (!customText) {
        configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, enabled: true });
        return reply(`💾 *AutoMsg atualizado:* Intervalo alterado para *${parsedMinutes} minutos*.`);
      }
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, message: customText, enabled: true });
      return reply(`💾 *AutoMsg atualizado e ATIVADO!*\n⏱️ *Intervalo:* a cada ${parsedMinutes} minutos\n💬 *Mensagem:*\n${customText}`);
    }

    // Configuração direta de tempo: /automsg tempo 60
    if (['tempo', 'intervalo', 'minutos', 'min'].includes(sub)) {
      const minutesArg = parseInt(args[1], 10);
      if (isNaN(minutesArg) || minutesArg < 5) {
        return reply('⚠️ Digite um intervalo válido em minutos (mínimo 5). Ex: `/automsg tempo 60`');
      }
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: minutesArg, enabled: true });
      return reply(`💾 *AutoMsg atualizado:* Intervalo definido para a cada *${minutesArg} minutos*.`);
    }

    // Configuração direta de texto: /automsg texto <texto...>
    if (['texto', 'msg', 'mensagem'].includes(sub)) {
      const customText = args.slice(1).join(' ').trim();
      if (!customText) {
        return reply('⚠️ Digite o texto do anúncio. Ex: `/automsg texto Sejam todos bem-vindos!`');
      }
      configManager.updatePluginConfig(from, 'automsg', { message: customText, enabled: true });
      return reply(`💾 *AutoMsg atualizado!*\n💬 *Novo texto:*\n${customText}`);
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    const status = configManager.isPluginEnabled(from, 'automsg') ? t('common.enabled') : t('common.disabled');
    const minutes = cfg.intervalMinutes || 180;
    const alertMsg = cfg.message || 'Nenhuma mensagem configurada';

    let help = t('automsg.status', { status, minutes, msg: alertMsg });
    help += `\n\n💡 *Comandos Diretos:*\n• \`/automsg on\` ou \`/automsg off\`\n• \`/automsg 120 [texto]\` (define tempo e texto direto)\n• \`/automsg tempo 60\` (define minutos)\n• \`/automsg texto [mensagem]\` (define texto)\n• \`/automsg config\` (abre wizard)`;
    return reply(help);
  }
};
