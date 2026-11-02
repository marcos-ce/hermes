const { sendSafeMessage, checkHidetagCooldown, touchHidetagCooldown } = require('../../utils/antiBan');
const { getGroupMetadata } = require('../../utils/jidResolver');
const { t } = require('../../utils/i18n');

module.exports = async function hidetagAnnouncement({ sock, from, lang, args }) {
  const text = args.message;
  if (!text || text.trim().length === 0) {
    return { success: false, error: t(lang, 'hidetag.empty') };
  }

  // BLINDAGEM ANTI-BAN: Parcimônia extrema para comunicados gerais.
  // Limita a 1 comunicado a cada 2 minutos por grupo para evitar flags de spam da Meta.
  const cd = checkHidetagCooldown(from);
  if (!cd.allowed) {
    return {
      success: false,
      error: `Cooldown Anti-Ban ativo: comunicados gerais devem ser usados com extrema parcimônia (apenas avisos cruciais). Aguarde ${cd.remainingSec}s para enviar outro comunicado.`
    };
  }
  touchHidetagCooldown(from);

  // Envia comunicado oficial com destaque visual SEM marcação em massa.
  await sendSafeMessage(sock, from, {
    text: `📢 *COMUNICADO OFICIAL:*\n\n${text.trim()}`
  });

  return { success: true };
};
