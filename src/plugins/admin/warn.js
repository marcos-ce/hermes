const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { safeKick, sendSafeMessage } = require('../../utils/antiBan');
const { extractTarget, resolveTarget, checkAdminStatus } = require('../../utils/jidResolver');
const settings = require('../../config/settings');

module.exports = {
  name: 'warn',
  aliases: ['warn', 'adv', 'advertir', 'advertencia', 'aviso', 'unwarn', 'perdoar', 'perdonar', 'warns', 'advertencias'],
  description: 'Sistema de advertências progressivas com banimento automático',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: true,

  configSchema: {
    title: {
      pt: 'Sistema de Advertências',
      es: 'Sistema de Advertencias',
      en: 'Warning System'
    },
    description: {
      pt: 'Define o limite máximo de advertências antes da expulsão',
      es: 'Define el límite máximo de advertencias antes de la expulsión',
      en: 'Sets the maximum number of warnings before expulsion'
    },
    fields: [
      {
        name: 'maxWarns',
        type: 'number',
        question: {
          pt: 'Quantas advertências um membro pode receber antes de ser banido? (Padrão: 3):',
          es: '¿Cuántas advertencias puede recibir un miembro antes de ser expulsado? (Predeterminado: 3):',
          en: 'How many warnings can a member receive before being banned? (Default: 3):'
        },
        default: 3,
        min: 1,
        max: 10
      }
    ]
  },

  async execute({ sock, msg, from, sender, args, text, command, reply, t, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const trigger = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'warn') || {};
    const maxWarns = cfg.maxWarns || 3;

    // Configuração via Wizard
    if (trigger === 'config' || trigger === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'warn');
    }

    // Listagem de membros advertidos (!warns ou !warn list)
    if (trigger === 'list' || trigger === 'lista' || ['warns', 'advertencias'].includes(command)) {
      const allWarns = configManager.getAllWarns(from);
      const entries = Object.entries(allWarns).filter(([_, data]) => data.count > 0);

      if (entries.length === 0) {
        return reply(t('warn.list_empty'));
      }

      let listText = `${t('warn.list_title')}\n\n`;
      const mentions = [];
      for (const [jid, data] of entries) {
        const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
        listText += t('warn.list_item', { user: num, count: data.count }) + '\n';
        mentions.push(jid);
      }

      return reply(listText, { mentions });
    }

    // Remover advertência (!unwarn @user ou !warn del @user)
    const isUnwarn = trigger === 'del' || trigger === 'remove' || trigger === 'perdoar' || 
                     ['unwarn', 'perdoar', 'perdonar'].includes(command);

    if (isUnwarn) {
      const targetText = trigger === 'del' || trigger === 'remove' ? args.slice(1).join(' ') : text;
      const targetData = await resolveTarget(sock, msg, from, targetText);

      if (!targetData) {
        return reply(t('common.not_found_target'));
      }

      const newCount = configManager.removeWarn(from, targetData.phoneJid);
      return reply(t('warn.removed', { user: targetData.displayNum, warns: newCount, max: maxWarns }), {
        mentions: [targetData.groupJid, targetData.phoneJid]
      });
    }

    // Adicionar Advertência (!warn @user [motivo])
    const targetData = await resolveTarget(sock, msg, from, text);
    if (!targetData) {
      return reply(t('common.not_found_target'));
    }

    const targetPhone = targetData.phoneJid;
    const targetGroup = targetData.groupJid;
    const targetNum = targetData.displayNum;

    // Não permite advertir admins ou o dono
    if (settings.isOwner(targetPhone, sock) || settings.isOwner(targetGroup, sock)) {
      return reply(t('warn.cannot_warn_admin'));
    }

    const adminCheck = await checkAdminStatus(sock, from, targetPhone);
    if (adminCheck.isAdmin) {
      return reply(t('warn.cannot_warn_admin'));
    }

    // Extrai o motivo
    const reasonParts = text.replace(/@?\d{8,15}/, '').trim();
    const reason = reasonParts || 'Comportamento inadequado';

    const count = configManager.addWarn(from, targetPhone, reason);

    if (count >= maxWarns) {
      // Atingiu limite: Ban imediato usando o JID de grupo exato e zera warns
      await safeKick(sock, from, targetGroup);
      configManager.resetWarns(from, targetPhone);
      return reply(t('warn.max_reached', { user: targetNum, max: maxWarns }), {
        mentions: [targetGroup, targetPhone]
      });
    }

    return reply(t('warn.added', { user: targetNum, reason, warns: count, max: maxWarns }), {
      mentions: [targetGroup, targetPhone]
    });
  }
};
