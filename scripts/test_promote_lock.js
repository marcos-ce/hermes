const assert = require('assert');
const { resolveActionTarget, getExplicitMentionTargets } = require('../src/services/targetResolver');
const promoteMember = require('../src/services/tools/promote_member');
const promotePlugin = require('../src/plugins/admin/promote');
const toolRegistry = require('../src/services/toolRegistry');
const { t } = require('../src/utils/i18n');
const i18nFormal = require('../src/utils/i18nFormal');
const { groupCache } = require('../src/utils/cache');

console.log('====================================================');
console.log('🧪 BATERIA DE TESTES EXAUSTIVOS: TRAVA DE PROMOÇÃO');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function runAll() {
  const mockBotJid = '5511900000000@s.whatsapp.net';
  const mockBotLid = '123456789@lid';
  const mockSock = {
    user: { id: '5511900000000:0@s.whatsapp.net', lid: '123456789:0@lid' },
    groupParticipantsUpdate: async (from, jids, action) => {
      mockSock.lastUpdate = { from, jids, action };
      return [{ status: '200', jid: jids[0] }];
    },
    groupMetadata: async (groupJid) => ({
      id: groupJid,
      participants: [
        { id: mockBotJid, admin: 'admin' },
        { id: '5511911111111@s.whatsapp.net', admin: 'admin' }, // Admin legítimo
        { id: '5511922222222@s.whatsapp.net', admin: null },    // Membro Bob
        { id: '5511933333333@s.whatsapp.net', admin: null },    // Membro Charlie
        { id: '5511944444444@s.whatsapp.net', admin: 'admin' }  // Membro já admin
      ]
    })
  };
  const fromGroup = '120363000000000@g.us';

  // Popula cache de metadados
  const meta = await mockSock.groupMetadata(fromGroup);
  groupCache.set(fromGroup, meta);

  // ----------------------------------------------------
  // GRUPO 1: TESTES DE INTERNACIONALIZAÇÃO (i18n & Formal)
  // ----------------------------------------------------
  runTest('1.1 Dicionários padrão contêm chave promote.need_explicit_mention em pt, es, en', () => {
    for (const lang of ['pt', 'es', 'en']) {
      const text = t(lang, 'promote.need_explicit_mention');
      assert(typeof text === 'string' && text.length > 10, `Texto ausente para ${lang}`);
      assert(text.includes('@'), `Texto de ${lang} deve citar @`);
    }
  });

  runTest('1.2 Dicionários formais contêm chave promote.need_explicit_mention em pt, es, en', () => {
    for (const lang of ['pt', 'es', 'en']) {
      const text = i18nFormal.dictionaries[lang]?.['promote.need_explicit_mention'];
      assert(typeof text === 'string' && text.length > 10, `Texto formal ausente para ${lang}`);
      assert(text.includes('*[Segurança]*') || text.includes('*[Seguridad]*') || text.includes('*[Security]*'), `Texto formal de ${lang} deve ter tag`);
    }
  });

  // ----------------------------------------------------
  // GRUPO 2: RESOLVEDOR CENTRAL (targetResolver)
  // ----------------------------------------------------
  await runAsyncTest('2.1 getExplicitMentionTargets extrai menções excluindo o próprio bot', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: '@hermes dá adm pro @5511922222222',
          contextInfo: {
            mentionedJid: [mockBotJid, '5511922222222@s.whatsapp.net']
          }
        }
      }
    };
    const targets = await getExplicitMentionTargets(mockSock, msg, fromGroup);
    assert.strictEqual(targets.length, 1, 'Deve extrair apenas 1 alvo');
    assert.strictEqual(targets[0].phoneJid, '5511922222222@s.whatsapp.net');
  });

  await runAsyncTest('2.2 getExplicitMentionTargets ignora replies sem menção @', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'dá adm nele',
          contextInfo: {
            participant: '5511922222222@s.whatsapp.net',
            quotedMessage: { conversation: 'olá grupo' }
          }
        }
      }
    };
    const targets = await getExplicitMentionTargets(mockSock, msg, fromGroup);
    assert.strictEqual(targets.length, 0, 'Quote sem menção deve retornar zero alvos');
  });

  await runAsyncTest('2.3 resolveActionTarget bloqueia citação (reply) quando requireExplicitMention é true', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, promove esse cara',
          contextInfo: {
            participant: '5511922222222@s.whatsapp.net',
            quotedMessage: { conversation: 'mensagem do cara' }
          }
        }
      }
    };
    const res = await resolveActionTarget(mockSock, msg, fromGroup, 'quoted', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'promote.need_explicit_mention'));
  });

  await runAsyncTest('2.4 resolveActionTarget bloqueia nome avulso sem @ quando requireExplicitMention é true', async () => {
    const msg = {
      message: {
        conversation: 'Hermes, dá adm pro Bob'
      }
    };
    const res = await resolveActionTarget(mockSock, msg, fromGroup, 'Bob', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'promote.need_explicit_mention'));
  });

  await runAsyncTest('2.5 resolveActionTarget bloqueia número digitado sem @ quando requireExplicitMention é true', async () => {
    const msg = {
      message: {
        conversation: 'Hermes, dá adm pro 5511922222222'
      }
    };
    const res = await resolveActionTarget(mockSock, msg, fromGroup, '5511922222222', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'promote.need_explicit_mention'));
  });

  await runAsyncTest('2.6 resolveActionTarget aceita membro expressamente marcado com @', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm pro @5511922222222',
          contextInfo: {
            mentionedJid: ['5511922222222@s.whatsapp.net']
          }
        }
      }
    };
    const res = await resolveActionTarget(mockSock, msg, fromGroup, '@5511922222222', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetData.phoneJid, '5511922222222@s.whatsapp.net');
  });

  await runAsyncTest('2.7 resolveActionTarget bloqueia alucinação de modelo (alvo diferente do marcado)', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm pro @5511922222222',
          contextInfo: {
            mentionedJid: ['5511922222222@s.whatsapp.net'] // Marcou Bob
          }
        }
      }
    };
    // Modelo tenta promover Charlie (5511933333333) que NÃO foi marcado
    const res = await resolveActionTarget(mockSock, msg, fromGroup, '5511933333333', { requireExplicitMention: true, lang: 'pt' });
    assert.strictEqual(res.success, false, 'Deve bloquear alvo divergente da menção');
    assert.strictEqual(res.error, t('pt', 'promote.need_explicit_mention'));
  });

  // ----------------------------------------------------
  // GRUPO 3: FERRAMENTA DO AGENTE IA (promote_member.js)
  // ----------------------------------------------------
  await runAsyncTest('3.1 promote_member executa promoção quando alvo está marcado com @', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, promove o @5511922222222',
          contextInfo: {
            mentionedJid: ['5511922222222@s.whatsapp.net']
          }
        }
      }
    };
    mockSock.lastUpdate = null;
    const res = await promoteMember({
      sock: mockSock,
      msg,
      from: fromGroup,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: '@5511922222222' }
    });
    assert.strictEqual(res.success, true);
    assert(res.message.includes('agora é um *Administrador*'));
    assert.strictEqual(mockSock.lastUpdate?.action, 'promote');
    assert.deepStrictEqual(mockSock.lastUpdate?.jids, ['5511922222222@s.whatsapp.net']);
  });

  await runAsyncTest('3.2 promote_member rejeita quando chamado sem @ (mesmo respondendo à mensagem)', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, promove ele',
          contextInfo: {
            participant: '5511922222222@s.whatsapp.net',
            quotedMessage: { conversation: 'oi' }
          }
        }
      }
    };
    mockSock.lastUpdate = null;
    const res = await promoteMember({
      sock: mockSock,
      msg,
      from: fromGroup,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: 'quoted' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'promote.need_explicit_mention'));
    assert.strictEqual(mockSock.lastUpdate, null, 'Nenhuma chamada Baileys deve ser disparada');
  });

  await runAsyncTest('3.3 promote_member rejeita se bot não for admin', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm pro @5511922222222',
          contextInfo: {
            mentionedJid: ['5511922222222@s.whatsapp.net']
          }
        }
      }
    };
    const res = await promoteMember({
      sock: mockSock,
      msg,
      from: fromGroup,
      isBotAdmin: false,
      lang: 'pt',
      args: { target: '@5511922222222' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'common.bot_not_admin'));
  });

  await runAsyncTest('3.4 promote_member rejeita se membro já for admin', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm pro @5511944444444',
          contextInfo: {
            mentionedJid: ['5511944444444@s.whatsapp.net'] // 944444444 já é admin no mock
          }
        }
      }
    };
    const res = await promoteMember({
      sock: mockSock,
      msg,
      from: fromGroup,
      isBotAdmin: true,
      lang: 'pt',
      args: { target: '@5511944444444' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'promote.already_admin'));
  });

  // ----------------------------------------------------
  // GRUPO 4: COMANDO TRADICIONAL (!adm / !promover)
  // ----------------------------------------------------
  await runAsyncTest('4.1 promote plugin aceita comando !adm @user', async () => {
    let output = '';
    const reply = (txt) => { output = txt; };
    const msg = {
      message: {
        extendedTextMessage: {
          text: '!adm @5511933333333',
          contextInfo: {
            mentionedJid: ['5511933333333@s.whatsapp.net']
          }
        }
      }
    };
    mockSock.lastUpdate = null;
    await promotePlugin.execute({
      sock: mockSock,
      msg,
      from: fromGroup,
      text: '@5511933333333',
      reply,
      t: (key, vars) => t('pt', key, vars),
      isGroup: true
    });
    assert(output.includes('agora é um *Administrador*'), `Saída inesperada: ${output}`);
    assert.strictEqual(mockSock.lastUpdate?.action, 'promote');
    assert.deepStrictEqual(mockSock.lastUpdate?.jids, ['5511933333333@s.whatsapp.net']);
  });

  await runAsyncTest('4.2 promote plugin rejeita !adm por reply sem @', async () => {
    let output = '';
    const reply = (txt) => { output = txt; };
    const msg = {
      message: {
        extendedTextMessage: {
          text: '!adm',
          contextInfo: {
            participant: '5511933333333@s.whatsapp.net',
            quotedMessage: { conversation: 'me dê adm' }
          }
        }
      }
    };
    mockSock.lastUpdate = null;
    await promotePlugin.execute({
      sock: mockSock,
      msg,
      from: fromGroup,
      text: '',
      reply,
      t: (key, vars) => t('pt', key, vars),
      isGroup: true
    });
    assert.strictEqual(output, t('pt', 'promote.need_explicit_mention'));
    assert.strictEqual(mockSock.lastUpdate, null);
  });

  await runAsyncTest('4.3 promote plugin rejeita !adm 5511... sem @', async () => {
    let output = '';
    const reply = (txt) => { output = txt; };
    const msg = {
      message: {
        conversation: '!adm 5511933333333'
      }
    };
    mockSock.lastUpdate = null;
    await promotePlugin.execute({
      sock: mockSock,
      msg,
      from: fromGroup,
      text: '5511933333333',
      reply,
      t: (key, vars) => t('pt', key, vars),
      isGroup: true
    });
    assert.strictEqual(output, t('pt', 'promote.need_explicit_mention'));
    assert.strictEqual(mockSock.lastUpdate, null);
  });

  await runAsyncTest('4.4 promote plugin com reply na Alice mas menção no Bob promove Bob', async () => {
    let output = '';
    const reply = (txt) => { output = txt; };
    const msg = {
      message: {
        extendedTextMessage: {
          text: '!adm @5511922222222',
          contextInfo: {
            participant: '5511933333333@s.whatsapp.net', // Alice citada
            quotedMessage: { conversation: 'sou a Alice' },
            mentionedJid: ['5511922222222@s.whatsapp.net'] // Bob mencionado
          }
        }
      }
    };
    mockSock.lastUpdate = null;
    await promotePlugin.execute({
      sock: mockSock,
      msg,
      from: fromGroup,
      text: '@5511922222222',
      reply,
      t: (key, vars) => t('pt', key, vars),
      isGroup: true
    });
    assert(output.includes('agora é um *Administrador*'));
    assert.strictEqual(mockSock.lastUpdate?.action, 'promote');
    assert.deepStrictEqual(mockSock.lastUpdate?.jids, ['5511922222222@s.whatsapp.net'], 'Deve promover Bob, não Alice');
  });

  await runAsyncTest('4.5 promote plugin bloqueia execução fora de grupo', async () => {
    let output = '';
    const reply = (txt) => { output = txt; };
    await promotePlugin.execute({
      sock: mockSock,
      msg: {},
      from: '5511999999999@s.whatsapp.net',
      text: '@5511922222222',
      reply,
      t: (key, vars) => t('pt', key, vars),
      isGroup: false
    });
    assert.strictEqual(output, t('pt', 'common.group_only'));
  });

  // ----------------------------------------------------
  // GRUPO 5: TOOL REGISTRY DISPATCH & ANTI-PROMPT INJECTION
  // ----------------------------------------------------
  await runAsyncTest('5.1 toolRegistry bloqueia membro comum tentando acionar promote_member', async () => {
    const msg = {
      message: {
        extendedTextMessage: {
          text: 'dá adm pro @5511922222222',
          contextInfo: { mentionedJid: ['5511922222222@s.whatsapp.net'] }
        }
      }
    };
    // 5511933333333 é membro comum (não admin)
    const res = await toolRegistry.executeTool({
      sock: mockSock,
      msg,
      from: fromGroup,
      sender: '5511933333333@s.whatsapp.net',
      toolName: 'promote_member',
      args: { target: '@5511922222222' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, t('pt', 'common.no_permission_admin'));
  });

  // ----------------------------------------------------
  // GRUPO 6: GATEKEEPER LOCAL NO PLUGIN DO HERMES IA (Zero Custo de Tokens)
  // ----------------------------------------------------
  const hermesPlugin = require('../src/plugins/admin/hermesAgent');
  const aiService = require('../src/services/aiService');

  await runAsyncTest('6.1 hermesAgent intercepta "dá adm pro Pedro" (sem @) localmente sem chamar a API de IA', async () => {
    let apiCalled = false;
    const originalChat = aiService.chatCompletion;
    aiService.chatCompletion = async () => {
      apiCalled = true;
      return { success: true, content: 'resposta do modelo' };
    };

    let replyText = '';
    const msg = {
      key: { id: 'TEST_MSG_6_1' },
      message: { conversation: 'Hermes, dá adm pro Pedro' }
    };

    try {
      await hermesPlugin.processAIInteraction({
        sock: mockSock,
        msg,
        from: fromGroup,
        sender: '5511911111111@s.whatsapp.net',
        queryText: 'dá adm pro Pedro',
        reply: async (txt) => { replyText = txt; },
        lang: 'pt',
        cfg: { personality: 'descontraido' },
        contextInfo: null
      });

      assert.strictEqual(apiCalled, false, 'API da DeepSeek NÃO deve ser chamada para pedido sem @!');
      assert.strictEqual(replyText, t('pt', 'promote.need_explicit_mention'), 'Deve responder com o template padrão');
    } finally {
      aiService.chatCompletion = originalChat;
    }
  });

  await runAsyncTest('6.2 hermesAgent intercepta citação sem @ "dá adm nele" localmente sem chamar a API de IA', async () => {
    let apiCalled = false;
    const originalChat = aiService.chatCompletion;
    aiService.chatCompletion = async () => {
      apiCalled = true;
      return { success: true, content: 'resposta do modelo' };
    };

    let replyText = '';
    const msg = {
      key: { id: 'TEST_MSG_6_2' },
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm nele',
          contextInfo: {
            participant: '5511922222222@s.whatsapp.net',
            quotedMessage: { conversation: 'oi' }
          }
        }
      }
    };

    try {
      await hermesPlugin.processAIInteraction({
        sock: mockSock,
        msg,
        from: fromGroup,
        sender: '5511911111111@s.whatsapp.net',
        queryText: 'dá adm nele',
        reply: async (txt) => { replyText = txt; },
        lang: 'pt',
        cfg: { personality: 'descontraido' },
        contextInfo: msg.message.extendedTextMessage.contextInfo
      });

      assert.strictEqual(apiCalled, false, 'API da DeepSeek NÃO deve ser chamada para reply sem @!');
      assert.strictEqual(replyText, t('pt', 'promote.need_explicit_mention'), 'Deve responder com o template padrão');
    } finally {
      aiService.chatCompletion = originalChat;
    }
  });

  await runAsyncTest('6.3 hermesAgent NÃO intercepta pergunta informativa "quem é o adm do grupo?"', async () => {
    let apiCalled = false;
    const originalChat = aiService.chatCompletion;
    aiService.chatCompletion = async () => {
      apiCalled = true;
      return { success: true, content: 'O adm do grupo é o Carlos.' };
    };

    let replyText = '';
    const msg = {
      key: { id: 'TEST_MSG_6_3' },
      message: { conversation: 'Hermes, quem é o adm do grupo?' }
    };

    try {
      await hermesPlugin.processAIInteraction({
        sock: mockSock,
        msg,
        from: fromGroup,
        sender: '5511911111111@s.whatsapp.net',
        queryText: 'quem é o adm do grupo?',
        reply: async (txt) => { replyText = txt; },
        lang: 'pt',
        cfg: { personality: 'descontraido' },
        contextInfo: null
      });

      assert.strictEqual(apiCalled, true, 'Pergunta informativa DEVE ser encaminhada à IA');
    } finally {
      aiService.chatCompletion = originalChat;
    }
  });

  await runAsyncTest('6.4 hermesAgent com menção explícita @ segue normalmente para o fluxo da IA', async () => {
    let apiCalled = false;
    const originalChat = aiService.chatCompletion;
    aiService.chatCompletion = async () => {
      apiCalled = true;
      return { success: true, content: 'Promovendo membro...' };
    };

    let replyText = '';
    const msg = {
      key: { id: 'TEST_MSG_6_4' },
      message: {
        extendedTextMessage: {
          text: 'Hermes, dá adm pro @5511922222222',
          contextInfo: {
            mentionedJid: ['5511922222222@s.whatsapp.net']
          }
        }
      }
    };

    try {
      await hermesPlugin.processAIInteraction({
        sock: mockSock,
        msg,
        from: fromGroup,
        sender: '5511911111111@s.whatsapp.net',
        queryText: 'dá adm pro @5511922222222',
        reply: async (txt) => { replyText = txt; },
        lang: 'pt',
        cfg: { personality: 'descontraido' },
        contextInfo: msg.message.extendedTextMessage.contextInfo
      });

      assert.strictEqual(apiCalled, true, 'Pedido com @ legítimo DEVE seguir para o fluxo de IA/ferramenta');
    } finally {
      aiService.chatWithTools = originalChat;
    }
  });

  console.log('\n====================================================');
  console.log(`🏁 RESULTADO DA BATERIA: ${passedTests}/${totalTests} testes aprovados!`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
