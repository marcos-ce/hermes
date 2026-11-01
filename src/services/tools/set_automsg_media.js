const configManager = require('../../core/configManager');

/**
 * Ferramenta de IA: anexa (ou remove) uma foto como anúncio periódico (automsg).
 * Apenas fotos leves (máx 2.5 MB) são aceitas por proteção Anti-Ban.
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
      message: '🗑️ Foto do anúncio periódico removida. O anúncio volta a ser só texto (se houver).'
    };
  }

  const automsgPlugin = require('../../plugins/admin/automsg');

  const extracted = await automsgPlugin.extractMediaBuffer(sock, msg);
  if (!extracted) {
    return {
      success: false,
      error: 'Envie ou responda (cite) uma foto para anexar ao anúncio periódico do grupo.'
    };
  }

  // Trava Anti-Ban: bloqueia vídeos e áudios
  if (extracted.type !== 'image') {
    return {
      success: false,
      error: '⚠️ Segurança Anti-Ban: O anúncio periódico aceita apenas fotos/banners leves (JPG, PNG ou WebP). Vídeos e áudios não são permitidos para evitar bloqueios do WhatsApp.'
    };
  }

  if (extracted.buffer.length > automsgPlugin.MAX_IMAGE_BYTES) {
    return {
      success: false,
      error: `Imagem muito pesada (${(extracted.buffer.length / 1024 / 1024).toFixed(2)} MB). O limite máximo para o anúncio periódico é de 2.5 MB (Anti-Ban).`
    };
  }

  const mediaMeta = automsgPlugin.saveAutomsgMedia(from, extracted.buffer, extracted);
  if (!mediaMeta) {
    return { success: false, error: 'Não foi possível salvar a imagem do anúncio periódico.' };
  }

  const currentCfg = configManager.getPluginConfig(from, 'automsg') || {};
  const updates = { media: mediaMeta, enabled: true, configured: true };

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

  const intervalNote = updates.intervalMinutes
    ? `\n⏱️ Intervalo ajustado para 3h (mínimo com foto, anti-ban).`
    : '';
  const captionNote = updates.message ? `\n💬 *Legenda:* ${updates.message}` : '';

  return {
    success: true,
    message: `📎 *Foto anexada ao anúncio periódico com proteção Anti-Ban!*\n🖼️ *Tamanho:* ${(mediaMeta.size / 1024 / 1024).toFixed(2)} MB\n🛡️ *Hash Jitter:* Ativo (novo SHA-256 a cada envio)${captionNote}${intervalNote}`
  };
};
