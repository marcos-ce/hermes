# 📋 Plano de Refatoração e Correções — Hermes (Fase 2+)

> Documento de acompanhamento da engenharia. Não é carregado em runtime.

## Princípios (refatoração cirúrgica)

1. Cada lote é independente, testável e deployável separadamente.
2. Preservar 100% da lógica e dos esquemas de `data/groups.json`.
3. Validar antes de cada commit: `node --check` + `node scripts/audit_suite.js` + `node scripts/test_suite.js`.
4. Nunca tocar em `data/`, `.env`, `src/auth/`.

---

## Lote 1 — Correções médias (baixo risco) — ✅ CONCLUÍDO

### 1.1 Fallback de estilo formal (BUG) — ✅
- **Problema:** em `t()`, no modo formal, uma chave ausente em ES/EN cai no `i18nFormal.pt`, exibindo **texto em português** em grupos espanhóis/ingleses.
- **Correção:** remover o fallback `|| i18nFormal.dictionaries.pt?.[key]`, deixando formal ES/EN cair no dicionário natural do próprio idioma (língua correta).

### 1.2 `antiflood` não apaga a mensagem (BUG) — ✅
- Apagar `msg.key` (via `safeDelete`) ao detectar flood/trava, antes de punir.

### 1.3 Limpezas pontuais — ✅
- `groupAuth.js`: `msg: _msg` → `msg` (estava passando `undefined` ao `autoAdm`).
- `welcome.js`: remover `seconds` extra no objeto de vars (inócuo).
- `connection.js`: corrigir comentário do `msgStore` e remover `require('fs')` redundante.

---

## Lote 2 — Extração de helpers — ✅ CONCLUÍDO

- **2.1** ✅ Centralizar `getBotIdentity(sock)` / `isBotIdentity(sock, jid)` em `jidResolver.js`.
- **2.2** ✅ Consolidar `_resolveTargetSmart` / `_getExplicitTargets` / `_requireExplicitTarget` num único `resolveActionTarget` em `src/services/targetResolver.js`, mantendo o retorno idêntico `{ phoneJid, groupJid, displayNum }` e a blindagem anti-prompt-injection.

---

## Lote 3 — Deduplicação de lógica de domínio — ✅ CONCLUÍDO

- **3.1** ✅ Extrair `pickWinners(pool, count)` (Fisher-Yates) para `src/utils/raffle.js` — corrigido o viés de `.sort(() => 0.5 - Math.random())` no `calendar.js` e unificado com `raffle.js` e `toolRegistry.js`.
- **3.2** ✅ Extrair `unpinAllMessages(sock, groupJid)` para `src/utils/pinTracker.js` (unificado em `pin.js`, `toolRegistry` e `calendar`).
- **3.3** ✅ Extrair `scheduleTimedGroupAction` para `src/plugins/admin/calendar.js` (unificado fechamento temporário + reabertura agendada com persistência e timer de curto prazo).

---

## Lote 4 — Refatoração estrutural — ✅ CONCLUÍDO

- **4.1** ✅ Quebrar o switch de 1300 linhas de `toolRegistry.js` em 25 handlers modulares em `src/services/tools/<nome>.js` despachados via Map, reduzindo `toolRegistry.js` de 2250 para ~640 linhas.
- **4.2** ✅ Numeração de comandos centralizada em fonte única (`src/core/commandNumbers.js`) com validação de colisão e teste rigoroso de unicidade na seção 9 do `audit_suite.js`.

---

## Lote 5 — Infra / deploy — ✅ CONCLUÍDO

- **5.1** ✅ Adicionado `"engines": { "node": ">=22.5.0" }` no `package.json` (requisito do `node:sqlite`).
- **5.2** ✅ Alinhados limites de RAM: `--max-old-space-size=380` no `package.json`, `max_memory_restart: '420M'` no `ecosystem.config.js` e `RAM=512` no `discloud.config`.
- **5.3** ✅ Política de `uncaughtException`: `logger.fatal`, `flushSync()` de dados e `process.exit(1)` para reinício limpo pelo supervisor.
