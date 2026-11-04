const configManager = require('../../core/configManager');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { sendSafeMessage } = require('../../utils/antiBan');
const { t } = require('../../utils/i18n');
const logger = require('../../utils/logger');

module.exports = {
  name: 'milestone',
  aliases: ['meta', 'milestone', 'metas', 'marco', 'objetivo', 'goal'],
  description: 'Metas progressivas de quantidade de membros com ações automáticas',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,
  priority: 50,

  configSchema: {
    title: {
      pt: 'Metas de Membros',
      es: 'Metas de Miembros',
      en: 'Member Milestones'
    },
    description: {
      pt: 'Celebra marcos de crescimento do grupo com mensagens e ações automáticas',
      es: 'Celebra hitos de crecimiento del grupo con mensajes y acciones automáticas',
      en: 'Celebrates group growth milestones with messages and automatic actions'
    },
    fields: []
  },

  /**
   * Hook passivo: verifica metas ao entrar novo membro
   */
  async onParticipantsUpdate({ sock, groupJid, targetPhoneJid, targetGroupJid, participantNumber, lang, action }) {
    if (action !== 'add') return false;

    const cfg = configManager.getPluginConfig(groupJid, 'milestone');
    if (!cfg || !cfg.enabled) return false;

    const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
    if (targets.length === 0) return false;

    let metadata;
    try {
      metadata = await getGroupMetadata(sock, groupJid);
    } catch (err) {
      logger.warn({ err, groupJid }, '[milestone] Falha ao obter metadados do grupo');
      return false;
    }

    const totalMembers = metadata?.participants?.length || 0;
    const groupName = metadata?.subject || 'Grupo';
    let triggered = false;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target || target.reached) continue;
      if (totalMembers < target.count) continue;

      // Meta atingida
      const userMention = `@${participantNumber}`;
      let text = (target.message || `🎉 O grupo atingiu {count} membros! Bem-vindo(a), {user}!`)
        .replace(/\{count\}/g, target.count)
        .replace(/\{user\}/g, userMention)
        .replace(/\{group\}/g, groupName)
        .replace(/\{total\}/g, totalMembers);

      try {
        const payload = {
          text,
          mentions: [targetGroupJid || `${participantNumber}@s.whatsapp.net`, targetPhoneJid].filter(Boolean)
        };

        const sentMsg = await sendSafeMessage(sock, groupJid, payload);

        // Ações extras
        const extraAction = target.action || 'announce';

        if (extraAction === 'pin' && sentMsg?.key) {
          try {
            await sock.sendMessage(groupJid, { pin: { type: 1, time: 86400 } }, { quoted: { key: sentMsg.key, message: { conversation: text } } });
          } catch (pinErr) {
            logger.warn({ pinErr }, '[milestone] Falha ao fixar mensagem de meta');
          }
        }

        if (extraAction === 'open_group') {
          try {
            await sock.groupSettingUpdate(groupJid, 'not_announcement');
          } catch (openErr) {
            logger.warn({ openErr }, '[milestone] Falha ao abrir grupo na meta');
          }
        }

        // Marca meta como atingida (merge não-destrutivo)
        const updatedTargets = [...targets];
        updatedTargets[i] = { ...target, reached: true, reachedAt: Date.now() };
        configManager.updatePluginConfig(groupJid, 'milestone', { targets: updatedTargets });

        triggered = true;
        logger.info({ groupJid, count: target.count, totalMembers }, '[milestone] Meta atingida e marcada');
      } catch (err) {
        logger.error({ err, groupJid, count: target.count }, '[milestone] Erro ao disparar meta');
      }
    }

    return triggered;
  },

  async execute({ sock, msg, from, sender, args, reply, t: translate, lang, isGroup }) {
    if (!isGroup) return reply(translate('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'milestone') || {};
    const targets = Array.isArray(cfg.targets) ? cfg.targets : [];

    // !meta on
    if (sub === 'on' || sub === 'ativar' || sub === 'activar' || sub === 'enable') {
      configManager.setPluginEnabled(from, 'milestone', true);
      return reply(t(lang, 'milestone.on'));
    }

    // !meta off
    if (sub === 'off' || sub === 'desativar' || sub === 'desactivar' || sub === 'disable') {
      configManager.setPluginEnabled(from, 'milestone', false);
      return reply(t(lang, 'milestone.off'));
    }

    // !meta del <count>
    if (sub === 'del' || sub === 'remover' || sub === 'remove' || sub === 'rm') {
      const count = parseInt(args[1], 10);
      if (!count || isNaN(count)) {
        return reply('⚠️ Informe o número da meta. Ex: `!meta del 100`');
      }
      const newTargets = targets.filter(t => t.count !== count);
      if (newTargets.length === targets.length) {
        return reply(`⚠️ Nenhuma meta de *${count}* membros encontrada.`);
      }
      configManager.updatePluginConfig(from, 'milestone', { targets: newTargets });
      return reply(t(lang, 'milestone.target_removed', { count }));
    }

    // !meta clear
    if (sub === 'clear' || sub === 'limpar' || sub === 'limpiar') {
      configManager.updatePluginConfig(from, 'milestone', { targets: [] });
      return reply(t(lang, 'milestone.cleared'));
    }

    // !meta reset <count> — reativa meta já atingida para disparar novamente
    if (sub === 'reset') {
      const count = parseInt(args[1], 10);
      if (!count || isNaN(count)) return reply('⚠️ Informe o número da meta. Ex: `!meta reset 100`');
      const newTargets = targets.map(t => t.count === count ? { ...t, reached: false, reachedAt: undefined } : t);
      configManager.updatePluginConfig(from, 'milestone', { targets: newTargets });
      return reply(`♻️ Meta de *${count}* membros reativada.`);
    }

    // !meta list
    if (sub === 'list' || sub === 'listar' || sub === 'listar' || sub === 'status') {
      if (targets.length === 0) return reply(t(lang, 'milestone.list_empty'));
      const enabled = configManager.isPluginEnabled(from, 'milestone');
      let text = t(lang, 'milestone.list_header') + `\n${enabled ? '✅ Ativado' : '❌ Desativado'}\n\n`;
      const sorted = [...targets].sort((a, b) => a.count - b.count);
      for (const tgt of sorted) {
        const status = tgt.reached ? `✅ ${t(lang, 'milestone.reached')}` : `⏳ ${t(lang, 'milestone.pending')}`;
        const actionLabel = tgt.action && tgt.action !== 'announce' ? ` [${tgt.action}]` : '';
        text += `• *${tgt.count} membros*${actionLabel} — ${status}\n  _${tgt.message || '(padrão)'}_\n`;
      }
      return reply(text.trim());
    }

    // !meta add <count> <mensagem>
    // Aceita: !meta add 100 Parabéns {user}!
    if (sub === 'add' || sub === 'adicionar' || sub === 'agregar') {
      const count = parseInt(args[1], 10);
      if (!count || isNaN(count) || count < 1) {
        return reply('⚠️ Informe o número de membros. Ex: `!meta add 100 Parabéns {user}, somos {count}!`');
      }

      // Detecta action no fim do texto: [...] --pin, [...] --open_group, [...] --raffle
      let rawText = args.slice(2).join(' ').trim();
      let action = 'announce';
      const actionMatch = rawText.match(/--?(pin|open_group|announce|raffle)\s*$/i);
      if (actionMatch) {
        action = actionMatch[1].toLowerCase();
        rawText = rawText.slice(0, rawText.length - actionMatch[0].length).trim();
      }

      const message = rawText || `🎉 O grupo atingiu {count} membros! Bem-vindo(a), {user}!`;

      // Merge: mantém targets existentes, substitui se já houver uma para o mesmo count
      const existing = targets.filter(t => t.count !== count);
      const newTargets = [...existing, { count, message, action, reached: false }]
        .sort((a, b) => a.count - b.count);

      configManager.updatePluginConfig(from, 'milestone', { targets: newTargets, enabled: true });
      return reply(t(lang, 'milestone.target_added', { count }));
    }

    // Sem sub-comando: exibe ajuda/status
    const enabled = configManager.isPluginEnabled(from, 'milestone');
    const statusStr = enabled ? translate('common.enabled') : translate('common.disabled');
    let help = `🎯 *Metas de Membros:* ${statusStr}\n`;
    if (targets.length === 0) {
      help += t(lang, 'milestone.list_empty');
    } else {
      const sorted = [...targets].sort((a, b) => a.count - b.count);
      for (const tgt of sorted) {
        const mark = tgt.reached ? '✅' : '⏳';
        help += `\n${mark} *${tgt.count}* membros — _${tgt.message || '(padrão)'}_`;
      }
    }
    help += `\n\n💡 *Comandos:*\n• \`!meta add 100 Parabéns {user}!\`\n• \`!meta del 100\`\n• \`!meta list\`\n• \`!meta reset 100\` (reativa meta já atingida)\n• \`!meta on\` / \`!meta off\``;
    return reply(help);
  }
};
