# 📋 Plano de Refatoração e Correções — Hermes (Fase 2+)

> Documento de acompanhamento da engenharia. Não é carregado em runtime.

## Princípios (refatoração cirúrgica)

1. Cada lote é independente, testável e deployável separadamente.
2. Preservar 100% da lógica e dos esquemas de `data/groups.json`.
3. Validar antes de cada commit: `node --check` + `node scripts/audit_suite.js` + `node scripts/test_suite.js`.
4. Nunca tocar em `data/`, `.env`, `src/auth/`.

---

## Lote 1 — Correções médias (baixo risco)

### 1.1 Fallback de estilo formal (BUG)
- **Problema:** em `t()`, no modo formal, uma chave ausente em ES/EN cai no `i18nFormal.pt`, exibindo **texto em português** em grupos espanhóis/ingleses.
- **Correção:** remover o fallback `|| i18nFormal.dictionaries.pt?.[key]`, deixando formal ES/EN cair no dicionário natural do próprio idioma (língua correta).
- **Completar `i18nFormal` (es/en)** fica como esforço separado (grande, ~100 chaves × 2 idiomas).

### 1.2 `antiflood` não apaga a mensagem (BUG)
- Apagar `msg.key` (via `safeDelete`) ao detectar flood/trava, antes de punir.

### 1.3 Limpezas pontuais
- `groupAuth.js`: `msg: _msg` → `msg` (estava passando `undefined` ao `autoAdm`).
- `welcome.js`: remover `seconds` extra no objeto de vars (inócuo).
- `connection.js`: corrigir comentário do `msgStore` e remover `require('fs')` redundante.

---

## Lote 2 — Extração de helpers (reduz duplicação, sem mudar comportamento)

- **2.1** Centralizar `getBotIdentity(sock)` / `isBotIdentity(sock, jid)` em `jidResolver.js` (hoje em ~8 arquivos).
- **2.2** Consolidar `_resolveTargetSmart` / `_getExplicitTargets` / `_requireExplicitTarget` do `toolRegistry` num único `resolveActionTarget`.

---

## Lote 3 — Deduplicação de lógica de domínio

- **3.1** Extrair `pickWinners(pool, count)` (Fisher-Yates) — corrige o viés de `.sort(() => 0.5 - Math.random())` no `calendar.js`.
- **3.2** Extrair `unpinAllMessages(sock, groupJid)` (triplicado em `pin.js`, `toolRegistry`, `calendar`).
- **3.3** Extrair `scheduleTimedGroupAction` para fechamento temporário + reabertura agendada (repetido 3× no `set_group_mute`).

---

## Lote 4 — Refatoração estrutural (maior cuidado)

- **4.1** Quebrar `toolRegistry.js` (2250 linhas) em módulos por ferramenta (`src/services/tools/`).
- **4.2** Numeração de comandos em fonte única (`src/core/commandNumbers.js`) + validação de unicidade no loader (causa-raiz do bug de `cmdNumber`).

---

## Lote 5 — Infra / deploy

- **5.1** `engines` no `package.json` (`node >= 22.5` por causa do `node:sqlite`).
- **5.2** Alinhar `ecosystem.config.js` / `discloud.config` / `--max-old-space-size`.
- **5.3** Política de `uncaughtException` (logar + `exit(1)` para o supervisor reiniciar limpo).
