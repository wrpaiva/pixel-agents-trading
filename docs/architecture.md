# Arquitetura

O Pixel Agents Trading é o Pixel Agents 1.5.0 (subtree em `vendor/pixel-agents`) com sete personagens nativos alimentados pelo receptor do `openclaw-pixel-adapter`. Não há segundo frontend: o navegador recebe as mesmas mensagens WebSocket que o upstream já usa para agentes do Claude.

## Diagrama

```text
OpenClaw Trading
  |
  | Hooks de observação
  v
openclaw-pixel-adapter
  |
  | GET /agents
  | GET /events
  | Bearer Token
  v
Pixel Agents Trading
  |
  | Adaptador interno OpenClawProvider
  | Eventos normalizados
  v
AgentRuntime / AgentStateStore
  |
  | WebSocket
  v
Pixel Agents Webview
  |
  v
7 personagens animados
```

O fluxo é de mão única: nada volta ao OpenClaw, e o token do receptor só existe no backend (lido de `/run/secrets/pixel_events_token`).

## Camadas de `src/trading`

- **`config`**: `agents.ts` lista os sete agentes (`trading-coordinator`, `crypto-btc`, `crypto-eth`, `forex-eur`, `forex-gbp`, `gold-analyst`, `risk-reviewer`) com nome visual, papel, id numérico fixo no escritório (9001–9007), paleta e rotação de cor. Ids fixos mantêm cor entre reinícios, e `seatId` aponta o banco da estação do agente em `trading-room/layout.json` (`seat-<agentId>`). No início, o provider grava esses assentos no estado do upstream (`standalone-state.json`, campo `seats`); o handshake os envia como `agentMeta.seatId` e o webview senta cada agente na sua estação. Se o layout carregado não tiver esse banco, o webview escolhe uma cadeira livre, como antes. O agente `main` não está na lista e, portanto, nunca aparece.
- **`domain`**: tipos puros, sem I/O: `AgentStatus` (`idle`, `analyzing`, `using_tool`, `waiting`, `completed`, `error`, `disconnected`), `TradingAgent`, `TradingAgentEvent` e `TradingAgentSnapshot`. Não conhecem HTTP nem o Pixel Agents.
- **`application`**: a lógica. `TradingAgentRegistry` guarda o estado dos sete agentes. `AgentStateMapper` (Strategy) traduz evento ou estado do receptor em `AgentStatus`. `TradingEventProcessor` (Observer) aplica snapshots e eventos, descarta duplicados e atrasados (por `seq`, com fallback por timestamp), expira `completed` (4 s) e `error` (2 min) para `idle`, devolve agentes ativos sem eventos a `idle` (`PIXEL_EVENTS_STALE_ACTIVE_MS`) e marca `disconnected`. `ports.ts` define `Logger` e demais interfaces.
- **`infrastructure`**: adaptadores para o mundo externo. `SecretProvider` lê o token do arquivo de secret. `ReceiverApiClient` faz `GET /agents` e abre `GET /events` com Bearer. `ReceiverEventStream` consome o SSE, valida cada mensagem, reconecta com backoff e trata silêncio prolongado (nem o `: ping` chega) como conexão morta.
- **`providers`**: `OpenClawProvider` projeta o registry no Pixel Agents: cria os `AgentState` no `AgentStateStore` (persistidos e reenviados a cada `webviewReady`), cria arquivos-marcador vazios em `~/.pixel-agents/openclaw/` e envia as mensagens WebSocket nativas. É a única camada que importa código do vendor. O `store.persist()` do start roda antes do `restoreExternalAgents` do upstream, então agentes externos persistidos que não sejam do OpenClaw são sobrescritos; sem efeito prático aqui, pois o container não roda Claude. Interação com rollback: os ids 9001–9007 e os marcadores ficam no volume compartilhado, e a 1.0.0 (upstream puro) os restauraria como personagens ociosos; ver a limpeza em `docs/deployment.md`.
- **`bootstrap`**: `registerTradingProvider` monta tudo (registry, processor, provider, cliente, stream), lê as variáveis `PIXEL_EVENTS_*`, faz o snapshot inicial antes do SSE e liga o relógio de expiração (1 s). Se algo falhar ao montar, registra `[trading] Trading Room desativada: …`, desfaz o que subiu e devolve um handle inerte: o servidor continua rodando sem os sete agentes. Isso difere do plano original, que deixava a exceção subir. Sem token válido, a Trading Room sobe e mostra os agentes como desconectados.

## Como os estados viram mensagens nativas

Fatos sobre o upstream v1.5.0:

- O webview ativa a animação em `agentToolStart` e em `agentStatus: 'active'`. Qualquer outro valor de `agentStatus` desativa a animação. `'waiting'` também mostra o balão de "concluído" e toca o som.
- O texto sob o personagem é o `status` da última ferramenta não concluída. Sem ferramentas, o texto é "Idle".
- `agentTeamInfo.agentName` aparece como linha de título, e `directoryName` aparece como linha extra.
- No `webviewReady`, o servidor manda `existingAgents` → `layoutLoaded` → `resendAgentActivity` (team info, ferramentas, `waiting`).
- `startStaleExternalAgentCheck` remove agentes `isExternal` cujo `jsonlFile` não existe. Por isso criamos arquivos-marcador vazios.
- `restoreExternalAgents` ignora IDs que já estão no store. Por isso registramos os agentes no boot, antes de qualquer cliente se conectar.

| AgentStatus | AgentState (para replay) | Broadcast |
|---|---|---|
| idle | sem ferramentas, `isWaiting=false` | `agentToolsClear`, `agentStatus:'idle'` |
| analyzing | ferramenta `openclaw-activity` = "Analisando" | `agentToolsClear`, `agentToolStart`, `agentStatus:'active'` |
| using_tool | ferramenta = "Ferramenta: <nome>" | idem analyzing |
| completed | sem ferramentas, `isWaiting=true` | `agentToolsClear`, `agentStatus:'waiting'` |
| waiting / error / disconnected | ferramenta = rótulo | `agentToolsClear`, `agentToolStart`, `agentStatus:'idle'` (+ replayer reenvia `'idle'`) |

Rótulos: `Analisando`, `Ferramenta: <nome>`, `Aguardando dependência`, `Erro na execução`, `Sem conexão com o receptor`.

## Alterações no vendor

O vendor é um subtree do upstream com exatamente três alterações, todas marcadas com o comentário `pixel-agents-trading patch`:

1. **`server/src/activityReplayers.ts`** (arquivo novo): ponto de extensão com `addActivityReplayer` e `replayExtraActivity`. O upstream só reenvia estado derivado de transcripts do Claude; o replayer permite que o provider OpenClaw corrija o que um cliente recém-conectado acabou de receber (por exemplo, o `agentStatus:'idle'` dos estados com rótulo e sem animação).
2. **`server/src/clientMessageHandler.ts`**: chama `replayExtraActivity(send)` logo após `resendAgentActivity` no handshake `webviewReady`. Sem isso, recarregar a página perderia o estado dos sete personagens.
3. **`server/src/cli.ts`**: importa e chama `registerTradingProvider` no boot, depois de criar o store e antes de aceitar clientes. O import vem de `src/trading`, empacotado pelo esbuild do upstream (`node esbuild.js --production`), sem etapa de build própria. Também passa o `FileStateAdapter` (`seats: adapter`), onde o provider grava a cadeira de cada agente.

## Atualizar o upstream

```bash
git subtree pull --prefix vendor/pixel-agents https://github.com/pixel-agents-hq/pixel-agents.git vX.Y.Z --squash
```

Depois, reaplique e confira as três alterações acima (`grep -rn "pixel-agents-trading patch" vendor/pixel-agents/server/src`), ajuste a versão do `.tgz` no `Dockerfile` (`pixel-agents-<versão>.tgz`) e rode `npm run typecheck && npm test && npm run build:vendor && npm run e2e`.
