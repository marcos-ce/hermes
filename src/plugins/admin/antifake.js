const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

module.exports = {
  name: 'antifake',
  aliases: ['antifake', 'antifakes', 'ddi', 'antiddi', 'extranjeros', 'foreigners'],
  description: 'Bloqueio automático de números estrangeiros (Filtro de DDI)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 20,

  configSchema: {
    title: {
      pt: 'Filtro Anti-Fake / DDI',
      es: 'Filtro Anti-Fake / DDI',
      en: 'Anti-Fake / Country Code Filter'
    },
    description: {
      pt: 'Permite apenas a entrada de números com códigos de país autorizados',
      es: 'Permite solo la entrada de números con prefijos autorizados',
      en: 'Only allows entry of numbers with authorized country codes'
    },
    fields: [
      {
        name: 'allowedDdis',
        type: 'string_list',
        question: {
          pt: 'Digite os códigos de país (DDIs) permitidos separados por espaço (Ex: 55 351 1) ou . para padrão:',
          es: 'Escribe los prefijos de país (DDIs) permitidos separados por espacio (Ej: 55 351 1) o . para predeterminado:',
          en: 'Enter allowed country calling codes (DDIs) separated by space (e.g. 55 351 1) or . for default:'
        },
        default: ['55', '351', '1', '34', '54', '52']
      }
    ]
  },

  /**
   * Hook passivo: monitora novos membros e expulsa se o DDI não for autorizado
   */
  async onParticipantsUpdate({ sock, groupJid, targetPhoneJid, targetGroupJid, participantNumber, lang, action }) {
    if (action !== 'add') return false;

    const antifakeCfg = configManager.getPluginConfig(groupJid, 'antifake');
    if (antifakeCfg && antifakeCfg.enabled) {
      // Blindagem AntiFake para contas @lid: Se o WhatsApp ocultou o telefone real por privacidade,
      // o identificador retornado é um LID arbitrário e não possui DDI. Não expulsar falsamente (P0.2).
      if (targetPhoneJid.endsWith('@lid') || (participantNumber && participantNumber.length > 14)) {
        logger.info({ groupJid, targetPhoneJid, participantNumber }, 'AntiFake: participante @lid ignorado (DDI não revelável por privacidade)');
        return false;
      }

      const allowedDdis = Array.isArray(antifakeCfg.allowedDdis) && antifakeCfg.allowedDdis.length > 0
        ? antifakeCfg.allowedDdis
        : ['55', '351', '1', '34', '54', '52'];

      const hasValidDdi = allowedDdis.some(ddi => participantNumber.startsWith(ddi.replace(/\D/g, '')));
      if (!hasValidDdi) {
        // Número estrangeiro não permitido -> Ban imediato
        await safeKick(sock, groupJid, targetGroupJid);
        await sendSafeMessage(sock, groupJid, {
          text: t(lang, 'antifake.detected', { user: participantNumber }),
          mentions: [targetGroupJid, targetPhoneJid]
        });
        return { stop: true }; // Interrompe próximos plugins (como welcome)
      }
    }

    return false;
  },

  async execute({ sock, msg, from, sender, args, reply, t: translate, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'antifake') || {};

    // Digitar /antifake sem argumentos (ou /antifake config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antifake');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'antifake', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antifake');
      }
      const ddis = (cfg.allowedDdis && cfg.allowedDdis.length) ? cfg.allowedDdis.join(', ') : '55, 351, 1, 34, 54, 52';
      return reply(`${translate('common.saved')}\n🎭 *AntiFake:* ATIVADO\n🌍 *DDIs permitidos:* \`${ddis}\``);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'antifake', false);
      return reply(translate('common.saved') + '\n🎭 *AntiFake:* DESATIVADO');
    }

    // Configuração direta de DDIs: /antifake 55 ou /antifake 55 351 1
    const ddiCandidates = args.map(a => a.replace(/\D/g, '')).filter(Boolean);
    if (ddiCandidates.length > 0 && !['status', 'config', 'wizard', 'setup'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antifake', { allowedDdis: ddiCandidates, enabled: true });
      return reply(`💾 *AntiFake atualizado e ATIVADO!*\n🌍 *DDIs permitidos:* \`${ddiCandidates.join(', ')}\``);
    }

    const status = configManager.isPluginEnabled(from, 'antifake') ? translate('common.enabled') : translate('common.disabled');
    const ddis = (cfg.allowedDdis && cfg.allowedDdis.length) ? cfg.allowedDdis.join(', ') : '55, 351, 1, 34, 54, 52';

    let help = translate('antifake.status', { status, ddis });
    help += `\n\n💡 *Comandos Diretos:*\n• \`/antifake on\` ou \`/antifake off\`\n• \`/antifake 55\` (permite apenas Brasil)\n• \`/antifake 55 351 1\` (permite Brasil, Portugal e EUA)\n• \`/antifake config\` (abre wizard)`;
    return reply(help);
  }
};
