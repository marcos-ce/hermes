const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const path = require('path');
const qrcode = require('qrcode-terminal');
const settings = require('../config/settings');
const logger = require('../utils/logger');
const { groupCache } = require('../utils/cache');
const { registerParticipantLid } = require('../utils/jidResolver');
const { handleMessage } = require('../handlers/messageHandler');
const { handleParticipantsUpdate } = require('../handlers/groupHandler');
const scheduler = require('./scheduler');

let currentSock = null;

/**
 * Inicia e gerencia a conexão do socket Baileys com reconexão automática
 * @param {object} options Opções de inicialização
 * @returns {Promise<object>} Instância do socket Baileys
 */
async function connectBot(options = {}) {
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
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  currentSock = sock;
  scheduler.updateSocket(sock);

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
          console.log('Digite este código no seu WhatsApp: Aparelhos Conectados > Conectar com número');
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
      console.clear();
      console.log('\n⚡ Escaneie o QR Code abaixo com o seu WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nAguardando leitura do QR Code...\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Conexão encerrada. Motivo: ${statusCode || 'Desconhecido'}. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log('🔄 Reconectando ao WhatsApp em 3 segundos...');
        setTimeout(() => connectBot(options), 3000);
      } else {
        console.log('🛑 Sessão encerrada (Logout). Apague a pasta src/auth e reinicie para novo login.');
      }
    } else if (connection === 'open') {
      console.log('\n====================================================');
      console.log('🚀 BOT CONECTADO COM SUCESSO AO WHATSAPP!');
      console.log(`🏷️  ID: ${sock.user?.id || 'Desconhecido'}`);
      if (sock.user?.lid) {
        console.log(`🔒 LID: ${sock.user.lid}`);
      }
      console.log(`🛡️  Modo Furtivo Anti-Ban: ATIVO (Presença Desconectada/Invisível)`);
      console.log('====================================================\n');

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
  getSocket
};
