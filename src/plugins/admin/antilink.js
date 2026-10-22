const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { safeDelete, safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { checkAdminStatus } = require('../../utils/jidResolver');
const settings = require('../../config/settings');

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|me|xyz|app|br|edu|gov|gg|link|site|top|online|tech|live)[^\s]*)/gi;

module.exports = {
  name: 'antilink',
  aliases: ['antilink', 'antlink', 'link', 'links', 'antienlace'],
  description: 'Filtro inteligente de links não autorizados com whitelist',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Filtro AntiLink',
      es: 'Filtro AntiLink',
      en: 'AntiLink Filter'
    },
    description: {
      pt: 'Bloqueia links externos com suporte a whitelist de sites',
      es: 'Bloquea enlaces externos con lista blanca de sitios',
      en: 'Blocks external links with domain whitelist support'
    },
    fields: [
      {
        name: 'allowedDomains',
        type: 'domain_list',
        question: {
          pt: 'Digite os domínios PERMITIDOS separados por espaço (Ex: youtube.com instagram.com) ou envie . para bloquear todos os links:',
          es: 'Escribe los dominios PERMITIDOS separados por espacio (Ej: youtube.com instagram.com) o envía . para bloquear todos:',
          en: 'Enter ALLOWED domains separated by space (e.g. youtube.com instagram.com) or send . to block all links:'
        },
        default: []
      },
      {
        name: 'action',
        type: 'choice',
        question: {
          pt: 'Qual ação aplicar ao membro que enviar link não autorizado?',
          es: '¿Qué acción aplicar al miembro que envíe un enlace no autorizado?',
          en: 'What action should be taken against a member sending unauthorized links?'
        },
        choices: [
          { value: 'delete', label: { pt: 'Apenas apagar a mensagem', es: 'Solo borrar el mensaje', en: 'Only delete message' } },
          { value: 'warn', label: { pt: 'Apagar e advertir (soma no !warn)', es: 'Borrar y advertir (suma en !warn)', en: 'Delete and warn (adds to !warn)' } },
          { value: 'ban', label: { pt: 'Apagar e banir imediatamente', es: 'Borrar y expulsar inmediatamente', en: 'Delete and ban immediately' } }
        ],
        default: 'delete'
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'antilink') || {};

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'antilink', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
      }
      return reply(t('common.saved') + '\n🛡️ *AntiLink:* ATIVADO');
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'antilink', false);
      return reply(t('common.saved') + '\n🛡️ *AntiLink:* DESATIVADO');
    }

    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
    }

    // Status
    const status = configManager.isPluginEnabled(from, 'antilink') ? t('common.enabled') : t('common.disabled');
    const domains = (cfg.allowedDomains && cfg.allowedDomains.length) ? cfg.allowedDomains.join(', ') : 'Nenhum (Bloqueia Todos)';
    const action = cfg.action || 'delete';

    return reply(t('antilink.status', { status, domains, action }));
  },

  /**
   * Hook passivo: monitora mensagens em tempo real
   */
  async onMessage({ sock, msg, from, sender, text, lang }) {
    if (!configManager.isPluginEnabled(from, 'antilink')) return false;
    if (!text || !URL_REGEX.test(text)) return false;

    // Ignora se quem enviou for Dono ou Administrador
    if (settings.isOwner(sender, sock)) return false;
    const adminCheck = await checkAdminStatus(sock, from, sender);
    if (adminCheck.isAdmin) return false;

    const cfg = configManager.getPluginConfig(from, 'antilink') || {};
    const allowed = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];

    // Checa se o link enviado contém algum dos domínios permitidos
    const matches = text.match(URL_REGEX) || [];
    let isAllAllowed = true;

    for (const match of matches) {
      const cleanMatch = match.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
      const isDomainWhitelisted = allowed.some(d => cleanMatch.startsWith(d) || cleanMatch.includes(d));
      if (!isDomainWhitelisted) {
        isAllAllowed = false;
        break;
      }
    }

    if (isAllAllowed && matches.length > 0 && allowed.length > 0) {
      return false; // Link permitido na whitelist
    }

    // Ação de Emergência (Zero Delay): Apagar mensagem do infrator
    await safeDelete(sock, from, msg.key);

    const userNum = sender.replace(/@.*$/, '').replace(/\D/g, '');
    const action = cfg.action || 'delete';

    if (action === 'ban') {
      await safeKick(sock, from, sender);
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.banned', { user: userNum }),
        mentions: [sender]
      });
    } else if (action === 'warn') {
      const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
      const maxWarns = warnCfg.maxWarns || 3;
      const count = configManager.addWarn(from, sender, 'Envio de link não autorizado');

      if (count >= maxWarns) {
        await safeKick(sock, from, sender);
        configManager.resetWarns(from, sender);
        await sendSafeMessage(sock, from, {
          text: t(lang, 'warn.max_reached', { user: userNum, max: maxWarns }),
          mentions: [sender]
        });
      } else {
        await sendSafeMessage(sock, from, {
          text: t(lang, 'antilink.warned', { user: userNum, warns: count, max: maxWarns }),
          mentions: [sender]
        });
      }
    } else {
      // Apenas apagar
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.detected', { user: userNum }),
        mentions: [sender]
      });
    }

    return true; // Interrompe o pipeline de mensagens
  }
};
