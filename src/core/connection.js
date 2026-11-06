const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  Browsers 
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const settings = require('../config/settings');
const logger = require('../utils/logger');
const { groupCache } = require('../utils/cache');
const { registerParticipantLid } = require('../utils/jidResolver');
const pollTracker = require('../utils/pollTracker');
const pinTracker = require('../utils/pinTracker');
const { handleMessage } = require('../handlers/messageHandler');
const { handleParticipantsUpdate, handleJoinRequest } = require('../handlers/groupHandler');
const scheduler = require('./scheduler');
const configManager = require('./configManager');
const { sendSafeMessage, safeGroupLeave } = require('../utils/antiBan');
const { t } = require('../utils/i18n');

/**
 * Auto-cura de sessões de criptografia corrompidas (Over 2000 messages into the future / No matching sessions).
 * Exclui exclusivamente os arquivos de sessão afetados preservando creds.json intacto, forçando o Baileys
 * a solicitar novas PreKeys limpas ao WhatsApp sem deslogar a conta.
 * @param {object} msg Mensagem de stub com erro de decriptografia
 */
async function healBrokenSession(msg) {
  try {
    const authDir = path.resolve(process.cwd(), 'src', 'auth');
    if (!fs.existsSync(authDir)) return;

    const jid = msg?.key?.remoteJid || '';
    const participant = msg?.key?.participant || msg?.participant || '';
    const candidates = [
      jid.replace(/@.*$/, ''),
      participant.replace(/@.*$/, '')
    ].filter(Boolean);

    const files = await fs.promises.readdir(authDir);
    let removedCount = 0;

    for (const file of files) {
      if (file === 'creds.json') continue; // JAMAIS toca no creds.json

      if (file.startsWith('session-') || file.startsWith('sender-key-')) {
        const matchesCandidate = candidates.some(c => c && file.includes(c));
        if (matchesCandidate) {
          try {
            await fs.promises.unlink(path.join(authDir, file));
            removedCount++;
          } catch (_) {}
        }
      }
    }

    if (removedCount > 0) {
      logger.warn({ removedCount, candidates }, 'Auto-Healing Baileys: Sessões corrompidas removidas para forçar renegociação de chaves');
    }
  } catch (err) {
    logger.error({ err }, 'Erro no auto-healing de sessões');
  }
}

let currentSock = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const pendingPresentationTimers = new Map(); // groupJid -> timer

/**
 * Cancela o timer da mensagem de apresentação oficial de um grupo recém-adicionado
 * (por exemplo, quando o administrador já começou a interagir no grupo antes de 1 minuto).
 * @param {string} groupJid 
 * @returns {boolean}
 */
function cancelPendingPresentation(groupJid) {
  if (!groupJid) return false;
  const timer = pendingPresentationTimers.get(groupJid);
  if (timer) {
    clearTimeout(timer);
    pendingPresentationTimers.delete(groupJid);
    logger.info({ groupJid }, '[Anti-Ban] Apresentação automática cancelada: administrador já interagiu no grupo.');
    return true;
  }
  return false;
}
// Mini-store de mensagens recentes para re-decriptografia pós-reconexão (substitui makeInMemoryStore)
// Guarda as últimas 1500 mensagens em RAM com eviction FIFO. Sem TTL = sem vazamento de memória.
const msgStore = new Map();
const MSG_STORE_MAX = 1500;

// Cache de IDs de mensagens revogadas/apagadas (evita que retentativas do Baileys reenviem mensagens excluídas)
const revokedMsgCache = new NodeCache({ stdTTL: 3600, checkperiod: 300, useClones: false });

/**
 * Registra uma mensagem como revogada/apagada.
 * Remove do msgStore imediatamente e impede que getMessage a retorne para o Baileys em retentativas.
 * @param {string} msgId 
 */
function revokeMsgFromStore(msgId) {
  if (!msgId) return;
  revokedMsgCache.set(msgId, true);
  if (msgStore.has(msgId)) {
    msgStore.delete(msgId);
  }
}

/**
 * Verifica se um ID de mensagem foi revogado/apagado
 * @param {string} msgId 
 * @returns {boolean}
 */
function isMessageRevoked(msgId) {
  if (!msgId) return false;
  return Boolean(revokedMsgCache.get(msgId));
}

/**
 * Registra uma mensagem no mini-store para suporte a re-decriptografia do Baileys.
 * Deve ser chamado após o pipeline processar cada mensagem com sucesso.
 * @param {object} msg 
 */
function storeMsgForRetry(msg) {
  if (msg?.key?.id && isMessageRevoked(msg.key.id)) return;
  if (!msg?.key?.id || !msg.message) return;
  if (!msgStore.has(msg.key.id) && msgStore.size >= MSG_STORE_MAX) {
    const oldest = msgStore.keys().next().value;
    msgStore.delete(oldest);
  }
  msgStore.set(msg.key.id, msg.message);
}

// Cache anti-loop de retentativas de decriptografia (Baileys Best Practice)
const msgRetryCounterCache = new NodeCache({ stdTTL: 300, useClones: false });

/**
 * Inicia e gerencia a conexão do socket Baileys com reconexão automática
 * @param {object} options Opções de inicialização
 * @returns {Promise<object>} Instância do socket Baileys
 */
async function connectBot(options = {}) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Encerra e limpa listeners da conexão anterior para prevenir vazamento de memória
  if (currentSock) {
    try {
      currentSock.ev.removeAllListeners();
      currentSock.end?.(new Error('Reiniciando conexão Baileys'));
    } catch (_) {}
    currentSock = null;
  }

  const authDir = path.resolve(process.cwd(), 'src', 'auth');
  let authState;
  try {
    authState = await useMultiFileAuthState(authDir);
  } catch (authErr) {
    logger.error({ authErr: authErr.message }, 'Erro ao carregar autenticação em src/auth. Limpando pasta corrompida...');
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }
    } catch (_) {}
    authState = await useMultiFileAuthState(authDir);
  }
  const { state, saveCreds } = authState;
  let version = [2, 3000, 1043857760];
  let isLatest = false;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 8s ao buscar versão')), 8000)
    );
    const verRes = await Promise.race([fetchLatestBaileysVersion(), timeoutPromise]);
    if (verRes?.version) {
      version = verRes.version;
      isLatest = verRes.isLatest;
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Falha/timeout ao consultar versão remota do Baileys, usando fallback seguro');
  }

  logger.info(`Iniciando Baileys v${version.join('.')} (Última versão: ${isLatest})`);

  const isPairingCode = options.pairingCode || 
                        process.argv.includes('--code') || 
                        settings.connectionMethod === 'code';

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false, // OBRIGATÓRIO (API depreciada evitada)
    markOnlineOnConnect: false, // MODO FURTIVO ANTI-BAN: Nunca ficar online 24h
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache, // Evita tempestades de retentativas de decriptografia
    getMessage: async (key) => {
      const id = key?.id;
      if (!id || isMessageRevoked(id)) return undefined;
      if (msgStore.has(id)) return msgStore.get(id);
      const poll = pollTracker.getPoll(id);
      if (poll?.message) return poll.message;
      return undefined;
    },
    shouldIgnoreJid: (jid) => typeof jid === 'string' && (jid.endsWith('@newsletter') || jid.endsWith('@broadcast')),
    browser: Browsers.windows('Chrome')
  });

  currentSock = sock;
  // Nota: scheduler.updateSocket() é chamado somente após connection === 'open'
  // para garantir que o socket está autenticado antes de qualquer tick agendado.

  // ==========================================
  // Fluxo de Autenticação: Pairing Code
  // ==========================================
  if (isPairingCode && !state.creds.registered) {
    const rawNumber = options.phoneNumber || settings.botNumber;
    const cleanNumber = (rawNumber || '').replace(/\D/g, '');

    if (!cleanNumber) {
      console.log('\n❌ [ERRO] Número do Bot não configurado no .env para Pairing Code!');
      console.log('Adicione BOT_NUMBER=5511... no seu .env ou rode node index.js --setup\n');
    } else {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(cleanNumber);
          const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log('\n====================================================');
          console.log(`📱 CÓDIGO DE EMPARELHAMENTO DO WHATSAPP:`);
          console.log(`👉  [ ${formattedCode} ]  👈`);
          console.log('📌 ONDE DIGITAR O CÓDIGO (NÃO É NO TERMINAL DA HOSPEDAGEM):');
          console.log('1. Abra o WhatsApp no celular do chip do bot');
          console.log('2. Vá em Configurações (ou ⋮) > Aparelhos Conectados');
          console.log('3. Toque em "Conectar um aparelho"');
          console.log('4. Na parte inferior, toque em "Conectar com número de telefone"');
          console.log(`5. Digite o código [ ${formattedCode} ] no seu celular!`);
          console.log('====================================================\n');
        } catch (err) {
          logger.error({ err }, 'Erro ao solicitar Pairing Code');
        }
      }, 3000);
    }
  }

  // ==========================================
  // Monitoramento de Eventos
  // ==========================================

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Exibição do QR Code no terminal se conexão for via QR
    if (qr && !isPairingCode) {
      if (process.stdout.isTTY) console.clear();
      console.log('\n Escaneie o QR Code abaixo com o seu WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nAguardando leitura do QR Code...\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn(`Conexão encerrada. Motivo: ${statusCode || 'Desconhecido'}. Desconectado por Logout: ${isLoggedOut}`);

      if (isLoggedOut) {
        console.log('\n====================================================');
        console.log('🛑 [LOGOUT DETECTADO] Sessão desconectada pelo WhatsApp (Código 401).');
        console.log('🧹 Limpando src/auth automaticamente e mantendo bot ONLINE...');
        console.log('🔄 Gerando novo QR Code / Pairing Code em 3 segundos...');
        console.log('====================================================\n');

        try {
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
        } catch (err) {
          logger.error({ err }, 'Erro ao limpar pasta auth pós-logout');
        }

        reconnectAttempts = 0;
        reconnectTimer = setTimeout(() => {
          connectBot(options).catch(err => {
            logger.error({ err }, 'Falha ao reconectar. Reagendando em 5s...');
            reconnectTimer = setTimeout(() => connectBot(options).catch(() => {}), 5000);
          });
        }, 3000);
      } else {
        const delay = Math.min(3000 * Math.pow(1.3, reconnectAttempts), 30000);
        reconnectAttempts++;
        console.log(`🔄 Reconectando ao WhatsApp em ${(delay / 1000).toFixed(1)} segundos (tentativa ${reconnectAttempts})...`);
        reconnectTimer = setTimeout(() => {
          connectBot(options).catch(err => {
            logger.error({ err }, 'Falha ao reconectar. Reagendando em 5s...');
            reconnectTimer = setTimeout(() => connectBot(options).catch(() => {}), 5000);
          });
        }, delay);
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('\n====================================================');
      console.log('🚀 BOT CONECTADO COM SUCESSO AO WHATSAPP!');
      console.log(`🏷️  ID: ${sock.user?.id || 'Desconhecido'}`);
      if (sock.user?.lid) {
        console.log(`🔒 LID: ${sock.user.lid}`);
      }
      console.log(`🛡️  ATIVO`);
      console.log('====================================================\n');

      // Atualiza o scheduler com o socket autenticado (somente após conexão confirmada)
      scheduler.updateSocket(sock);
      require('../services/siteBridge').updateSocket(sock);

      // Registra identidade do bot no mapa LID <-> Telefone
      if (sock.user) {
        registerParticipantLid({
          id: sock.user.id,
          jid: sock.user.id,
          lid: sock.user.lid
        });
      }

      // Carrega e mapeia todos os grupos participantes e seus LIDs antecipadamente
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupCount = Object.keys(groups || {}).length;
        console.log(`👥 Grupos sincronizados na inicialização: ${groupCount}`);
        for (const [gid, meta] of Object.entries(groups || {})) {
          groupCache.set(gid, meta);
          if (!configManager.isGroupBanned(gid)) {
            if (!configManager.getGroup(gid)) {
              configManager.ensureGroupStarterKit(gid, meta.subject || '');
            }
            configManager.markWelcomeSent(gid, true);
          }
          if (Array.isArray(meta.participants)) {
            for (const p of meta.participants) {
              registerParticipantLid(p);
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Erro ao sincronizar grupos na inicialização');
      }

      // Garante presença invisível/unavailable ao conectar
      try {
        await sock.sendPresenceUpdate('unavailable');
      } catch (_) {}
    }
  });

  // Mapeamento automático de compartilhamento de número e LID
  sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
    if (lid && jid) {
      registerParticipantLid({ id: lid, jid, lid });
    }
  });

  // Mensagens recebidas
  sock.ev.on('messages.upsert', async (m) => {
    try {
      // Auto-healing de sessões corrompidas e rastreamento de pins em grupos
      if (Array.isArray(m?.messages)) {
        for (const msg of m.messages) {
          const from = msg?.key?.remoteJid;
          if (from && from.endsWith('@g.us')) {
            const realMsg = msg?.message?.ephemeralMessage?.message ||
                            msg?.message?.viewOnceMessage?.message ||
                            msg?.message?.viewOnceMessageV2?.message ||
                            msg?.message?.documentWithCaptionMessage?.message ||
                            msg?.message;

            const protoMsg = realMsg?.protocolMessage || msg?.message?.protocolMessage;
            if (protoMsg?.type === 0 && protoMsg?.key?.id) {
              revokeMsgFromStore(protoMsg.key.id);
            }
            if (msg?.messageStubType === 68 && msg?.key?.id) {
              revokeMsgFromStore(msg.key.id);
            }

            if (realMsg?.pinInChatMessage) {
              pinTracker.handlePinMessage(from, realMsg.pinInChatMessage);
            }

            if (realMsg?.pollCreationMessage || realMsg?.pollCreationMessageV2 || realMsg?.pollCreationMessageV3) {
              pollTracker.savePoll(from, msg);
            }

            if (realMsg?.pollUpdateMessage) {
              await pollTracker.processIncomingVote(sock, msg, realMsg.pollUpdateMessage);
            }
          }

          if (msg?.messageStubType === 2 /* CIPHERTEXT */ && Array.isArray(msg?.messageStubParameters)) {
            const errStr = msg.messageStubParameters.join(' ');
            if (errStr.includes('2000') || errStr.includes('future') || errStr.includes('No matching sessions')) {
              await healBrokenSession(msg);
            }
          }
        }
      }

      await handleMessage(sock, m);
    } catch (err) {
      logger.error({ err }, 'Erro inesperado no handler de mensagens');
    }
  });

  // Atualização de participantes em grupos (Welcome, AntiFake, Blacklist)
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleParticipantsUpdate(sock, update);
    } catch (err) {
      logger.error({ err }, 'Erro no handler de participantes de grupo');
    }
  });

  // Solicitações de entrada em grupos com aprovação de novos membros (Auto-Aprovação Anti-Ban)
  sock.ev.on('group.join-request', async (request) => {
    try {
      await handleJoinRequest(sock, request);
    } catch (err) {
      logger.error({ err }, 'Erro no handler de group.join-request');
    }
  });

  // Atualização de mensagens (votos de enquetes, reações e status)
  sock.ev.on('messages.update', (updates) => {
    try {
      if (Array.isArray(updates)) {
        const meId = sock?.user?.id;
        for (const u of updates) {
          // Detecta revogação de mensagem (Admin Revoke ou Sender Revoke) e remove do store
          const isRevoke = u.update?.messageStubType === 68 ||
                           u.update?.message === null ||
                           u.update?.protocolMessage?.type === 0;

          if (isRevoke) {
            const targetId = u.key?.id || u.update?.key?.id;
            if (targetId) {
              revokeMsgFromStore(targetId);
            }
          }

          if (u.update?.pollUpdates) {
            pollTracker.handlePollUpdate(u.key, u.update.pollUpdates, meId);
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Erro ao processar messages.update no pollTracker');
    }
  });

  // Atualização de configurações ou metadados de grupos
  // Entrada em novos grupos: ativa automaticamente o Kit Padrão (30 dias + AntiLink + IA) e envia saudação
  sock.ev.on('groups.upsert', async (newGroups) => {
    if (!Array.isArray(newGroups)) return;
    for (const g of newGroups) {
      try {
        if (!g?.id || !g.id.endsWith('@g.us')) continue;
        groupCache.set(g.id, g);
        if (Array.isArray(g.participants)) {
          for (const p of g.participants) {
            registerParticipantLid(p);
          }
        }
        if (configManager.isGroupBanned(g.id)) continue;

        // Verifica se há licença pendente desta compra registrada pelo siteBridge
        const siteOrders = require('../services/siteOrders');
        let inviteCode = null;
        try {
          inviteCode = await sock.groupInviteCode(g.id);
        } catch (_) {}

        const pending = siteOrders.claimPendingGroup(g.id, inviteCode);
        const effectiveDays = pending ? pending.days : 3;

        const isTrialPending = Boolean(!pending || pending.isTrial || pending.plan === 'teste');
        const trialAlreadyUsed = configManager.hasGroupUsedTrial(g.id);

        // Trava anti-abuso: grupo que já consumiu os 3 dias grátis não recebe nova licença trial
        if (isTrialPending && trialAlreadyUsed) {
          logger.warn({ groupJid: g.id, subject: g.subject }, 'Tentativa de reuso de teste grátis bloqueada');
          try {
            const siteBridge = require('../services/siteBridge');
            siteBridge._notifyOwner(
              `⚠️ *Tentativa de Reuso de Teste Grátis Bloqueada!*\n\n` +
              `• Grupo: "${g.subject || 'Grupo'}"\n` +
              `• JID: \`${g.id}\`\n` +
              `• Solicitante: ${pending.ownerName || 'Não informado'}\n` +
              `• WhatsApp: https://wa.me/${pending.ownerPhone} (${pending.ownerPhone || 'N/A'})\n\n` +
              `O grupo já consumiu os 3 dias grátis anteriormente. O bot não concedeu a licença e saiu do grupo automaticamente.`
            );
          } catch (_) {}

          try {
            const groupLang = configManager.getGroupLang(g.id) || 'pt';
            const siteUrl = process.env.PUBLIC_URL || process.env.URL_PUBLICA || 'https://hermes.hewhotries.tech';
            let adminsMention = '';
            try {
              const meta = await sock.groupMetadata(g.id);
              const admins = (meta.participants || []).filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`);
              if (admins.length > 0) adminsMention = admins.join(' ');
            } catch (_) {}

            const text = t(groupLang, 'saas.trial_already_consumed', { admins: adminsMention, url: siteUrl });
            try {
              await sendSafeMessage(sock, g.id, { text });
              await new Promise(r => setTimeout(r, 1500));
            } catch (_) {}
          } catch (_) {}

          try {
            await safeGroupLeave(sock, g.id, 'trial_already_consumed');
          } catch (leaveErr) {
            logger.warn({ err: leaveErr.message, groupJid: g.id }, 'Falha ao executar safeGroupLeave');
          }
          continue;
        }

        const { shouldSendWelcome } = configManager.ensureGroupStarterKit(g.id, g.subject || '', effectiveDays);
        configManager.markWelcomeSent(g.id, true);

        const grp = configManager.getGroup(g.id);
        if (grp) {
          if (pending) {
            grp.ownerName = pending.ownerName || '';
            grp.ownerPhone = pending.ownerPhone || '';
            grp.autoLeave = true;
            grp.plan = pending.plan;
            grp.isTrial = Boolean(pending.isTrial || pending.plan === 'teste');
            if (grp.isTrial) {
              grp.trialUsed = true;
            }
            grp.lastPaymentId = String(pending.paymentId);
            configManager.setGroupExpiry(g.id, Date.now() + effectiveDays * 24 * 60 * 60 * 1000);
          } else {
            // Grupo entrando sem pedido pendente: ativado exclusivamente como Teste Grátis de 3 dias!
            grp.plan = 'teste';
            grp.isTrial = true;
            grp.trialUsed = true;
            grp.autoLeave = true;
            configManager.setGroupExpiry(g.id, Date.now() + 3 * 24 * 60 * 60 * 1000);
          }
        }
        configManager.flushSync();

        if (pending) {
          // Notifica o dono no Telegram confirmando a ativação
          try {
            const siteBridge = require('../services/siteBridge');
            siteBridge.notifyActivationSuccess({
              groupName: g.subject || 'Grupo',
              groupJid: g.id,
              days: effectiveDays,
              plan: pending.plan,
              ownerName: pending.ownerName,
              ownerPhone: pending.ownerPhone
            });
          } catch (err) {
            logger.warn({ err: err.message }, 'Falha ao notificar ativação no Telegram');
          }
        }

        // Apresentação oficial humanizada em grupos novos com delay inteligente (~1 minuto) e digitação simulada
        if (shouldSendWelcome) {
          const groupPrefix = configManager.getGroupPrefix(g.id) || '!';
          const groupLang = configManager.getGroupLang(g.id) || 'pt';
          const presentationText = t(groupLang, 'saas.group_presentation', { prefix: groupPrefix });

          // ANTI-BAN HUMANIZADO REFINADO:
          // 1. Jitter aleatório entre 45s e 75s (média ~60s) para quebrar detecção de padrão temporal
          // 2. Simulação de "Digitando..." ativa nos últimos 4 a 6 segundos antes do envio
          // 3. Cancelamento automático caso o administrador envie qualquer comando antes do timer disparar
          const organicDelayMs = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
          const typingDurationMs = Math.floor(Math.random() * (6000 - 3500 + 1)) + 3500;
          const waitBeforeTypingMs = Math.max(organicDelayMs - typingDurationMs, 20000);

          const timer = setTimeout(async () => {
            try {
              pendingPresentationTimers.delete(g.id);
              if (configManager.isGroupBanned(g.id) || !configManager.isGroupEnabled(g.id)) return;

              // Simula presença "Digitando..." no grupo durante alguns segundos
              try {
                await sock.sendPresenceUpdate('composing', g.id);
              } catch (_) {}

              await new Promise((r) => setTimeout(r, typingDurationMs));

              try {
                await sock.sendPresenceUpdate('paused', g.id);
              } catch (_) {}

              await sock.groupMetadata(g.id).catch(() => {});
              await sendSafeMessage(sock, g.id, { text: presentationText });
              await sock.sendPresenceUpdate('unavailable', g.id).catch(() => {});

              logger.info(
                { groupJid: g.id, delayMs: organicDelayMs, typingMs: typingDurationMs },
                '[Anti-Ban] Apresentação oficial enviada com sucesso após delay e digitação simulada.'
              );
            } catch (err) {
              logger.error({ err, groupJid: g.id }, 'Erro ao enviar apresentação no novo grupo após delay humanizado');
            }
          }, waitBeforeTypingMs);

          pendingPresentationTimers.set(g.id, timer);
        }
      } catch (err) {
        logger.error({ err, groupJid: g?.id }, 'Erro ao processar groups.upsert');
      }
    }
  });

  sock.ev.on('groups.update', (updates) => {
    if (Array.isArray(updates)) {
      for (const update of updates) {
        if (update.id) {
          groupCache.del(update.id);
        }
      }
    }
  });

  return sock;
}

function getSocket() {
  return currentSock;
}

module.exports = {
  connectBot,
  getSocket,
  storeMsgForRetry,
  cancelPendingPresentation,
  revokeMsgFromStore,
  isMessageRevoked
};
