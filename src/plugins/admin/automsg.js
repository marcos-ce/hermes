const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const configManager = require('../../core/configManager');
const wizardEngine = require('../../core/wizardEngine');
const settings = require('../../config/settings');
const { sendSafeMessage } = require('../../utils/antiBan');
const logger = require('../../utils/logger');
const { parseHumanDuration, formatHumanDuration } = wizardEngine;
const { generateAutomsgVariation } = require('../../services/automsgVariationService');

/**
 * ============================================================
 *  BLINDAGEM ANTI-BAN — AUTOMSG (Anúncios Periódicos Seguros)
 * ============================================================
 * 1. Trava de Mídia Leve: apenas fotos/banners (máx 2.5 MB). Vídeos/áudios bloqueados.
 * 2. Hash Jitter Ativo: cada disparo gera um novo FileSha256 único em memória (anti-fingerprint).
 * 3. Limpeza de EXIF: remove metadados/GPS/dispositivo de JPEGs antes de salvar.
 * 4. Sleep Mode Noturno: pausa automática entre 23:00 e 08:00 (evita denúncias noturnas).
 * 5. Jitter Temporal: variação aleatória de +5 a +25 min a cada ciclo (quebra cron robótico).
 * 6. Checagem de Atividade: só envia se houver atividade real de membros no grupo.
 */

const AUTOMSG_MEDIA_DIR = path.join(process.cwd(), 'data', 'automsg');
const MAX_IMAGE_BYTES = Math.floor(2.5 * 1024 * 1024); // 2.5 MB (limite estrito anti-ban)
const MAX_MEDIA_BYTES = MAX_IMAGE_BYTES; // Compatibilidade com ferramentas legadas
const MIN_INTERVAL_WITH_MEDIA = 180; // 3h: intervalo mínimo com imagem anexada (anti-ban)
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
    'image/gif': '.gif'
  };
  if (map[m]) return map[m];
  if (m.startsWith('image/')) return '.jpg';
  return '.img';
}

/**
 * Remove EXIF/XMP (APP1) e comentários (COM) de um JPEG preservando a imagem.
 * Evita vazar GPS ou dados do dispositivo antes do envio. JS puro, sem libs externas.
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
    if (buffer[i] !== 0xFF) return buffer;
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
 * Injeta um salt aleatório (hash jitter) no buffer da mídia a cada disparo.
 * Altera matematicamente o FileSha256 e FileLength gerados pelo Baileys
 * sem degradar ou corromper a renderização visual da imagem.
 * Impede que os servidores MMS do WhatsApp detectem uploads de hashes repetidos.
 *
 * @param {Buffer} buffer - Buffer da imagem original
 * @param {string} [mimeType] - MIME type da imagem
 * @returns {Buffer} Buffer com novo hash SHA-256 único
 */
function applyMediaHashJitter(buffer, mimeType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return buffer;

  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

  // Salt aleatório de 16 a 48 bytes
  const saltLen = Math.floor(Math.random() * 33) + 16;
  const salt = crypto.randomBytes(saltLen);

  if (isJpeg) {
    // Procura o marcador EOI (0xFF 0xD9). Dados após o EOI são ignorados por decodificadores JPEG,
    // mas computados no FileSha256 do Baileys e dos servidores do WhatsApp.
    let eoiIndex = -1;
    for (let i = buffer.length - 2; i >= 2; i--) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
        eoiIndex = i + 2;
        break;
      }
    }
    if (eoiIndex !== -1) {
      return Buffer.concat([buffer.subarray(0, eoiIndex), salt]);
    }
    return Buffer.concat([buffer, salt]);
  }

  if (isPng) {
    // No PNG, após o chunk IEND (49 45 4E 44 + 4 bytes CRC = 8 bytes), trailing bytes são ignorados
    const iendIdx = buffer.indexOf('IEND');
    if (iendIdx !== -1 && iendIdx + 8 <= buffer.length) {
      return Buffer.concat([buffer.subarray(0, iendIdx + 8), salt]);
    }
    return Buffer.concat([buffer, salt]);
  }

  // WebP e outros: anexa o salt ao final do buffer
  return Buffer.concat([buffer, salt]);
}

/**
 * Retorna true se a hora local atual estiver dentro da janela de silêncio noturno (23:00 às 08:00).
 * @param {Date} [now]
 * @param {string} [timezone]
 * @returns {boolean}
 */
function isQuietHours(now = new Date(), timezone = 'America/Sao_Paulo') {
  let hour;
  try {
    const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', hour12: false });
    hour = parseInt(timeStr, 10);
  } catch (_) {
    hour = now.getHours();
  }
  return hour >= 23 || hour < 8;
}

/**
 * Extrai o buffer de mídia da mensagem direta ou citada (quote).
 * Identifica o tipo exato (image, video, audio) para permitir validação estrita.
 * @param {object} sock
 * @param {object} msg
 * @returns {Promise<{ buffer: Buffer, type: string, mimeType: string, isPtt: boolean, caption: string }|null>}
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
  let originalCaption = '';

  for (const mt of MEDIA_MSG_TYPES) {
    if (realMsg?.[mt]) {
      targetMsg = { key: msg?.key, message: realMsg };
      type = mt === 'imageMessage' ? 'image' : mt === 'videoMessage' ? 'video' : 'audio';
      mimeType = realMsg[mt]?.mimetype;
      isPtt = mt === 'audioMessage' && realMsg.audioMessage?.ptt === true;
      originalCaption = realMsg[mt]?.caption || '';
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
        originalCaption = unwrappedQuoted[mt]?.caption || '';
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
    return { buffer, type, mimeType, isPtt, caption: originalCaption };
  } catch (err) {
    logger.warn({ err: err?.message || err }, 'Falha ao baixar mídia do AutoMsg');
    return null;
  }
}

/**
 * Salva a imagem (com limpeza de metadados) em data/automsg/{grupo}.{ext}.
 * @param {string} groupJid
 * @param {Buffer} buffer
 * @param {object} info { type, mimeType }
 * @returns {object|null} Metadados da imagem salva
 */
function saveAutomsgMedia(groupJid, buffer, info) {
  try {
    if (!fs.existsSync(AUTOMSG_MEDIA_DIR)) {
      fs.mkdirSync(AUTOMSG_MEDIA_DIR, { recursive: true });
    }

    let cleanBuffer = buffer;
    if (info.type === 'image' && String(info.mimeType || '').toLowerCase().includes('jpeg')) {
      cleanBuffer = stripJpegMetadata(buffer);
    }

    const ext = extFromMime(info.mimeType);
    const basePrefix = sanitizeGroupId(groupJid);
    const fileName = `${basePrefix}${ext}`;
    const filePath = path.join(AUTOMSG_MEDIA_DIR, fileName);

    // Limpa arquivos anteriores do mesmo grupo caso a extensão tenha mudado (ex: .png -> .jpg)
    try {
      const existingFiles = fs.readdirSync(AUTOMSG_MEDIA_DIR);
      for (const f of existingFiles) {
        if (f.startsWith(`${basePrefix}.`) && f !== fileName) {
          try { fs.unlinkSync(path.join(AUTOMSG_MEDIA_DIR, f)); } catch (_) {}
        }
      }
    } catch (_) {}

    fs.writeFileSync(filePath, cleanBuffer);

    return {
      type: 'image',
      path: filePath,
      fileName,
      mimeType: info.mimeType || 'image/jpeg',
      isPtt: false,
      size: cleanBuffer.length,
      savedAt: Date.now()
    };
  } catch (err) {
    logger.error({ err }, 'Falha ao salvar mídia do AutoMsg em disco');
    return null;
  }
}

/**
 * Envia a imagem salva aplicando Hash Jitter único a cada disparo e presença humanizada via sendSafeMessage.
 * @param {object} sock
 * @param {string} groupJid
 * @param {object} media
 * @param {string} caption
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
async function sendAutomsgMedia(sock, groupJid, media, caption, options = {}) {
  if (!media?.path || !fs.existsSync(media.path)) return null;

  let buffer;
  try {
    buffer = fs.readFileSync(media.path);
  } catch (err) {
    logger.error({ err, path: media.path }, 'Falha ao ler mídia do AutoMsg');
    return null;
  }
  if (!buffer || buffer.length === 0) return null;

  // Trava de segurança: apenas imagens
  if (media.type && media.type !== 'image') {
    logger.warn({ type: media.type }, 'Envio bloqueado: apenas imagens são permitidas no AutoMsg');
    return null;
  }

  // Anti-Ban crítico: injeta hash jitter único em memória para gerar FileSha256 exclusivo
  const jitteredBuffer = applyMediaHashJitter(buffer, media.mimeType);

  const payload = {
    image: jitteredBuffer
  };

  if (media.mimeType) payload.mimetype = media.mimeType;
  if (caption && String(caption).trim()) payload.caption = String(caption).trim();

  return await sendSafeMessage(sock, groupJid, payload, options);
}

module.exports = {
  name: 'automsg',
  aliases: ['automsg', 'anuncio', 'lembrete', 'recordatorio', 'autoannounce', 'timermsg'],
  description: 'Mensagens e anúncios periódicos inteligentes com blindagem Anti-Ban (foto/texto, jitter temporal, sleep noturno)',
  ownerOnly: false,
  adminOnly: true,
  botAdminRequired: false,

  configSchema: {
    title: {
      pt: 'Mensagens Automáticas Periódicas (Anti-Ban)',
      es: 'Mensajes Automáticos Periódicos (Anti-Ban)',
      en: 'Periodic Automated Messages (Anti-Ban)'
    },
    description: {
      pt: 'Envia comunicados e fotos em intervalos regulares com blindagem contra bloqueios',
      es: 'Envía comunicados y fotos en intervalos regulares con protección contra bloqueos',
      en: 'Sends announcements and photos at regular intervals with ban protection'
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
          { value: 60, label: { pt: '1 hora (Apenas texto)', es: '1 hora (Solo texto)', en: '1 hour (Text only)' } },
          { value: 120, label: { pt: '2 horas (Apenas texto)', es: '2 horas (Solo texto)', en: '2 hours (Text only)' } },
          { value: 180, label: { pt: '3 horas (Recomendado Anti-Ban)', es: '3 horas (Recomendado Anti-Ban)', en: '3 hours (Recommended Anti-Ban)' } },
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
      },
      {
        name: 'sleepMode',
        type: 'boolean',
        question: {
          pt: 'Ativar Modo Silencioso Noturno (pausa os envios entre 23:00 e 08:00 para evitar denúncias)?',
          es: '¿Activar Modo Silencioso Nocturno (pausa envíos entre 23:00 y 08:00 para evitar reportes)?',
          en: 'Enable Night Sleep Mode (pauses sends between 23:00 and 08:00 to prevent reports)?'
        },
        default: true
      },
      {
        name: 'useAI',
        type: 'boolean',
        question: {
          pt: 'Usar IA para variar o texto automaticamente a cada envio? (Evita spam de mensagem idêntica):',
          es: '¿Usar IA para variar el texto automáticamente en cada envío? (Evita spam de mensaje idéntico):',
          en: 'Use AI to automatically vary the text on each send? (Prevents repeated message spam):'
        },
        default: true
      }
    ]
  },

  /**
   * Hook de execução periódica chamado a cada minuto pelo scheduler
   */
  async onSchedule({ sock, groupJid, group, config, queueTask, lastAutoMsgTimes, currentHHMM }) {
    const automsgCfg = config;
    if (!automsgCfg || !automsgCfg.enabled) return;

    // Requer ao menos um conteúdo para disparo: texto ou imagem salva
    const hasMedia = hasMediaAttached(automsgCfg);
    if (!automsgCfg.message && !hasMedia) return;

    // Blindagem Anti-Ban 1: Sleep Mode Noturno (23:00 às 08:00)
    const sleepMode = automsgCfg.sleepMode !== false;
    if (sleepMode) {
      let hh = -1;
      if (currentHHMM && typeof currentHHMM === 'string') {
        hh = parseInt(currentHHMM.split(':')[0], 10);
      }
      if (isNaN(hh) || hh < 0) {
        const now = new Date();
        try {
          const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: settings.timezone || 'America/Sao_Paulo', hour: '2-digit', hour12: false });
          hh = parseInt(timeStr, 10);
        } catch (_) {
          hh = now.getHours();
        }
      }
      if (hh >= 23 || hh < 8) {
        return; // Pausado durante a madrugada para evitar denúncias de membros
      }
    }

    // Blindagem Anti-Ban 2: Intervalo mínimo de 3h quando há imagem anexada
    const baseMinutes = hasMedia
      ? Math.max(automsgCfg.intervalMinutes || 180, MIN_INTERVAL_WITH_MEDIA)
      : Math.max(automsgCfg.intervalMinutes || 180, 5);

    // Blindagem Anti-Ban 3: Jitter Temporal (+5 a +25 minutos) para quebrar padrão robótico
    const currentJitter = automsgCfg.nextJitterMinutes || 0;
    const effectiveMinutes = baseMinutes + currentJitter;
    const intervalMs = effectiveMinutes * 60 * 1000;

    const lastSent = lastAutoMsgTimes.get(groupJid) || automsgCfg.lastSent || 0;

    if (lastSent === 0) {
      // Primeiro ciclo: aguarda o intervalo completo antes de disparar
      const initialJitter = Math.floor(Math.random() * 21) + 5;
      lastAutoMsgTimes.set(groupJid, Date.now());
      configManager.updatePluginConfig(groupJid, 'automsg', {
        lastSent: Date.now(),
        nextJitterMinutes: initialJitter
      });
      return;
    }

    const timeSinceLast = Date.now() - lastSent;
    if (timeSinceLast < intervalMs) return;

    // Blindagem Anti-Ban 4: Atividade Real do Grupo (evita spammar grupo inativo)
    const onlyIfActive = automsgCfg.onlyIfActive !== false;
    const lastActivity = group?.lastActivity || 0;
    if (onlyIfActive && lastActivity <= lastSent) {
      return; // Sem atividade nova de membros: não dispara
    }

    queueTask({
      type: 'automsg',
      groupJid,
      run: async () => {
        const nextJitter = Math.floor(Math.random() * 21) + 5; // novo jitter para o próximo ciclo
        lastAutoMsgTimes.set(groupJid, Date.now());
        configManager.updatePluginConfig(groupJid, 'automsg', {
          lastSent: Date.now(),
          nextJitterMinutes: nextJitter
        });

        // ── Variação de texto via IA (anti-spam de mensagem idêntica) ──
        let msgToSend = automsgCfg.message || '';
        if (msgToSend && automsgCfg.useAI !== false) {
          try {
            const groupLangForAI = group?.lang || 'pt';
            const varied = await Promise.race([
              generateAutomsgVariation(msgToSend, groupLangForAI),
              new Promise(resolve => setTimeout(() => resolve(null), 7000))
            ]);
            if (varied) msgToSend = varied;
          } catch (_) { /* fallback: usa texto original */ }
        }

        if (hasMedia) {
          // Envia imagem com hash jitter novo em memória + legenda (possivelmente variada)
          const sent = await sendAutomsgMedia(sock, groupJid, automsgCfg.media, msgToSend);
          if (!sent && msgToSend) {
            await sendSafeMessage(sock, groupJid, { text: msgToSend });
          }
        } else {
          await sendSafeMessage(sock, groupJid, { text: msgToSend });
        }
      }
    });
  },

  async execute({ sock, msg, from, sender, args, reply, t, lang, isGroup }) {
    if (!isGroup) return reply(t('common.group_only'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = configManager.getPluginConfig(from, 'automsg') || {};
    const groupLang = lang || configManager.getGroupLang(from);

    // Se o módulo não estiver configurado e o usuário chamar sem argumentos, inicia o wizard
    if (!sub && !cfg.configured) {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    // Configuração assistida via Wizard
    if (sub === 'config' || sub === 'wizard' || sub === 'setup') {
      return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
    }

    // Ativação rápida
    if (sub === 'on' || sub === 'ativar' || sub === 'activar') {
      configManager.setPluginEnabled(from, 'automsg', true);
      if (!cfg.configured) {
        return await wizardEngine.startWizard(sock, msg, from, sender, 'automsg');
      }
      return reply(t('config.module_toggled_on', { module: 'AUTOMSG' }));
    }

    // Desativação rápida
    if (sub === 'off' || sub === 'desativar') {
      configManager.setPluginEnabled(from, 'automsg', false);
      return reply(t('config.module_toggled_off', { module: 'AUTOMSG' }));
    }

    // Controle do Modo Silencioso Noturno (23:00 às 08:00)
    if (['silencio', 'sleep', 'noturno'].includes(sub)) {
      const mode = (args[1] || '').toLowerCase();
      if (['on', 'ativar', 'sim', '1'].includes(mode)) {
        configManager.updatePluginConfig(from, 'automsg', { sleepMode: true, enabled: true });
        return reply('🌙 *Modo Silencioso Noturno ATIVADO!* Os anúncios serão pausados entre *23:00 e 08:00* para evitar denúncias.');
      }
      if (['off', 'desativar', 'nao', 'não', '0'].includes(mode)) {
        configManager.updatePluginConfig(from, 'automsg', { sleepMode: false, enabled: true });
        return reply('☀️ *Modo Silencioso Noturno DESATIVADO.* Os anúncios rodarão normalmente durante a madrugada.');
      }
      const currentSleep = cfg.sleepMode !== false;
      return reply(`🌙 *Modo Silencioso Noturno:* ${currentSleep ? '*Ativado* (pausa das 23h às 08h)' : '*Desativado*'}\nUse \`/automsg silencio on\` ou \`/automsg silencio off\`.`);
    }

    // Bloqueio educativo de vídeos e áudios
    if (['video', 'audio', 'aud', 'gravacao', 'som'].includes(sub)) {
      return reply('⚠️ *Envio de Vídeo/Áudio Bloqueado (Segurança Anti-Ban)*\n\nPara proteger o número contra banimentos do WhatsApp por tráfego excessivo e denúncias, o anúncio periódico aceita *apenas fotos ou banners leves* (máx. 2.5 MB).\n\n👉 *Como usar:* envie ou responda a uma foto/banner com o comando `/automsg foto [legenda]`');
    }

    // Captura de Foto/Banner para o anúncio periódico
    if (['midia', 'media', 'mídia', 'foto', 'imagem', 'imagen', 'banner'].includes(sub)) {
      const extracted = await extractMediaBuffer(sock, msg);
      if (!extracted) {
        return reply('⚠️ Envie ou *responda (quote)* a uma foto com a legenda `/automsg foto`.\n_Exemplo: responda ao banner do grupo com `/automsg foto Acesse nosso site!`_');
      }

      // Trava Anti-Ban: Rejeita vídeos e áudios com explicação
      if (extracted.type !== 'image') {
        return reply('⚠️ *Tipo de mídia não permitido (Anti-Ban)*\n\nO anúncio periódico aceita *apenas fotos/imagens leves* (JPG, PNG ou WebP de até 2.5 MB). Vídeos pesados geram alto tráfego contínuo e causam banimento rápido pelo WhatsApp.\n\n👉 Por favor, envie uma *foto ou banner*.');
      }

      // Trava de tamanho máximo de imagem (2.5 MB)
      if (extracted.buffer.length > MAX_IMAGE_BYTES) {
        return reply(`⚠️ *Imagem muito pesada!* (${(extracted.buffer.length / 1024 / 1024).toFixed(2)} MB)\nO limite máximo para anúncios automáticos é *2.5 MB* para garantir leveza e proteção Anti-Ban. Comprima a imagem e tente novamente.`);
      }

      const mediaMeta = saveAutomsgMedia(from, extracted.buffer, extracted);
      if (!mediaMeta) {
        return reply('❌ Não foi possível salvar a imagem. Tente novamente.');
      }

      const update = {
        media: mediaMeta,
        lastSent: Date.now(),
        enabled: true,
        configured: true
      };

      // Captura o texto/link informado junto com o comando
      const customCaption = args.slice(1).join(' ').trim();
      if (customCaption) {
        update.message = customCaption;
      } else if (extracted.caption && !extracted.caption.startsWith('/') && !extracted.caption.startsWith('!')) {
        update.message = extracted.caption;
      }

      // Backstop Anti-Ban: com foto anexada, o intervalo mínimo é 3h
      const currentInterval = cfg.intervalMinutes || 180;
      let intervalNote = '';
      if (currentInterval < MIN_INTERVAL_WITH_MEDIA) {
        update.intervalMinutes = MIN_INTERVAL_WITH_MEDIA;
        intervalNote = `\n⏱️ *Intervalo ajustado para 3h* (mínimo com foto, anti-ban).`;
      }
      configManager.updatePluginConfig(from, 'automsg', update);

      const activeCaption = update.message || cfg.message || '';
      const captionInfo = activeCaption ? `\n💬 *Legenda:* ${activeCaption}` : '\n💬 *Legenda:* _(nenhuma)_';

      return reply(`📎 *Foto do AutoMsg atualizada com proteção Anti-Ban!*\n🖼️ *Tamanho:* ${(mediaMeta.size / 1024 / 1024).toFixed(2)} MB\n🛡️ *Hash Jitter:* Ativo (novo SHA-256 a cada envio)${captionInfo}\n\n⏱️ A foto será enviada a cada intervalo configurado.${intervalNote}`);
    }

    // Remoção da mídia (volta a ser apenas texto)
    if (['removermidia', 'semmidia', 'limparmidia', 'clearmidia', 'nomedia', 'apagarmidia', 'removerfoto'].includes(sub)) {
      const media = cfg.media;
      if (media?.path) {
        try { fs.unlinkSync(media.path); } catch (_) {}
      }
      configManager.updatePluginConfig(from, 'automsg', { media: null });
      return reply('🗑️ *Foto do AutoMsg removida.* O anúncio voltará a ser apenas texto (se houver).');
    }

    // Configuração direta: /automsg 3h <texto...> ou /automsg 120 <texto...>
    const durSub = parseHumanDuration(sub);
    const parsedMinutes = durSub ? durSub.totalMinutes : parseInt(sub, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes >= 5) {
      if (hasMediaAttached(cfg) && parsedMinutes < MIN_INTERVAL_WITH_MEDIA) {
        return reply(`⚠️ Com foto anexada, o intervalo mínimo é *3 horas* (anti-ban).\nUse \`/automsg 3h\` ou mais, ou remova a foto com \`/automsg removerfoto\`.`);
      }
      const customText = args.slice(1).join(' ').trim();
      const formattedTime = formatHumanDuration(parsedMinutes, 'minutes', groupLang);
      if (!customText) {
        configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, enabled: true, lastSent: Date.now() });
        return reply(`💾 *AutoMsg atualizado:* Intervalo alterado para *a cada ${formattedTime}*.`);
      }
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: parsedMinutes, message: customText, enabled: true, lastSent: Date.now() });
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
        return reply(`⚠️ Com foto anexada, o intervalo mínimo é *3 horas* (anti-ban).\nUse \`/automsg tempo 3h\` ou mais, ou remova a foto com \`/automsg removerfoto\`.`);
      }
      const formattedTime = formatHumanDuration(minutesArg, 'minutes', groupLang);
      configManager.updatePluginConfig(from, 'automsg', { intervalMinutes: minutesArg, enabled: true, lastSent: Date.now() });
      return reply(`💾 *AutoMsg atualizado:* Intervalo definido para *a cada ${formattedTime}*.`);
    }

    // Configuração direta de texto: /automsg texto <texto...>
    if (['texto', 'msg', 'mensagem'].includes(sub)) {
      const customText = args.slice(1).join(' ').trim();
      if (!customText) {
        return reply('⚠️ Digite o texto do anúncio. Ex: `/automsg texto Sejam todos bem-vindos!`');
      }
      configManager.updatePluginConfig(from, 'automsg', { message: customText, enabled: true, lastSent: Date.now() });
      return reply(`💾 *AutoMsg atualizado!*\n💬 *Novo texto:*\n${customText}`);
    }

    // Disparo imediato de teste (preview para o administrador)
    if (['teste', 'test', 'probar', 'preview'].includes(sub)) {
      const activeCfg = configManager.getPluginConfig(from, 'automsg') || cfg;
      const hasMedia = hasMediaAttached(activeCfg);
      if (!activeCfg.message && !hasMedia) {
        return reply('⚠️ O AutoMsg ainda não possui texto ou foto configurada para teste.');
      }

      // Reinicia lastSent para evitar disparo duplicado pelo scheduler logo em seguida
      configManager.updatePluginConfig(from, 'automsg', { lastSent: Date.now() });

      if (hasMedia) {
        const sent = await sendAutomsgMedia(sock, from, activeCfg.media, activeCfg.message || '', { quoted: msg });
        if (!sent && activeCfg.message) {
          await sendSafeMessage(sock, from, { text: activeCfg.message }, { quoted: msg });
        }
      } else {
        await sendSafeMessage(sock, from, { text: activeCfg.message }, { quoted: msg });
      }
      return;
    }

    // Status / Ajuda Geral
    const isEnabled = configManager.isPluginEnabled(from, 'automsg');
    const statusText = isEnabled ? t('common.enabled') : t('common.disabled');
    const configuredMinutes = cfg.intervalMinutes || 180;
    const hasMedia = hasMediaAttached(cfg);
    const effectiveMinutes = hasMedia ? Math.max(configuredMinutes, MIN_INTERVAL_WITH_MEDIA) : configuredMinutes;
    const formattedInterval = formatHumanDuration(effectiveMinutes, 'minutes', groupLang);
    const alertMsg = cfg.message || 'Nenhuma mensagem configurada';
    const sleepActive = cfg.sleepMode !== false;
    const onlyActive = cfg.onlyIfActive !== false;

    let help = `📢 *AutoMsg (Anúncios Periódicos Anti-Ban)*\n`;
    help += `• *Status:* ${statusText}\n`;
    help += `• *Intervalo Efetivo:* a cada ${formattedInterval} (+ variação anti-ban)\n`;
    help += `• *Modo Silencioso Noturno:* ${sleepActive ? '✅ Ativo (23h às 08h)' : '❌ Desativado'}\n`;
    help += `• *Apenas com Movimento:* ${onlyActive ? '✅ Sim (economiza envios)' : '❌ Não'}\n`;

    if (cfg.media?.path) {
      help += `• *Foto Anexada:* Sim (${((cfg.media.size || 0) / 1024 / 1024).toFixed(2)} MB)\n`;
    }
    help += `• *Mensagem/Legenda Atual:*\n${alertMsg}\n`;

    if (hasMedia && configuredMinutes < MIN_INTERVAL_WITH_MEDIA) {
      help += `\n⚠️ _Nota: Intervalo fixado em 3h no agendador devido à foto anexada (anti-ban)._\n`;
    }

    help += `\n💡 *Comandos Rápidos:*\n`;
    help += `• \`/automsg on\` ou \`/automsg off\`\n`;
    help += `• \`/automsg foto [legenda]\` (anexa foto/banner com proteção anti-ban)\n`;
    help += `• \`/automsg texto [seu texto]\` (atualiza apenas a mensagem)\n`;
    help += `• \`/automsg tempo 3h\` (ou \`/automsg tempo 30m\`)\n`;
    help += `• \`/automsg silencio on\` ou \`off\` (pausa das 23h às 08h)\n`;
    help += `• \`/automsg removerfoto\` (remove a foto anexada)\n`;
    help += `• \`/automsg teste\` (envia um teste imediato)\n`;
    help += `• \`/automsg config\` (abre o assistente interativo)`;

    return reply(help);
  },

  // Helpers exportados para testes e reuso seguro pelas ferramentas de IA
  extractMediaBuffer,
  saveAutomsgMedia,
  sendAutomsgMedia,
  stripJpegMetadata,
  applyMediaHashJitter,
  hasMediaAttached,
  isQuietHours,
  MIN_INTERVAL_WITH_MEDIA,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES
};
