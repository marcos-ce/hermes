const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const { sendSafeMessage } = require('../../utils/antiBan');
const logger = require('../../utils/logger');
const { parseHumanDuration, formatHumanDuration } = wizardEngine;

/**
 * ============================================================
 *  SUPORTE A MÍDIA (Vídeo / Áudio / Foto) — Envio Anti-Ban
 * ============================================================
 */

const AUTOMSG_MEDIA_DIR = path.join(process.cwd(), 'data', 'automsg');
const MAX_MEDIA_BYTES = 64 * 1024 * 1024; // 64 MB (limite de segurança)
const MIN_INTERVAL_WITH_MEDIA = 180; // 3h: intervalo mínimo quando há mídia anexada (anti-ban)
const MEDIA_MSG_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];

/** Sanitiza o JID do grupo para uso como nome de arquivo seguro. */
function sanitizeGroupId(groupJid) {
  return String(groupJid || 'grupo').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Retorna true se o grupo possui mídia anexada ao AutoMsg. */
function hasMediaAttached(cfg) {
  return Boolean(cfg?.media?.path);
}

/** Infere a extensão de arquivo a partir do MIME type. */
function extFromMime(mimeType) {
  const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/amr': '.amr',
    'audio/aac': '.aac',
    'audio/wav': '.wav'
  };
  if (map[m]) return map[m];
  if (m.startsWith('image/')) return '.img';
  if (m.startsWith('video/')) return '.mp4';
  if (m.startsWith('audio/')) return '.ogg';
  return '.bin';
}

/**
 * Remove EXIF/XMP (APP1) e comentários (COM) de um JPEG preservando a imagem.
 * O WhatsApp re-codifica a mídia no upload, mas isso evita vazar GPS/dispositivo
 * do arquivo-fonte antes do envio. JS puro, sem dependências externas.
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function stripJpegMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return buffer;
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return buffer; // não é JPEG

  const chunks = [buffer.subarray(0, 2)]; // SOI (FF D8) preservado
  let i = 2;
  const len = buffer.length;

  while (i < len) {
    if (buffer[i] !== 0xFF) return buffer; // estrutura inesperada: devolve original
    const marker = buffer[i + 1];
    if (marker === undefined) return buffer;

    // Marcadores sem campo de tamanho (TEM, RST0-7)
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      chunks.push(buffer.subarray(i, i + 2));
      i += 2;
      continue;
    }

    // SOS: copia o restante (dados de entropia) e encerra
    if (marker === 0xDA) {
      chunks.push(buffer.subarray(i));
      break;
    }
    // EOI: fim de arquivo
    if (marker === 0xD9) {
      chunks.push(buffer.subarray(i, i + 2));
      break;
    }

    // Segmentos com tamanho (2 bytes big-endian, incluindo os 2 do próprio tamanho)
    if (i + 4 > len) return buffer;
    const segLen = (buffer[i + 2] << 8) | buffer[i + 3];
    if (segLen < 2) return buffer;
    const segEnd = i + 2 + segLen;
    if (segEnd > len) return buffer;

    // APP1 (0xE1) contém EXIF/XMP; COM (0xFE) é comentário — removemos
    if (marker === 0xE1 || marker === 0xFE) {
      i = segEnd;
      continue;
    }

    chunks.push(buffer.subarray(i, segEnd));
    i = segEnd;
  }

  return Buffer.concat(chunks);
}

/**
 * Extrai o buffer da mídia (foto/vídeo/áudio) da mensagem direta ou citada (quote).
 * @param {object} sock
 * @param {object} msg
 * @returns {Promise<{ buffer: Buffer, type: string, mimeType: string, isPtt: boolean }|null>}
 */
async function extractMediaBuffer(sock, msg) {
  const realMsg = msg?.message?.ephemeralMessage?.message ||
                  msg?.message?.viewOnceMessage?.message ||
                  msg?.message?.viewOnceMessageV2?.message ||
                  msg?.message?.documentWithCaptionMessage?.message ||
                  msg?.message;

  const contextInfo = realMsg?.extendedTextMessage?.contextInfo ||
                      realMsg?.imageMessage?.contextInfo ||
                      realMsg?.videoMessage?.contextInfo ||
                      realMsg?.audioMessage?.contextInfo ||
                      realMsg?.documentMessage?.contextInfo;

  const rawQuoted = contextInfo?.quotedMessage;
  const unwrappedQuoted = rawQuoted?.ephemeralMessage?.message ||
                          rawQuoted?.viewOnceMessage?.message ||
                          rawQuoted?.viewOnceMessageV2?.message ||
                          rawQuoted?.documentWithCaptionMessage?.message ||
                          rawQuoted;

  let targetMsg = null;
  let type = null;
  let mimeType = null;
  let isPtt = false;

  for (const mt of MEDIA_MSG_TYPES) {
    if (realMsg?.[mt]) {
      targetMsg = { key: msg?.key, message: realMsg };
      type = mt === 'imageMessage' ? 'image' : mt === 'videoMessage' ? 'video' : 'audio';
      mimeType = realMsg[mt]?.mimetype;
      isPtt = mt === 'audioMessage' && realMsg.audioMessage?.ptt === true;
      break;
    }
  }

  if (!targetMsg) {
    for (const mt of MEDIA_MSG_TYPES) {
      if (unwrappedQuoted?.[mt]) {
        targetMsg = {
          key: {
            remoteJid: msg?.key?.remoteJid,
            id: contextInfo?.stanzaId,
            participant: contextInfo?.participant
          },
          message: unwrappedQuoted
        };
        type = mt === 'imageMessage' ? 'image' : mt === 'videoMessage' ? 'video' : 'audio';
        mimeType = unwrappedQuoted[mt]?.mimetype;
        isPtt = mt === 'audioMessage' && unwrappedQuoted.audioMessage?.ptt === true;
        break;
      }
    }
  }

  if (!targetMsg) return null;

  try {
    const buffer = await downloadMediaMessage(
      targetMsg,
      'buffer',
      {},
      { logger, reuploadRequest: sock?.updateMediaMessage }
    );
    if (!buffer || buffer.length === 0) return null;
    return { buffer, type, mimeType, isPtt };
  } catch (err) {
    logger.warn({ err: err?.message || err }, 'Falha ao baixar mídia do AutoMsg');
    return null;
  }
}

/**
 * Salva a mídia (com limpeza de metadados) em data/automsg/{grupo}.{ext}.
 * @param {string} groupJid
 * @param {Buffer} buffer
 * @param {object} info { type, mimeType, isPtt }
 * @returns {object|null} metadados da mídia salva
 */
function saveAutomsgMedia(groupJid, buffer, info) {
  try {
    if (!fs.existsSync(AUTOMSG_MEDIA_DIR)) {
      fs.mkdirSync(AUTOMSG_MEDIA_DIR, { recursive: true });
    }

    // Camada 1: limpeza de metadados (só fotos; o WhatsApp re-codifica vídeo/áudio no upload)
    let cleanBuffer = buffer;
    if (info.type === 'image' && String(info.mimeType || '').toLowerCase().includes('jpeg')) {
      cleanBuffer = stripJpegMetadata(buffer);
    }

    const ext = extFromMime(info.mimeType);
    const fileName = `${sanitizeGroupId(groupJid)}${ext}`;
    const filePath = path.join(AUTOMSG_MEDIA_DIR, fileName);
    fs.writeFileSync(filePath, cleanBuffer);

    return {
      type: info.type,
      path: filePath,
      fileName,
      mimeType: info.mimeType || '',
      isPtt: Boolean(info.isPtt),
      size: cleanBuffer.length,
      savedAt: Date.now()
    };
  } catch (err) {
    logger.error({ err }, 'Falha ao salvar mídia do AutoMsg em disco');
    return null;
  }
}

/**
 * Envia a mídia salva através do sendSafeMessage (jitter de leitura, "digitando..."
 * proporcional ao caption quando houver e restauração de presença furtiva).
 *
 * A cada disparo o arquivo é relido do disco e repassado ao Baileys, que gera
 * MediaKey + FileSha256 NOVOS a cada envio (assinatura única automática, sem
 * necessidade de alterar o arquivo original).
 * @param {object} sock
 * @param {string} groupJid
 * @param {object} media
 * @param {string} caption
 * @returns {Promise<object|null>}
 */
async function sendAutomsgMedia(sock, groupJid, media, caption) {
  if (!media?.path || !fs.existsSync(media.path)) return null;

  let buffer;
  try {
    buffer = fs.readFileSync(media.path);
  } catch (err) {
    logger.error({ err, path: media.path }, 'Falha ao ler mídia do AutoMsg');
    return null;
  }
  if (!buffer || buffer.length === 0) return null;

  const payload = {};
  if (media.type === 'image') payload.image = buffer;
  else if (media.type === 'video') payload.video = buffer;
  else if (media.type === 'audio') { payload.audio = buffer; if (media.isPtt) payload.ptt = true; }
  else return null;

  if (media.mimeType) payload.mimetype = media.mimeType;

  const hasCaption = Boolean(caption) && media.type !== 'audio';
  if (hasCaption) payload.caption = caption;

  return await sendSafeMessage(sock, groupJid, payload);
}

module.exports = {
  name: 'automsg',
  aliases: ['automsg', 'anuncio', 'lembrete', 'recordatorio', 'autoannounce', 'timermsg'],
  description: 'Mensagens e anúncios periódicos inteligentes (texto ou mídia, só envia se houver movimento)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Mensagens Automáticas Periódicas',
      es: 'Mensajes Automáticos Periódicos',
      en: 'Periodic Automated Messages'
    },
    description: {
      pt: 'Envia avisos e anúncios em intervalos regulares sem floodar grupos parados',
      es: 'Envía avisos y anuncios en intervalos regulares sin saturar grupos inactivos',
      en: 'Sends announcements at regular intervals without spamming inactive groups'
    },
    fields: [
      {
        name: 'message',
        type: 'string',
        question: {
          pt: 'Digite o texto do comunicado/anúncio periódico:',
          es: 'Escribe el texto del comunicado/anuncio periódico:',
          en: 'Enter the periodic announcement text:'
        },
        default: '📢 *Comunicado Importante:* Fiquem atentos às regras do grupo!'
      },
      {
        name: 'intervalMinutes',
        type: 'choice',
        question: {
          pt: 'Qual o intervalo de tempo entre cada envio do comunicado?',
          es: '¿Cuál es el intervalo de tiempo entre cada envío del comunicado?',
          en: 'What is the time interval between announcement messages?'
        },
        choices: [
          { value: 60, label: { pt: '1 hora', es: '1 hora', en: '1 hour' } },
          { value: 120, label: { pt: '2 horas', es: '2 horas', en: '2 hours' } },
          { value: 180, label: { pt: '3 horas (Recomendado)', es: '3 horas (Recomendado)', en: '3 hours (Recommended)' } },
          { value: 360, label: { pt: '6 horas', es: '6 horas', en: '6 hours' } },
          { value: 720, label: { pt: '12 horas', es: '12 horas', en: '12 hours' } },
          { value: 1440, label: { pt: '24 horas (1 dia)', es: '24 horas (1 día)', en: '24 hours (1 day)' } }
        ],
        unit: 'minutes',
        default: 180
      },
      {
        name: 'onlyIfActive',
        type: 'boolean',
        question: {
          pt: 'Enviar apenas se tiver havido movimentação de membros desde o último aviso?',
          es: '¿Enviar solo si hubo actividad de miembros desde el último aviso?',
          en: 'Only send if there was member activity since the last announcement?'
        },
        default: true
      }
    ]
  },

  /**
   * Hook de execução periódica chamado a cada minuto pelo scheduler
   */
  async onSchedule({ sock, groupJid, group, config, queueTask, lastAutoMsgTimes }) {
    const automsgCfg = config;
    if (!automsgCfg || !automsgCfg.enabled) return;

    // Requer ao menos um conteúdo para disparo: texto ou mídia salva
    const hasMedia = hasMediaAttached(automsgCfg);
    if (!automsgCfg.message && !hasMedia) return;

    // Backstop anti-ban: com mídia anexada, o intervalo efetivo nunca fica abaixo de 3h
    const intervalMinutes = hasMedia
      ? Math.max(automsgCfg.intervalMinutes || 180, MIN_INTERVAL_WITH_MEDIA)
      : (automsgCfg.intervalMinutes || 180);
    const intervalMs = intervalMinutes * 60 * 1000;
    const lastSent = lastAutoMsgTimes.get(groupJid) || automsgCfg.lastSent || 0;

    if (lastSent === 0) {
      // Primeiro boot: inicializa o marco temporal para aguardar o intervalo completo antes de disparar
      lastAutoMsgTimes.set(groupJid, Date.now());
      configManager.updatePluginConfig(groupJid, 'automsg', { lastSent: Date.now() });
    } else {
      const timeSinceLast = Date.now() - lastSent;

      if (timeSinceLast >= intervalMs) {
        const lastActivity = group.lastActivity || 0;
        const onlyIfActive = automsgCfg.onlyIfActive !== false;

        // Se onlyIfActive estiver ativado, só envia se houver atividade desde o último envio
        if (!onlyIfActive || lastActivity > lastSent) {
          queueTask({
            type: 'automsg',
            groupJid,
            run: async () => {
              lastAutoMsgTimes.set(groupJid, Date.now());
              configManager.updatePluginConfig(groupJid, 'automsg', { lastSent: Date.now() });

              if (hasMedia) {
                // Envia a mídia (com legenda/texto, se houver); se falhar, cai para texto
                const sent = await sendAutomsgMedia(sock, groupJid, automsgCfg.media, automsgCfg.message || '');
                if (!sent && automsgCfg.message) {
                  await sendSafeMessage(sock, groupJid, { text: automsgCfg.message });
                }
              } else {
                await sendSafeMessage(sock, groupJid, { text: automsgCfg.message });
              }
            }
          });
        }
      }
    }
  },

  async execute({ sock, msg, from, sender, args, reply, t, lang, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'automsg') || {};
    const groupLang = lang || configManager.getGroupLang(from);

    // Digitar /automsg sem argumentos (ou /automsg config) abre direto o assistente interativo!
    if (!sub || sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'automsg', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
      }
      return reply(t('config.module_toggled_on', { module: 'AUTOMSG' }));
    }

    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'automsg', false);
      return reply(t('config.module_toggled_off', { module: 'AUTOMSG' }));
    }

    // Captura de mídia (foto/vídeo/áudio) para o anúncio periódico
    if (['midia', 'media', 'mídia', 'video', 'foto', 'imagem', 'imagen', 'audio', 'aud'].includes(sub)) {
      const extracted = await extractMediaBuffer(sock, msg);
      if (!extracted) {
        return reply('⚠️ Envie ou *responda (quote)* a uma foto, vídeo ou áudio com a legenda `/automsg midia`.\n_Ex.: responda ao vídeo com `/automsg midia`._');
      }
      if (extracted.buffer.length > MAX_MEDIA_BYTES) {
        return reply('⚠️ Mídia muito grande para o anúncio periódico (máx. 64 MB).');
      }
      const mediaMeta = saveAutomsgMedia(from, extracted.buffer, extracted);
      if (!mediaMeta) {
        return reply('❌ Não foi possível salvar a mídia. Tente novamente.');
      }

      const update = { media: mediaMeta };
      const currentInterval = cfg.intervalMinutes || 180;
      let intervalNote = '';
      if (currentInterval < MIN_INTERVAL_WITH_MEDIA) {
        update.intervalMinutes = MIN_INTERVAL_WITH_MEDIA;
        intervalNote = `\n⏱️ *Intervalo ajustado para 3h* (mínimo com mídia, anti-ban).`;
      }
      configManager.updatePluginConfig(from, 'automsg', update);

      const typeLabel = mediaMeta.type === 'image' ? 'Foto' : mediaMeta.type === 'video' ? 'Vídeo' : 'Áudio';
      return reply(`📎 *Mídia do AutoMsg atualizada!*\n🎞️ *Tipo:* ${typeLabel}\n💾 *Tamanho:* ${(mediaMeta.size / 1024 / 1024).toFixed(2)} MB\n\nA mídia será enviada a cada intervalo configurado (com a legenda/texto, se houver).${intervalNote}`);
    }

    // Remoção da mídia do anúncio (volta a ser apenas texto)
    if (['removermidia', 'semmidia', 'limparmidia', 'clearmidia', 'nomedia', 'apagarmidia'].includes(sub)) {
      const media = cfg.media;
      if (media?.path) {
        try { fs.unlinkSync(media.path); } catch (_) {}
      }
      configManager.updatePluginConfig(from, 'automsg', { media: null });
      return reply('🗑️ *Mídia do AutoMsg removida.* O anúncio voltará a ser apenas texto (se houver).');
    }

    // Configuração direta: /automsg 3h <texto...> ou /automsg 120 <texto...> (primeiro arg é tempo/número)
    const durSub = parseHumanDuration(sub);
    const parsedMinutes = durSub ? durSub.totalMinutes : parseInt(sub, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes >= 5) {
      if (hasMediaAttached(cfg) && parsedMinutes < MIN_INTERVAL_WITH_MEDIA) {
        return reply(`⚠️ Com mídia anexada, o intervalo mínimo é *3 horas* (anti-ban).\nUse \`/automsg 3h\` ou mais, ou remova a mídia com \`/automsg removermidia\`.`);
      }
      const customText = args.slice(1).join(' ').trim();
      const formattedTime = formatHumanDuration(parsedMinutes, 'minutes', groupLang);
      if (!customText) {
        configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, enabled: true });
        return reply(`💾 *AutoMsg atualizado:* Intervalo alterado para *a cada ${formattedTime}*.`);
      }
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, message: customText, enabled: true });
      return reply(`💾 *AutoMsg atualizado e ATIVADO!*\n⏱️ *Intervalo:* a cada ${formattedTime}\n💬 *Mensagem:*\n${customText}`);
    }

    // Configuração direta de tempo: /automsg tempo 3h ou /automsg tempo 60
    if (['tempo', 'intervalo', 'minutos', 'min', 'horas', 'hora'].includes(sub)) {
      const rawArg = args.slice(1).join(' ').trim();
      const dur = parseHumanDuration(rawArg);
      const minutesArg = dur ? dur.totalMinutes : parseInt(rawArg, 10);
      if (isNaN(minutesArg) || minutesArg < 5) {
        return reply('⚠️ Digite um intervalo válido. Ex: `/automsg tempo 3h` (3 horas) ou `/automsg tempo 30m` (30 minutos)');
      }
      if (hasMediaAttached(cfg) && minutesArg < MIN_INTERVAL_WITH_MEDIA) {
        return reply(`⚠️ Com mídia anexada, o intervalo mínimo é *3 horas* (anti-ban).\nUse \`/automsg tempo 3h\` ou mais, ou remova a mídia com \`/automsg removermidia\`.`);
      }
      const formattedTime = formatHumanDuration(minutesArg, 'minutes', groupLang);
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: minutesArg, enabled: true });
      return reply(`💾 *AutoMsg atualizado:* Intervalo definido para *a cada ${formattedTime}*.`);
    }

    // Configuração direta de texto: /automsg texto <texto...>
    if (['texto', 'msg', 'mensagem'].includes(sub)) {
      const customText = args.slice(1).join(' ').trim();
      if (!customText) {
        return reply('⚠️ Digite o texto do anúncio. Ex: `/automsg texto Sejam todos bem-vindos!`');
      }
      configManager.updatePluginConfig(from, 'automsg', { message: customText, enabled: true });
      return reply(`💾 *AutoMsg atualizado!*\n💬 *Novo texto:*\n${customText}`);
    }

    // Disparo imediato de teste (preview para o administrador)
    if (['teste', 'test', 'probar', 'preview'].includes(sub)) {
      const hasMedia = hasMediaAttached(cfg);
      if (!cfg.message && !hasMedia) {
        return reply('⚠️ O AutoMsg ainda não possui texto ou mídia configurada para teste.');
      }
      await reply('🧪 *Disparando teste do AutoMsg agora...*');
      if (hasMedia) {
        const sent = await sendAutomsgMedia(sock, from, cfg.media, cfg.message || '');
        if (!sent && cfg.message) {
          await sendSafeMessage(sock, from, { text: cfg.message });
        }
      } else {
        await sendSafeMessage(sock, from, { text: cfg.message });
      }
      return;
    }

    const status = configManager.isPluginEnabled(from, 'automsg') ? t('common.enabled') : t('common.disabled');
    const configuredMinutes = cfg.intervalMinutes || 180;
    const hasMedia = hasMediaAttached(cfg);
    const effectiveMinutes = hasMedia ? Math.max(configuredMinutes, MIN_INTERVAL_WITH_MEDIA) : configuredMinutes;
    const formattedInterval = formatHumanDuration(effectiveMinutes, 'minutes', groupLang);
    const alertMsg = cfg.message || 'Nenhuma mensagem configurada';

    let help = `${t('automsg.status', { status, interval: formattedInterval })}\n💬 *Mensagem atual:*\n${alertMsg}`;
    if (hasMedia && configuredMinutes < MIN_INTERVAL_WITH_MEDIA) {
      help += `\n⚠️ _Nota: Intervalo fixado em 3h no agendador devido à mídia anexada (anti-ban)._`;
    }
    if (cfg.media?.path) {
      const mediaLabel = cfg.media.type === 'image' ? 'Foto' : cfg.media.type === 'video' ? 'Vídeo' : 'Áudio';
      help += `\n📎 *Mídia anexada:* ${mediaLabel} (${((cfg.media.size || 0) / 1024 / 1024).toFixed(2)} MB)`;
    }
    help += `\n\n💡 *Comandos Diretos:*\n• \`/automsg on\` ou \`/automsg off\`\n• \`/automsg 3h [seu texto aqui]\` (define intervalo e mensagem direto)\n• \`/automsg tempo 2h\` (ou \`/automsg tempo 30m\`)\n• \`/automsg texto [seu texto]\` (atualiza apenas a mensagem)\n• \`/automsg midia\` (anexa foto/vídeo/áudio; com mídia o mínimo é 3h)\n• \`/automsg removermidia\` (remove a mídia anexada)\n• \`/automsg teste\` (dispara um envio de teste imediatamente)\n• \`/automsg config\` (abre assistente interativo)`;
    return reply(help);
  },

  // Helpers de mídia exportados para reuso pelas ferramentas de IA (Tool Calling)
  extractMediaBuffer,
  saveAutomsgMedia,
  sendAutomsgMedia,
  stripJpegMetadata,
  hasMediaAttached,
  MIN_INTERVAL_WITH_MEDIA,
  MAX_MEDIA_BYTES
};
