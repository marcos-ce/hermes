const siteOrders = require('../../services/siteOrders');
const siteBridge = require('../../services/siteBridge');
const { extractInviteCode } = require('../../services/joinService');

module.exports = {
  name: 'pedido',
  aliases: ['pedido', 'pedidos', 'order', 'orders'],
  usage: 'pedido <id|reprocessar|set|listar>',
  description: 'Gestão de pedidos, assinaturas do site e integração Mercado Pago',
  ownerOnly: true,
  adminOnly: false,
  botAdminRequired: false,
  allowWhenBanned: true,
  allowWhenInactive: true,

  async execute({ sock, msg, args, command, reply, prefix, isOwner }) {
    if (!isOwner) return;

    const p = prefix || '!';
    siteOrders.load();

    const sub = (args[0] || '').toLowerCase();

    // 1. Listagem dos pedidos recentes (!pedidos ou !pedido list)
    if (!sub || sub === 'list' || sub === 'listar' || command === 'pedidos' || command === 'orders') {
      const all = siteOrders.getAll(15);
      if (all.length === 0) {
        return reply('📦 *Nenhum pedido do site registrado até o momento.*');
      }

      let text = `📦 *Últimos Pedidos do Site (${all.length}):*\n\n`;
      for (const o of all) {
        const statusEmoji = {
          done: '✅ Concluído',
          waiting_owner_join: '⏳ Aguardando Entrada',
          queued: '🔄 Na Fila',
          processing: '⚙️ Processando',
          partial: '⚠️ Parcial',
          rejected: '🚫 Rejeitado',
          error: '❌ Erro'
        }[o.status] || o.status;

        const dateStr = o.updatedAt || o.createdAt ? new Date(o.updatedAt || o.createdAt).toLocaleString('pt-BR') : 'Recente';
        const groupCount = (o.groups || []).length;
        const days = o.days || 30;

        text += `• *ID:* \`${o.paymentId}\` | ${statusEmoji}\n`;
        text += `  Cliente: ${o.name || 'Cliente'} (${o.phone ? `+${o.phone}` : 's/ tel'})\n`;
        text += `  Plano: *${o.plan === 'teste' ? 'Teste Grátis' : 'Mensal'}* (${days} dias) | Grupos: ${groupCount}\n`;
        if (o.error) {
          text += `  ⚠️ Erro: ${String(o.error).slice(0, 80)}\n`;
        }
        text += `  Data: ${dateStr}\n\n`;
      }

      text += `👉 Use \`${p}pedido <id>\` para ver detalhes ou \`${p}pedido reprocessar <id> [dias]\` para reprocessar.`;
      return reply(text);
    }

    // 2. Reprocessar pedido (!pedido reprocessar <id> [dias])
    if (sub === 'reprocessar' || sub === 'retry' || sub === 'reprocess') {
      const targetId = args[1];
      if (!targetId) {
        return reply(`⚠️ Informe o ID do pagamento. Exemplo:\n\`${p}pedido reprocessar 187419436876 30\``);
      }
      const customDays = args[2] ? parseInt(args[2], 10) : (targetId === '187419436876' ? 30 : null);

      const res = await siteBridge.reprocessOrder(targetId, customDays);
      if (!res.ok) {
        return reply(`❌ Não foi possível reprocessar: ${res.error || 'Erro desconhecido'}`);
      }

      return reply(
        `🔄 *Pedido ${targetId} re-enfileirado com sucesso!*\n\n` +
        `• Dias configurados: *${customDays || res.order?.days || 30} dias*\n` +
        `• O bot reprocessará a ordem imediatamente e notificará no Telegram.`
      );
    }

    // 3. Ajustar vigência/dias do pedido (!pedido set <id> <dias>)
    if (sub === 'set' || sub === 'dias' || sub === 'alterar') {
      const targetId = args[1];
      const newDays = parseInt(args[2], 10);
      if (!targetId || isNaN(newDays) || newDays <= 0) {
        return reply(`⚠️ Uso: \`${p}pedido set <id> <dias>\`\nExemplo: \`${p}pedido set 187419436876 30\``);
      }

      const order = siteOrders.get(targetId);
      if (!order) {
        // Se ainda não existia, cria registro
        siteOrders.upsert(targetId, {
          days: newDays,
          plan: newDays <= 5 ? 'teste' : 'mensal',
          status: 'queued',
          retry: true
        });
        return reply(`✅ Pedido \`${targetId}\` criado com vigência de *${newDays} dias*.`);
      }

      order.days = newDays;
      order.plan = newDays <= 5 ? 'teste' : 'mensal';
      delete order.error;
      if (Array.isArray(order.groups)) {
        for (const g of order.groups) {
          g.days = newDays;
          g.plan = order.plan;
        }
      }
      siteOrders.upsert(targetId, order);
      return reply(`✅ Pedido \`${targetId}\` atualizado para *${newDays} dias* (${order.plan}).`);
    }

    // 4. Liberar pedido com link (!pedido liberar <id> <link> [dias])
    if (sub === 'liberar' || sub === 'join') {
      const targetId = args[1];
      const link = args[2];
      const daysArg = parseInt(args[3], 10) || 30;

      if (!targetId || !link) {
        return reply(`⚠️ Uso: \`${p}pedido liberar <id> <link_do_grupo> [dias]\``);
      }

      const code = extractInviteCode(link);
      if (!code) {
        return reply('⚠️ Link de convite do WhatsApp inválido.');
      }

      const pendingData = {
        paymentId: targetId,
        code,
        days: daysArg,
        plan: daysArg <= 5 ? 'teste' : 'mensal',
        ownerName: 'Cliente',
        ownerPhone: ''
      };

      siteOrders.registerPendingGroup(pendingData);
      siteBridge._enqueue(targetId);

      return reply(
        `✅ *Grupo vinculado ao pedido ${targetId} com sucesso!*\n\n` +
        `• Código: \`${code}\`\n` +
        `• Vigência: *${daysArg} dias*\n` +
        `• Status: Aguardando entrada do dono pelo celular.`
      );
    }

    // 5. Exibir detalhes de um pedido específico (!pedido <id>)
    const targetId = sub;
    const order = siteOrders.get(targetId);
    if (!order) {
      return reply(
        `❓ *Pedido \`${targetId}\` não encontrado no histórico local.*\n\n` +
        `Para forçar a busca e reprocessamento direto no Mercado Pago, use:\n` +
        `\`${p}pedido reprocessar ${targetId} 30\``
      );
    }

    let details = `📋 *Detalhes do Pedido ${targetId}:*\n\n`;
    details += `• Status: *${order.status}*\n`;
    details += `• Cliente: ${order.name || 'Cliente'}\n`;
    details += `• Telefone: ${order.phone ? `https://wa.me/${order.phone} (${order.phone})` : 'Não informado'}\n`;
    details += `• Plano: *${order.plan === 'teste' ? 'Teste Grátis' : 'Mensal'}* (*${order.days || (order.plan === 'teste' ? 3 : 30)} dias*)\n`;
    if (order.amount) details += `• Valor: R$ ${order.amount}\n`;
    if (order.error) details += `• ⚠️ Erro Registrado: \`${order.error}\`\n`;

    const groups = order.groups || [];
    details += `\n• *Grupos (${groups.length}):*\n`;
    if (groups.length === 0) {
      details += `  (Nenhum link de grupo associado)\n`;
    } else {
      for (const g of groups) {
        details += `  - Link: https://chat.whatsapp.com/${g.code}\n`;
        details += `    Status: ${g.status} | Dias: ${g.days || order.days || 30}\n`;
        if (g.jid) details += `    JID: \`${g.jid}\`\n`;
        if (g.groupName) details += `    Nome: "${g.groupName}"\n`;
      }
    }

    details += `\n*Ações rápidas:*\n`;
    details += `• \`${p}pedido reprocessar ${targetId} 30\` (Reprocessar no MP)\n`;
    details += `• \`${p}pedido set ${targetId} 30\` (Definir 30 dias)`;

    return reply(details);
  }
};
