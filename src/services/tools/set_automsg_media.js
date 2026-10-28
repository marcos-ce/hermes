const configManager = require('../../core/configManager');

/**
 * Ferramenta de IA: anexa (ou remove) uma foto/vídeo/áudio como anúncio periódico (automsg).
 * A mídia é extraída da mensagem enviada ou citada pelo admin.
 */
module.exports = async function setAutomsgMedia({ sock, msg, from, lang, args }) {
  const action = args.action || 'attach';

  if (action === 'remove') {
    const currentCfg = configManager.getPluginConfig(from, 'automsg') || {};
    if (currentCfg.media?.path) {
      try { require('fs').unlinkSync(currentCfg.media.path); } catch (_) {}
    }
    configManager.updatePluginConfig(from, 'automsg', { media: null });
    return {
      success: true,
      message: '🗑️ Mídia do anúncio periódico removida. O anúncio volta a ser só texto (se houver).'
    };
  }

  const automsgPlugin = require('../../plugins/admin/automsg');

  const extracted = await automsgPlugin.extractMediaBuffer(sock, msg);
  if (!extracted) {
    return {
      success: false,
      error: 'Envie ou responda (cite) uma foto, vídeo ou áudio para anexar ao anúncio periódico do grupo.'
    };
  }

  if (extracted.buffer.length > automsgPlugin.MAX_MEDIA_BYTES) {
    return { success: false, error: 'Mídia muito grande para o anúncio periódico (máx. 64 MB).' };
  }

  const mediaMeta = automsgPlugin.saveAutomsgMedia(from, extracted.buffer, extracted);
  if (!mediaMeta) {
    return { success: false, error: 'Não foi possível salvar a mídia do anúncio periódico.' };
  }

  const currentCfg = configManager.getPluginConfig(from, 'automsg') || {};
  const updates = { media: mediaMeta, enabled: true };

  // Regra anti-ban: com mídia, o intervalo mínimo é 3h
  const currentInterval = currentCfg.intervalMinutes || 180;
  if (currentInterval < automsgPlugin.MIN_INTERVAL_WITH_MEDIA) {
    updates.intervalMinutes = automsgPlugin.MIN_INTERVAL_WITH_MEDIA;
  }

  // Legenda/texto que acompanha a mídia (se o admin especificar)
  if (args.caption && String(args.caption).trim()) {
    updates.message = String(args.caption).trim();
  }

  configManager.updatePluginConfig(from, 'automsg', updates);

  const typeLabel = mediaMeta.type === 'image' ? 'Foto' : mediaMeta.type === 'video' ? 'Vídeo' : 'Áudio';
  const intervalNote = updates.intervalMinutes
    ? `\n⏱️ Intervalo ajustado para 3h (mínimo com mídia, anti-ban).`
    : '';
  const captionNote = updates.message ? `\n💬 *Legenda:* ${updates.message}` : '';

  return {
    success: true,
    message: `📎 *Mídia anexada ao anúncio periódico!*\n🎞️ *Tipo:* ${typeLabel} (${(mediaMeta.size / 1024 / 1024).toFixed(2)} MB)${captionNote}${intervalNote}`
  };
};
