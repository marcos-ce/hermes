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

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'automsg', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
      }
      return reply(t('common.saved') + '\n📢 *AutoMsg:* ATIVADO');
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'automsg', false);
      return reply(t('common.saved') + '\n📢 *AutoMsg:* DESATIVADO');
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    const status = configManager.isPluginEnabled(from, 'automsg') ? t('common.enabled') : t('common.disabled');
    const minutes = cfg.intervalMinutes || 180;
    const alertMsg = cfg.message || 'Nenhuma mensagem configurada';

    return reply(t('automsg.status', { status, minutes, msg: alertMsg }));
  }
};
