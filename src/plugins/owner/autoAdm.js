const { getGroupMetadata, cleanJid, getBr } = require('../../utils/jidResolver');
const { groupCache } = require('../../utils/cache');
const { randomDelay } = require('../../utils/antiBan');
const settings = require('../../config/settings');
const configManager = require('../../core/configManager');
const logger = require('../../utils/logger');

/**
 * Tenta promover o dono a administrador em um grupo específico.
 * @param {object} sock 
 * @param {string} gid 
 * @param {string} ownerPhoneJid 
 * @param {string} ownerLidJid 
 * @param {object|null} preloadedMeta
 * @returns {Promise<{ success: boolean, reason: string, groupName: string, inviteLink?: string }>}
 */
async function promoteOwnerInGroup(sock, gid, ownerPhoneJid, ownerLidJid, preloadedMeta = null) {
  const meta = preloadedMeta || (await getGroupMetadata(sock, gid));
  if (!meta || !Array.isArray(meta.participants)) {
    return { success: false, reason: 'not_found', groupName: gid };
  }

  const groupName = meta.subject || gid;

  // 1. Verifica se o bot é administrador neste grupo
  const botJid = cleanJid(sock.user?.id || '');
  const botLid = cleanJid(sock.user?.lid || '');
  const botNumber = botJid.replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

  let isBotAdmin = false;
  for (const p of meta.participants) {
    const pId = cleanJid(p.id);
    const pLid = p.lid ? cleanJid(p.lid) : '';
    const pJid = p.jid ? cleanJid(p.jid) : '';
    const pNum = (pJid || pId).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');

    const isBot = (pId === botJid) || (botLid && (pId === botLid || pLid === botLid)) || (botNumber && pNum === botNumber);
    if (isBot && (p.admin === 'admin' || p.admin === 'superadmin')) {
      isBotAdmin = true;
      break;
    }
  }

  if (!isBotAdmin) {
    return { success: false, reason: 'bot_not_admin', groupName };
  }

  // 2. Procura o dono entre os participantes do grupo
  const ownerNum = ownerPhoneJid.replace(/@.*$/, '').replace(/\D/g, '');
  const ownerLidNum = (ownerLidJid || '').replace(/@.*$/, '').replace(/\D/g, '');
  const ownerBr = getBr(ownerNum);

  let ownerParticipant = null;
  for (const p of meta.participants) {
    const pId = cleanJid(p.id);
    const pLid = p.lid ? cleanJid(p.lid) : '';
    const pJid = p.jid ? cleanJid(p.jid) : '';
    const pNum = (pJid || pId).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
    const pBr = getBr(pNum);

    const isOwnerMatch = (pId === ownerPhoneJid) ||
                         (ownerLidJid && (pId === ownerLidJid || pLid === ownerLidJid)) ||
                         (ownerNum && pNum === ownerNum) ||
                         (ownerLidNum && (pNum === ownerLidNum || pLid.includes(ownerLidNum))) ||
                         (ownerBr.ddd && pBr.ddd && ownerBr.ddd === pBr.ddd && ownerBr.last8 === pBr.last8);

    if (isOwnerMatch) {
      ownerParticipant = p;
      break;
    }
  }

  // 3. Se o dono já estiver no grupo
  if (ownerParticipant) {
    if (ownerParticipant.admin === 'admin' || ownerParticipant.admin === 'superadmin') {
      return { success: true, reason: 'already_admin', groupName };
    }

    try {
      await sock.groupParticipantsUpdate(gid, [ownerParticipant.id], 'promote');
      groupCache.del(gid);
      return { success: true, reason: 'promoted', groupName };
    } catch (err) {
      logger.error({ err, gid }, 'Erro ao promover dono a admin');
      return { success: false, reason: 'promote_failed', groupName };
    }
  }

  // 4. Se o dono NÃO estiver no grupo, tenta adicioná-lo e depois promover
  try {
    const addTarget = ownerPhoneJid.endsWith('@s.whatsapp.net') ? ownerPhoneJid : `${ownerNum}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(gid, [addTarget], 'add');
    
    // Aguarda registro no WhatsApp
    await new Promise(r => setTimeout(r, 1200));

    // Atualiza metadados para localizar o JID exato registrado
    const refreshed = await sock.groupMetadata(gid).catch(() => null);
    if (refreshed) groupCache.set(gid, refreshed);

    const pTarget = refreshed?.participants?.find(p => {
      const pNum = (p.jid || p.id).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '');
      return pNum === ownerNum;
    })?.id || addTarget;

    await sock.groupParticipantsUpdate(gid, [pTarget], 'promote');
    groupCache.del(gid);
    return { success: true, reason: 'added_and_promoted', groupName };
  } catch (errAdd) {
    // Se a privacidade do dono bloqueia adição direta, gera link de convite
    let inviteLink = null;
    try {
      const code = await sock.groupInviteCode(gid);
      if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
    } catch (_) {}
    return { success: false, reason: 'failed_add', groupName, inviteLink };
  }
}

module.exports = {
  name: 'autoadm',
  aliases: ['autoadm', 'admdono', 'admall', 'promotedono', 'owneradm'],
  usage: 'autoadm <id | all>',
  description: 'Promove você (Dono) a Admin (por ID ou em todos os grupos onde o bot é admin)',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,

  async execute({ sock, msg, from, sender, args, reply, prefix, isGroup }) {
    const p = prefix || '/';
    const rawTarget = (args[0] || '').trim();

    // Identifica o número/LID do dono
    const ownerPhoneJid = (settings.ownerNumber ? `${settings.ownerNumber}@s.whatsapp.net` : null) || sender;
    const ownerLidJid = settings.ownerLid ? `${settings.ownerLid}@lid` : (sender.endsWith('@lid') ? sender : null);

    // ==========================================
    // 1. MODO: EM TODOS OS GRUPOS (all / todos)
    // ==========================================
    if (['all', 'todos', 'tudo'].includes(rawTarget.toLowerCase())) {
      await reply('⏳ *Iniciando Auto-Admin em Todos os Grupos...*\nVerificando permissões e promovendo você onde o bot for administrador. Aguarde...');

      let groupsMap = {};
      try {
        groupsMap = await sock.groupFetchAllParticipating();
      } catch (err) {
        logger.warn({ err }, 'Falha no groupFetchAllParticipating, buscando do cache/config');
      }

      let groupsList = Object.entries(groupsMap || {});
      if (groupsList.length === 0) {
        const saved = configManager.getAllGroups();
        for (const [gid] of saved) {
          try {
            const m = await getGroupMetadata(sock, gid);
            if (m) groupsList.push([gid, m]);
          } catch (_) {}
        }
      }

      if (groupsList.length === 0) {
        return reply('⚠️ O bot não está participando de nenhum grupo atualmente.');
      }

      const promoted = [];
      const already = [];
      const addedAndPromoted = [];
      const botNotAdmin = [];
      const failed = [];

      for (const [gid, groupMeta] of groupsList) {
        try {
          if (groupMeta) groupCache.set(gid, groupMeta);
          const res = await promoteOwnerInGroup(sock, gid, ownerPhoneJid, ownerLidJid, groupMeta);
          if (res.reason === 'promoted') {
            promoted.push(res.groupName);
          } else if (res.reason === 'added_and_promoted') {
            addedAndPromoted.push(res.groupName);
          } else if (res.reason === 'already_admin') {
            already.push(res.groupName);
          } else if (res.reason === 'bot_not_admin') {
            botNotAdmin.push(res.groupName);
          } else {
            failed.push(res.groupName);
          }
        } catch (e) {
          failed.push(gid);
        }

        // Delay anti-ban para não inundar o socket do WhatsApp
        await randomDelay(800, 1600);
      }

      const totalSuccess = promoted.length + addedAndPromoted.length;
      let report = `👑 *RELATÓRIO DE AUTO-ADMIN - HERMES*\n\n` +
        `📊 *Resumo da Varredura:*\n` +
        `• Grupos verificados: *${groupsList.length}*\n` +
        `• 🟢 Promovido a Admin: *${totalSuccess}*\n` +
        `• ℹ️ Já era Admin: *${already.length}*\n` +
        `• ⚠️ Bot não é Admin: *${botNotAdmin.length}*\n`;

      if (failed.length > 0) {
        report += `• ❌ Não foi possível promover: *${failed.length}*\n`;
      }

      if (promoted.length > 0 || addedAndPromoted.length > 0) {
        const allNew = [...promoted, ...addedAndPromoted];
        report += `\n✅ *Novos grupos onde você é Admin:*\n`;
        allNew.slice(0, 15).forEach(g => { report += `• ${g}\n`; });
        if (allNew.length > 15) {
          report += `_... e mais ${allNew.length - 15} grupos_\n`;
        }
      }

      if (botNotAdmin.length > 0) {
        report += `\n⚠️ *Grupos onde o bot ainda não é Admin:*\n`;
        botNotAdmin.slice(0, 10).forEach(g => { report += `• ${g}\n`; });
        if (botNotAdmin.length > 10) {
          report += `_... e mais ${botNotAdmin.length - 10} grupos_\n`;
        }
      }

      report += `\n💡 *Operação finalizada com sucesso!*`;
      return reply(report);
    }

    // ==========================================
    // 2. MODO: GRUPO ESPECÍFICO (Por ID ou Grupo Atual)
    // ==========================================
    let targetGid = null;
    if (rawTarget) {
      if (rawTarget.endsWith('@g.us')) {
        targetGid = rawTarget;
      } else if (/^\d{15,25}$/.test(rawTarget)) {
        targetGid = `${rawTarget}@g.us`;
      }
    } else if (isGroup) {
      targetGid = from;
    }

    if (!targetGid) {
      return reply(
        `👑 *AUTO-ADMIN DO DONO - HERMES*\n\n` +
        `Promova a si mesmo como administrador onde o bot for admin:\n\n` +
        `📌 *Como usar:*\n` +
        `• \`${p}autoadm all\` - Promover em *TODOS* os grupos onde o bot é admin\n` +
        `• \`${p}autoadm <id_do_grupo>\` - Promover em um grupo específico\n` +
        `• \`${p}autoadm\` - Executar dentro do próprio grupo\n\n` +
        `💡 *Exemplo:* \`${p}autoadm 120363000000000@g.us\`\n` +
        `Use \`${p}bot list\` para consultar os IDs de todos os seus grupos.`
      );
    }

    const res = await promoteOwnerInGroup(sock, targetGid, ownerPhoneJid, ownerLidJid);

    if (res.reason === 'promoted') {
      return reply(`✅ *Sucesso!* Você foi promovido a *Administrador* no grupo *${res.groupName}*!`);
    }

    if (res.reason === 'already_admin') {
      return reply(`ℹ️ Você já é *Administrador* no grupo *${res.groupName}*!`);
    }

    if (res.reason === 'added_and_promoted') {
      return reply(`✅ *Sucesso!* Você foi adicionado e promovido a *Administrador* no grupo *${res.groupName}*!`);
    }

    if (res.reason === 'bot_not_admin') {
      return reply(`⚠️ O bot *não é administrador* no grupo *${res.groupName}*.\nPara promover você a admin, o bot precisa ter cargo de administrador no grupo primeiro!`);
    }

    if (res.reason === 'failed_add') {
      let msgText = `⚠️ Você não está no grupo *${res.groupName}* e suas configurações de privacidade impediram a adição direta.`;
      if (res.inviteLink) {
        msgText += `\n\n🔗 *Entre pelo link de convite:*\n${res.inviteLink}\n\nApós entrar, envie \`${p}autoadm ${targetGid}\` para receber Admin!`;
      }
      return reply(msgText);
    }

    return reply(`❌ Não foi possível acessar o grupo (*${res.groupName}*). Verifique se o ID está correto ou se o bot está no grupo.`);
  }
};
