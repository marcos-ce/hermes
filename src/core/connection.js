const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const path = require('path');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const settings = require('../config/settings');
const logger = require('../utils/logger');
const { groupCache } = require('../utils/cache');
const { registerParticipantLid } = require('../utils/jidResolver');
const { handleMessage } = require('../handlers/messageHandler');
const { handleParticipantsUpdate } = require('../handlers/groupHandler');
const scheduler = require('./scheduler');

let currentSock = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
// Mini-store de mensagens recentes para re-decriptografia pós-reconexão (substitui makeInMemoryStore)
// Guarda as últimas 100 mensagens em RAM com eviction FIFO. Sem TTL = sem vazamento de memória.
const msgStore = new Map();
const MSG_STORE_MAX = 100;

/**
 * Registra uma mensagem no mini-store para suporte a re-decriptografia do Baileys.
 * Deve ser chamado após o pipeline processar cada mensagem com sucesso.
 * @param {object} msg 
 */
function storeMsgForRetry(msg) {
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
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

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
      if (id && msgStore.has(id)) return msgStore.get(id);
      return undefined;
    },
    shouldIgnoreJid: (jid) => typeof jid === 'string' && (jid.endsWith('@newsletter') || jid.endsWith('@broadcast')),
    browser: ['Ubuntu', 'Chrome', '120.0.0']
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
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Conexão encerrada. Motivo: ${statusCode || 'Desconhecido'}. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        const delay = Math.min(3000 * Math.pow(1.3, reconnectAttempts), 30000);
        reconnectAttempts++;
        console.log(`🔄 Reconectando ao WhatsApp em ${(delay / 1000).toFixed(1)} segundos (tentativa ${reconnectAttempts})...`);
        reconnectTimer = setTimeout(() => connectBot(options), delay);
      } else {
        console.log('🛑 Sessão encerrada (Logout). Apague a pasta src/auth e reinicie para novo login.');
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('\n====================================================');
      console.log('🚀 BOT CONECTADO COM SUCESSO AO WHATSAPP!');
      console.log(`🏷️  ID: ${sock.user?.id || 'Desconhecido'}`);
      if (sock.user?.lid) {
        console.log(`🔒 LID: ${sock.user.lid}`);
      }
      console.log(`🛡️ Anti-Ban: ATIVO`);
      console.log('====================================================\n');

      // Atualiza o scheduler com o socket autenticado (somente após conexão confirmada)
      scheduler.updateSocket(sock);

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

  // Atualização de configurações ou metadados de grupos
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
  storeMsgForRetry
};
