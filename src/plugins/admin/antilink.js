const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { safeDelete, safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { checkAdminStatus, resolveParticipant } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');
const settings = require('../../config/settings');

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|me|xyz|app|br|edu|gov|gg|link|site|top|online|tech|live|tv|co|info|biz|club|shop|store|games?|news|blog|media)[^\s]*)/gi;

/**
 * Aliases canônicos: mapeamento de domínios "alternativos" para o domínio principal.
 * Ex: youtu.be → youtube.com, t.me → telegram.org
 */
const DOMAIN_ALIASES = {
  'youtu.be': 'youtube.com',
  'm.youtube.com': 'youtube.com',
  't.me': 'telegram.org',
  'wa.me': 'whatsapp.com',
  'chat.whatsapp.com': 'whatsapp.com',
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
 * Verifica se um domínio extraído está na whitelist.
 * Compara: exacto, sem subdomínios e com alias canônicos.
 * @param {string} urlOrDomain
 * @param {string[]} allowedList
 * @returns {boolean}
 */
function isDomainAllowed(urlOrDomain, allowedList) {
  if (!allowedList || allowedList.length === 0) return false;
  const base = extractBaseDomain(urlOrDomain);
  if (!base) return false;

  const normalizedAllowed = allowedList.map(d => {
    const cleaned = d.replace(/^(https?:\/\/)?(www\.|m\.|mobile\.)?/, '').toLowerCase().trim();
    return DOMAIN_ALIASES[cleaned] || cleaned;
  });

  // Verifica match exato ou se o domínio extraído termina com o domínio permitido (ex: sub.youtube.com → youtube.com)
  return normalizedAllowed.some(allowed =>
    base === allowed || base.endsWith('.' + allowed)
  );
}

/**
 * Extrai todos os textos relevantes de uma mensagem Baileys para detecção de links,
 * incluindo link previews (extendedTextMessage), legendas de mídia e texto normal.
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
    // matchedText e canonicalUrl são os campos que contêm o link REAL do preview
    if (ext.matchedText) parts.push(ext.matchedText);
    if (ext.canonicalUrl) parts.push(ext.canonicalUrl);
  }

  // Legendas de mídia
  if (real.imageMessage?.caption) parts.push(real.imageMessage.caption);
  if (real.videoMessage?.caption) parts.push(real.videoMessage.caption);
  if (real.documentMessage?.caption) parts.push(real.documentMessage.caption);
  if (real.audioMessage?.caption) parts.push(real.audioMessage.caption);
  if (real.stickerMessage?.caption) parts.push(real.stickerMessage.caption);

  return parts.join(' ');
}

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
          pt: 'Digite os domínios PERMITIDOS separados por espaço (Ex: youtube.com instagram.com)\nou escreva "nenhum" para bloquear absolutamente todos os links:',
          es: 'Escribe los dominios PERMITIDOS separados por espacio (Ej: youtube.com instagram.com)\no escribe "ninguno" para bloquear todos los enlaces:',
          en: 'Enter ALLOWED domains separated by space (e.g. youtube.com instagram.com)\nor type "none" to block all links:'
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

    // Digitar /antilink sem argumentos (ou /antilink config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'antilink', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'antilink');
      }
      const action = cfg.action || 'delete';
      return reply(`${t('common.saved')}\n🛡️ *AntiLink:* ATIVADO\n⚡ *Ação atual:* \`${action}\``);
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'antilink', false);
      return reply(t('common.saved') + '\n🛡️ *AntiLink:* DESATIVADO');
    }

    // Configuração direta de ação: ban, del, warn
    if (['ban', 'banir', 'expulsar'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'ban', enabled: true, configured: true });
      return reply('💾 *AntiLink atualizado:* Ação definida para *EXPULSAR (BAN)*.');
    }
    if (['delete', 'del', 'apagar', 'remover'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'delete', enabled: true, configured: true });
      return reply('💾 *AntiLink atualizado:* Ação definida para *APENAS APAGAR*.');
    }
    if (['warn', 'adv', 'advertir', 'aviso'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { action: 'warn', enabled: true, configured: true });
      return reply('💾 *AntiLink atualizado:* Ação definida para *APAGAR E ADVERTIR (WARN)*.');
    }

    // Configuração direta de Whitelist: permitir domínios
    if (['permitir', 'allow', 'whitelist'].includes(sub)) {
      const domains = args.slice(1).map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase().trim()).filter(Boolean);
      configManager.updatePluginConfig(from, 'antilink', { allowedDomains: domains, enabled: true, configured: true });
      const display = domains.length ? domains.join(', ') : 'Nenhum (Bloqueia Todos)';
      return reply(`💾 *AntiLink atualizado:* Domínios permitidos: \`${display}\``);
    }

    if (['bloquear', 'blockall', 'bloqueartodos'].includes(sub)) {
      configManager.updatePluginConfig(from, 'antilink', { allowedDomains: [], enabled: true, configured: true });
      return reply('💾 *AntiLink atualizado:* Bloqueando absolutamente *TODOS* os links.');
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
  async onMessage({ sock, msg, from, sender, _text, lang }) {
    if (!configManager.isPluginEnabled(from, 'antilink')) return false;

    // Extrai TODOS os textos relevantes (incluindo link previews e legendas de mídia)
    const fullText = extractAllTextForLinks(msg.message);
    if (!fullText || !URL_REGEX.test(fullText)) return false;

    // Reseta o lastIndex pois URL_REGEX tem flag /g
    URL_REGEX.lastIndex = 0;

    // Ignora se quem enviou for Dono ou Administrador
    if (settings.isOwner(sender, sock)) return false;
    const adminCheck = await checkAdminStatus(sock, from, sender);
    if (adminCheck.isAdmin) return false;

    const cfg = configManager.getPluginConfig(from, 'antilink') || {};
    const allowed = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];

    // Extrai todos os links encontrados no texto completo
    URL_REGEX.lastIndex = 0;
    const matches = fullText.match(URL_REGEX) || [];

    // Se não achou nenhum link real, não faz nada
    if (matches.length === 0) return false;

    // Verifica se TODOS os links estão na whitelist
    let isAllAllowed = allowed.length > 0; // Só "todos permitidos" se whitelist não for vazia
    if (isAllAllowed) {
      for (const match of matches) {
        if (!isDomainAllowed(match, allowed)) {
          isAllAllowed = false;
          break;
        }
      }
    }

    if (isAllAllowed) return false; // Todos os links estão na whitelist

    // Ação de Emergência (Zero Delay): Apagar mensagem do infrator
    await safeDelete(sock, from, msg.key);

    const targetData = await resolveParticipant(sock, from, sender);
    const targetPhone = targetData?.phoneJid || sender;
    const targetGroup = targetData?.groupJid || sender;
    const userNum = targetData?.displayNum || sender.replace(/@.*$/, '').replace(/\D/g, '');
    const action = cfg.action || 'delete';

    if (action === 'ban') {
      await safeKick(sock, from, targetGroup);
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.banned', { user: userNum }),
        mentions: [targetGroup, targetPhone]
      });
    } else if (action === 'warn') {
      const warnCfg = configManager.getPluginConfig(from, 'warn') || {};
      const maxWarns = warnCfg.maxWarns || 3;
      const count = configManager.addWarn(from, targetPhone, 'Envio de link não autorizado');

      if (count >= maxWarns) {
        await safeKick(sock, from, targetGroup);
        configManager.resetWarns(from, targetPhone);
        await sendSafeMessage(sock, from, {
          text: t(lang, 'warn.max_reached', { user: userNum, max: maxWarns }),
          mentions: [targetGroup, targetPhone]
        });
      } else {
        await sendSafeMessage(sock, from, {
          text: t(lang, 'antilink.warned', { user: userNum, warns: count, max: maxWarns }),
          mentions: [targetGroup, targetPhone]
        });
      }
    } else {
      // Apenas apagar
      await sendSafeMessage(sock, from, {
        text: t(lang, 'antilink.detected', { user: userNum }),
        mentions: [targetGroup, targetPhone]
      });
    }

    return true; // Interrompe o pipeline de mensagens
  }
};
