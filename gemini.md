Markdown
# 🤖 Especificação Técnica: WhatsApp Admin Bot (Baileys High-Performance + Wizard Engine + SaaS + i18n + Anti-Ban)

> **Instruções de Sistema para o Agente de IA (Gemini / Antigravity / Claude Code):**
> Este documento é a especificação técnica definitiva (`AGENTS.md` / `GEMINI.md` / `CLAUDE.md`). Ao implementar este projeto, **não faça suposições fora deste escopo**, não adicione dependências pesadas (como bancos de dados externos ou ORMs), **não utilize APIs depreciadas do Baileys** (como `makeInMemoryStore` ou `printQRInTerminal: true`) e **PROIBIDO usar placeholders** (`// implemente aqui`, `// traduções restantes`). Gere o código 100% completo, enxuto e funcional seguindo rigorosamente a ordem da seção **10. Plano de Execução para o Agente**.
> 
> **🎯 REGRA GLOBAL DE REFATORAÇÃO CIRÚRGICA:** Toda refatoração deve ser executada com a precisão cirúrgica de uma refatoração arquitetural. É obrigatório manter 100% da lógica de código, preservar os esquemas de dados persistidos em `data/groups.json` sem perda de configurações, e garantir que cada plugin seja verdadeiramente modular e autocontido (sem dependências engessadas ou lógicas hardcoded em handlers/núcleo).
> 
> **🧠 REGRA GLOBAL DE ISOLAMENTO DO AGENTE DE IA EM PLUGIN (ZERO MODIFICAÇÃO NO CORE):**
> 1. O acionamento de qualquer modelo de Inteligência Artificial (DeepSeek, Hermes, OpenRouter, OpenAI SDK, LLMs) é **ESTRITAMENTE CONFINADO AO SEU PRÓPRIO PLUGIN** (`src/plugins/admin/hermesAgent.js` e camada `src/services/` exclusiva).
> 2. **É TERMINANTEMENTE PROIBIDO** inserir chamadas de IA, importações de API de LLM ou dependências de agentes dentro de arquivos do núcleo (`src/core/connection.js`, `src/core/configManager.js`, `src/core/scheduler.js`, `src/core/setupWizard.js`, `src/core/wizardEngine.js`), manipuladores de eventos (`src/handlers/groupHandler.js`), utilitários fundamentais (`src/utils/*`) ou nos 19 plugins tradicionais de moderação.
> 3. **Independência Operacional Total:** Caso a API de IA caia, fique sem saldo ou esteja desativada no grupo, o bot continuará 100% funcional. Os comandos por prefixo (`!ban`, `!mute`, `!warn`, `!config`), as proteções passivas (`antilink`, `antiflood`, `antifake`), as rotinas do scheduler e o Baileys jamais dependerão do status da IA.
> 4. **Filtros em Tempo Real Não Usam IA:** Ações de segurança rápida (excluir link, banir flood, verificar DDI) são executadas em milissegundos via código puro determinístico, sem qualquer latência ou custo de tokens.

---

## 📂 1. Estrutura de Diretórios Obrigatória

```text
whatsapp-admin-bot/
├── data/                      # Persistência JSON Atômica (Criado automaticamente - no .gitignore)
│   ├── groups.json            # Whitelist de grupos, licenças SaaS, idioma e configs de plugins
│   └── groups.json.bak        # Backup automático anti-corrupção
├── src/
│   ├── auth/                  # Sessão do Baileys (Criado automaticamente - no .gitignore)
│   ├── config/
│   │   └── settings.js        # Carregamento dinâmico de configurações (.env) e estado global (DM/Anti-Ban)
│   ├── core/
│   │   ├── setupWizard.js     # Wizard interativo de CLI (1º boot: configura .env sem editar arquivos)
│   │   ├── configManager.js   # Motor em RAM + Escrita Atômica (.tmp -> .json) + Merge Não-Destrutivo
│   │   ├── wizardEngine.js    # Máquina de estados exclusiva por Admin (${from}:${sender}) + Painel !config
│   │   ├── scheduler.js       # Motor leve de tarefas agendadas (Horários abrir/fechar, AutoMsg e Vencimentos)
│   │   ├── connection.js      # Motor do Baileys (Socket Furtivo, Auth Híbrida, Cache de Grupo, Reconexão)
│   │   └── pluginLoader.js    # Carregador dinâmico dos comandos, aliases e schemas de configuração
│   ├── handlers/
│   │   ├── messageHandler.js  # Early-return, trava de Privado (DM), Licença, Wizard por Admin e Comandos
│   │   └── groupHandler.js    # Eventos group-participants.update (Welcome, AntiFake, Blacklist, Cache)
│   ├── plugins/               # 19 Módulos Plug-and-Play com Multi-Aliases (PT/ES/EN)
│   │   ├── admin/
│   │   │   ├── config.js      # Painel Geral (!config / !painel / !settings)
│   │   │   ├── lang.js        # Troca instantânea de idioma (!idioma / !lang / !language)
│   │   │   ├── antilink.js    # Filtro de links inteligente com Whitelist de domínios
│   │   │   ├── welcome.js     # Boas-vindas e regras automáticas com auto-delete opcional
│   │   │   ├── warn.js        # Sistema de Advertências progressivas (1/3 -> Ban)
│   │   │   ├── antiflood.js   # Anti-Spam de mensagens seguidas e Anti-Trava (caracteres excessivos)
│   │   │   ├── antifake.js    # Bloqueio automático de números estrangeiros (Filtro de DDI)
│   │   │   ├── schedule.js    # Agendamento automático para abrir e fechar o grupo por horário
│   │   │   ├── automsg.js     # Mensagens/Anúncios periódicos inteligentes (só envia se houver movimento)
│   │   │   ├── ban.js         # Remoção imediata + config de mensagem/delete
│   │   │   ├── mute.js        # Fechar e abrir grupo imediatamente
│   │   │   ├── hidetag.js     # Marcação oculta de todos os membros
│   │   │   ├── promote.js     # Promover membro a Admin
│   │   │   ├── demote.js      # Rebaixar Admin a membro
│   │   │   ├── clear.js       # Apagar mensagem específica do chat via Reply (!del / !apagar)
│   │   │   ├── blacklist.js   # Lista Negra do grupo/global (expulsa automaticamente ao entrar)
│   │   │   └── raffle.js      # Sorteio rápido entre membros do grupo (!sortear / !sorteo / !raffle)
│   │   ├── owner/
│   │   │   ├── groupAuth.js   # Gestão SaaS (!bot on 30, !bot add 30, !bot off, !bot status, !pv on/off)
│   │   │   └── reload.js      # Hot-reload de plugins, traduções e schemas em tempo real
│   │   └── general/
│   │       └── ping.js        # Status, latência, RAM e validade da assinatura do grupo
│   └── utils/
│       ├── antiBan.js         # Skill Anti-Ban: Jitter Delay, Simulação "Digitando...", Rate Limit e Fila
│       ├── i18n.js            # Skill Global de Internacionalização Nativa (PT, ES, EN)
│       ├── jidResolver.js     # Normalização de JID, suporte a @lid, menções, quotes e números BR
│       ├── logger.js          # Instância do Pino configurada para baixo consumo de I/O
│       └── cache.js           # Instância singleton do node-cache (Metadados, Wizard e AntiFlood)
├── .env.example               # Template de variáveis de ambiente
├── .gitignore                 # Ignorar node_modules, src/auth, data/ e .env
├── ecosystem.config.js        # Configuração pronta para deploy com PM2
├── index.js                   # Entrypoint: roda setupWizard, inicia conexão e registra Graceful Shutdown
└── package.json               # Dependências enxutas (Padrão CommonJS: "type": "commonjs")
🌐 2. Skill Obrigatória #1: Internacionalização Trilíngue (src/utils/i18n.js — PT / ES / EN)
REGRA GLOBAL DE TRADUÇÃO: Absolutamente todas as respostas do bot, perguntas do Wizard, menus do !config e mensagens de moderação devem passar pelo motor src/utils/i18n.js suportando Português (pt), Espanhol (es) e Inglês (en).

Funcionamento do src/utils/i18n.js:

Exporta a função t(lang, key, vars = {}) que busca o texto no dicionário correspondente (pt, es ou en, com fallback para pt) e substitui placeholders dinâmicos no formato {variavel}.

Exporta também resolveSchemaText(fieldOrChoice, lang) para que os itens do configSchema dos plugins possam ter label e question definidos como objeto { pt: '...', es: '...', en: '...' }.

O helper reply(text) injetado no messageHandler.js e o helper t(key, vars) já detectam automaticamente o idioma configurado no grupo (configManager.getGroupLang(from)).

Múltiplas Formas de Ativação (Multi-Aliases Intuitivos):

Todo comando deve aceitar variações naturais nos 3 idiomas e sinônimos práticos no array aliases (ex: ['fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'mute', 'unmute']), permitindo que o admin ative a função de várias formas intuitivas.

🛡️ 3. Skill Obrigatória #2: Blindagem Anti-Ban & Humanização (src/utils/antiBan.js)
REGRA GLOBAL ANTI-BAN: O bot NUNCA deve se comportar como um script robótico que responde em 1ms ou dispara dezenas de pacotes simultâneos. Todas as interações de saída devem ser roteadas ou protegidas pelo módulo src/utils/antiBan.js.

Diretrizes de Implementação do src/utils/antiBan.js e connection.js:
Modo Furtivo de Presença (Nunca ficar "Online" 24h):

No makeWASocket (connection.js), é obrigatório definir markOnlineOnConnect: false.

Após enviar uma resposta, ou a cada ciclo ocioso, o bot deve manter a presença como 'unavailable' (await sock.sendPresenceUpdate('unavailable')), impedindo que o WhatsApp detecte conexão automatizada ininterrupta.

Simulação Realista de "Digitando..." (composing) + Atraso Aleatório (Human Jitter):

Crie e exporte em src/utils/antiBan.js a função sendSafeMessage(sock, jid, content, options = {}) (e use-a no helper reply do messageHandler e nos avisos dos plugins):

Ações de Emergência (Zero Delay na Punição): Exclusão de mensagem ({ delete: msg.key }) e remoção de infrator (groupParticipantsUpdate no antilink, antiflood, antifake, blacklist) acontecem imediatamente, para proteger o grupo a tempo.

Respostas de Texto (Comandos, Menus e Wizard):

Aguarda um atraso inicial de "leitura" aleatório entre 300ms e 700ms (randomDelay(300, 700)).

Envia o status "Digitando...": await sock.sendPresenceUpdate('composing', jid).

Calcula o tempo de digitação proporcional ao tamanho do texto com variação aleatória (ex: Math.min(Math.max(text.length * 12, 600), 2200) + randomInt(100, 500) ms).

Aguarda esse tempo em milissegundos.

Pausa o digitando (await sock.sendPresenceUpdate('paused', jid)) e envia a mensagem (await sock.sendMessage(jid, content, options)).

Bloqueio de Comandos no Privado (DM) Ativável/Desativável (ALLOW_PRIVATE_CMDS):

Uma das maiores causas de banimento de bots é qualquer desconhecido chamar o bot no privado (DM) e interagir com ele (o WhatsApp penaliza severamente bots que respondem a números que não estão na agenda ou fora de grupos em comum).

Regra no messageHandler.js:

Se a mensagem não vier de um grupo (!from.endsWith('@g.us')):

O Dono do Bot (isOwner) SEMPRE pode usar comandos no privado (para gerir licenças, usar !bot list, !pv on, !pv off, etc.).

Para qualquer outro usuário no privado: se configManager.isPrivateEnabled() for false (que deve ser o padrão recomendado: false), o bot ignora 100% em silêncio (não envia "Digitando", não marca como lida e não responde nada).

O Dono pode ligar ou desligar respostas no privado a qualquer momento enviando !pv on ou !pv off (no plugin groupAuth.js).

Fila de Disparo e Rate-Limit Anti-Spam por Grupo (Cooldown):

Cooldown de Comandos: No antiBan.js, use um Map ou node-cache para impedir que o mesmo usuário execute mais de 1 comando a cada 2000ms (2 segundos), descartando cliques/mensagens duplicadas silenciosamente.

Escalonamento no Scheduler (scheduler.js): Se 10 grupos tiverem horário agendado para fechar exatamente às 23:00, o scheduler.js NUNCA deve disparar os 10 ao mesmo tempo (Promise.all). Ele deve processar em fila sequencial com um atraso aleatório de 1500ms a 3500ms entre cada grupo.

🧙‍♂️ 4. Sistema Triplo de Wizard, Retenção Anti-Perda & Controle SaaS
A. CLI Setup Wizard (src/core/setupWizard.js)
Executado pelo index.js antes de iniciar o Baileys se .env não existir ou se rodar node index.js --setup.

Usa readline/promises nativo para perguntar:

Método de Conexão ([1] QR Code ou [2] Pairing Code).

Número do Bot (se escolheu [2]).

Número do Dono (OWNER_NUMBER).

Prefixo Padrão (padrão !).

Idioma Padrão Inicial ([1] Português, [2] Español, [3] English).

Modo de Autorização de Grupos ([1] Apenas Dono ou [2] Qualquer Admin).

Responder Comandos no Privado/DM ([1] Não - Apenas o Dono (Recomendado Anti-Ban) ou [2] Sim - Liberado).

Gera o .env, recarrega variáveis e segue para a conexão automaticamente.

B. Persistência Blindada, Retenção de Configs e Controle de Assinatura (src/core/configManager.js)
REGRA CRÍTICA DE RETENÇÃO (PROIBIDO APAGAR CONFIGURAÇÕES):

Desativar um grupo (!bot off ou vencimento de assinatura) ou desativar um plugin (!antilink off) NUNCA apaga o objeto de configurações daquele grupo ou plugin. Apenas altera enabled: false (Soft Disable).

Quando um plugin que já possui configurações salvas (configured: true) é reativado com !<plugin> on, ele restaura imediatamente as configurações anteriores sem obrigar o admin a refazer o Wizard (informando que para reconfigurar basta usar !<plugin> config ou !config).

Toda atualização via Wizard aplica Shallow Merge Não-Destrutivo ({ ...existingConfig, ...newAnswers, enabled: true, configured: true }).

Persistência Atômica Anti-Corrupção + Graceful Shutdown:

Toda leitura é 
O(1) em RAM (Map).

Toda escrita agenda gravação assíncrona com debounce de 1000ms que:

Grava primeiro em data/groups.json.tmp.

Copia o data/groups.json atual para data/groups.json.bak.

Renomeia atomicamente (fs.promises.rename) data/groups.json.tmp para data/groups.json.

Exporta flushSync() registrado em process.on('SIGINT'), process.on('SIGTERM') e process.on('exit') para salvar na hora se a VPS reiniciar.

Estrutura de data/groups.json:

JSON
{
  "_global": {
    "allowPrivateCmds": false,
    "blacklist": ["5511900000000@s.whatsapp.net"]
  },
  "120363000000000@g.us": {
    "enabled": true,
    "lang": "pt",
    "prefix": "!",
    "expiresAt": 1790000000000,
    "expiryNotified": false,
    "lastActivity": 1710000000000,
    "blacklist": [],
    "warns": {},
    "plugins": {
      "antilink": {
        "enabled": true,
        "configured": true,
        "allowedDomains": ["youtube.com", "instagram.com"],
        "action": "delete"
      }
    }
  }
}
C. Onboarding Wizard Exclusivo por Admin Anti-Flood (src/core/wizardEngine.js)
Isolamento Estrito por Admin Iniciador (${from}:${sender}):

O estado do Wizard é salvo no wizardCache com a chave composta ${from}:${sender} (Grupo + JID do Admin que iniciou).

Mensagens de membros comuns ou de outros admins no meio de um grupo movimentado são 100% ignoradas pelo Wizard daquele Admin.

Todas as mensagens do Wizard e do !config são enviadas via sendSafeMessage com Quote ({ quoted: msg }).

Filtro Inteligente de Conversa Paralela:

Se o Admin estiver em um passo de escolha numérica (choice, boolean, menu !config) e enviar uma mensagem longa no grupo (mais de 15 caracteres ou marcando alguém) para conversar com um membro, o wizardEngine ignora aquela mensagem sem poluir o chat, mantendo a sessão ativa aguardando a resposta curta do menu.

Atalho de Valor Padrão / Manter Atual (.):

Se o Admin responder . (ponto), padrao, default ou todos, o Wizard mantém o valor já salvo no grupo (ou assume o default do schema no primeiro uso).

⚡ 5. Regras de Ouro de Performance e Pipeline (messageHandler.js)
PROIBIDO usar makeInMemoryStore (evita Out of Memory).

Cache de Metadados (src/utils/cache.js):

groupCache (stdTTL: 300, useClones: false), wizardCache (stdTTL: 180, useClones: false) e floodCache (stdTTL: 10, useClones: false).

Invalidar groupCache.del(id) imediatamente em groups.update e group-participants.update.

Pipeline de Filtro Rápido (Early Return) no messageHandler.js:

Ignorar se type !== 'notify', !msg.message, msg.key.fromMe ou status@broadcast.

Ignorar mensagens anteriores ao boot (Number(msg.messageTimestamp) < bootTimestamp - 10).

Desencapsular mensagens efêmeras/viewOnce e extrair text.

Trava Anti-Ban de Privado (DM):

Se !from.endsWith('@g.us'): verificar isOwner(sender, sock). Se não for o Dono e !configManager.isPrivateEnabled(), dar return imediato em silêncio absoluto.

Verificação de Grupo Ativo e Licença SaaS:

Em grupos, se !configManager.isGroupEnabled(from): só deixar passar se for comando de ativação (!bot / !ativar). Caso contrário, return imediato.

Se a licença do grupo expirou (expiresAt !== null && Date.now() > expiresAt): se ainda não notificou (!expiryNotified), enviar 1 aviso de licença expirada (em PT/ES/EN) marcando expiryNotified = true e dar return.

Atualizar Atividade do Grupo: configManager.touchGroupActivity(from) (usado pelo automsg).

Hooks Passivos de Proteção (onMessage):

Executar hooks ativos no grupo (antiflood, antilink). Se retornarem true (punição aplicada), interromper pipeline (return).

Interceptador do Wizard Exclusivo do Admin (${from}:${sender}):

Se existir sessão em wizardCache.get(
from:{sender}) e o texto não começar com prefixo de outro comando, enviar para wizardEngine.handleInput e dar return.

Checagem de Prefixo, Cooldown Anti-Ban e Permissões:

Se text começar com o prefixo do grupo: checar antiBan.checkCooldown(sender) (ignora se mandou comando há menos de 2s).

Resolver comando por name ou aliases. Checar ownerOnly, adminOnly e botAdminRequired via jidResolver.checkAdminStatus (compatível com @lid).

🛠️ 6. Catálogo Completo dos 19 Plugins (Multi-Aliases + Wizard + PT/ES/EN)
👑 Categoria: Owner & SaaS (src/plugins/owner/)
groupAuth.js (!bot)

Aliases: ['bot', 'ativar', 'activar', 'activate', 'licenca', 'licencia', 'pv', 'dm']

Funções:

!bot on [dias] (ex: !bot on 30 ou !bot on para vitalício): Ativa o grupo preservando configs antigas.

!bot add <dias> (ex: !bot add 30): Soma dias à assinatura atual do grupo.

!bot off: Pausa o bot no grupo sem apagar configurações.

!bot status: Mostra validade da licença e módulos ativos.

!bot list: Lista todos os grupos cadastrados e dias restantes.

!pv on / !pv off (ou !bot pv on / !bot pv off): Ativa ou desativa respostas a comandos de usuários comuns no privado (DM).

reload.js (!reload)

Aliases: ['reload', 'recarregar', 'recargar', 'atualizar']

Função: Limpa require.cache e recarrega todos os plugins, schemas e traduções sem reiniciar o processo.

⚙️ Categoria: Painel & Idioma (src/plugins/admin/)
config.js (!config)

Aliases: ['config', 'painel', 'panel', 'settings', 'menu', 'cfg', 'wizard']

Função: Abre o Painel Interativo do grupo permitindo ativar/desativar módulos rapidamente, editar apenas 1 pergunta específica ou refazer o Wizard de um plugin, alterar o prefixo ([P]) ou trocar o idioma ([L]).

lang.js (!idioma)

Aliases: ['idioma', 'lang', 'language', 'lingua', 'lenguaje']

Função: Troca o idioma do grupo na hora (!idioma pt, !idioma es, !idioma en) ou abre escolha rápida [1] PT / [2] ES / [3] EN.

🛡️ Tópico 1: Moderação e Proteção Automática (src/plugins/admin/)
antilink.js (!antilink)

Aliases: ['antilink', 'antlink', 'link', 'links', 'antienlace']

Subcomandos diretos: on, off, config, status.

Wizard (configSchema):

allowedDomains (domain_list, default: []): Sites permitidos (ou . / todos para bloquear todos os links).

action (choice, default: 'delete'): [1] Apenas apagar, [2] Apagar e advertir (soma no !warn), [3] Apagar e banir.

welcome.js (!bemvindo)

Aliases: ['bemvindo', 'welcome', 'bienvenida', 'bv', 'regras', 'rules', 'reglas']

Wizard (configSchema):

message (string): Texto de boas-vindas suportando {user}, {group} e {desc} (enviar . usa mensagem padrão no idioma do grupo).

autoDeleteSeconds (number, default: 0): Segundos para apagar a mensagem de boas-vindas automaticamente (0 ou . para não apagar).

Hook onParticipantsUpdate: Dispara no evento add enviando a mensagem formatada via sendSafeMessage.

warn.js (!warn)

Aliases: ['warn', 'adv', 'advertir', 'advertencia', 'aviso', 'unwarn', 'perdoar', 'perdonar', 'warns', 'advertencias']

Uso direto:

!warn @user [motivo] (ou reply): Adiciona 1 advertência (1/3, 2/3). Ao atingir maxWarns, aplica o banimento automaticamente e zera o contador do usuário.

!unwarn @user (ou !warn del @user): Remove 1 advertência do membro.

!warns (ou !warn list): Lista membros advertidos no grupo.

!warn config: Abre o Wizard para configurar maxWarns (number, default: 3).

antiflood.js (!antiflood)

Aliases: ['antiflood', 'antispam', 'flood', 'spam', 'antitrava', 'trava']

Wizard (configSchema):

maxMessages (number, default: 6): Máximo de mensagens seguidas permitidas em 5 segundos.

maxChars (number, default: 2500): Limite máximo de caracteres por mensagem (Anti-Trava).

action (choice, default: 'warn'): [1] Apagar e Advertir, [2] Apagar e Banir imediatamente.

Hook onMessage: Monitora frequência de mensagens por usuário no floodCache e tamanho do texto.

antifake.js (!antifake)

Aliases: ['antifake', 'antifakes', 'ddi', 'antiddi', 'extranjeros', 'foreigners']

Wizard (configSchema):

allowedDdis (string_list, default: ['55', '351', '1', '34', '54', '52']): Lista de DDIs permitidos separados por vírgula (ex: 55 apenas para Brasil).

Hook onParticipantsUpdate: No evento add, resolve o número real do participante; se não começar com nenhum dos DDIs permitidos, avisa e remove imediatamente.

⏰ Tópico 2: Automação de Rotina (src/plugins/admin/ + src/core/scheduler.js)
schedule.js (!horarios)

Aliases: ['horarios', 'horario', 'schedule', 'agendar', 'timer', 'programar']

Wizard (configSchema):

closeTime (string, default: '23:00'): Horário diário para fechar o grupo no formato HH:MM (ou 0 para não fechar).

openTime (string, default: '07:00'): Horário diário para abrir o grupo no formato HH:MM (ou 0 para não abrir).

Execução (scheduler.js): Verifica a cada 60 segundos (unref()) o horário atual (HH:MM) e executa groupSettingUpdate(jid, 'announcement' | 'not_announcement') com fila escalonada Anti-Ban (1.5s a 3.5s entre grupos), salvando a última execução do dia para não repetir no mesmo minuto.

automsg.js (!automsg)

Aliases: ['automsg', 'anuncio', 'lembrete', 'recordatorio', 'autoannounce', 'timermsg']

Wizard (configSchema):

message (string): Texto do comunicado periódico.

intervalMinutes (number, default: 180): Intervalo em minutos entre cada envio (ex: 180 = a cada 3 horas).

onlyIfActive (boolean, default: true): Só enviar se tiver havido mensagens de membros no grupo desde o último anúncio (evita flood em grupo parado).

🧹 Tópico 3: Utilitários de Gestão Rápida (src/plugins/admin/ & general/)
ban.js (!ban)

Aliases: ['ban', 'kick', 'remover', 'expulsar', 'banir', 'eliminar']

Ação: Remove imediatamente o alvo (reply, @menção ou número digitado). Suporta !ban config para definir se apaga a mensagem do alvo e texto customizado.

mute.js (!mute)

Aliases: ['mute', 'unmute', 'fechar', 'abrir', 'cerrar', 'lock', 'unlock', 'grupo']

Ação: Se chamado como !fechar, !cerrar, !lock ou !mute on, fecha na hora. Se chamado como !abrir, !unlock ou !mute off, abre na hora. Se chamado apenas !mute, pergunta [1] Fechar / [2] Abrir.

hidetag.js (!hidetag)

Aliases: ['hidetag', 'totag', 'aviso', 'todos', 'marcar', 'notificar', 'all']

Ação: Reenvia o texto digitado (ou da mensagem respondida) mencionando todos os membros do grupo de forma oculta.

promote.js (!promote)

Aliases: ['promote', 'promover', 'adm', 'admin', 'daradm']

Ação: Promove o usuário alvo a administrador e invalida o groupCache.

demote.js (!demote)

Aliases: ['demote', 'rebaixar', 'tiraradm', 'quitaradm', 'unadmin']

Ação: Rebaixa o administrador alvo a membro comum e invalida o groupCache.

clear.js (!del)

Aliases: ['del', 'apagar', 'delete', 'borrar', 'limparmsg', 'rm']

Ação: Apaga imediatamente a mensagem que foi respondida (quoted) pelo Admin.

blacklist.js (!blacklist)

Aliases: ['blacklist', 'listanegra', 'bl', 'bloqueados']

Ação:

!blacklist add @user (ou número/reply): Adiciona à lista negra do grupo e já remove se estiver presente.

!blacklist global @user (Apenas Owner): Adiciona à lista negra global de todos os grupos.

!blacklist del @user / !blacklist list: Remove da lista ou exibe números bloqueados.

Hook onParticipantsUpdate: Se um número na lista negra entrar no grupo (add), é banido instantaneamente.

raffle.js (!sortear)

Aliases: ['sortear', 'sorteio', 'sorteo', 'raffle', 'draw', 'ganhador']

Ação: !sortear [prêmio] ou !sortear <quantidade> [prêmio] (ex: !sortear 3 PIX de R$50). Sorteia aleatoriamente membros do grupo (excluindo o bot e admins, a menos que especificado) e anuncia marcando os vencedores.

ping.js (!ping — em src/plugins/general/ping.js)

Aliases: ['ping', 'status', 'info', 'latencia', 'uptime']

Ação: Exibe latência em ms, tempo online (uptime), consumo de RAM, idioma atual, status do modo Anti-Ban e validade da licença do grupo.

📦 7. Dependências e Configuração de Produção (VPS)
package.json (Enxuto e CommonJS)
JSON
{
  "name": "whatsapp-admin-bot",
  "version": "2.0.0",
  "description": "High-Performance WhatsApp Admin Bot with Wizard Engine, SaaS Licensing, i18n (PT/ES/EN) and Anti-Ban Protection",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "setup": "node index.js --setup",
    "code": "node index.js --code"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.9",
    "dotenv": "^16.4.5",
    "node-cache": "^5.1.2",
    "pino": "^9.0.0",
    "qrcode-terminal": "^0.12.0"
  }
}
ecosystem.config.js (PM2)
JavaScript
module.exports = {
  apps: [{
    name: 'wpp-admin-bot',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '250M',
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
🚀 8. Plano de Execução para o Agente (Passo a Passo)
Ao receber este arquivo, implemente o projeto completo seguindo rigorosamente esta sequência sem omitir código:

Setup Base: Crie package.json, .env.example, .gitignore e ecosystem.config.js.

Utilitários, Anti-Ban e Internacionalização: Crie src/config/settings.js, src/utils/logger.js, src/utils/cache.js, src/utils/jidResolver.js, src/utils/antiBan.js (com simulação de composing, atraso aleatório em ms, presença unavailable e cooldown) e src/utils/i18n.js (com dicionários completos em pt, es e en).

Motores de Estado e Persistência Atômica: Crie src/core/setupWizard.js, src/core/configManager.js (com merge não-destrutivo, controle allowPrivateCmds, escrita atômica .tmp 
→ .json + .bak e flushSync) e src/core/pluginLoader.js (mapeando name e todos os aliases).

Motor Conversacional, Scheduler e Handlers: Crie src/core/wizardEngine.js (isolamento ${from}:${sender}, filtro de conversa paralela e quote obrigatório via sendSafeMessage), src/core/scheduler.js (com fila escalonada Anti-Ban), src/handlers/groupHandler.js, src/handlers/messageHandler.js (com bloqueio silencioso de DM para não-owners quando desativado) e src/core/connection.js.

Catálogo de Plugins (20 arquivos): Crie todos os plugins especificados na Seção 6 dentro de src/plugins/owner/, src/plugins/admin/ e src/plugins/general/.

Entrypoint e Validação: Crie o index.js (registrando SIGINT/SIGTERM para configManager.flushSync()), rode npm install e valide todos os arquivos gerados com node --check.


---

### Resumo das Proteções Anti-Ban adicionadas nesta versão:
* **Simulação de Digitação Humana (`composing` + Jitter Aleatório):** Antes de responder a qualquer comando ou passo do Wizard, o bot espera entre `300ms` e `700ms` (simulando leitura), liga o *"Digitando..."* no grupo por um tempo proporcional ao tamanho da mensagem (`600ms a 2700ms` variáveis), pausa o digitando e envia a resposta. *(Nota: punições de emergência como apagar link ou banir continuam instantâneas para não dar tempo de o spammer agir).*
* **Furtividade de Status Online (`markOnlineOnConnect: false` + `unavailable`):** O bot nunca fica com a tag "Online" travada 24 horas por dia. Ele aparece apenas quando digita e depois volta a ficar invisível.
* **Trava Silenciosa de Privado/DM (`!pv off` por padrão):** Estranhos que chamarem o bot no privado são 100% ignorados em silêncio absoluto (nem confirma leitura nem simula digitação), enquanto você (Dono) continua podendo enviar comandos para o bot no privado normalmente. Se um dia quiser liberar o privado, basta mandar `!pv on`.
* **Fila Escalonada + Cooldown Anti-Flood de Comandos:** Impede que usuários metralhem comandos repetidos (rate-limit de 2s por usuário) e faz com que os agendamentos de horários (`!horarios`) enviem mensagens com intervalo aleatório de `1.5s a 3.5s` entre cada grupo.