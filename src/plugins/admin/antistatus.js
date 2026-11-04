'use strict';

const configManager  = require('../../core/configManager');
const wizardEngine   = require('../../core/wizardEngine');
const { safeDelete, sendSafeMessage } = require('../../utils/antiBan');
const { t }          = require('../../utils/i18n');
const logger         = require('../../utils/logger');

/**
 * antistatus — Apaga automaticamente mensagens que mencionam @status no grupo.
 *
 * O WhatsApp permite marcar "@status" em mensagens de grupo, o que notifica
 * todos os contatos que seguem aquele status — comportamento invasivo e
 * indesejado em grupos administrados. Este plugin detecta e apaga essas
 * mensagens instantaneamente (ação de segurança → zero delay anti-ban).
 *
 * Configuração disponível:
 *   - warn: também emite um aviso público após apagar (padrão: false)
 *   - notifyPrivate: envia DM ao infrator explicando a regra (padrão: false)
 */

module.exports = {
  name: 'antistatus',
  aliases: ['antistatus', 'antistatusmention', 'statusblock', 'blockstatus'],
  description: 'Apaga mensagens que marcam @status no grupo',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,
  priority: 9, // executa antes de antilink (10), depois de nada crítico

  configSchema: {
    title: {
      pt: 'Bloqueio de Menção ao @status',
      es: 'Bloqueo de Mención @status',
      en: '@status Mention Blocker'
    },
    description: {
      pt: 'Apaga mensagens que marcam @status, evitando spam silencioso',
      es: 'Borra mensajes que mencionan @status, evitando spam silencioso',
      en: 'Deletes messages mentioning @status to prevent silent spam'
    },
    fields: [
      {
        name: 'warn',
        type: 'boolean',
        default: false,
        label: {
          pt: 'Avisar publicamente após apagar?',
          es: '¿Avisar públicamente tras borrar?',
          en: 'Warn publicly after deleting?'
        },
        question: {
          pt: 'Deseja enviar um aviso público quando apagar a menção ao @status?\n[1] Não — apaga em silêncio (recomendado)\n[2] Sim — avisa o grupo',
          es: '¿Enviar aviso público al borrar la mención @status?\n[1] No — borrar en silencio (recomendado)\n[2] Sí — avisar al grupo',
          en: 'Send a public warning when deleting the @status mention?\n[1] No — delete silently (recommended)\n[2] Yes — warn the group'
        },
        choices: [
          { value: false, label: { pt: 'Não — silêncio', es: 'No — silencio', en: 'No — silent' } },
          { value: true,  label: { pt: 'Sim — avisa', es: 'Sí — avisa', en: 'Yes — warn' } }
        ]
      }
    ]
  },

  // ─── Comando direto (!antistatus on/off/config/status) ────────────────────
  async execute({ sock, msg, from, sender, args, reply, lang }) {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
      configManager.setPluginEnabled(from, 'antistatus', true);
      return reply('Filtro anti-status ativado com sucesso. Mensagens mencionando @status no grupo serão apagadas imediatamente.');
    }

    if (sub === 'off') {
      configManager.setPluginEnabled(from, 'antistatus', false);
      return reply('Filtro anti-status desativado.');
    }

    if (sub === 'config') {
      return wizardEngine.startWizard({ sock, msg, from, sender, lang, pluginName: 'antistatus' });
    }

    if (sub === 'status') {
      const enabled = configManager.isPluginEnabled(from, 'antistatus');
      const cfg     = configManager.getPluginConfig(from, 'antistatus') || {};
      const warnOn  = cfg.warn ? '✅' : '❌';
      const st      = enabled ? '✅ ativo' : '❌ inativo';
      return reply(
        `🚫 *Anti-Status* — ${st}\n` +
        `• Aviso público: ${warnOn}`
      );
    }

    // Sem subcomando → abre wizard
    return wizardEngine.startWizard({ sock, msg, from, sender, lang, pluginName: 'antistatus' });
  },

  // ─── Hook passivo: monitora toda mensagem do grupo ────────────────────────
  async onMessage({ sock, msg, from, sender, text, lang }) {
    if (!configManager.isPluginEnabled(from, 'antistatus')) return false;

    // Detecta menção a status@broadcast no campo mentionedJid do Baileys
    const realMsg = msg?.message?.ephemeralMessage?.message ||
                    msg?.message?.viewOnceMessage?.message  ||
                    msg?.message;

    const contextInfo =
      realMsg?.extendedTextMessage?.contextInfo  ||
      realMsg?.imageMessage?.contextInfo          ||
      realMsg?.videoMessage?.contextInfo          ||
      realMsg?.documentMessage?.contextInfo       ||
      realMsg?.buttonsMessage?.contextInfo        ||
      null;

    const mentionedJids = contextInfo?.mentionedJid || [];
    const hasStatusMention = mentionedJids.some(
      jid => String(jid).toLowerCase().includes('status@broadcast')
    );

    // Também detecta "@status" literal no texto (fallback para clientes que não preenchem mentionedJid)
    const hasStatusText = text ? /@status\b/i.test(text) : false;

    if (!hasStatusMention && !hasStatusText) return false;

    // Ação de segurança — zero delay (não passa pelo sendSafeMessage)
    try {
      await safeDelete(sock, msg);
      logger.info({ from, sender }, '[antistatus] Menção a @status apagada');
    } catch (err) {
      logger.warn({ err, from }, '[antistatus] Falha ao apagar menção a @status');
      return false;
    }

    // Aviso público opcional (passa pelo delay humanizado)
    const cfg  = configManager.getPluginConfig(from, 'antistatus') || {};
    if (cfg.warn) {
      const senderNum = sender.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      await sendSafeMessage(
        sock,
        from,
        {
          text: t(lang, 'antistatus.warn', {
            user: `@${senderNum}`,
            fallback: `@${senderNum} Mensagens com menção ao @status são apagadas automaticamente neste grupo.`
          }),
          mentions: [sender]
        },
        { quoted: null }
      );
    }

    return true; // interrompe o pipeline
  }
};
