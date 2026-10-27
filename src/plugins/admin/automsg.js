const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { sendSafeMessage } = require('../../utils/antiBan');
const { parseHumanDuration, formatHumanDuration } = wizardEngine;

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
        type: 'choice',
        question: {
          pt: 'Qual o intervalo de tempo entre cada envio do comunicado?',
          es: '¿Cuál es el intervalo de tiempo entre cada envío del comunicado?',
          en: 'What is the time interval between announcement messages?'
        },
        choices: [
          { value: 60, label: { pt: '1 hora', es: '1 hora', en: '1 hour' } },
          { value: 120, label: { pt: '2 horas', es: '2 horas', en: '2 hours' } },
          { value: 180, label: { pt: '3 horas (Recomendado)', es: '3 horas (Recomendado)', en: '3 hours (Recommended)' } },
          { value: 360, label: { pt: '6 horas', es: '6 horas', en: '6 hours' } },
          { value: 720, label: { pt: '12 horas', es: '12 horas', en: '12 hours' } },
          { value: 1440, label: { pt: '24 horas (1 dia)', es: '24 horas (1 día)', en: '24 hours (1 day)' } }
        ],
        unit: 'minutes',
        default: 180
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

  /**
   * Hook de execução periódica chamado a cada minuto pelo scheduler
   */
  async onSchedule({ sock, groupJid, group, config, queueTask, lastAutoMsgTimes }) {
    const automsgCfg = config;
    if (!automsgCfg || !automsgCfg.enabled || !automsgCfg.message) return;

    const intervalMs = (automsgCfg.intervalMinutes || 180) * 60 * 1000;
    const lastSent = lastAutoMsgTimes.get(groupJid) || automsgCfg.lastSent || 0;

    if (lastSent === 0) {
      // Primeiro boot: inicializa o marco temporal para aguardar o intervalo completo antes de disparar
      lastAutoMsgTimes.set(groupJid, Date.now());
      configManager.updatePluginConfig(groupJid, 'automsg', { lastSent: Date.now() });
    } else {
      const timeSinceLast = Date.now() - lastSent;

      if (timeSinceLast >= intervalMs) {
        const lastActivity = group.lastActivity || 0;
        const onlyIfActive = automsgCfg.onlyIfActive !== false;

        // Se onlyIfActive estiver ativado, só envia se houver atividade desde o último envio
        if (!onlyIfActive || lastActivity > lastSent) {
          queueTask({
            type: 'automsg',
            groupJid,
            run: async () => {
              lastAutoMsgTimes.set(groupJid, Date.now());
              configManager.updatePluginConfig(groupJid, 'automsg', { lastSent: Date.now() });
              await sendSafeMessage(sock, groupJid, { text: automsgCfg.message });
            }
          });
        }
      }
    }
  },

  async execute({ sock, msg, from, sender, args, reply, t, lang, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'automsg') || {};
    const groupLang = lang || configManager.getGroupLang(from);

    // Digitar /automsg sem argumentos (ou /automsg config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'automsg', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
      }
      return reply(t('config.module_toggled_on', { module: 'AUTOMSG' }));
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'automsg', false);
      return reply(t('config.module_toggled_off', { module: 'AUTOMSG' }));
    }

    // Configuração direta: /automsg 3h <texto...> ou /automsg 120 <texto...> (primeiro arg é tempo/número)
    const durSub = parseHumanDuration(sub);
    const parsedMinutes = durSub ? durSub.totalMinutes : parseInt(sub, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes >= 5) {
      const customText = args.slice(1).join(' ').trim();
      const formattedTime = formatHumanDuration(parsedMinutes, 'minutes', groupLang);
      if (!customText) {
        configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, enabled: true });
        return reply(`💾 *AutoMsg atualizado:* Intervalo alterado para *a cada ${formattedTime}*.`);
      }
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, message: customText, enabled: true });
      return reply(`💾 *AutoMsg atualizado e ATIVADO!*\n⏱️ *Intervalo:* a cada ${formattedTime}\n💬 *Mensagem:*\n${customText}`);
    }

    // Configuração direta de tempo: /automsg tempo 3h ou /automsg tempo 60
    if (['tempo', 'intervalo', 'minutos', 'min', 'horas', 'hora'].includes(sub)) {
      const rawArg = args.slice(1).join(' ').trim();
      const dur = parseHumanDuration(rawArg);
      const minutesArg = dur ? dur.totalMinutes : parseInt(rawArg, 10);
      if (isNaN(minutesArg) || minutesArg < 5) {
        return reply('⚠️ Digite um intervalo válido. Ex: `/automsg tempo 3h` (3 horas) ou `/automsg tempo 30m` (30 minutos)');
      }
      const formattedTime = formatHumanDuration(minutesArg, 'minutes', groupLang);
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: minutesArg, enabled: true });
      return reply(`💾 *AutoMsg atualizado:* Intervalo definido para *a cada ${formattedTime}*.`);
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

    const status = configManager.isPluginEnabled(from, 'automsg') ? t('common.enabled') : t('common.disabled');
    const minutes = cfg.intervalMinutes || 180;
    const formattedInterval = formatHumanDuration(minutes, 'minutes', groupLang);
    const alertMsg = cfg.message || 'Nenhuma mensagem configurada';

    let help = `${t('automsg.status', { status, interval: formattedInterval })}\n💬 *Mensagem atual:*\n${alertMsg}`;
    help += `\n\n💡 *Comandos Diretos:*\n• \`/automsg on\` ou \`/automsg off\`\n• \`/automsg 3h [seu texto aqui]\` (define intervalo e mensagem direto)\n• \`/automsg tempo 2h\` (ou \`/automsg tempo 30m\`)\n• \`/automsg texto [seu texto]\` (atualiza apenas a mensagem)\n• \`/automsg config\` (abre assistente interativo)`;
    return reply(help);
  }
};
