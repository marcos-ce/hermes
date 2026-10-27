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
    const noWww = hostname.replace(/^(www\.|m\.|mobile\.)/, '');
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
 * Extrai todos os textos relevantes de uma mensagem Baileys para detecção de links.
 * @param {object} message msg.message do Baileys
 * @returns {string}
 */
function extractAllTextForLinks(message) {
  if (!message) return '';

  const real = message.ephemeralMessage?.message ||
               message.viewOnceMessage?.message ||
               message.viewOnceMessageV2?.message ||
               message.documentWithCaptionMessage?.message ||
               message;

  const parts = [];

  if (real.conversation) parts.push(real.conversation);

  if (real.extendedTextMessage) {
    const ext = real.extendedTextMessage;
    if (ext.text) parts.push(ext.text);
    if (ext.matchedText) parts.push(ext.matchedText);
    if (ext.canonicalUrl) parts.push(ext.canonicalUrl);
  }

  if (real.imageMessage?.caption) parts.push(real.imageMessage.caption);
  if (real.videoMessage?.caption) parts.push(real.videoMessage.caption);
  if (real.documentMessage?.caption) parts.push(real.documentMessage.caption);
  if (real.audioMessage?.caption) parts.push(real.audioMessage.caption);
  if (real.stickerMessage?.caption) parts.push(real.stickerMessage.caption);

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
  description: 'Filtro inteligente de links: bloqueia todos os links, apenas WhatsApp ou sites específicos',
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
      pt: 'Proteção contra links externos com opções de bloqueio total, WhatsApp ou sites específicos',
      es: 'Protección contra enlaces externos con opciones de bloqueo total, WhatsApp o sitios específicos',
      en: 'External link protection with full block, WhatsApp-only or specific sites options'
    },
    fields: [
      {
        name: 'mode',
        type: 'choice',
        question: {
          pt: 'O que você deseja bloquear no grupo?',
          es: '¿Qué deseas bloquear en el grupo?',
          en: 'What do you want to block in the group?'
        },
        choices: [
          {
            value: 'all',
            label: {
              pt: 'Todos os links (Bloqueia qualquer link externo)',
              es: 'Todos los enlaces (Bloquea cualquier enlace externo)',
              en: 'All links (Block any external link)'
            }
          },
          {
            value: 'whatsapp',
            label: {
              pt: 'Apenas WhatsApp (Bloqueia só links/grupos do WhatsApp e libera o resto)',
              es: 'Solo WhatsApp (Bloquea solo enlaces/grupos de WhatsApp y permite el resto)',
              en: 'WhatsApp only (Block only WhatsApp links/groups and allow the rest)'
            }
          },
          {
            value: 'specific',
            label: {
              pt: 'Apenas sites específicos (Bloqueia só os sites que você escolher)',
              es: 'Solo sitios específicos (Bloquea solo los sitios que elijas)',
              en: 'Specific sites only (Block only the sites you choose)'
            }
          }
        ],
        default: 'all'
      },
      {
        name: 'blockedDomains',
        type: 'domain_list',
        question: {
          pt: 'Se escolheu a opção 3 (Apenas sites específicos), digite os sites a bloquear separados por espaço (ex: telegram.org tiktok.com).\nSe escolheu Todos ou WhatsApp, envie . para avançar:',
          es: 'Si elegiste la opción 3 (Solo sitios específicos), escribe los sitios a bloquear separados por espacio (ej: telegram.org tiktok.com).\nSi elegiste Todos o WhatsApp, envía . para continuar:',
          en: 'If you chose option 3 (Specific sites only), enter sites to block separated by space (e.g. telegram.org tiktok.com).\nIf you chose All or WhatsApp, send . to proceed:'
        },
        default: ['whatsapp.com']
      },
      {
        name: 'action',
        type: 'choice',
        question: {
          pt: 'Qual ação aplicar ao membro que enviar link proibido?',
          es: '¿Qué acción aplicar al miembro que envíe un enlace prohibido?',
          en: 'What action should be taken against a member sending forbidden links?'
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

    // Sem argumentos, config, wizard ou setup abre o assistente interativo enxuto
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
    }

    // 1. Ativar bloqueando TUDO direto (sem abrir wizard)
    if (['on', 'ativar', 'activar', 'enable'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', {
        enabled: true,
        configured: true,
        mode: 'all',
        allowedDomains: [],
        action: cfg.action || 'delete'
      });
      return reply(t('antilink.on_direct'));
    }

    // 2. Ativar bloqueando APENAS links do WhatsApp (libera todo o restante)
    if (['whats', 'whatsapp'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', {
        enabled: true,
        configured: true,
        mode: 'whatsapp',
        action: cfg.action || 'delete'
      });
      return reply(t('antilink.mode_whatsapp'));
    }

    // 3. Ativar bloqueando APENAS sites específicos (ex: !antilink apenas telegram.org discord.gg)
    if (['apenas', 'bloquear', 'proibir', 'block', 'blacklist', 'especifico'].includes(sub)) {
      const domains = args.slice(1).map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim()).filter(Boolean);
      if (domains.length > 0) {
        configManager.updatePluginConfig(from, 'antilink', {
          enabled: true,
          configured: true,
          mode: 'specific',
          blockedDomains: domains,
          action: cfg.action || 'delete'
        });
        return reply(t('antilink.mode_specific', { domains: domains.join(', ') }));
      }
      // Se chamado sem listar domínios (ex: !antilink bloquear), bloqueia tudo direto
      configManager.updatePluginConfig(from, 'antilink', {
        enabled: true,
        configured: true,
        mode: 'all',
        allowedDomains: [],
        action: cfg.action || 'delete'
      });
      return reply(t('antilink.on_direct'));
    }

    // 4. Desativar
    if (['off', 'desativar', 'desactivar', 'disable'].includes(sub)) {
      configManager.setPluginEnabled(from, 'antilink', false);
      return reply(t('config.module_toggled_off', { module: 'ANTILINK' }));
    }

    // 5. Configuração direta de ação punitiva: ban, del, warn
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

    // 6. Status resumido do módulo
    const status = configManager.isPluginEnabled(from, 'antilink') ? t('common.enabled') : t('common.disabled');
    const mode = (cfg.mode || 'all').toLowerCase();

    let modeDisplay = '';
    let domainsDisplay = '';

    if (mode === 'whatsapp') {
      modeDisplay = lang === 'es' ? 'Solo WhatsApp (Bloquea solo enlaces de WhatsApp)' : (lang === 'en' ? 'WhatsApp only (Blocks WhatsApp links only)' : 'Apenas WhatsApp (Bloqueia só links do WhatsApp)');
      domainsDisplay = 'chat.whatsapp.com, wa.me, whatsapp.com';
    } else if (mode === 'specific' || mode === 'blacklist') {
      const blocked = (cfg.blockedDomains && cfg.blockedDomains.length) ? cfg.blockedDomains.join(', ') : 'whatsapp.com';
      modeDisplay = lang === 'es' ? 'Sitios específicos' : (lang === 'en' ? 'Specific sites' : 'Apenas sites específicos');
      domainsDisplay = blocked;
    } else {
      // Modo 'all' ou 'whitelist'
      if (Array.isArray(cfg.allowedDomains) && cfg.allowedDomains.length > 0) {
        modeDisplay = lang === 'es' ? 'Todos los enlaces (con excepciones)' : (lang === 'en' ? 'All links (with exceptions)' : 'Todos os links (com exceções)');
        domainsDisplay = `Liberados: ${cfg.allowedDomains.join(', ')}`;
      } else {
        modeDisplay = lang === 'es' ? 'Todos los enlaces (Bloqueo total)' : (lang === 'en' ? 'All links (Full block)' : 'Todos os links (Bloqueio total)');
        domainsDisplay = lang === 'es' ? 'Cualquier enlace externo' : (lang === 'en' ? 'Any external link' : 'Qualquer link externo');
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

    // Extrai textos relevantes (incluindo link previews, legendas de mídia e enquetes)
    const fullText = extractAllTextForLinks(msg.message);
    const matches = fullText ? fullText.match(new RegExp(URL_REGEX_PATTERN, 'gi')) : null;
    if (!matches || matches.length === 0) return false;

    // Ignora se quem enviou for Dono ou Administrador
    if (settings.isOwner(sender, sock)) return false;
    const adminCheck = await checkAdminStatus(sock, from, sender);
    if (adminCheck.isAdmin) return false;

    const cfg = configManager.getPluginConfig(from, 'antilink') || {};
    const mode = (cfg.mode || 'all').toLowerCase();
    let isViolation = false;

    if (mode === 'whatsapp') {
      // Bloqueia SOMENTE links da família WhatsApp
      isViolation = matches.some(match => isWhatsAppMatch(match));
    } else if (mode === 'specific' || mode === 'blacklist') {
      // Bloqueia APENAS os domínios específicos configurados
      const blocked = Array.isArray(cfg.blockedDomains) && cfg.blockedDomains.length > 0
        ? cfg.blockedDomains
        : ['whatsapp.com'];
      isViolation = matches.some(match => isDomainMatch(match, blocked));
    } else {
      // Modo 'all' ou 'whitelist': bloqueia todos os links externos
      const allowed = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];
      if (allowed.length === 0) {
        isViolation = true;
      } else {
        // Se houver lista de liberados, apenas eles passam
        isViolation = matches.some(match => !isDomainMatch(match, allowed));
      }
    }

    // Se nenhum link violou a regra do modo ativo, libera a mensagem
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
