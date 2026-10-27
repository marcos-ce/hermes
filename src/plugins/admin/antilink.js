const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { safeDelete, safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { checkAdminStatus, resolveParticipant } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');
const settings = require('../../config/settings');

const URL_REGEX_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|me|xyz|app|br|edu|gov|gg|link|site|top|online|tech|live|tv|co|info|biz|club|shop|store|games?|news|blog|media)[^\s]*)/gi.source;

/**
 * Aliases canônicos: mapeamento de domínios "alternativos" para o domínio principal.
 * Ex: youtu.be → youtube.com, t.me → telegram.org, wa.me → whatsapp.com
 */
const DOMAIN_ALIASES = {
  'youtu.be': 'youtube.com',
  'm.youtube.com': 'youtube.com',
  't.me': 'telegram.org',
  'telegram.me': 'telegram.org',
  'wa.me': 'whatsapp.com',
  'chat.whatsapp.com': 'whatsapp.com',
  'api.whatsapp.com': 'whatsapp.com',
  'fb.me': 'facebook.com',
  'm.facebook.com': 'facebook.com',
  'fb.com': 'facebook.com',
  'instagr.am': 'instagram.com',
  'twitter.com': 'x.com',
  'x.com': 'x.com',
  't.co': 'x.com',
  'pin.it': 'pinterest.com',
  'tiktok.com': 'tiktok.com',
  'vm.tiktok.com': 'tiktok.com',
  'linktr.ee': 'linktr.ee',
  'discord.gg': 'discord.com',
  'discordapp.com': 'discord.com',
};

/**
 * Extrai o domínio base de uma URL, aplicando alias canônicos e removendo subdomínios comuns.
 * @param {string} url
 * @returns {string|null}
 */
function extractBaseDomain(url) {
  try {
    let href = url.trim();
    if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
    const hostname = new URL(href).hostname.toLowerCase();
    // Remove www. e subdomínios simples (www, m, mobile)
    const noWww = hostname.replace(/^(www\.|m\.|mobile\.)/, '');
    // Verifica alias canônico para subdomínio completo
    if (DOMAIN_ALIASES[hostname]) return DOMAIN_ALIASES[hostname];
    if (DOMAIN_ALIASES[noWww]) return DOMAIN_ALIASES[noWww];
    return noWww;
  } catch {
    return null;
  }
}

/**
 * Verifica se um link/URL ou domínio pertence à família WhatsApp (grupos, convites, wa.me, canais).
 * @param {string} urlOrDomain
 * @returns {boolean}
 */
function isWhatsAppMatch(urlOrDomain) {
  if (!urlOrDomain) return false;
  if (/chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com/i.test(urlOrDomain)) return true;
  const base = extractBaseDomain(urlOrDomain);
  return base === 'whatsapp.com' || (base && base.endsWith('.whatsapp.com'));
}

/**
 * Verifica se um domínio extraído confere com uma lista de domínios.
 * Compara: match exato, sem subdomínios e com aliases canônicos.
 * @param {string} urlOrDomain
 * @param {string[]} domainList
 * @returns {boolean}
 */
function isDomainMatch(urlOrDomain, domainList) {
  if (!domainList || domainList.length === 0) return false;
  const base = extractBaseDomain(urlOrDomain);
  if (!base) return false;

  const normalizedList = domainList.map(d => {
    const cleaned = d.replace(/^(https?:\/\/)?(www\.|m\.|mobile\.)?/, '').toLowerCase().trim();
    return DOMAIN_ALIASES[cleaned] || cleaned;
  });

  return normalizedList.some(target =>
    base === target || base.endsWith('.' + target)
  );
}

/**
 * Extrai todos os textos relevantes de uma mensagem Baileys para detecção de links,
 * incluindo link previews (extendedTextMessage), legendas de mídia, enquetes e texto normal.
 * @param {object} message msg.message do Baileys
 * @returns {string}
 */
function extractAllTextForLinks(message) {
  if (!message) return '';

  // Desencapsula efêmeras/viewOnce
  const real = message.ephemeralMessage?.message ||
               message.viewOnceMessage?.message ||
               message.viewOnceMessageV2?.message ||
               message.documentWithCaptionMessage?.message ||
               message;

  const parts = [];

  // Texto normal
  if (real.conversation) parts.push(real.conversation);

  // Mensagem com texto estendido (link preview)
  if (real.extendedTextMessage) {
    const ext = real.extendedTextMessage;
    if (ext.text) parts.push(ext.text);
    if (ext.matchedText) parts.push(ext.matchedText);
    if (ext.canonicalUrl) parts.push(ext.canonicalUrl);
  }

  // Legendas de mídia
  if (real.imageMessage?.caption) parts.push(real.imageMessage.caption);
  if (real.videoMessage?.caption) parts.push(real.videoMessage.caption);
  if (real.documentMessage?.caption) parts.push(real.documentMessage.caption);
  if (real.audioMessage?.caption) parts.push(real.audioMessage.caption);
  if (real.stickerMessage?.caption) parts.push(real.stickerMessage.caption);

  // Enquetes
  const poll = real.pollCreationMessage || real.pollCreationMessageV2 || real.pollCreationMessageV3;
  if (poll?.name) parts.push(poll.name);
  if (Array.isArray(poll?.options)) {
    poll.options.forEach(opt => {
      if (opt.optionName) parts.push(opt.optionName);
    });
  }

  return parts.join(' ');
}

module.exports = {
  name: 'antilink',
  aliases: ['antilink', 'antlink', 'link', 'links', 'antienlace', 'antilinks'],
  description: 'Filtro inteligente de links não autorizados com Whitelist, Blacklist e modo exclusivo WhatsApp',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 20,

  configSchema: {
    title: {
      pt: 'Filtro AntiLink',
      es: 'Filtro AntiLink',
      en: 'AntiLink Filter'
    },
    description: {
      pt: 'Bloqueia links externos com suporte a Whitelist, Blacklist e modo exclusivo WhatsApp',
      es: 'Bloquea enlaces externos con soporte de Lista Blanca, Lista Negra y modo exclusivo WhatsApp',
      en: 'Blocks external links with Whitelist, Blacklist and WhatsApp-only mode support'
    },
    fields: [
      {
        name: 'mode',
        type: 'choice',
        question: {
          pt: 'Qual modo de proteção do AntiLink você deseja utilizar?',
          es: '¿Qué modo de protección de AntiLink deseas utilizar?',
          en: 'Which AntiLink protection mode do you want to use?'
        },
        choices: [
          {
            value: 'whitelist',
            label: {
              pt: 'Lista Branca (Bloquear tudo, exceto sites permitidos)',
              es: 'Lista Blanca (Bloquear todo, excepto sitios permitidos)',
              en: 'Whitelist (Block all, except allowed sites)'
            }
          },
          {
            value: 'whatsapp',
            label: {
              pt: 'Apenas WhatsApp (Liberar tudo, bloquear apenas links/grupos do WhatsApp)',
              es: 'Solo WhatsApp (Permitir todo, bloquear solo enlaces de WhatsApp)',
              en: 'WhatsApp Only (Allow all, block only WhatsApp links)'
            }
          },
          {
            value: 'blacklist',
            label: {
              pt: 'Lista Negra (Liberar tudo, bloquear domínios específicos)',
              es: 'Lista Negra (Permitir todo, bloquear dominios específicos)',
              en: 'Blacklist (Allow all, block specific domains)'
            }
          }
        ],
        default: 'whitelist'
      },
      {
        name: 'blockedDomains',
        type: 'domain_list',
        question: {
          pt: 'Digite os domínios PROIBIDOS separados por espaço (usado no modo Lista Negra, ex: whatsapp.com t.me)\nou envie . para padrão:',
          es: 'Escribe los dominios PROHIBIDOS separados por espacio (usado en modo Lista Negra, ej: whatsapp.com t.me)\no envía . para predeterminado:',
          en: 'Enter FORBIDDEN domains separated by space (used in Blacklist mode, e.g. whatsapp.com t.me)\nor send . for default:'
        },
        default: ['whatsapp.com']
      },
      {
        name: 'allowedDomains',
        type: 'domain_list',
        question: {
          pt: 'Digite os domínios PERMITIDOS separados por espaço (usado no modo Lista Branca, ex: youtube.com instagram.com)\nou escreva "nenhum" para bloquear absolutamente todos os links:',
          es: 'Escribe los dominios PERMITIDOS separados por espacio (usado en modo Lista Blanca, ej: youtube.com instagram.com)\no escribe "ninguno" para bloquear todos los enlaces:',
          en: 'Enter ALLOWED domains separated by space (used in Whitelist mode, e.g. youtube.com instagram.com)\nor type "none" to block all links:'
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
    const lang = configManager.getGroupLang(from);

    // Sem argumentos, config, wizard ou setup abre o assistente interativo
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
    }

    // Ativar
    if (['on', 'ativar', 'activar', 'enable'].includes(sub)) {
      configManager.setPluginEnabled(from, 'antilink', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
      }
      return reply(t('config.module_toggled_on', { module: 'ANTILINK' }));
    }

    // Desativar
    if (['off', 'desativar', 'desactivar', 'disable'].includes(sub)) {
      configManager.setPluginEnabled(from, 'antilink', false);
      return reply(t('config.module_toggled_off', { module: 'ANTILINK' }));
    }

    // Atalho direto: Bloquear apenas links do WhatsApp (libera todo o resto)
    if (['whats', 'whatsapp'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', {
        mode: 'whatsapp',
        enabled: true,
        configured: true
      });
      return reply(t('antilink.mode_whatsapp'));
    }

    // Configuração de Lista Negra (Blacklist): Proibir domínios específicos e liberar o restante
    if (['proibir', 'block', 'blacklist', 'prohibir', 'bloquearlink'].includes(sub)) {
      const domains = args.slice(1).map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim()).filter(Boolean);
      const targetDomains = domains.length > 0 ? domains : ['whatsapp.com'];
      configManager.updatePluginConfig(from, 'antilink', {
        mode: 'blacklist',
        blockedDomains: targetDomains,
        enabled: true,
        configured: true
      });
      return reply(t('antilink.mode_blacklist', { domains: targetDomains.join(', ') }));
    }

    // Configuração de Lista Branca (Whitelist): Permitir domínios e bloquear o restante
    if (['permitir', 'allow', 'whitelist'].includes(sub)) {
      const domains = args.slice(1).map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim()).filter(Boolean);
      configManager.updatePluginConfig(from, 'antilink', {
        mode: 'whitelist',
        allowedDomains: domains,
        enabled: true,
        configured: true
      });
      const display = domains.length ? domains.join(', ') : 'Nenhum (Bloqueia Todos)';
      return reply(t('antilink.mode_whitelist', { domains: display }));
    }

    // Bloquear 100% de todos os links externos
    if (['bloquear', 'blockall', 'bloqueartodos'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', {
        mode: 'whitelist',
        allowedDomains: [],
        enabled: true,
        configured: true
      });
      return reply(t('antilink.mode_blockall'));
    }

    // Alternar ou consultar modo
    if (['modo', 'mode'].includes(sub)) {
      const targetMode = (args[1] || '').toLowerCase();
      if (['whats', 'whatsapp'].includes(targetMode)) {
        configManager.updatePluginConfig(from, 'antilink', { mode: 'whatsapp', enabled: true, configured: true });
        return reply(t('antilink.mode_whatsapp'));
      }
      if (['blacklist', 'negra', 'proibir'].includes(targetMode)) {
        const blocked = Array.isArray(cfg.blockedDomains) && cfg.blockedDomains.length > 0 ? cfg.blockedDomains : ['whatsapp.com'];
        configManager.updatePluginConfig(from, 'antilink', { mode: 'blacklist', blockedDomains: blocked, enabled: true, configured: true });
        return reply(t('antilink.mode_blacklist', { domains: blocked.join(', ') }));
      }
      if (['whitelist', 'branca', 'permitir', 'todos', 'all'].includes(targetMode)) {
        const allowed = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];
        configManager.updatePluginConfig(from, 'antilink', { mode: 'whitelist', allowedDomains: allowed, enabled: true, configured: true });
        const display = allowed.length > 0 ? allowed.join(', ') : 'Nenhum (Bloqueia Todos)';
        return reply(t('antilink.mode_whitelist', { domains: display }));
      }
      return reply(t('antilink.mode_help'));
    }

    // Configuração direta de ação: ban, del, warn
    if (['ban', 'banir', 'expulsar', 'kick'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'ban', enabled: true, configured: true });
      return reply(t('antilink.action_ban'));
    }
    if (['delete', 'del', 'apagar', 'remover', 'borrar'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'delete', enabled: true, configured: true });
      return reply(t('antilink.action_delete'));
    }
    if (['warn', 'adv', 'advertir', 'aviso'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'warn', enabled: true, configured: true });
      return reply(t('antilink.action_warn'));
    }

    // Status do módulo
    const status = configManager.isPluginEnabled(from, 'antilink') ? t('common.enabled') : t('common.disabled');
    const mode = (cfg.mode || 'whitelist').toLowerCase();

    let modeDisplay = '';
    let domainsDisplay = '';

    if (mode === 'whatsapp') {
      modeDisplay = lang === 'es' ? 'Solo WhatsApp (Bloquea solo enlaces de WhatsApp)' : (lang === 'en' ? 'WhatsApp Only (Blocks WhatsApp links only)' : 'Apenas WhatsApp (Bloqueia só convites/links do WhatsApp)');
      domainsDisplay = 'chat.whatsapp.com, wa.me, whatsapp.com';
    } else if (mode === 'blacklist') {
      const blocked = (cfg.blockedDomains && cfg.blockedDomains.length) ? cfg.blockedDomains.join(', ') : 'whatsapp.com';
      modeDisplay = lang === 'es' ? 'Lista Negra (Bloquea dominios específicos)' : (lang === 'en' ? 'Blacklist (Blocks specific domains)' : 'Lista Negra (Bloqueia domínios específicos)');
      domainsDisplay = blocked;
    } else {
      // Modo whitelist / padrão histórico
      const allowed = (cfg.allowedDomains && cfg.allowedDomains.length) ? cfg.allowedDomains.join(', ') : '';
      if (allowed) {
        modeDisplay = lang === 'es' ? 'Lista Blanca (Permite seleccionados)' : (lang === 'en' ? 'Whitelist (Allows selected)' : 'Lista Branca (Permitir selecionados)');
        domainsDisplay = allowed;
      } else {
        modeDisplay = lang === 'es' ? 'Lista Blanca (Bloquea todos los enlaces)' : (lang === 'en' ? 'Whitelist (Blocks all links)' : 'Lista Branca (Bloquear todos os links)');
        domainsDisplay = lang === 'es' ? 'Ninguno (Bloquea todo)' : (lang === 'en' ? 'None (Blocks all)' : 'Nenhum (Bloqueia Todos)');
      }
    }

    const action = cfg.action || 'delete';
    return reply(t('antilink.status', { status, mode: modeDisplay, domains: domainsDisplay, action }));
  },

  /**
   * Hook passivo: monitora mensagens em tempo real
   */
  async onMessage({ sock, msg, from, sender, _text, lang }) {
    if (!configManager.isPluginEnabled(from, 'antilink')) return false;

    // Extrai TODOS os textos relevantes (incluindo link previews, legendas de mídia e enquetes)
    const fullText = extractAllTextForLinks(msg.message);
    const matches = fullText ? fullText.match(new RegExp(URL_REGEX_PATTERN, 'gi')) : null;
    if (!matches || matches.length === 0) return false;

    // Ignora se quem enviou for Dono ou Administrador
    if (settings.isOwner(sender, sock)) return false;
    const adminCheck = await checkAdminStatus(sock, from, sender);
    if (adminCheck.isAdmin) return false;

    const cfg = configManager.getPluginConfig(from, 'antilink') || {};
    const mode = (cfg.mode || 'whitelist').toLowerCase();
    let isViolation = false;

    if (mode === 'whatsapp') {
      // Modo expresso: Bloqueia SOMENTE links da família WhatsApp (grupos, convites, wa.me, canais) e libera todo o restante
      isViolation = matches.some(match => isWhatsAppMatch(match));
    } else if (mode === 'blacklist') {
      // Modo Lista Negra: Bloqueia apenas os domínios proibidos configurados
      const blocked = Array.isArray(cfg.blockedDomains) && cfg.blockedDomains.length > 0
        ? cfg.blockedDomains
        : ['whatsapp.com'];
      isViolation = matches.some(match => isDomainMatch(match, blocked));
    } else {
      // Modo Lista Branca (padrão histórico): bloqueia tudo exceto os domínios autorizados
      const allowed = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];
      if (allowed.length === 0) {
        // Whitelist vazia = bloqueia absolutamente todos os links
        isViolation = true;
      } else {
        // Se qualquer link da mensagem NÃO estiver na whitelist, é violação
        isViolation = matches.some(match => !isDomainMatch(match, allowed));
      }
    }

    // Se nenhum link configurado violou as regras do modo ativo, permite a mensagem normalmente
    if (!isViolation) return false;

    // Ação de Emergência (Zero Delay): Apagar mensagem do infrator
    await safeDelete(sock, from, msg.key);

    const targetData = await resolveParticipant(sock, from, sender);
    const targetPhone = targetData?.phoneJid || sender;
    const targetGroup = targetData?.groupJid || sender;
    const userNum = targetData?.displayNum || sender.replace(/@.*$/, '').replace(/\D/g, '');
    const action = cfg.action || 'delete';
    const groupStyle = configManager.getGroupStyle(from);

    if (action === 'ban') {
      await safeKick(sock, from, targetGroup);
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.banned', { user: userNum }, groupStyle),
        mentions: [targetGroup, targetPhone]
      });
    } else if (action === 'warn') {
      const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
      const maxWarns = warnCfg.maxWarns || 3;
      const warnReason = t(lang, 'antilink.warn_reason') || 'Envio de link não autorizado';
      const count = configManager.addWarn(from, targetPhone, warnReason);

      if (count >= maxWarns) {
        await safeKick(sock, from, targetGroup);
        configManager.resetWarns(from, targetPhone);
        await sendSafeMessage(sock, from, {
          text: t(lang, 'warn.max_reached', { user: userNum, max: maxWarns }, groupStyle),
          mentions: [targetGroup, targetPhone]
        });
      } else {
        await sendSafeMessage(sock, from, {
          text: t(lang, 'antilink.warned', { user: userNum, warns: count, max: maxWarns }, groupStyle),
          mentions: [targetGroup, targetPhone]
        });
      }
    } else {
      // Apenas apagar
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.detected', { user: userNum }, groupStyle),
        mentions: [targetGroup, targetPhone]
      });
    }

    return true; // Interrompe o pipeline de mensagens
  }
};
