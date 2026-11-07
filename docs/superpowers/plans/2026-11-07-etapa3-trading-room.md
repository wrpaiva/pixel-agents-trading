# Etapa 3 — Trading Room com agentes OpenClaw: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar os sete agentes reais do `openclaw-trading` como personagens nativos do Pixel Agents 1.5.0. Os estados vêm de eventos reais do `openclaw-pixel-adapter`. A imagem resultante é a `2.0.0`.

**Architecture:** O fonte do Pixel Agents 1.5.0 entra em `vendor/pixel-agents` via `git subtree --squash`. Ele recebe apenas três alterações: um ponto de extensão `activityReplayers.ts`, uma linha no handshake `webviewReady` e o registro do provedor no `cli.ts`. A lógica da Trading Room fica em `src/trading`, que o esbuild do upstream empacota junto. No backend, um cliente HTTP/SSE consome `GET /agents` e `GET /events` do receptor. Um processador puro converte os eventos em `AgentStatus`. O `OpenClawProvider` cria os sete `AgentState` com IDs fixos (9001–9007) no `AgentStateStore` e anima os personagens só com mensagens WebSocket que já existem (`agentToolStart`, `agentToolsClear`, `agentStatus`, `agentTeamInfo`). Não há nenhuma alteração no webview.

**Tech Stack:** TypeScript 5.9, Node 22 (`fetch`/`ReadableStream`/`WebSocket` nativos), Vitest 4, Playwright 1.58, esbuild/Vite do upstream, Docker multi-stage, Docker Swarm + Traefik, GitHub Actions + GHCR.

**Spec:** `docs/superpowers/specs/2026-11-07-etapa3-trading-room.md`

## Global Constraints

- Imagem final: `ghcr.io/wrpaiva/pixel-agents-trading:2.0.0`. A tag `1.0.0` nunca mais é sobrescrita.
- Base: Pixel Agents **1.5.0** (tag `v1.5.0` de `https://github.com/pixel-agents-hq/pixel-agents.git`).
- Agentes, exatamente estes: `trading-coordinator`, `crypto-btc`, `crypto-eth`, `forex-eur`, `forex-gbp`, `gold-analyst`, `risk-reviewer`. O agente `main` nunca aparece.
- Estados internos: `"idle" | "analyzing" | "using_tool" | "waiting" | "completed" | "error" | "disconnected"`.
- Receptor: `http://pixel-events_receiver:3188`, `GET /agents` e `GET /events` (SSE), com `Authorization: Bearer <token>`.
- O token é lido de `/run/secrets/pixel_events_token`. Ele nunca vai ao navegador, a logs, ao repositório, ao Dockerfile ou a mensagens de erro.
- Prompts, mensagens, argumentos e resultados de ferramentas nunca chegam ao frontend. Só passam campos da lista branca (`agentId`, `type`, `state`, `sessionKey`, `toolName`, `timestamp`, `seq`, `count`).
- Nenhum endpoint, mensagem ou botão pode iniciar comandos do OpenClaw ou ordens financeiras.
- Nenhuma alteração em `tiles`, `tileColors`, `furniture`, paredes ou decoração. O código não escreve `layout.json`. **Não rodar `criar-trading-room.sh`.**
- Não editar bundles compilados. O webview do upstream não é modificado.
- Stack `pixel-agents`, serviço `pixel-agents_web`, redes `waurumai_net` + `trading_internal`, secret `pixel_events_token`, mesmo volume `pixel_agents_data`, sem porta publicada, `--no-terminal` preservado, limites de recursos mantidos.
- Comentários, logs e textos de UI ficam em português, como no resto do repositório.
- O `main` tem alterações locais não commitadas do usuário em `criar-trading-room.sh` e `trading-room/layout.json`. **Trabalhe num worktree** (skill `superpowers:using-git-worktrees`), no branch `feat/etapa3-openclaw`. Nunca faça stage desses dois arquivos.
- Ações externas (push de tag, publicação de imagem, deploy no Swarm, reimplantar o receptor ou o plugin) só acontecem com confirmação explícita do usuário. Isso vale para a Task 13 inteira.

## Review Focus

1. **Recarregar o navegador enquanto um agente está em `error` ou `disconnected`.** O personagem deve continuar parado, com o rótulo de erro ou de conexão perdida. O `resendAgentActivity` do upstream reenvia `agentToolStart`, que ativa a animação, e por isso o replayer precisa desativá-la em seguida. Teste na Task 9.
2. **O receptor reinicia e o `seq` volta a 0.** Os eventos novos (seq 1, 2…) têm que ser aceitos, e não descartados como "atrasados". Teste na Task 5.
3. **Uma chamada longa ao modelo, ou eventos chegando depois do timeout de inatividade.** Passados `staleActiveMs` sem eventos, o agente volta a `idle`. Se depois chegar um `model_end` ou `tool_end` real, ele volta a `analyzing`. Teste na Task 5.
4. **Um operador com `?token` fecha o personagem pela UI.** O personagem tem que reaparecer, com o mesmo id e o mesmo nome. Teste na Task 9.
5. **O secret criado com `echo` tem `\n` ou `\r\n` no final.** O token precisa ser aceito depois do trim. Teste na Task 6.

---

## Mapa de arquivos

```text
vendor/pixel-agents/                       # subtree v1.5.0 (Task 1)
  server/src/activityReplayers.ts          # NOVO — ponto de extensão (Task 8)
  server/src/clientMessageHandler.ts       # +2 linhas — chama replayExtraActivity (Task 8)
  server/src/cli.ts                        # +~10 linhas — registra a Trading Room (Task 10)
  server/__tests__/activityReplayers.test.ts  # NOVO (Task 8)
src/trading/
  config/agents.ts                         # 7 agentes, ids 9001–9007, paleta fixa (Task 3)
  domain/AgentStatus.ts                    # tipo + conjuntos (Task 3)
  domain/TradingAgent.ts                   # contrato do spec (Task 3)
  domain/TradingAgentEvent.ts              # contrato do spec + failed/seq (Task 3)
  domain/TradingAgentSnapshot.ts           # snapshot normalizado do receptor (Task 3)
  application/ports.ts                     # Clock, Logger (Task 3)
  application/TradingAgentRegistry.ts      # Registry (Task 3)
  application/AgentStateMapper.ts          # Strategy (Task 4)
  application/TradingEventProcessor.ts     # Observer + dedupe/ordem/timeouts (Task 5)
  infrastructure/SecretProvider.ts         # lê o secret (Task 6)
  infrastructure/ReceiverApiClient.ts      # Adapter HTTP + parsers lista-branca (Task 6)
  infrastructure/ReceiverEventStream.ts    # SseParser + cliente SSE com reconexão (Task 7)
  providers/OpenClawProvider.ts            # personagens nativos (Task 9)
  bootstrap/registerTradingProvider.ts     # composição + env (Task 10)
tests/
  fixtures/receiver-agents.json            # resposta real do receptor (Task 3)
  support/fakeReceiver.ts                  # receptor fake SÓ para testes (Task 7)
  support/waitFor.ts                       # (Task 7)
  unit/*.test.ts  integration/*.test.ts  e2e/trading-room.spec.ts
scripts/smoke-ws.mjs                       # verificação via WebSocket dentro do container (Task 11)
package.json  package-lock.json  tsconfig.json  vitest.config.ts  playwright.config.ts  .gitignore  .dockerignore
Dockerfile  stack.yml  stack.canary.yml  .github/workflows/{test.yml,docker-publish.yml}
docs/{architecture.md,event-contract.md,deployment.md}  README.md  CLAUDE.md
```

Repositório separado (Task 2): `/home/usuario/projeto-2026/openclaw-pixel-adapter` (`plugin/index.ts`, `receiver/server.mjs`, `test/receiver.test.mjs`, `README.md`).

### Como os estados viram mensagens nativas

Estes fatos sobre o upstream foram conferidos no código da v1.5.0:

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

---

### Task 1: Importar o Pixel Agents 1.5.0 e configurar o ferramental na raiz

**Files:**
- Create: `vendor/pixel-agents/**` (subtree)
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Test: `tests/unit/vendorSmoke.test.ts`

**Interfaces:**
- Produces: scripts `npm test`, `npm run typecheck`, `npm run build:vendor`, `npm run e2e`. Módulos do upstream importáveis por caminho relativo (`vendor/pixel-agents/server/src/*.js`).

- [ ] **Step 1: Criar o worktree.** Use a skill `superpowers:using-git-worktrees` para criar o branch `feat/etapa3-openclaw` a partir de `main`. Confirme com `git status --short` que o worktree está limpo, ou seja, que as alterações locais do `main` não vieram junto.

- [ ] **Step 2: Adicionar o subtree**

```bash
git subtree add --prefix vendor/pixel-agents https://github.com/pixel-agents-hq/pixel-agents.git v1.5.0 --squash
```

Esperado: dois commits, um "Squashed 'vendor/pixel-agents/' content from commit b1bafd0" e um merge. `cat vendor/pixel-agents/package.json | grep '"version"'` deve mostrar `"version": "1.5.0"`.

- [ ] **Step 3: Escrever o teste de fumaça (falha porque ainda não há tooling)**

`tests/unit/vendorSmoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createAgentState } from '../../vendor/pixel-agents/server/src/agentState.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';

describe('vendor pixel-agents 1.5.0', () => {
  it('expõe AgentStateStore e createAgentState para a Trading Room', () => {
    const store = new AgentStateStore();
    store.set(
      1,
      createAgentState({ id: 1, sessionId: 's', projectDir: 'p', jsonlFile: 'f', isExternal: true }),
    );
    expect(store.get(1)?.activeToolStatuses.size).toBe(0);
  });
});
```

- [ ] **Step 4: Criar o ferramental na raiz**

`package.json`:

```json
{
  "name": "pixel-agents-trading",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "typecheck": "tsc --noEmit",
    "build:vendor": "cd vendor/pixel-agents && npm ci --ignore-scripts && node esbuild.js --production && npm run build:webview",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@types/node": "22.x",
    "@types/vscode": "^1.105.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.10"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "tests", "playwright.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
```

`.gitignore`:

```gitignore
node_modules/
vendor/pixel-agents/node_modules/
vendor/pixel-agents/webview-ui/node_modules/
vendor/pixel-agents/server/node_modules/
vendor/pixel-agents/dist/
test-results/
playwright-report/
*.tgz
```

- [ ] **Step 5: Instalar e rodar**

```bash
npm install
npx vitest run tests/unit/vendorSmoke.test.ts
npm run typecheck
```

Esperado: 1 teste PASS e `tsc` sem erros. Se o `tsc` acusar erros dentro de `vendor/`, eles vêm de opções mais estritas que as do upstream. Ajuste a opção no `tsconfig.json` da raiz; não edite o vendor.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore tests/unit/vendorSmoke.test.ts
git commit -m "build: ferramental TypeScript/Vitest sobre o vendor pixel-agents 1.5.0"
```

---

### Task 2: Adapter — evento `tool_start`, `seq` e keepalive SSE (repo `openclaw-pixel-adapter`)

Repositório: `/home/usuario/projeto-2026/openclaw-pixel-adapter`. Os comandos desta task rodam lá.

**Files:**
- Modify: `plugin/index.ts` (registrar o hook de início de ferramenta)
- Modify: `receiver/server.mjs` (aceitar `tool_start`; `seq` monotônico; `: ping` a cada 25s)
- Modify: `test/receiver.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces, consumido pelas Tasks 5–7:
  - Os eventos `activity` do SSE e cada item de `GET /agents` passam a ter `seq: number`. É um contador global por execução do receptor, que volta a 0 quando ele reinicia. No snapshot, `seq` é o último seq daquele agente, ou 0.
  - Novo tipo `tool_start`, com estado `ferramenta`.
  - Comentário `: ping` no SSE a cada 25 s.

- [ ] **Step 1: Escrever os testes que falham**, no fim de `test/receiver.test.mjs`:

```js
async function withServerOpts(opts, fn) {
  const receiver = createReceiver({ token, ...opts });
  const server = http.createServer(receiver.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (base, body) => fetch(base + '/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ version: 1, ...body }) });
const agentsOf = async base => (await (await fetch(base + '/agents', { headers: { authorization: `Bearer ${token}` } })).json()).agents;

test('tool_start marks the agent as using a tool', async () => withServer(async base => {
  assert.equal((await post(base, { type: 'tool_start', agentId: 'crypto-btc', toolName: 'web_search' })).status, 202);
  const btc = (await agentsOf(base)).find(a => a.agentId === 'crypto-btc');
  assert.equal(btc.state, 'ferramenta');
  assert.equal(btc.toolName, 'web_search');
}));
test('every accepted event gets a monotonic seq exposed in the snapshot', async () => withServer(async base => {
  await post(base, { type: 'model_start', agentId: 'crypto-btc' });
  await post(base, { type: 'model_start', agentId: 'crypto-eth' });
  await post(base, { type: 'model_end', agentId: 'crypto-btc' });
  const agents = await agentsOf(base);
  assert.equal(agents.find(a => a.agentId === 'crypto-btc').seq, 3);
  assert.equal(agents.find(a => a.agentId === 'crypto-eth').seq, 2);
  assert.equal(agents.find(a => a.agentId === 'gold-analyst').seq, 0);
}));
test('SSE sends snapshot, activity with seq and keepalive pings', async () => withServerOpts({ pingMs: 20 }, async base => {
  const controller = new AbortController();
  const res = await fetch(base + '/events', { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  await post(base, { type: 'tool_start', agentId: 'forex-eur', toolName: 'quote' });
  const deadline = Date.now() + 2000;
  while (!(text.includes('event: activity') && text.includes(': ping')) && Date.now() < deadline) {
    const { value } = await reader.read();
    text += decoder.decode(value, { stream: true });
  }
  controller.abort();
  assert.match(text, /^event: snapshot\n/);
  const activity = JSON.parse(text.split('event: activity\ndata: ')[1].split('\n')[0]);
  assert.equal(activity.type, 'tool_start');
  assert.equal(activity.seq, 1);
  assert.match(text, /: ping\n\n/);
}));
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/*.test.mjs`
Esperado: FAIL nos 3 testes novos. `tool_start` responde 422, `seq` vem `undefined` e o ping não chega.

- [ ] **Step 3: Implementar no receptor.** Em `receiver/server.mjs`, troque a constante `STATES`, adicione `PING_MS` e ajuste `createReceiver`:

```js
const STATES = { model_start: 'analisando', model_end: 'aguardando', tool_start: 'ferramenta', tool_end: 'ferramenta_concluida', agent_end: 'ocioso' };
const MAX_BODY = 4096;
const IDLE_MS = 120000;
const PING_MS = 25000;

export function createReceiver({ token, now = () => Date.now(), pingMs = PING_MS }) {
  if (!token || token.length < 24) throw Error('PIXEL_EVENTS_TOKEN must have at least 24 characters');
  const latest = new Map();
  const listeners = new Set();
  const counters = new Map(AGENTS.map(a => [a, 0]));
  // Global, monotonic per process: lets consumers drop duplicates and late events.
  let seq = 0;
```

No `snapshot()`, inclua `seq` em cada item:

```js
      count: counters.get(agentId),
      seq: entry?.seq ?? 0,
```

No `GET /events`, troque as duas linhas `listeners.add(res); req.on('close', ...)` por:

```js
      listeners.add(res);
      // Keepalive comment so idle connections are not silently dropped by the overlay network.
      const ping = setInterval(() => res.write(': ping\n\n'), pingMs);
      req.on('close', () => { clearInterval(ping); listeners.delete(res); });
```

No `POST /events`, adicione `seq` ao `record`:

```js
        timestamp, receivedAt: now(), seq: ++seq,
```

- [ ] **Step 4: Implementar no plugin.** Em `plugin/index.ts`, dentro de `register(api)`, adicione antes do `after_tool_call`:

```ts
    // Observation only: returns nothing, so the tool call is never blocked or modified.
    api.on("before_tool_call", (event, ctx) => emit("tool_start", event, ctx));
```

Confirme o nome do hook na documentação do plugin SDK do OpenClaw 2026.10.9. Depois da instalação, `openclaw plugins inspect pixel-events --runtime --json` deve listar o hook. Confirme também que um handler sem retorno não altera a chamada. Se o nome documentado for outro (por exemplo `tool_call_started`), use esse nome no `api.on`; o tipo emitido continua `"tool_start"`.

- [ ] **Step 5: Rodar os testes.** `node --test test/*.test.mjs` → todos PASS, os 4 antigos e os 3 novos.

- [ ] **Step 6: README.** Na lista de hooks do `README.md`, inclua `tool_start (before_tool_call)`. Acrescente em "Segurança / limites": "Cada evento aceito recebe `seq` (contador global por processo; volta a 0 ao reiniciar). O SSE envia `: ping` a cada 25 s."

- [ ] **Step 7: Commit (no repo do adapter)**

```bash
git add plugin/index.ts receiver/server.mjs test/receiver.test.mjs README.md
git commit -m "feat: tool_start, seq monotônico e keepalive no SSE"
```

---

### Task 3: Domínio, configuração dos agentes e `TradingAgentRegistry`

**Files:**
- Create: `src/trading/domain/AgentStatus.ts`, `src/trading/domain/TradingAgent.ts`, `src/trading/domain/TradingAgentEvent.ts`, `src/trading/domain/TradingAgentSnapshot.ts`
- Create: `src/trading/application/ports.ts`, `src/trading/config/agents.ts`, `src/trading/application/TradingAgentRegistry.ts`
- Create: `tests/fixtures/receiver-agents.json`
- Test: `tests/unit/TradingAgentRegistry.test.ts`

**Interfaces:**
- Produces:
  - `type AgentStatus`, `AGENT_STATUSES`, `ACTIVE_STATUSES: ReadonlySet<AgentStatus>` (`analyzing`, `using_tool`)
  - `interface TradingAgent { agentId; displayName; sessionKey: string|null; status: AgentStatus; lastEvent: string|null; lastSeen: string|null; toolName: string|null; eventCount: number }`
  - `interface TradingAgentEvent { agentId; sessionKey: string|null; eventType: string; timestamp: string; toolName?: string|null; failed?: boolean; seq?: number|null }`
  - `interface TradingAgentSnapshot { agentId; receiverState: string; lastEvent: string|null; lastSeen: string|null; sessionKey: string|null; toolName: string|null; count: number; seq: number|null }`
  - `interface Clock { now(): number }`, `interface Logger { info(m: string): void; warn(m: string): void }`, `systemClock`, `consoleLogger`
  - `interface TradingAgentDefinition { agentId; displayName; role; officeId: number; palette: number; hueShift: number }`, `TRADING_AGENTS`
  - `type AgentPatch = Partial<Omit<TradingAgent, 'agentId' | 'displayName'>>`
  - `class TradingAgentRegistry { constructor(defs?); isKnown(id): boolean; get(id): TradingAgent|undefined; all(): TradingAgent[]; definitions(): readonly TradingAgentDefinition[]; definition(id): TradingAgentDefinition|undefined; update(id, patch): TradingAgent }`

- [ ] **Step 1: Criar o fixture.** É a resposta real validada no spec, completada com os outros seis agentes no formato que `receiver/server.mjs` produz. `tests/fixtures/receiver-agents.json`:

```json
{
  "agents": [
    { "agentId": "trading-coordinator", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 },
    { "agentId": "crypto-btc", "state": "ocioso", "lastEvent": "model_end", "lastSeen": "2026-11-04T01:53:15.504Z", "sessionKey": "agent:crypto-btc:main", "toolName": null, "count": 6 },
    { "agentId": "crypto-eth", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 },
    { "agentId": "forex-eur", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 },
    { "agentId": "forex-gbp", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 },
    { "agentId": "gold-analyst", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 },
    { "agentId": "risk-reviewer", "state": "ocioso", "lastEvent": null, "lastSeen": null, "sessionKey": null, "toolName": null, "count": 0 }
  ]
}
```

O fixture não tem `seq`, porque representa a versão do receptor já em produção. Os parsers precisam tolerar a ausência desse campo.

- [ ] **Step 2: Escrever o teste que falha.** `tests/unit/TradingAgentRegistry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TRADING_AGENTS } from '../../src/trading/config/agents.js';

describe('TradingAgentRegistry', () => {
  it('registra exatamente os sete agentes do spec, na ordem do spec', () => {
    const registry = new TradingAgentRegistry();
    expect(registry.all().map((a) => [a.agentId, a.displayName])).toEqual([
      ['trading-coordinator', 'Coordinator'],
      ['crypto-btc', 'BTC Analyst'],
      ['crypto-eth', 'ETH Analyst'],
      ['forex-eur', 'EUR Analyst'],
      ['forex-gbp', 'GBP Analyst'],
      ['gold-analyst', 'Gold Analyst'],
      ['risk-reviewer', 'Risk Reviewer'],
    ]);
  });

  it('começa desconectado: nada é ativo antes de evidência do receptor', () => {
    const registry = new TradingAgentRegistry();
    for (const agent of registry.all()) {
      expect(agent).toMatchObject({ status: 'disconnected', sessionKey: null, eventCount: 0, toolName: null });
    }
  });

  it('dá a cada agente um officeId fixo e único', () => {
    const ids = TRADING_AGENTS.map((d) => d.officeId);
    expect(ids).toEqual([9001, 9002, 9003, 9004, 9005, 9006, 9007]);
  });

  it('não conhece o agente main', () => {
    const registry = new TradingAgentRegistry();
    expect(registry.isKnown('main')).toBe(false);
    expect(registry.get('main')).toBeUndefined();
  });

  it('get devolve cópia; só update altera o estado', () => {
    const registry = new TradingAgentRegistry();
    registry.get('crypto-btc')!.status = 'analyzing';
    expect(registry.get('crypto-btc')!.status).toBe('disconnected');
    const updated = registry.update('crypto-btc', { status: 'idle', eventCount: 2 });
    expect(updated).toMatchObject({ agentId: 'crypto-btc', displayName: 'BTC Analyst', status: 'idle', eventCount: 2 });
  });

  it('update de agente desconhecido falha', () => {
    expect(() => new TradingAgentRegistry().update('main', { status: 'idle' })).toThrow(/main/);
  });

  it('rejeita definições duplicadas', () => {
    const [first] = TRADING_AGENTS;
    expect(() => new TradingAgentRegistry([first!, { ...first!, officeId: 1 }])).toThrow(/duplicado/);
    expect(() => new TradingAgentRegistry([first!, { ...first!, agentId: 'x' }])).toThrow(/duplicado/);
  });
});
```

- [ ] **Step 3: Rodar e confirmar a falha.** `npx vitest run tests/unit/TradingAgentRegistry.test.ts` → FAIL, porque o módulo ainda não existe.

- [ ] **Step 4: Implementar**

`src/trading/domain/AgentStatus.ts`:

```ts
export const AGENT_STATUSES = [
  'idle',
  'analyzing',
  'using_tool',
  'waiting',
  'completed',
  'error',
  'disconnected',
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** Estados que só existem com evidência de execução real (e que expiram). */
export const ACTIVE_STATUSES: ReadonlySet<AgentStatus> = new Set<AgentStatus>(['analyzing', 'using_tool']);
```

`src/trading/domain/TradingAgent.ts`:

```ts
import type { AgentStatus } from './AgentStatus.js';

export interface TradingAgent {
  agentId: string;
  displayName: string;
  sessionKey: string | null;
  status: AgentStatus;
  lastEvent: string | null;
  lastSeen: string | null;
  toolName: string | null;
  eventCount: number;
}
```

`src/trading/domain/TradingAgentEvent.ts`:

```ts
export interface TradingAgentEvent {
  agentId: string;
  sessionKey: string | null;
  eventType: string;
  timestamp: string;
  toolName?: string | null;
  /** agent_end com success=false (o receptor publica state "erro"). */
  failed?: boolean;
  /** Sequência global do receptor; ausente em versões antigas. */
  seq?: number | null;
}
```

`src/trading/domain/TradingAgentSnapshot.ts`:

```ts
/** Um item de GET /agents (ou do evento SSE "snapshot"), já validado. */
export interface TradingAgentSnapshot {
  agentId: string;
  /** Estado em português publicado pelo receptor: ocioso, analisando, ... */
  receiverState: string;
  lastEvent: string | null;
  lastSeen: string | null;
  sessionKey: string | null;
  toolName: string | null;
  count: number;
  seq: number | null;
}
```

`src/trading/application/ports.ts`:

```ts
export interface Clock {
  now(): number;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const systemClock: Clock = { now: () => Date.now() };

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};
```

`src/trading/config/agents.ts`:

```ts
export interface TradingAgentDefinition {
  agentId: string;
  displayName: string;
  role: string;
  /** Id numérico do personagem no AgentStateStore. Fixo: mantém cadeira e cor entre reinícios. */
  officeId: number;
  /** Paleta do personagem (0-5) e rotação de cor, fixas por agente. */
  palette: number;
  hueShift: number;
}

export const TRADING_AGENTS: readonly TradingAgentDefinition[] = [
  { agentId: 'trading-coordinator', displayName: 'Coordinator', role: 'Orquestração', officeId: 9001, palette: 0, hueShift: 0 },
  { agentId: 'crypto-btc', displayName: 'BTC Analyst', role: 'Criptomoedas', officeId: 9002, palette: 1, hueShift: 0 },
  { agentId: 'crypto-eth', displayName: 'ETH Analyst', role: 'Criptomoedas', officeId: 9003, palette: 2, hueShift: 0 },
  { agentId: 'forex-eur', displayName: 'EUR Analyst', role: 'Forex', officeId: 9004, palette: 3, hueShift: 0 },
  { agentId: 'forex-gbp', displayName: 'GBP Analyst', role: 'Forex', officeId: 9005, palette: 4, hueShift: 0 },
  { agentId: 'gold-analyst', displayName: 'Gold Analyst', role: 'Ouro', officeId: 9006, palette: 5, hueShift: 0 },
  { agentId: 'risk-reviewer', displayName: 'Risk Reviewer', role: 'Gestão de risco', officeId: 9007, palette: 0, hueShift: 180 },
];
```

`src/trading/application/TradingAgentRegistry.ts`:

```ts
import { TRADING_AGENTS, type TradingAgentDefinition } from '../config/agents.js';
import type { TradingAgent } from '../domain/TradingAgent.js';

export type AgentPatch = Partial<Omit<TradingAgent, 'agentId' | 'displayName'>>;

/** Os sete agentes conhecidos, com identidade estável por agentId (nunca por sessionKey). */
export class TradingAgentRegistry {
  private readonly defs = new Map<string, TradingAgentDefinition>();
  private readonly agents = new Map<string, TradingAgent>();

  constructor(definitions: readonly TradingAgentDefinition[] = TRADING_AGENTS) {
    const officeIds = new Set<number>();
    for (const def of definitions) {
      if (this.defs.has(def.agentId)) throw new Error(`Agente duplicado: ${def.agentId}`);
      if (officeIds.has(def.officeId)) throw new Error(`officeId duplicado: ${def.officeId}`);
      officeIds.add(def.officeId);
      this.defs.set(def.agentId, def);
      this.agents.set(def.agentId, {
        agentId: def.agentId,
        displayName: def.displayName,
        sessionKey: null,
        // Até o primeiro snapshot não sabemos nada: desconectado, nunca ativo.
        status: 'disconnected',
        lastEvent: null,
        lastSeen: null,
        toolName: null,
        eventCount: 0,
      });
    }
  }

  isKnown(agentId: string): boolean {
    return this.defs.has(agentId);
  }

  get(agentId: string): TradingAgent | undefined {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent } : undefined;
  }

  all(): TradingAgent[] {
    return [...this.agents.values()].map((agent) => ({ ...agent }));
  }

  definitions(): readonly TradingAgentDefinition[] {
    return [...this.defs.values()];
  }

  definition(agentId: string): TradingAgentDefinition | undefined {
    return this.defs.get(agentId);
  }

  update(agentId: string, patch: AgentPatch): TradingAgent {
    const current = this.agents.get(agentId);
    if (!current) throw new Error(`Agente desconhecido: ${agentId}`);
    const next = { ...current, ...patch };
    this.agents.set(agentId, next);
    return { ...next };
  }
}
```

(As mensagens "Agente duplicado" e "officeId duplicado" casam com `/duplicado/` no teste.)

- [ ] **Step 5: Rodar.** `npx vitest run tests/unit/TradingAgentRegistry.test.ts && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/trading/domain src/trading/application/ports.ts src/trading/config src/trading/application/TradingAgentRegistry.ts tests/fixtures tests/unit/TradingAgentRegistry.test.ts
git commit -m "feat(trading): domínio, sete agentes fixos e TradingAgentRegistry"
```

---

### Task 4: `AgentStateMapper` (Strategy)

**Files:**
- Create: `src/trading/application/AgentStateMapper.ts`
- Test: `tests/unit/AgentStateMapper.test.ts`

**Interfaces:**
- Consumes: `AgentStatus`, `TradingAgentEvent`
- Produces: `class AgentStateMapper { fromEvent(current: AgentStatus, event: TradingAgentEvent): AgentStatus | null; fromReceiverState(state: string): AgentStatus }`. `null` significa tipo de evento desconhecido.

- [ ] **Step 1: Escrever o teste que falha.** `tests/unit/AgentStateMapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { AgentStateMapper } from '../../src/trading/application/AgentStateMapper.js';
import type { AgentStatus } from '../../src/trading/domain/AgentStatus.js';

const mapper = new AgentStateMapper();
const ev = (eventType: string, extra: object = {}) => ({
  agentId: 'crypto-btc',
  sessionKey: 'agent:crypto-btc:main',
  eventType,
  timestamp: '2026-11-07T12:00:00.000Z',
  ...extra,
});

describe('AgentStateMapper.fromEvent', () => {
  it.each<[string, AgentStatus, object, AgentStatus]>([
    ['model_start', 'idle', {}, 'analyzing'],
    ['model_start', 'completed', {}, 'analyzing'],
    ['tool_start', 'analyzing', { toolName: 'web_search' }, 'using_tool'],
    ['tool_end', 'using_tool', {}, 'analyzing'],
    ['agent_end', 'analyzing', {}, 'completed'],
    ['agent_end', 'analyzing', { failed: true }, 'error'],
  ])('%s em %s -> %s', (type, current, extra, expected) => {
    expect(mapper.fromEvent(current, ev(type, extra))).toBe(expected);
  });

  it('model_end NÃO encerra a rodada: a execução segue até agent_end', () => {
    expect(mapper.fromEvent('analyzing', ev('model_end'))).toBe('analyzing');
    // model_end visto após reconexão também é evidência de execução em andamento.
    expect(mapper.fromEvent('idle', ev('model_end'))).toBe('analyzing');
  });

  it('tipo desconhecido devolve null', () => {
    expect(mapper.fromEvent('idle', ev('session_start'))).toBeNull();
  });
});

describe('AgentStateMapper.fromReceiverState', () => {
  it.each<[string, AgentStatus]>([
    ['ocioso', 'idle'],
    ['analisando', 'analyzing'],
    ['aguardando', 'analyzing'],
    ['ferramenta', 'using_tool'],
    ['ferramenta_concluida', 'analyzing'],
    ['erro', 'error'],
    ['qualquer-outro', 'idle'],
  ])('%s -> %s', (state, expected) => {
    expect(mapper.fromReceiverState(state)).toBe(expected);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha.** `npx vitest run tests/unit/AgentStateMapper.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** `src/trading/application/AgentStateMapper.ts`:

```ts
import type { AgentStatus } from '../domain/AgentStatus.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';

/**
 * Regras de transição do spec (seção 4), isoladas do transporte.
 *
 * Ciclo de uma rodada no OpenClaw: model_start → model_end → tool_start → tool_end
 * → model_start → ... → agent_end. Por isso model_end mantém "analyzing": só
 * agent_end encerra a rodada.
 */
export class AgentStateMapper {
  fromEvent(_current: AgentStatus, event: TradingAgentEvent): AgentStatus | null {
    switch (event.eventType) {
      case 'model_start':
      case 'model_end':
      case 'tool_end':
        return 'analyzing';
      case 'tool_start':
        return 'using_tool';
      case 'agent_end':
        return event.failed ? 'error' : 'completed';
      default:
        return null;
    }
  }

  /** Estado publicado pelo receptor em GET /agents; ele já expira para "ocioso" após 2 min sem eventos. */
  fromReceiverState(state: string): AgentStatus {
    switch (state) {
      case 'analisando':
      case 'aguardando':
      case 'ferramenta_concluida':
        return 'analyzing';
      case 'ferramenta':
        return 'using_tool';
      case 'erro':
        return 'error';
      default:
        return 'idle';
    }
  }
}
```

- [ ] **Step 4: Rodar.** `npx vitest run tests/unit/AgentStateMapper.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trading/application/AgentStateMapper.ts tests/unit/AgentStateMapper.test.ts
git commit -m "feat(trading): AgentStateMapper com as regras de transição do spec"
```

---

### Task 5: `TradingEventProcessor` (Observer, deduplicação, ordem, timeouts)

**Files:**
- Create: `src/trading/application/TradingEventProcessor.ts`
- Test: `tests/unit/TradingEventProcessor.test.ts`

**Interfaces:**
- Consumes: `TradingAgentRegistry`, `AgentStateMapper`, `Clock`, `Logger`, `TradingAgentEvent`, `TradingAgentSnapshot`
- Produces:
  - `type AgentChangeListener = (agent: TradingAgent, previous: TradingAgent) => void`
  - `interface TradingEventProcessorOptions { registry; mapper?; clock?; logger?; completedHoldMs?: number /*4000*/; errorHoldMs?: number /*120000*/; staleActiveMs?: number /*180000*/ }`
  - `class TradingEventProcessor { subscribe(l): () => void; applySnapshot(s: TradingAgentSnapshot[]): void; applyEvent(e: TradingAgentEvent): boolean; markDisconnected(): void; tick(): void }`
  - Os listeners só disparam quando `status` ou `toolName` mudam.

- [ ] **Step 1: Escrever o teste que falha.** `tests/unit/TradingEventProcessor.test.ts`:

```ts
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../../src/trading/application/TradingEventProcessor.js';
import type { TradingAgent } from '../../src/trading/domain/TradingAgent.js';
import type { TradingAgentEvent } from '../../src/trading/domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../../src/trading/domain/TradingAgentSnapshot.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/receiver-agents.json', import.meta.url), 'utf8')) as {
  agents: Array<Record<string, unknown>>;
};
const realSnapshot = (): TradingAgentSnapshot[] =>
  fixture.agents.map((a) => ({
    agentId: a.agentId as string,
    receiverState: a.state as string,
    lastEvent: (a.lastEvent as string | null) ?? null,
    lastSeen: (a.lastSeen as string | null) ?? null,
    sessionKey: (a.sessionKey as string | null) ?? null,
    toolName: null,
    count: a.count as number,
    seq: null,
  }));

let now = Date.parse('2026-11-07T12:00:00.000Z');
const clock = { now: () => now };
const warnings: string[] = [];
const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
let registry: TradingAgentRegistry;
let processor: TradingEventProcessor;
let changes: Array<{ agent: TradingAgent; previous: TradingAgent }>;

let seq = 0;
const event = (eventType: string, extra: Partial<TradingAgentEvent> = {}): TradingAgentEvent => ({
  agentId: 'crypto-btc',
  sessionKey: 'agent:crypto-btc:main',
  eventType,
  timestamp: new Date(now).toISOString(),
  seq: ++seq,
  ...extra,
});
const status = (id: string) => registry.get(id)!.status;

beforeEach(() => {
  now = Date.parse('2026-11-07T12:00:00.000Z');
  seq = 0;
  warnings.length = 0;
  registry = new TradingAgentRegistry();
  processor = new TradingEventProcessor({ registry, clock, logger, completedHoldMs: 4000, errorHoldMs: 120_000, staleActiveMs: 180_000 });
  changes = [];
  processor.subscribe((agent, previous) => changes.push({ agent, previous }));
});

describe('snapshot inicial (resposta real do receptor)', () => {
  it('leva os sete agentes a idle, sem nenhum estado ativo', () => {
    processor.applySnapshot(realSnapshot());
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('idle'));
    expect(registry.get('crypto-btc')).toMatchObject({ lastEvent: 'model_end', eventCount: 6, sessionKey: 'agent:crypto-btc:main' });
  });

  it('snapshot com estado ativo e lastSeen recente vira analyzing', () => {
    processor.applySnapshot([{ ...realSnapshot()[1]!, receiverState: 'analisando', lastSeen: new Date(now - 5000).toISOString() }]);
    expect(status('crypto-btc')).toBe('analyzing');
  });
});

describe('eventos de execução', () => {
  beforeEach(() => processor.applySnapshot(realSnapshot()));

  it('rodada completa: analyzing → using_tool → analyzing → completed → idle', () => {
    processor.applyEvent(event('model_start'));
    expect(status('crypto-btc')).toBe('analyzing');
    processor.applyEvent(event('model_end'));
    expect(status('crypto-btc')).toBe('analyzing');
    processor.applyEvent(event('tool_start', { toolName: 'web_search' }));
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'using_tool', toolName: 'web_search' });
    processor.applyEvent(event('tool_end', { toolName: 'web_search' }));
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'analyzing', toolName: null });
    processor.applyEvent(event('agent_end'));
    expect(status('crypto-btc')).toBe('completed');
    now += 3999;
    processor.tick();
    expect(status('crypto-btc')).toBe('completed');
    now += 1;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('não altera os outros agentes', () => {
    processor.applyEvent(event('model_start'));
    for (const agent of registry.all()) {
      if (agent.agentId !== 'crypto-btc') expect(agent.status).toBe('idle');
    }
    expect(changes.map((c) => c.agent.agentId)).toEqual(['crypto-btc']);
  });

  it('model_end não dispara listener (status inalterado)', () => {
    processor.applyEvent(event('model_start'));
    changes.length = 0;
    processor.applyEvent(event('model_end'));
    expect(changes).toEqual([]);
    expect(registry.get('crypto-btc')!.eventCount).toBe(8);
  });

  it('falha real vira error e expira para idle após errorHoldMs', () => {
    processor.applyEvent(event('model_start'));
    processor.applyEvent(event('agent_end', { failed: true }));
    expect(status('crypto-btc')).toBe('error');
    now += 120_000;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('várias sessões do mesmo agente atualizam o mesmo registro', () => {
    processor.applyEvent(event('model_start', { sessionKey: 'agent:crypto-btc:main' }));
    processor.applyEvent(event('tool_start', { sessionKey: 'agent:crypto-btc:cron-7', toolName: 'quote' }));
    expect(registry.all()).toHaveLength(7);
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'using_tool', sessionKey: 'agent:crypto-btc:cron-7' });
  });
});

describe('resiliência', () => {
  beforeEach(() => processor.applySnapshot(realSnapshot()));

  it('evento com seq repetido é ignorado', () => {
    const start = event('model_start');
    expect(processor.applyEvent(start)).toBe(true);
    expect(processor.applyEvent({ ...start })).toBe(false);
    expect(registry.get('crypto-btc')!.eventCount).toBe(7);
    expect(changes).toHaveLength(1);
  });

  it('evento atrasado (seq menor) não regride o estado', () => {
    const start = event('model_start');
    processor.applyEvent(event('agent_end'));
    expect(processor.applyEvent(start)).toBe(false);
    expect(status('crypto-btc')).toBe('completed');
  });

  it('sem seq: duplicado pelo par timestamp+chave e atraso pelo timestamp', () => {
    const t = new Date(now).toISOString();
    expect(processor.applyEvent(event('model_start', { seq: null, timestamp: t }))).toBe(true);
    expect(processor.applyEvent(event('model_start', { seq: null, timestamp: t }))).toBe(false);
    expect(processor.applyEvent(event('tool_start', { seq: null, timestamp: t, toolName: 'x' }))).toBe(true);
    expect(processor.applyEvent(event('agent_end', { seq: null, timestamp: new Date(now - 1000).toISOString() }))).toBe(false);
    expect(status('crypto-btc')).toBe('using_tool');
  });

  it('ignora o agente main e registra o motivo', () => {
    expect(processor.applyEvent(event('model_start', { agentId: 'main' }))).toBe(false);
    expect(warnings.some((w) => w.includes('"main"'))).toBe(true);
    expect(changes).toEqual([]);
  });

  it('ignora tipo de evento desconhecido e registra o motivo', () => {
    expect(processor.applyEvent(event('session_start'))).toBe(false);
    expect(warnings.some((w) => w.includes('session_start'))).toBe(true);
    expect(status('crypto-btc')).toBe('idle');
  });

  it('ignora timestamp inválido', () => {
    expect(processor.applyEvent(event('model_start', { timestamp: 'ontem' }))).toBe(false);
  });

  it('não fica eternamente em analyzing: expira após staleActiveMs sem eventos', () => {
    processor.applyEvent(event('model_start'));
    now += 170_000;
    processor.applyEvent(event('model_end')); // renova a atividade
    now += 179_999;
    processor.tick();
    expect(status('crypto-btc')).toBe('analyzing');
    now += 1;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('evento real depois da expiração reativa o agente', () => {
    processor.applyEvent(event('model_start'));
    now += 180_000;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
    processor.applyEvent(event('tool_end'));
    expect(status('crypto-btc')).toBe('analyzing');
  });

  it('markDisconnected difere de idle e um snapshot novo restaura', () => {
    processor.applyEvent(event('model_start'));
    processor.markDisconnected();
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('disconnected'));
    processor.applySnapshot(realSnapshot());
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('idle'));
  });

  it('receptor reiniciado (seq volta a 0) continua aceitando eventos novos', () => {
    for (let i = 0; i < 50; i++) processor.applyEvent(event('model_end'));
    seq = 0;
    processor.applySnapshot(realSnapshot().map((s) => ({ ...s, seq: 0, lastEvent: null, lastSeen: null, count: 0 })));
    expect(processor.applyEvent(event('model_start'))).toBe(true);
    expect(status('crypto-btc')).toBe('analyzing');
  });

  it('receptor reiniciado sem histórico: não inventa atividade', () => {
    processor.applyEvent(event('model_start'));
    processor.applySnapshot(realSnapshot().map((s) => ({ ...s, lastEvent: null, lastSeen: null, count: 0 })));
    expect(status('crypto-btc')).toBe('idle');
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha.** `npx vitest run tests/unit/TradingEventProcessor.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** `src/trading/application/TradingEventProcessor.ts`:

```ts
import { ACTIVE_STATUSES } from '../domain/AgentStatus.js';
import type { TradingAgent } from '../domain/TradingAgent.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';
import { AgentStateMapper } from './AgentStateMapper.js';
import { type Clock, consoleLogger, type Logger, systemClock } from './ports.js';
import type { AgentPatch, TradingAgentRegistry } from './TradingAgentRegistry.js';

export type AgentChangeListener = (agent: TradingAgent, previous: TradingAgent) => void;

export interface TradingEventProcessorOptions {
  registry: TradingAgentRegistry;
  mapper?: AgentStateMapper;
  clock?: Clock;
  logger?: Logger;
  /** Quanto tempo "completed" fica visível antes de voltar a idle. */
  completedHoldMs?: number;
  /** Quanto tempo "error" fica visível (o receptor também expira após 2 min). */
  errorHoldMs?: number;
  /** Sem eventos por esse tempo, um agente ativo volta a idle. */
  staleActiveMs?: number;
}

interface Tracking {
  lastSeq: number | null;
  lastTs: number | null;
  keysAtLastTs: Set<string>;
  lastActivityAt: number;
  statusSince: number;
}

const eventKey = (e: TradingAgentEvent) => `${e.eventType}|${e.sessionKey ?? ''}|${e.toolName ?? ''}`;

/** Aplica snapshots e eventos do receptor ao registry e notifica quem desenha o escritório. */
export class TradingEventProcessor {
  private readonly registry: TradingAgentRegistry;
  private readonly mapper: AgentStateMapper;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly completedHoldMs: number;
  private readonly errorHoldMs: number;
  private readonly staleActiveMs: number;
  private readonly listeners = new Set<AgentChangeListener>();
  private readonly tracking = new Map<string, Tracking>();

  constructor(options: TradingEventProcessorOptions) {
    this.registry = options.registry;
    this.mapper = options.mapper ?? new AgentStateMapper();
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger ?? consoleLogger;
    this.completedHoldMs = options.completedHoldMs ?? 4000;
    this.errorHoldMs = options.errorHoldMs ?? 120_000;
    this.staleActiveMs = options.staleActiveMs ?? 180_000;
  }

  subscribe(listener: AgentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Estado completo do receptor: redefine a linha de base (inclusive seq, que zera quando ele reinicia). */
  applySnapshot(snapshots: TradingAgentSnapshot[]): void {
    const now = this.clock.now();
    for (const snap of snapshots) {
      if (!this.registry.isKnown(snap.agentId)) {
        this.logger.warn(`[trading] snapshot ignorado: agente desconhecido "${snap.agentId}"`);
        continue;
      }
      const status = this.mapper.fromReceiverState(snap.receiverState);
      const lastTs = snap.lastSeen ? Date.parse(snap.lastSeen) : NaN;
      const track = this.track(snap.agentId);
      track.lastSeq = snap.seq;
      track.lastTs = Number.isNaN(lastTs) ? null : lastTs;
      track.keysAtLastTs = new Set();
      track.lastActivityAt = Number.isNaN(lastTs) ? now : Math.min(lastTs, now);
      this.transition(snap.agentId, {
        status,
        sessionKey: snap.sessionKey,
        lastEvent: snap.lastEvent,
        lastSeen: snap.lastSeen,
        toolName: status === 'using_tool' ? snap.toolName : null,
        eventCount: snap.count,
      });
    }
  }

  applyEvent(event: TradingAgentEvent): boolean {
    if (!this.registry.isKnown(event.agentId)) {
      this.logger.warn(`[trading] evento ignorado: agente desconhecido "${event.agentId}"`);
      return false;
    }
    const ts = Date.parse(event.timestamp);
    if (Number.isNaN(ts)) {
      this.logger.warn(`[trading] evento ignorado: timestamp inválido para ${event.agentId}`);
      return false;
    }
    const track = this.track(event.agentId);
    const seq = event.seq ?? null;
    const key = eventKey(event);
    if (seq !== null && track.lastSeq !== null) {
      if (seq <= track.lastSeq) return false; // duplicado ou atrasado
    } else if (track.lastTs !== null) {
      if (ts < track.lastTs) return false; // atrasado
      if (ts === track.lastTs && track.keysAtLastTs.has(key)) return false; // duplicado
    }

    const agent = this.registry.get(event.agentId)!;
    const status = this.mapper.fromEvent(agent.status, event);
    if (status === null) {
      this.logger.warn(`[trading] evento ignorado: tipo desconhecido "${event.eventType}" (${event.agentId})`);
      return false;
    }

    if (seq !== null) track.lastSeq = seq;
    if (track.lastTs !== ts) track.keysAtLastTs = new Set();
    track.lastTs = ts;
    track.keysAtLastTs.add(key);
    track.lastActivityAt = this.clock.now();

    this.transition(event.agentId, {
      status,
      sessionKey: event.sessionKey,
      lastEvent: event.eventType,
      lastSeen: event.timestamp,
      toolName: status === 'using_tool' ? (event.toolName ?? null) : null,
      eventCount: agent.eventCount + 1,
    });
    return true;
  }

  /** Receptor inacessível além do limite: diferente de idle. */
  markDisconnected(): void {
    for (const agent of this.registry.all()) {
      if (agent.status !== 'disconnected') this.transition(agent.agentId, { status: 'disconnected', toolName: null });
    }
  }

  /** Expirações baseadas em tempo; chamado periodicamente pelo bootstrap. */
  tick(): void {
    const now = this.clock.now();
    for (const agent of this.registry.all()) {
      const track = this.track(agent.agentId);
      if (agent.status === 'completed' && now - track.statusSince >= this.completedHoldMs) {
        this.transition(agent.agentId, { status: 'idle' });
      } else if (agent.status === 'error' && now - track.statusSince >= this.errorHoldMs) {
        this.transition(agent.agentId, { status: 'idle' });
      } else if (ACTIVE_STATUSES.has(agent.status) && now - track.lastActivityAt >= this.staleActiveMs) {
        this.logger.info(`[trading] ${agent.agentId}: sem eventos há ${Math.round((now - track.lastActivityAt) / 1000)}s, voltando a idle`);
        this.transition(agent.agentId, { status: 'idle', toolName: null });
      }
    }
  }

  private track(agentId: string): Tracking {
    let track = this.tracking.get(agentId);
    if (!track) {
      const now = this.clock.now();
      track = { lastSeq: null, lastTs: null, keysAtLastTs: new Set(), lastActivityAt: now, statusSince: now };
      this.tracking.set(agentId, track);
    }
    return track;
  }

  private transition(agentId: string, patch: AgentPatch): void {
    const previous = this.registry.get(agentId)!;
    const next = this.registry.update(agentId, patch);
    if (next.status !== previous.status) this.track(agentId).statusSince = this.clock.now();
    if (next.status === previous.status && next.toolName === previous.toolName) return;
    for (const listener of this.listeners) listener(next, previous);
  }
}
```

- [ ] **Step 4: Rodar.** `npx vitest run tests/unit/TradingEventProcessor.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trading/application/TradingEventProcessor.ts tests/unit/TradingEventProcessor.test.ts
git commit -m "feat(trading): TradingEventProcessor com dedupe, ordem e expirações"
```

---

### Task 6: `SecretProvider` e `ReceiverApiClient` (Adapter)

**Files:**
- Create: `src/trading/infrastructure/SecretProvider.ts`, `src/trading/infrastructure/ReceiverApiClient.ts`
- Test: `tests/unit/SecretProvider.test.ts`, `tests/integration/ReceiverApiClient.test.ts`

**Interfaces:**
- Produces:
  - `readSecretFile(path: string, read?: (p: string) => string): string | null`. Faz trim e devolve `null` se o arquivo não existir ou tiver menos de 24 caracteres.
  - `class ReceiverError extends Error { readonly status?: number }`
  - `parseSnapshotPayload(payload: unknown): TradingAgentSnapshot[]`. Lança `ReceiverError` se faltar `agents`.
  - `parseActivityPayload(payload: unknown): TradingAgentEvent | null`
  - `class ReceiverApiClient { constructor({ baseUrl, token, fetch?, timeoutMs? }); getAgents(): Promise<TradingAgentSnapshot[]>; openEvents(signal: AbortSignal): Promise<Response> }`

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/SecretProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { readSecretFile } from '../../src/trading/infrastructure/SecretProvider.js';

const TOKEN = 'a'.repeat(32);

describe('readSecretFile', () => {
  it('aceita secret com \\n ou \\r\\n final (criado com echo)', () => {
    expect(readSecretFile('/x', () => `${TOKEN}\n`)).toBe(TOKEN);
    expect(readSecretFile('/x', () => `${TOKEN}\r\n`)).toBe(TOKEN);
  });
  it('arquivo ausente devolve null', () => {
    expect(
      readSecretFile('/x', () => {
        throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      }),
    ).toBeNull();
  });
  it('token curto devolve null', () => {
    expect(readSecretFile('/x', () => 'curto')).toBeNull();
  });
});
```

`tests/integration/ReceiverApiClient.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseActivityPayload,
  ReceiverApiClient,
  ReceiverError,
} from '../../src/trading/infrastructure/ReceiverApiClient.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const fixture = readFileSync(new URL('../fixtures/receiver-agents.json', import.meta.url), 'utf8');
let server: http.Server | undefined;

async function serve(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

describe('ReceiverApiClient.getAgents', () => {
  it('lê a resposta real do receptor com Bearer token', async () => {
    let auth: string | undefined;
    const baseUrl = await serve((req, res) => {
      auth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' }).end(fixture);
    });
    const agents = await new ReceiverApiClient({ baseUrl: `${baseUrl}/`, token: TOKEN }).getAgents();
    expect(auth).toBe(`Bearer ${TOKEN}`);
    expect(agents).toHaveLength(7);
    expect(agents[1]).toEqual({
      agentId: 'crypto-btc',
      receiverState: 'ocioso',
      lastEvent: 'model_end',
      lastSeen: '2026-11-04T01:53:15.504Z',
      sessionKey: 'agent:crypto-btc:main',
      toolName: null,
      count: 6,
      seq: null,
    });
  });

  it('401 vira ReceiverError sem vazar o token', async () => {
    const baseUrl = await serve((_req, res) => res.writeHead(401).end('{"error":"unauthorized"}'));
    const error = await new ReceiverApiClient({ baseUrl, token: TOKEN }).getAgents().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReceiverError);
    expect((error as ReceiverError).status).toBe(401);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it('payload sem "agents" vira ReceiverError', async () => {
    const baseUrl = await serve((_req, res) => res.writeHead(200).end('{"ok":true}'));
    await expect(new ReceiverApiClient({ baseUrl, token: TOKEN }).getAgents()).rejects.toBeInstanceOf(ReceiverError);
  });

  it('timeout vira erro (não trava o boot)', async () => {
    const baseUrl = await serve(() => {
      /* nunca responde */
    });
    await expect(new ReceiverApiClient({ baseUrl, token: TOKEN, timeoutMs: 50 }).getAgents()).rejects.toThrow();
  });
});

describe('parseActivityPayload', () => {
  it('mantém só os campos da lista branca (nada de prompts ou resultados)', () => {
    const parsed = parseActivityPayload({
      agentId: 'crypto-btc',
      state: 'ferramenta',
      type: 'tool_start',
      sessionKey: 'agent:crypto-btc:main',
      toolName: 'web_search',
      timestamp: '2026-11-07T12:00:00.000Z',
      receivedAt: 1,
      seq: 9,
      prompt: 'SEGREDO',
      result: { price: 1 },
    });
    expect(parsed).toEqual({
      agentId: 'crypto-btc',
      eventType: 'tool_start',
      timestamp: '2026-11-07T12:00:00.000Z',
      sessionKey: 'agent:crypto-btc:main',
      toolName: 'web_search',
      failed: false,
      seq: 9,
    });
  });
  it('state "erro" vira failed=true', () => {
    expect(parseActivityPayload({ agentId: 'a', type: 'agent_end', state: 'erro', timestamp: 't' })?.failed).toBe(true);
  });
  it('payload incompleto devolve null', () => {
    expect(parseActivityPayload({ agentId: 'a' })).toBeNull();
    expect(parseActivityPayload(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha.** `npx vitest run tests/unit/SecretProvider.test.ts tests/integration/ReceiverApiClient.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/trading/infrastructure/SecretProvider.ts`:

```ts
import { readFileSync } from 'node:fs';

const MIN_TOKEN_LENGTH = 24;

/** Lê um Docker secret. Nunca registra o conteúdo; devolve null se ausente ou inválido. */
export function readSecretFile(
  path: string,
  read: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): string | null {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return null;
  }
  const token = raw.trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}
```

`src/trading/infrastructure/ReceiverApiClient.ts`:

```ts
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';

export class ReceiverError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ReceiverError';
  }
}

export interface ReceiverApiClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const str = (value: unknown, max: number): string | null => (typeof value === 'string' ? value.slice(0, max) : null);
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** Converte GET /agents (ou o evento SSE "snapshot") copiando só campos conhecidos. */
export function parseSnapshotPayload(payload: unknown): TradingAgentSnapshot[] {
  const agents = (payload as { agents?: unknown } | null)?.agents;
  if (!Array.isArray(agents)) throw new ReceiverError('Resposta do receptor sem a lista "agents"');
  return agents.flatMap((raw): TradingAgentSnapshot[] => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const agentId = str(r.agentId, 80);
    const receiverState = str(r.state, 40);
    if (!agentId || !receiverState) return [];
    return [
      {
        agentId,
        receiverState,
        lastEvent: str(r.lastEvent, 40),
        lastSeen: str(r.lastSeen, 40),
        sessionKey: str(r.sessionKey, 160),
        toolName: str(r.toolName, 80),
        count: count(r.count) ?? 0,
        seq: count(r.seq),
      },
    ];
  });
}

/** Converte um evento SSE "activity" copiando só campos conhecidos. */
export function parseActivityPayload(payload: unknown): TradingAgentEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  const agentId = str(r.agentId, 80);
  const eventType = str(r.type, 40);
  const timestamp = str(r.timestamp, 40);
  if (!agentId || !eventType || !timestamp) return null;
  return {
    agentId,
    eventType,
    timestamp,
    sessionKey: str(r.sessionKey, 160),
    toolName: str(r.toolName, 80),
    failed: r.state === 'erro',
    seq: count(r.seq),
  };
}

/** Adapter do contrato HTTP do openclaw-pixel-adapter (receiver/server.mjs). Só roda no backend. */
export class ReceiverApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ReceiverApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async getAgents(): Promise<TradingAgentSnapshot[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/agents`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new ReceiverError(`GET /agents respondeu ${res.status}`, res.status);
    return parseSnapshotPayload(await res.json());
  }

  openEvents(signal: AbortSignal): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}/events`, {
      headers: { authorization: `Bearer ${this.token}`, accept: 'text/event-stream' },
      signal,
    });
  }
}
```

- [ ] **Step 4: Rodar.** `npx vitest run tests/unit/SecretProvider.test.ts tests/integration/ReceiverApiClient.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trading/infrastructure/SecretProvider.ts src/trading/infrastructure/ReceiverApiClient.ts tests/unit/SecretProvider.test.ts tests/integration/ReceiverApiClient.test.ts
git commit -m "feat(trading): ReceiverApiClient e leitura do secret do receptor"
```

---

### Task 7: `ReceiverEventStream` (SSE com reconexão) e receptor fake de teste

**Files:**
- Create: `src/trading/infrastructure/ReceiverEventStream.ts`
- Create: `tests/support/fakeReceiver.ts`, `tests/support/waitFor.ts`
- Test: `tests/unit/SseParser.test.ts`, `tests/integration/ReceiverEventStream.test.ts`

**Interfaces:**
- Consumes: `ReceiverApiClient.openEvents`, `parseSnapshotPayload`, `parseActivityPayload`, `Logger`
- Produces:
  - `class SseParser { push(chunk: string): SseMessage[] }`, `interface SseMessage { event: string; data: string }`
  - `interface ReceiverEventHandlers { onSnapshot(s: TradingAgentSnapshot[]): void; onEvent(e: TradingAgentEvent): void; onConnectionLost(reason: string): void }`
  - `class ReceiverEventStream { constructor({ client, handlers, logger?, initialBackoffMs? /*1000*/, maxBackoffMs? /*30000*/, idleTimeoutMs? /*75000*/ }); start(): void; stop(): Promise<void> }`
  - Para testes: `startFakeReceiver({ token }): Promise<FakeReceiver>` e `waitFor(predicate, timeoutMs?)`

- [ ] **Step 1: Criar os utilitários de teste**

`tests/support/waitFor.ts`:

```ts
export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condição não atingida no prazo');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
```

`tests/support/fakeReceiver.ts`:

```ts
// SOMENTE PARA TESTES. Reproduz o contrato HTTP/SSE de openclaw-pixel-adapter/receiver/server.mjs
// para exercitar o cliente sem Docker. Nunca é empacotado nem usado em produção.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { TRADING_AGENTS } from '../../src/trading/config/agents.js';

const STATES: Record<string, string> = {
  model_start: 'analisando',
  model_end: 'aguardando',
  tool_start: 'ferramenta',
  tool_end: 'ferramenta_concluida',
  agent_end: 'ocioso',
};

export interface FakeReceiver {
  url: string;
  emit(event: { agentId: string; type: string; toolName?: string | null; sessionKey?: string; failed?: boolean }): void;
  dropClients(): void;
  readonly clientCount: number;
  close(): Promise<void>;
}

export async function startFakeReceiver({ token }: { token: string }): Promise<FakeReceiver> {
  const agents = TRADING_AGENTS.map((d) => ({
    agentId: d.agentId,
    state: 'ocioso',
    lastEvent: null,
    lastSeen: null,
    sessionKey: null,
    toolName: null,
    count: 0,
    seq: 0,
  }));
  const clients = new Set<http.ServerResponse>();
  let seq = 0;
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end('{"error":"unauthorized"}');
      return;
    }
    if (req.url === '/agents') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ agents }));
      return;
    }
    if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ agents })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const dropClients = () => {
    for (const client of clients) client.destroy();
    clients.clear();
  };

  return {
    url,
    emit({ agentId, type, toolName = null, sessionKey = `agent:${agentId}:main`, failed = false }) {
      const record = {
        agentId,
        state: type === 'agent_end' && failed ? 'erro' : STATES[type],
        type,
        sessionKey,
        toolName,
        timestamp: new Date().toISOString(),
        receivedAt: Date.now(),
        seq: ++seq,
      };
      const agent = agents.find((a) => a.agentId === agentId);
      if (agent) Object.assign(agent, { state: record.state, lastEvent: type, lastSeen: record.timestamp, sessionKey, toolName, count: agent.count + 1, seq });
      for (const client of clients) client.write(`event: activity\ndata: ${JSON.stringify(record)}\n\n`);
    },
    dropClients,
    get clientCount() {
      return clients.size;
    },
    close: async () => {
      dropClients();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/unit/SseParser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { SseParser } from '../../src/trading/infrastructure/ReceiverEventStream.js';

describe('SseParser', () => {
  it('monta mensagens divididas entre chunks e aceita CRLF', () => {
    const parser = new SseParser();
    expect(parser.push('event: snap')).toEqual([]);
    expect(parser.push('shot\r\ndata: {"a"')).toEqual([]);
    expect(parser.push(':1}\r\n\r\nevent: activity\ndata: x\n\n')).toEqual([
      { event: 'snapshot', data: '{"a":1}' },
      { event: 'activity', data: 'x' },
    ]);
  });
  it('ignora comentários de keepalive e junta várias linhas data', () => {
    const parser = new SseParser();
    expect(parser.push(': ping\n\ndata: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});
```

`tests/integration/ReceiverEventStream.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import type { TradingAgentEvent } from '../../src/trading/domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../../src/trading/domain/TradingAgentSnapshot.js';
import { ReceiverApiClient } from '../../src/trading/infrastructure/ReceiverApiClient.js';
import { ReceiverEventStream } from '../../src/trading/infrastructure/ReceiverEventStream.js';
import { type FakeReceiver, startFakeReceiver } from '../support/fakeReceiver.js';
import { waitFor } from '../support/waitFor.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const quiet = { info: () => {}, warn: () => {} };
let fake: FakeReceiver | undefined;
let stream: ReceiverEventStream | undefined;

afterEach(async () => {
  await stream?.stop();
  await fake?.close();
  stream = fake = undefined;
});

function collect() {
  const snapshots: TradingAgentSnapshot[][] = [];
  const events: TradingAgentEvent[] = [];
  const lost: string[] = [];
  return {
    snapshots,
    events,
    lost,
    handlers: {
      onSnapshot: (s: TradingAgentSnapshot[]) => snapshots.push(s),
      onEvent: (e: TradingAgentEvent) => events.push(e),
      onConnectionLost: (r: string) => lost.push(r),
    },
  };
}

describe('ReceiverEventStream', () => {
  it('recebe snapshot e depois eventos de atividade', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet });
    stream.start();
    await waitFor(() => c.snapshots.length === 1 && fake!.clientCount === 1);
    expect(c.snapshots[0]).toHaveLength(7);
    fake.emit({ agentId: 'crypto-btc', type: 'tool_start', toolName: 'web_search' });
    await waitFor(() => c.events.length === 1);
    expect(c.events[0]).toMatchObject({ agentId: 'crypto-btc', eventType: 'tool_start', toolName: 'web_search', seq: 1 });
  });

  it('reconecta após queda e recebe um snapshot novo', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.snapshots.length === 1);
    fake.dropClients();
    await waitFor(() => c.lost.length === 1 && c.snapshots.length === 2);
  });

  it('token errado: relata a perda e continua tentando', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: 'x'.repeat(30) }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.lost.length >= 2);
    expect(c.lost[0]).toContain('401');
    expect(c.lost.join(' ')).not.toContain('x'.repeat(30));
  });

  it('conexão silenciosa além de idleTimeoutMs é reaberta', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10, idleTimeoutMs: 100 });
    stream.start();
    await waitFor(() => c.snapshots.length >= 2);
    expect(c.lost[0]).toMatch(/sem dados/);
  });

  it('stop encerra sem novas tentativas', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.snapshots.length === 1);
    await stream.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(c.lost).toEqual([]);
    expect(fake.clientCount).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar a falha.** `npx vitest run tests/unit/SseParser.test.ts tests/integration/ReceiverEventStream.test.ts` → FAIL.

- [ ] **Step 4: Implementar.** `src/trading/infrastructure/ReceiverEventStream.ts`:

```ts
import { consoleLogger, type Logger } from '../application/ports.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';
import { parseActivityPayload, parseSnapshotPayload, type ReceiverApiClient } from './ReceiverApiClient.js';

export interface SseMessage {
  event: string;
  data: string;
}

/** Parser incremental de text/event-stream (só os campos event e data; comentários ignorados). */
export class SseParser {
  private buffer = '';
  private event = 'message';
  private data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        if (this.data.length > 0) out.push({ event: this.event, data: this.data.join('\n') });
        this.event = 'message';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') this.event = value;
      else if (field === 'data') this.data.push(value);
    }
    return out;
  }
}

export interface ReceiverEventHandlers {
  onSnapshot(snapshots: TradingAgentSnapshot[]): void;
  onEvent(event: TradingAgentEvent): void;
  onConnectionLost(reason: string): void;
}

export interface ReceiverEventStreamOptions {
  client: Pick<ReceiverApiClient, 'openEvents'>;
  handlers: ReceiverEventHandlers;
  logger?: Logger;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Sem nenhum byte (nem o ": ping" do receptor) por esse tempo, a conexão é tratada como morta. */
  idleTimeoutMs?: number;
}

const IDLE_ABORT = 'idle-timeout';

/** Consome GET /events (SSE) do receptor e reconecta com backoff exponencial. */
export class ReceiverEventStream {
  private readonly logger: Logger;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly idleTimeoutMs: number;
  private stopped = true;
  private controller: AbortController | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private wake: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(private readonly options: ReceiverEventStreamOptions) {
    this.logger = options.logger ?? consoleLogger;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 75_000;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.controller?.abort();
    this.wake?.();
    await this.loop;
    this.loop = null;
  }

  private async run(): Promise<void> {
    let backoff = this.initialBackoffMs;
    while (!this.stopped) {
      const reason = await this.connectOnce(() => {
        backoff = this.initialBackoffMs;
      });
      if (this.stopped) break;
      this.options.handlers.onConnectionLost(reason);
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, this.maxBackoffMs);
    }
  }

  private async connectOnce(onHealthy: () => void): Promise<string> {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await this.options.client.openEvents(controller.signal);
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        return `GET /events respondeu ${res.status}`;
      }
      const parser = new SseParser();
      const decoder = new TextDecoder();
      this.armIdle(controller);
      for await (const chunk of res.body) {
        this.armIdle(controller);
        for (const message of parser.push(decoder.decode(chunk, { stream: true }))) this.dispatch(message, onHealthy);
      }
      return 'stream encerrado pelo receptor';
    } catch (err) {
      if (controller.signal.reason === IDLE_ABORT) return `sem dados há ${this.idleTimeoutMs}ms`;
      return err instanceof Error ? err.message : String(err);
    } finally {
      this.clearIdle();
      this.controller = null;
    }
  }

  private dispatch(message: SseMessage, onHealthy: () => void): void {
    try {
      if (message.event === 'snapshot') {
        this.options.handlers.onSnapshot(parseSnapshotPayload(JSON.parse(message.data)));
        onHealthy();
      } else if (message.event === 'activity') {
        const event = parseActivityPayload(JSON.parse(message.data));
        if (event) this.options.handlers.onEvent(event);
        else this.logger.warn('[trading] evento "activity" inválido ignorado');
      }
    } catch (err) {
      this.logger.warn(`[trading] mensagem SSE "${message.event}" ignorada: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private armIdle(controller: AbortController): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => controller.abort(IDLE_ABORT), this.idleTimeoutMs);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }
}
```

Se o TypeScript reclamar do tipo de `chunk` no `for await` (a versão de `@types/node` pode tipar como `any`), use `decoder.decode(chunk as Uint8Array, { stream: true })`.

- [ ] **Step 5: Rodar.** `npx vitest run tests/unit/SseParser.test.ts tests/integration/ReceiverEventStream.test.ts && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/trading/infrastructure/ReceiverEventStream.ts tests/support tests/unit/SseParser.test.ts tests/integration/ReceiverEventStream.test.ts
git commit -m "feat(trading): cliente SSE do receptor com reconexão e keepalive"
```

---

### Task 8: Ponto de extensão no vendor — `activityReplayers`

O upstream reenvia a atividade num cliente que se reconecta (`resendAgentActivity`). Esse reenvio usa `agentToolStart`, que no webview **ativa** a animação. Sem um gancho nosso, um agente em `error` ou `disconnected` voltaria a "digitar" a cada recarga da página. O ponto de extensão é genérico e não sabe nada sobre trading.

**Files:**
- Create: `vendor/pixel-agents/server/src/activityReplayers.ts`
- Modify: `vendor/pixel-agents/server/src/clientMessageHandler.ts` (import + 1 chamada após `resendAgentActivity(send, store);`)
- Test: `vendor/pixel-agents/server/__tests__/activityReplayers.test.ts`

**Interfaces:**
- Produces: `type ReplaySend = (message: Record<string, unknown>) => void`, `addActivityReplayer(replay: (send: ReplaySend) => void): () => void`, `replayExtraActivity(send: ReplaySend): void`

- [ ] **Step 1: Instalar as dependências do vendor.** `cd vendor/pixel-agents && npm ci --ignore-scripts`. É grande, mas necessário para rodar os testes do upstream.

- [ ] **Step 2: Escrever o teste que falha.** `vendor/pixel-agents/server/__tests__/activityReplayers.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { addActivityReplayer, replayExtraActivity } from '../src/activityReplayers.js';

describe('activityReplayers', () => {
  it('runs registered replayers with the client send function until removed', () => {
    const sent: unknown[] = [];
    const remove = addActivityReplayer((send) => send({ type: 'agentStatus', id: 1, status: 'idle' }));
    replayExtraActivity((m) => sent.push(m));
    expect(sent).toEqual([{ type: 'agentStatus', id: 1, status: 'idle' }]);
    remove();
    sent.length = 0;
    replayExtraActivity((m) => sent.push(m));
    expect(sent).toEqual([]);
  });

  it('a failing replayer does not break the handshake or the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: unknown[] = [];
    const removeA = addActivityReplayer(() => {
      throw new Error('boom');
    });
    const removeB = addActivityReplayer((send) => send({ ok: true }));
    expect(() => replayExtraActivity((m) => sent.push(m))).not.toThrow();
    expect(sent).toEqual([{ ok: true }]);
    removeA();
    removeB();
    error.mockRestore();
  });
});
```

- [ ] **Step 3: Rodar e confirmar a falha.** `cd vendor/pixel-agents/server && npx vitest run __tests__/activityReplayers.test.ts` → FAIL.

- [ ] **Step 4: Implementar.** `vendor/pixel-agents/server/src/activityReplayers.ts`:

```ts
/**
 * pixel-agents-trading patch: extension point for state that is not derived
 * from Claude transcripts. Each replayer runs on the webviewReady handshake
 * right after resendAgentActivity, so it can correct or extend what a
 * reconnecting client was just sent.
 */
export type ReplaySend = (message: Record<string, unknown>) => void;

const replayers = new Set<(send: ReplaySend) => void>();

export function addActivityReplayer(replay: (send: ReplaySend) => void): () => void {
  replayers.add(replay);
  return () => {
    replayers.delete(replay);
  };
}

export function replayExtraActivity(send: ReplaySend): void {
  for (const replay of replayers) {
    try {
      replay(send);
    } catch (err) {
      console.error('[Pixel Agents] activity replayer failed:', err);
    }
  }
}
```

Em `vendor/pixel-agents/server/src/clientMessageHandler.ts`, acrescente o import logo **antes** de `import { resendAgentActivity } from './agentActivityResend.js';`:

```ts
import { replayExtraActivity } from './activityReplayers.js';
```

Troque a linha `  resendAgentActivity(send, store);` (passo 8 do handshake) por:

```ts
  resendAgentActivity(send, store);
  // pixel-agents-trading patch: providers outside the transcript pipeline replay their own state.
  replayExtraActivity(send);
```

- [ ] **Step 5: Rodar o teste novo e a suíte do servidor upstream**

```bash
cd vendor/pixel-agents && npm run test:server
```

Esperado: todos PASS, incluindo `clientMessageHandler.test.ts` sem regressão.

- [ ] **Step 6: Commit**

```bash
git add vendor/pixel-agents/server/src/activityReplayers.ts vendor/pixel-agents/server/src/clientMessageHandler.ts vendor/pixel-agents/server/__tests__/activityReplayers.test.ts
git commit -m "vendor(pixel-agents): ponto de extensão activityReplayers no handshake"
```

---

### Task 9: `OpenClawProvider` — personagens nativos

**Files:**
- Create: `src/trading/providers/OpenClawProvider.ts`
- Test: `tests/integration/OpenClawProvider.test.ts`

**Interfaces:**
- Consumes: `TradingAgentRegistry` (`definitions()`, `definition()`, `get()`, `all()`), `TradingEventProcessor.subscribe`, `createAgentState` (vendor), `AgentStateStore` (vendor), `addActivityReplayer` (Task 8)
- Produces:
  - `type OfficeStore = Pick<AgentStateStore, 'has' | 'get' | 'set' | 'broadcast' | 'persist' | 'on' | 'off'>`
  - `type AddReplayer = (replay: (send: ReplaySend) => void) => () => void`
  - `OPENCLAW_PROVIDER_ID = 'openclaw'`, `ACTIVITY_TOOL_ID = 'openclaw-activity'`
  - `activityLabel(agent: TradingAgent): string | null`
  - `class OpenClawProvider { constructor({ store, registry, processor, addReplayer, markerDir, logger? }); start(): void; stop(): void }`

- [ ] **Step 1: Escrever o teste que falha.** `tests/integration/OpenClawProvider.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../../src/trading/application/TradingEventProcessor.js';
import { OpenClawProvider } from '../../src/trading/providers/OpenClawProvider.js';
import { addActivityReplayer, replayExtraActivity } from '../../vendor/pixel-agents/server/src/activityReplayers.js';
import { resendAgentActivity } from '../../vendor/pixel-agents/server/src/agentActivityResend.js';
import { createAgentState } from '../../vendor/pixel-agents/server/src/agentState.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';

const quiet = { info: () => {}, warn: () => {} };
let dir: string;
let store: AgentStateStore;
let registry: TradingAgentRegistry;
let processor: TradingEventProcessor;
let provider: OpenClawProvider;
let broadcasts: Array<Record<string, unknown>>;
let seq = 0;

const snapshotIdle = () =>
  registry.definitions().map((d) => ({ agentId: d.agentId, receiverState: 'ocioso', lastEvent: null, lastSeen: null, sessionKey: null, toolName: null, count: 0, seq: 0 }));
const emit = (agentId: string, eventType: string, extra: object = {}) =>
  processor.applyEvent({ agentId, eventType, sessionKey: `agent:${agentId}:main`, timestamp: new Date().toISOString(), seq: ++seq, ...extra });
function handshake(): Array<Record<string, unknown>> {
  const sent: Array<Record<string, unknown>> = [];
  const send = (m: Record<string, unknown>) => sent.push(m);
  resendAgentActivity(send, store);
  replayExtraActivity(send);
  return sent;
}
const forId = (id: number, list = broadcasts) => list.filter((m) => m.id === id).map((m) => `${m.type}:${m.status ?? ''}`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openclaw-provider-'));
  store = new AgentStateStore();
  registry = new TradingAgentRegistry();
  processor = new TradingEventProcessor({ registry, logger: quiet });
  provider = new OpenClawProvider({ store, registry, processor, addReplayer: addActivityReplayer, markerDir: dir, logger: quiet });
  broadcasts = [];
  store.on('broadcast', (m) => broadcasts.push(m));
  seq = 0;
});
afterEach(() => {
  provider.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('OpenClawProvider', () => {
  it('registra os sete personagens com identidade fixa e legível', () => {
    provider.start();
    expect(store.size).toBe(7);
    const btc = store.get(9002)!;
    expect(btc).toMatchObject({
      sessionId: 'openclaw:crypto-btc',
      providerId: 'openclaw',
      isExternal: true,
      hooksOnly: true,
      directoryName: 'crypto-btc',
      agentName: 'BTC Analyst',
      palette: 1,
    });
    expect(existsSync(btc.jsonlFile)).toBe(true); // impede a limpeza de agentes externos "stale"
  });

  it('start duas vezes não duplica personagens', () => {
    provider.start();
    provider.start();
    expect(store.size).toBe(7);
  });

  it('falha alto se outro agente já ocupa um id reservado', () => {
    store.set(9001, createAgentState({ id: 9001, sessionId: 'x', projectDir: 'p', jsonlFile: 'f', isExternal: true, providerId: 'claude' }));
    expect(() => provider.start()).toThrow(/9001/);
  });

  it('antes de qualquer snapshot todos mostram "Sem conexão" sem animação', () => {
    provider.start();
    const sent = handshake();
    expect(forId(9002, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Sem conexão com o receptor', 'agentStatus:idle']);
  });

  it('análise real: anima, mostra a ferramenta e conclui', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    broadcasts.length = 0;
    emit('crypto-btc', 'model_start');
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentToolStart:Analisando', 'agentStatus:active']);
    broadcasts.length = 0;
    emit('crypto-btc', 'tool_start', { toolName: 'web_search' });
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentToolStart:Ferramenta: web_search', 'agentStatus:active']);
    broadcasts.length = 0;
    emit('crypto-btc', 'agent_end');
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentStatus:waiting']);
    expect(broadcasts.filter((m) => m.id !== 9002)).toEqual([]);
  });

  it('recarregar o navegador reproduz o estado ativo sem duplicar', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    emit('crypto-eth', 'tool_start', { toolName: 'quote' });
    const sent = handshake();
    expect(forId(9003, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Ferramenta: quote']);
    expect(store.size).toBe(7);
  });

  it('recarregar durante error mantém o personagem parado (replayer)', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    emit('gold-analyst', 'model_start');
    emit('gold-analyst', 'agent_end', { failed: true });
    const sent = handshake();
    expect(forId(9006, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Erro na execução', 'agentStatus:idle']);
  });

  it('agentes idle não recebem atividade no handshake', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    expect(forId(9001, handshake())).toEqual(['agentTeamInfo:']);
  });

  it('personagem fechado pela UI reaparece com o mesmo id e nome', async () => {
    provider.start();
    store.delete(9004);
    await new Promise((resolve) => setImmediate(resolve));
    expect(store.get(9004)).toMatchObject({ agentName: 'EUR Analyst', directoryName: 'forex-eur' });
    expect(broadcasts).toContainEqual({ type: 'agentTeamInfo', id: 9004, agentName: 'EUR Analyst' });
  });

  it('depois de stop, não reage mais', () => {
    provider.start();
    provider.stop();
    broadcasts.length = 0;
    emit('crypto-btc', 'model_start');
    expect(broadcasts).toEqual([]);
    expect(handshake().filter((m) => m.type === 'agentStatus')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha.** `npx vitest run tests/integration/OpenClawProvider.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** `src/trading/providers/OpenClawProvider.ts`:

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReplaySend } from '../../../vendor/pixel-agents/server/src/activityReplayers.js';
import { createAgentState } from '../../../vendor/pixel-agents/server/src/agentState.js';
import type { AgentStateStore } from '../../../vendor/pixel-agents/server/src/agentStateStore.js';
import type { AgentState } from '../../../vendor/pixel-agents/server/src/types.js';
import { consoleLogger, type Logger } from '../application/ports.js';
import type { TradingAgentRegistry } from '../application/TradingAgentRegistry.js';
import type { TradingEventProcessor } from '../application/TradingEventProcessor.js';
import type { TradingAgentDefinition } from '../config/agents.js';
import type { AgentStatus } from '../domain/AgentStatus.js';
import type { TradingAgent } from '../domain/TradingAgent.js';

export type OfficeStore = Pick<AgentStateStore, 'has' | 'get' | 'set' | 'broadcast' | 'persist' | 'on' | 'off'>;
export type AddReplayer = (replay: (send: ReplaySend) => void) => () => void;

export const OPENCLAW_PROVIDER_ID = 'openclaw';
/** Uma única "ferramenta" sintética por agente carrega o rótulo da atividade. */
export const ACTIVITY_TOOL_ID = 'openclaw-activity';
const ANALYSIS_TOOL_NAME = 'OpenClawAnalysis';
const PROJECT_DIR = 'openclaw-trading';
/** Estados com rótulo mas sem animação. */
const LABELED_INACTIVE: ReadonlySet<AgentStatus> = new Set<AgentStatus>(['waiting', 'error', 'disconnected']);

export function activityLabel(agent: TradingAgent): string | null {
  switch (agent.status) {
    case 'analyzing':
      return 'Analisando';
    case 'using_tool':
      return agent.toolName ? `Ferramenta: ${agent.toolName}` : 'Usando ferramenta';
    case 'waiting':
      return 'Aguardando dependência';
    case 'error':
      return 'Erro na execução';
    case 'disconnected':
      return 'Sem conexão com o receptor';
    default:
      return null;
  }
}

export interface OpenClawProviderOptions {
  store: OfficeStore;
  registry: TradingAgentRegistry;
  processor: TradingEventProcessor;
  addReplayer: AddReplayer;
  /** Diretório dos arquivos-marcador (um .jsonl vazio por agente). */
  markerDir: string;
  logger?: Logger;
}

/**
 * Projeta os sete agentes do OpenClaw como personagens nativos do Pixel Agents:
 * AgentState no store (persistido, reenviado a cada webviewReady) e as mesmas
 * mensagens WebSocket que o provider Claude usa. Não há caminho de volta ao OpenClaw.
 */
export class OpenClawProvider {
  private readonly logger: Logger;
  private unsubscribe: (() => void) | null = null;
  private removeReplayer: (() => void) | null = null;

  constructor(private readonly options: OpenClawProviderOptions) {
    this.logger = options.logger ?? consoleLogger;
  }

  start(): void {
    if (this.unsubscribe) return;
    for (const def of this.options.registry.definitions()) this.ensureAgent(def);
    this.options.store.persist();
    this.unsubscribe = this.options.processor.subscribe((agent) => this.render(agent));
    this.removeReplayer = this.options.addReplayer((send) => this.replay(send));
    this.options.store.on('agentRemoved', this.onAgentRemoved);
    for (const agent of this.options.registry.all()) this.render(agent);
  }

  stop(): void {
    this.unsubscribe?.();
    this.removeReplayer?.();
    this.options.store.off('agentRemoved', this.onAgentRemoved);
    this.unsubscribe = null;
    this.removeReplayer = null;
  }

  private ensureAgent(def: TradingAgentDefinition): void {
    const { store, markerDir } = this.options;
    const existing = store.get(def.officeId);
    if (existing) {
      if (existing.providerId !== OPENCLAW_PROVIDER_ID) {
        throw new Error(`[trading] id ${def.officeId} reservado para ${def.agentId} já está em uso por outro agente`);
      }
      return;
    }
    // Agentes externos sem arquivo de transcript são removidos pela checagem "stale"
    // do upstream; um marcador vazio mantém o personagem vivo. Nada é escrito nele.
    mkdirSync(markerDir, { recursive: true });
    const marker = join(markerDir, `${def.agentId}.jsonl`);
    if (!existsSync(marker)) writeFileSync(marker, '');
    store.set(
      def.officeId,
      createAgentState({
        id: def.officeId,
        sessionId: `${OPENCLAW_PROVIDER_ID}:${def.agentId}`,
        isExternal: true,
        hooksOnly: true,
        providerId: OPENCLAW_PROVIDER_ID,
        projectDir: PROJECT_DIR,
        jsonlFile: marker,
        directoryName: def.agentId,
        agentName: def.displayName,
        palette: def.palette,
        hueShift: def.hueShift,
      }),
    );
  }

  private render(agent: TradingAgent): void {
    const def = this.options.registry.definition(agent.agentId);
    const state = def ? this.options.store.get(def.officeId) : undefined;
    if (!def || !state) return;
    const { store } = this.options;
    const id = def.officeId;
    const label = activityLabel(agent);

    clearTools(state);
    state.isWaiting = false;
    store.broadcast({ type: 'agentToolsClear', id });

    if (label) {
      const toolName = agent.status === 'using_tool' ? (agent.toolName ?? 'tool') : ANALYSIS_TOOL_NAME;
      state.activeToolIds.add(ACTIVITY_TOOL_ID);
      state.activeToolStatuses.set(ACTIVITY_TOOL_ID, label);
      state.activeToolNames.set(ACTIVITY_TOOL_ID, toolName);
      store.broadcast({ type: 'agentToolStart', id, toolId: ACTIVITY_TOOL_ID, status: label, toolName });
    }

    if (agent.status === 'analyzing' || agent.status === 'using_tool') {
      store.broadcast({ type: 'agentStatus', id, status: 'active' });
    } else if (agent.status === 'completed') {
      state.isWaiting = true;
      store.broadcast({ type: 'agentStatus', id, status: 'waiting', awaitingInput: false });
    } else {
      // Qualquer status diferente de 'active' desativa a animação sem balão nem som.
      store.broadcast({ type: 'agentStatus', id, status: 'idle' });
    }
  }

  /** resendAgentActivity reenvia nossa "ferramenta", o que reativa a animação; desfazemos para estados parados. */
  private replay(send: ReplaySend): void {
    for (const agent of this.options.registry.all()) {
      const def = this.options.registry.definition(agent.agentId);
      if (def && LABELED_INACTIVE.has(agent.status)) send({ type: 'agentStatus', id: def.officeId, status: 'idle' });
    }
  }

  private readonly onAgentRemoved = (id: number): void => {
    const def = this.options.registry.definitions().find((d) => d.officeId === id);
    if (!def || !this.unsubscribe) return;
    this.logger.warn(`[trading] personagem ${def.agentId} removido; recriando`);
    // Fora do fluxo de remoção do runtime, que ainda está em andamento.
    setImmediate(() => {
      if (!this.unsubscribe || this.options.store.has(id)) return;
      this.ensureAgent(def);
      this.options.store.broadcast({ type: 'agentTeamInfo', id, agentName: def.displayName });
      this.render(this.options.registry.get(def.agentId)!);
      this.options.store.persist();
    });
  };
}

function clearTools(state: AgentState): void {
  state.activeToolIds.clear();
  state.activeToolStatuses.clear();
  state.activeToolNames.clear();
}
```

- [ ] **Step 4: Rodar.** `npx vitest run tests/integration/OpenClawProvider.test.ts && npm run typecheck` → PASS.

  Se o teste "antes de qualquer snapshot" mostrar `agentTeamInfo` com outra ordem de campos, isso é esperado, porque `forId` só compara `type:status`. Se `resendAgentActivity` não enviar `agentTeamInfo` (ele só envia quando `agentName` existe), confira se `agentName` foi passado em `createAgentState`.

- [ ] **Step 5: Commit**

```bash
git add src/trading/providers/OpenClawProvider.ts tests/integration/OpenClawProvider.test.ts
git commit -m "feat(trading): OpenClawProvider com sete personagens nativos persistentes"
```

---

### Task 10: Bootstrap `registerTradingProvider` e registro no `cli.ts`

**Files:**
- Create: `src/trading/bootstrap/registerTradingProvider.ts`
- Modify: `vendor/pixel-agents/server/src/cli.ts` (imports; registro após `server.onHookEvent(...)`; `await tradingRoom.stop()` no shutdown)
- Test: `tests/integration/registerTradingProvider.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 3–9.
- Produces: `registerTradingProvider({ store, addReplayer, dataDir, env?, logger? }): TradingRoomHandle`, com `interface TradingRoomHandle { stop(): Promise<void> }`.
- Variáveis de ambiente (todas opcionais):

  | Variável | Padrão |
  |---|---|
  | `PIXEL_EVENTS_RECEIVER_URL` | `http://pixel-events_receiver:3188` |
  | `PIXEL_EVENTS_TOKEN_FILE` | `/run/secrets/pixel_events_token` |
  | `PIXEL_EVENTS_DISCONNECT_AFTER_MS` | `30000` |
  | `PIXEL_EVENTS_RETRY_MS` | `1000` |
  | `PIXEL_EVENTS_STALE_ACTIVE_MS` | `180000` |

- [ ] **Step 1: Escrever o teste que falha.** `tests/integration/registerTradingProvider.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerTradingProvider, type TradingRoomHandle } from '../../src/trading/bootstrap/registerTradingProvider.js';
import { addActivityReplayer } from '../../vendor/pixel-agents/server/src/activityReplayers.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';
import { type FakeReceiver, startFakeReceiver } from '../support/fakeReceiver.js';
import { waitFor } from '../support/waitFor.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const warnings: string[] = [];
const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
let dir: string;
let store: AgentStateStore;
let broadcasts: Array<Record<string, unknown>>;
let fake: FakeReceiver | undefined;
let handle: TradingRoomHandle | undefined;

const statusOf = (id: number) => store.get(id)?.activeToolStatuses.get('openclaw-activity');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trading-boot-'));
  writeFileSync(join(dir, 'token'), `${TOKEN}\n`);
  store = new AgentStateStore();
  broadcasts = [];
  store.on('broadcast', (m) => broadcasts.push(m));
  warnings.length = 0;
});
afterEach(async () => {
  await handle?.stop();
  await fake?.close();
  handle = fake = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const env = (url: string) => ({
  PIXEL_EVENTS_RECEIVER_URL: url,
  PIXEL_EVENTS_TOKEN_FILE: join(dir, 'token'),
  PIXEL_EVENTS_DISCONNECT_AFTER_MS: '50',
  PIXEL_EVENTS_RETRY_MS: '10',
});

describe('registerTradingProvider', () => {
  it('ponta a ponta: snapshot → idle; model_start real → crypto-btc ativo', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(fake.url), logger });
    expect(store.size).toBe(7);
    await waitFor(() => fake!.clientCount === 1 && statusOf(9002) === undefined);
    fake.emit({ agentId: 'crypto-btc', type: 'model_start' });
    await waitFor(() => statusOf(9002) === 'Analisando');
    expect(broadcasts).toContainEqual({ type: 'agentStatus', id: 9002, status: 'active' });
    expect(statusOf(9003)).toBeUndefined();
  });

  it('o agente main é ignorado', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(fake.url), logger });
    await waitFor(() => fake!.clientCount === 1);
    fake.emit({ agentId: 'main', type: 'model_start' });
    await waitFor(() => warnings.some((w) => w.includes('"main"')));
    expect(store.size).toBe(7);
  });

  it('receptor fora do ar além do limite: todos "Sem conexão"; volta ao reconectar', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const url = fake.url;
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(url), logger });
    await waitFor(() => fake!.clientCount === 1 && statusOf(9001) === undefined);
    await fake.close();
    fake = undefined;
    await waitFor(() => statusOf(9001) === 'Sem conexão com o receptor');
  });

  it('sem token: personagens aparecem desconectados e nada é requisitado', () => {
    handle = registerTradingProvider({
      store,
      addReplayer: addActivityReplayer,
      dataDir: dir,
      env: { PIXEL_EVENTS_TOKEN_FILE: join(dir, 'inexistente') },
      logger,
    });
    expect(store.size).toBe(7);
    expect(statusOf(9005)).toBe('Sem conexão com o receptor');
    expect(warnings.some((w) => w.includes('token'))).toBe(true);
    expect(warnings.join(' ')).not.toContain(TOKEN);
  });
});
```

O teste de reconexão cobre só a queda, porque o fake sobe em porta aleatória. A volta depois do snapshot já está coberta nas Tasks 5 e 7.

- [ ] **Step 2: Rodar e confirmar a falha.** `npx vitest run tests/integration/registerTradingProvider.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** `src/trading/bootstrap/registerTradingProvider.ts`:

```ts
import { join } from 'node:path';

import { consoleLogger, type Logger } from '../application/ports.js';
import { TradingAgentRegistry } from '../application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../application/TradingEventProcessor.js';
import { ReceiverApiClient } from '../infrastructure/ReceiverApiClient.js';
import { ReceiverEventStream } from '../infrastructure/ReceiverEventStream.js';
import { readSecretFile } from '../infrastructure/SecretProvider.js';
import { type AddReplayer, type OfficeStore, OpenClawProvider } from '../providers/OpenClawProvider.js';

export interface RegisterTradingProviderOptions {
  store: OfficeStore;
  addReplayer: AddReplayer;
  /** ~/.pixel-agents — os marcadores ficam em <dataDir>/openclaw. */
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
}

export interface TradingRoomHandle {
  stop(): Promise<void>;
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Liga a Trading Room ao servidor do Pixel Agents. Falhas do receptor só mudam
 * o que o escritório mostra; nunca interrompem o servidor nem tocam no OpenClaw.
 */
export function registerTradingProvider(options: RegisterTradingProviderOptions): TradingRoomHandle {
  const env = options.env ?? process.env;
  const logger = options.logger ?? consoleLogger;
  const baseUrl = env.PIXEL_EVENTS_RECEIVER_URL ?? 'http://pixel-events_receiver:3188';
  const tokenFile = env.PIXEL_EVENTS_TOKEN_FILE ?? '/run/secrets/pixel_events_token';
  const disconnectAfterMs = numberFrom(env.PIXEL_EVENTS_DISCONNECT_AFTER_MS, 30_000);

  const registry = new TradingAgentRegistry();
  const processor = new TradingEventProcessor({
    registry,
    logger,
    staleActiveMs: numberFrom(env.PIXEL_EVENTS_STALE_ACTIVE_MS, 180_000),
  });
  const provider = new OpenClawProvider({
    store: options.store,
    registry,
    processor,
    addReplayer: options.addReplayer,
    markerDir: join(options.dataDir, 'openclaw'),
    logger,
  });
  provider.start();

  const token = readSecretFile(tokenFile);
  if (!token) {
    logger.warn(`[trading] token do receptor ausente ou inválido em ${tokenFile}; agentes exibidos como desconectados`);
    return { stop: async () => provider.stop() };
  }

  const client = new ReceiverApiClient({ baseUrl, token });
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelDisconnect = () => {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };
  const stream = new ReceiverEventStream({
    client,
    logger,
    initialBackoffMs: numberFrom(env.PIXEL_EVENTS_RETRY_MS, 1000),
    handlers: {
      onSnapshot: (snapshots) => {
        cancelDisconnect();
        processor.applySnapshot(snapshots);
      },
      onEvent: (event) => processor.applyEvent(event),
      onConnectionLost: (reason) => {
        logger.warn(`[trading] conexão com o receptor perdida: ${reason}`);
        disconnectTimer ??= setTimeout(() => processor.markDisconnected(), disconnectAfterMs);
      },
    },
  });

  let stopped = false;
  // Snapshot inicial antes dos eventos incrementais; o SSE reenvia um snapshot a cada conexão.
  void client
    .getAgents()
    .then((snapshots) => {
      if (!stopped) processor.applySnapshot(snapshots);
    })
    .catch((err: unknown) => logger.warn(`[trading] snapshot inicial indisponível: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => {
      if (!stopped) stream.start();
    });

  const ticker = setInterval(() => processor.tick(), 1000);
  ticker.unref();
  logger.info(`[trading] Trading Room ativa: 7 agentes, receptor ${baseUrl}`);

  return {
    async stop() {
      stopped = true;
      clearInterval(ticker);
      cancelDisconnect();
      await stream.stop();
      provider.stop();
    },
  };
}
```

- [ ] **Step 4: Rodar.** `npx vitest run tests/integration/registerTradingProvider.test.ts && npm test && npm run typecheck` → todos PASS.

- [ ] **Step 5: Registrar no `cli.ts` do vendor.** Em `vendor/pixel-agents/server/src/cli.ts`:

Logo depois de `import * as path from 'path';`:

```ts
import * as os from 'os';
```

Depois de `import { isLoopbackHost, normalizeHostname } from './wsAuth.js';`:

```ts
// pixel-agents-trading patch: OpenClaw Trading Room (src/trading).
import { registerTradingProvider } from '../../../../src/trading/bootstrap/registerTradingProvider.js';
import { addActivityReplayer } from './activityReplayers.js';
```

Logo depois do bloco `server.onHookEvent((providerId, event) => { runtime.handleHookEvent(providerId, event); });`:

```ts
    // pixel-agents-trading patch: the seven OpenClaw agents, registered before any
    // client connects so restoreExternalAgents never re-creates them from disk.
    const tradingRoom = registerTradingProvider({
      store,
      addReplayer: addActivityReplayer,
      dataDir: path.join(os.homedir(), '.pixel-agents'),
    });
```

Na função `shutdown()`, logo antes de `runtime.dispose();`:

```ts
      await tradingRoom.stop();
```

- [ ] **Step 6: Build e execução local de verdade**

```bash
npm run build:vendor
ls vendor/pixel-agents/dist/cli.js vendor/pixel-agents/dist/webview/index.html vendor/pixel-agents/dist/assets
cd vendor/pixel-agents && npm run test:server && cd ../..
```

Esperado: o build termina sem erro, os três caminhos existem e a suíte do servidor passa (incluindo `cli.test.ts`, que importa `parseArgs` e agora carrega o nosso módulo sem efeitos colaterais).

Verificação manual com HOME isolado (sem receptor, então os agentes aparecem desconectados):

```bash
TMPHOME=$(mktemp -d)
HOME=$TMPHOME PIXEL_EVENTS_TOKEN_FILE=$TMPHOME/none node vendor/pixel-agents/dist/cli.js --host 127.0.0.1 --port 3199 --no-terminal &
sleep 3; curl -s http://127.0.0.1:3199/api/health; kill %1
ls $TMPHOME/.pixel-agents/openclaw
```

Esperado: o log mostra `[trading] token do receptor ausente...`, o health responde e há 7 arquivos `.jsonl` em `openclaw/`. Também confirme que **não** apareceu nenhum `layout.json` novo além do que o upstream já cria por conta própria. O nosso código não escreve layout.

- [ ] **Step 7: Commit**

```bash
git add src/trading/bootstrap tests/integration/registerTradingProvider.test.ts vendor/pixel-agents/server/src/cli.ts
git commit -m "feat(trading): registra a Trading Room no servidor do Pixel Agents"
```

---

### Task 11: Dockerfile a partir do fonte, script de verificação e e2e

**Files:**
- Modify: `Dockerfile`
- Create: `.dockerignore`, `scripts/smoke-ws.mjs`, `playwright.config.ts`, `tests/e2e/trading-room.spec.ts`

**Interfaces:**
- Consumes: `vendor/pixel-agents/dist/cli.js` (Task 10), `startFakeReceiver` (Task 7)
- Produces: imagem com `CMD` idêntico ao da 1.0.0, e `/opt/trading/smoke-ws.mjs`. Uso: `node /opt/trading/smoke-ws.mjs [wsUrl] [segundos]`. Sai com 0 se os 7 ids 9001–9007 estiverem presentes.

- [ ] **Step 1: Escrever o e2e que falha.** `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { browserName: 'chromium', headless: true },
  reporter: [['list'], ['html', { open: 'never' }]],
});
```

`tests/e2e/trading-room.spec.ts`:

```ts
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { type FakeReceiver, startFakeReceiver } from '../support/fakeReceiver.js';

const TOKEN = 'e2e-e2e-e2e-e2e-e2e-e2e-e2e-12345678';
const PORT = 3297;
const IDS = [9001, 9002, 9003, 9004, 9005, 9006, 9007];
let home: string;
let fake: FakeReceiver;
let server: ChildProcess;

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'trading-e2e-'));
  writeFileSync(join(home, 'token'), TOKEN);
  fake = await startFakeReceiver({ token: TOKEN });
  server = spawn('node', ['vendor/pixel-agents/dist/cli.js', '--host', '127.0.0.1', '--port', String(PORT), '--no-terminal'], {
    env: { ...process.env, HOME: home, PIXEL_EVENTS_RECEIVER_URL: fake.url, PIXEL_EVENTS_TOKEN_FILE: join(home, 'token') },
    stdio: 'inherit',
  });
  await expect.poll(async () => (await fetch(`http://127.0.0.1:${PORT}/api/health`).catch(() => null))?.status, { timeout: 20_000 }).toBe(200);
});
test.afterAll(async () => {
  server?.kill('SIGTERM');
  await fake?.close();
  rmSync(home, { recursive: true, force: true });
});

/** Abre o escritório sem token (como o navegador atrás do basic auth) e coleta os frames do WebSocket. */
async function openOffice(page: Page) {
  const frames: Array<Record<string, unknown>> = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      try {
        frames.push(JSON.parse(String(payload)));
      } catch {
        /* frames binários não interessam */
      }
    }),
  );
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await expect.poll(() => frames.some((f) => f.type === 'layoutLoaded'), { timeout: 20_000 }).toBe(true);
  return frames;
}

test('sete personagens, atividade real e identidade preservada após recarregar', async ({ page }) => {
  let frames = await openOffice(page);
  const existing = frames.find((f) => f.type === 'existingAgents') as { agents: number[] };
  expect([...existing.agents].sort()).toEqual(IDS);
  const names = frames.filter((f) => f.type === 'agentTeamInfo').map((f) => f.agentName);
  expect(names).toEqual(expect.arrayContaining(['Coordinator', 'BTC Analyst', 'Risk Reviewer']));
  expect(names).not.toContain('main');

  fake.emit({ agentId: 'crypto-btc', type: 'model_start' });
  fake.emit({ agentId: 'main', type: 'model_start' });
  await expect.poll(() => frames.some((f) => f.type === 'agentToolStart' && f.id === 9002 && f.status === 'Analisando')).toBe(true);
  fake.emit({ agentId: 'crypto-btc', type: 'tool_start', toolName: 'web_search' });
  await expect.poll(() => frames.some((f) => f.id === 9002 && f.status === 'Ferramenta: web_search')).toBe(true);
  await page.screenshot({ path: 'test-results/trading-room-active.png', fullPage: true });

  frames.length = 0;
  await page.reload();
  frames = await openOffice(page);
  const again = frames.filter((f) => f.type === 'existingAgents').at(-1) as { agents: number[] };
  expect([...again.agents].sort()).toEqual(IDS);
  expect(frames.some((f) => f.type === 'agentToolStart' && f.id === 9002 && f.status === 'Ferramenta: web_search')).toBe(true);
  expect(frames.some((f) => f.type === 'agentToolStart' && f.id === 9003)).toBe(false);

  fake.emit({ agentId: 'crypto-btc', type: 'agent_end' });
  await expect.poll(() => frames.some((f) => f.type === 'agentStatus' && f.id === 9002 && f.status === 'waiting')).toBe(true);
});
```

- [ ] **Step 2: Rodar o e2e contra o build da Task 10**

```bash
npx playwright install chromium
npm run e2e
```

Esperado: PASS, com o screenshot gravado em `test-results/`. Abra-o e confira visualmente: o layout original, sete personagens e o rótulo "Ferramenta: web_search" sobre o BTC Analyst quando ele estiver selecionado ou com hover. Se `existingAgents` vier em dois frames (o webview pode reenviar `webviewReady`), o teste já usa o último. Se o e2e falhar, conserte o código, não o teste.

- [ ] **Step 3: Script de verificação para o Swarm.** `scripts/smoke-ws.mjs`:

```js
// Verificação somente leitura do escritório, para rodar DENTRO do container:
//   node /opt/trading/smoke-ws.mjs [ws://127.0.0.1:3100/ws] [segundos]
// Conecta como o navegador (sem token, portanto read-only), lista os personagens
// e imprime as mudanças de atividade até o prazo. Sai com 1 se faltar algum dos 7.
const url = process.argv[2] ?? 'ws://127.0.0.1:3100/ws';
const seconds = Number(process.argv[3] ?? 5);
const EXPECTED = [9001, 9002, 9003, 9004, 9005, 9006, 9007];
const names = new Map();
let agents = [];

const ws = new WebSocket(url);
ws.onopen = () => ws.send(JSON.stringify({ type: 'webviewReady' }));
ws.onerror = (e) => {
  console.error('erro no WebSocket:', e.message ?? e);
  process.exit(1);
};
ws.onmessage = ({ data }) => {
  let msg;
  try {
    msg = JSON.parse(String(data));
  } catch {
    return;
  }
  if (msg.type === 'existingAgents') agents = msg.agents;
  if (msg.type === 'agentTeamInfo') names.set(msg.id, msg.agentName);
  if (msg.type === 'agentToolStart' || msg.type === 'agentStatus' || msg.type === 'agentToolsClear') {
    const label = msg.status ? ` ${msg.status}` : '';
    console.log(`${new Date().toISOString()} ${names.get(msg.id) ?? msg.id}: ${msg.type}${label}`);
  }
};
setTimeout(() => {
  ws.close();
  console.log('\nPersonagens:', agents.map((id) => `${id}=${names.get(id) ?? '?'}`).join(', '));
  const missing = EXPECTED.filter((id) => !agents.includes(id));
  if (missing.length) {
    console.error('FALTANDO:', missing.join(', '));
    process.exit(1);
  }
  console.log('OK: 7 agentes presentes');
  process.exit(0);
}, seconds * 1000);
```

Verifique contra o servidor local: `HOME=$(mktemp -d) node vendor/pixel-agents/dist/cli.js --port 3198 --no-terminal & sleep 3; node scripts/smoke-ws.mjs ws://127.0.0.1:3198/ws 3; kill %1`. Esperado: "OK: 7 agentes presentes" e exit 0.

- [ ] **Step 4: Dockerfile multi-stage**

`.dockerignore`:

```gitignore
.git
node_modules
vendor/pixel-agents/node_modules
vendor/pixel-agents/webview-ui/node_modules
vendor/pixel-agents/server/node_modules
vendor/pixel-agents/dist
test-results
playwright-report
trading-room
```

`Dockerfile`:

```dockerfile
# Constrói o Pixel Agents 1.5.0 a partir do fonte versionado em vendor/, com a
# Trading Room (src/trading) empacotada pelo esbuild do upstream.
FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY vendor/pixel-agents/package.json vendor/pixel-agents/package-lock.json vendor/pixel-agents/
COPY vendor/pixel-agents/server/package.json vendor/pixel-agents/server/
COPY vendor/pixel-agents/webview-ui/package.json vendor/pixel-agents/webview-ui/
RUN cd vendor/pixel-agents && npm ci --ignore-scripts
COPY vendor/pixel-agents vendor/pixel-agents
COPY src src
RUN cd vendor/pixel-agents \
 && node esbuild.js --production \
 && npm run build:webview \
 && npm pack --ignore-scripts --pack-destination /build

FROM node:22-bookworm-slim
COPY --from=build /build/pixel-agents-1.5.0.tgz /tmp/pixel-agents.tgz
RUN npm install -g /tmp/pixel-agents.tgz && rm /tmp/pixel-agents.tgz && npm cache clean --force
COPY scripts/smoke-ws.mjs /opt/trading/smoke-ws.mjs

ENV NODE_ENV=production
ENV HOME=/home/node

USER node
WORKDIR /home/node

EXPOSE 3100

CMD ["pixel-agents", "--host", "0.0.0.0", "--port", "3100", "--no-terminal"]
```

- [ ] **Step 5: Validar a imagem localmente**

```bash
docker build -t pixel-agents-trading:local .
docker run --rm pixel-agents-trading:local sh -c 'ls /usr/local/lib/node_modules/pixel-agents/dist && grep -c "Sem conexão com o receptor" /usr/local/lib/node_modules/pixel-agents/dist/cli.js'
docker run -d --name pat-local -p 127.0.0.1:3196:3100 pixel-agents-trading:local
sleep 4; docker exec pat-local node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 3; docker rm -f pat-local
```

Esperado: `dist` tem `cli.js`, `webview/`, `assets/` e `hooks/`. O `grep` encontra pelo menos 1 ocorrência, o que prova que a Trading Room está no bundle. O smoke termina com "OK: 7 agentes presentes".

Compare também o conteúdo do pacote com o 1.5.0 publicado, para garantir que nada do upstream ficou de fora:

```bash
(cd vendor/pixel-agents && npm pack --dry-run --ignore-scripts 2>&1 | grep -E '^npm notice [0-9.]+[kMG]?B' | awk '{print $NF}' | sort) > /tmp/ours.txt
npm pack pixel-agents@1.5.0 --dry-run 2>&1 | grep -E '^npm notice [0-9.]+[kMG]?B' | awk '{print $NF}' | sort > /tmp/theirs.txt
diff /tmp/theirs.txt /tmp/ours.txt
```

Esperado: nenhuma linha faltando do lado do upstream (`<`). Arquivos a mais (`>`), como sourcemaps, merecem uma olhada, mas não bloqueiam.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore scripts/smoke-ws.mjs playwright.config.ts tests/e2e
git commit -m "build: imagem a partir do fonte, smoke via WebSocket e e2e Playwright"
```

---

### Task 12: CI, stack do Swarm e documentação

**Files:**
- Create: `.github/workflows/test.yml`, `stack.canary.yml`, `docs/architecture.md`, `docs/event-contract.md`, `docs/deployment.md`
- Modify: `.github/workflows/docker-publish.yml`, `stack.yml`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Produces: a tag `vX.Y.Z` publica a imagem `X.Y.Z` (nunca `1.0.0`). Também produz `stack.yml` com `PIXEL_AGENTS_TAG` (padrão `2.0.0`) e a stack canário.

- [ ] **Step 1: `.github/workflows/test.yml`**

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
  workflow_call:

permissions:
  contents: read

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  upstream-server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: cd vendor/pixel-agents && npm ci --ignore-scripts && npm run test:server

  e2e:
    needs: unit-integration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build:vendor
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: |
            test-results
            playwright-report
```

- [ ] **Step 2: `.github/workflows/docker-publish.yml`**

```yaml
name: Publish Pixel Agents Trading

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  packages: write

jobs:
  test:
    uses: ./.github/workflows/test.yml

  docker:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Buildx
        uses: docker/setup-buildx-action@v3

      # v2.0.0 -> 2.0.0. Um dispatch manual sem tag publica só sha-<commit>.
      # A tag 1.0.0 nunca é reescrita: é o caminho de rollback.
      - name: Image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/wrpaiva/pixel-agents-trading
          tags: |
            type=semver,pattern={{version}}
            type=sha

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 3: `stack.yml`**

```yaml
version: "3.8"

services:
  web:
    # Rollback: PIXEL_AGENTS_TAG=1.0.0 (ou o digest anotado em docs/deployment.md).
    image: ghcr.io/wrpaiva/pixel-agents-trading:${PIXEL_AGENTS_TAG:-2.0.0}

    environment:
      NODE_ENV: production
      HOME: /home/node
      PIXEL_EVENTS_RECEIVER_URL: http://pixel-events_receiver:3188
      PIXEL_EVENTS_TOKEN_FILE: /run/secrets/pixel_events_token

    secrets:
      - pixel_events_token

    networks:
      - waurumai_net
      - trading_internal

    volumes:
      - pixel_agents_data:/home/node/.pixel-agents

    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

    deploy:
      replicas: 1
      placement:
        constraints:
          - node.hostname == waurumai
      resources:
        limits:
          cpus: "1.0"
          memory: 1G
        reservations:
          memory: 256M
      restart_policy:
        condition: on-failure
      update_config:
        order: stop-first
        failure_action: rollback
        monitor: 60s
      rollback_config:
        order: stop-first
      labels:
        - traefik.enable=true
        - traefik.swarm.network=waurumai_net
        - traefik.http.routers.pixel-agents.rule=Host(`ag.waurumai.com`)
        - traefik.http.routers.pixel-agents.entrypoints=websecure
        - traefik.http.routers.pixel-agents.tls=true
        - traefik.http.routers.pixel-agents.tls.certresolver=letsencryptresolver
        - traefik.http.routers.pixel-agents.service=pixel-agents
        - traefik.http.services.pixel-agents.loadbalancer.server.port=3100
        - traefik.http.routers.pixel-agents.middlewares=pixel-agents-auth
        - traefik.http.middlewares.pixel-agents-auth.basicauth.users=${PIXEL_AUTH_USERS}

secrets:
  pixel_events_token:
    external: true

volumes:
  pixel_agents_data:

networks:
  waurumai_net:
    external: true
  trading_internal:
    external: true
```

A imagem 1.0.0 ignora o secret e a rede extra, então o mesmo `stack.yml` serve para o rollback. Isso só vale se o healthcheck também funcionar na 1.0.0. Ela roda `pixel-agents` 1.5.0 do npm, que expõe `/api/health`; confirme isso no rollback de teste da Task 13.

- [ ] **Step 4: `stack.canary.yml`.** Serve para validar antes de substituir. Não tem Traefik, não tem porta e usa um volume separado.

```yaml
version: "3.8"

# Validação da 2.0.0 contra o receptor real ANTES de trocar a produção.
# Sem Traefik e sem porta: acesso só via `docker exec ... smoke-ws.mjs`.
services:
  web:
    image: ghcr.io/wrpaiva/pixel-agents-trading:2.0.0
    environment:
      NODE_ENV: production
      HOME: /home/node
      PIXEL_EVENTS_RECEIVER_URL: http://pixel-events_receiver:3188
      PIXEL_EVENTS_TOKEN_FILE: /run/secrets/pixel_events_token
    secrets:
      - pixel_events_token
    networks:
      - trading_internal
    volumes:
      - pixel_agents_canary_data:/home/node/.pixel-agents
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.hostname == waurumai
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
      restart_policy:
        condition: none

secrets:
  pixel_events_token:
    external: true

volumes:
  pixel_agents_canary_data:

networks:
  trading_internal:
    external: true
```

- [ ] **Step 5: Documentação**

`docs/architecture.md` deve conter:

1. O diagrama da seção 2 do spec.
2. O papel de cada camada (`config`, `domain`, `application`, `infrastructure`, `providers`, `bootstrap`), com um parágrafo cada.
3. A tabela "Como os estados viram mensagens nativas" deste plano.
4. A lista das três alterações no vendor (`activityReplayers.ts`, `clientMessageHandler.ts`, `cli.ts`) e o motivo de cada uma.
5. Como atualizar o upstream: `git subtree pull --prefix vendor/pixel-agents https://github.com/pixel-agents-hq/pixel-agents.git vX.Y.Z --squash`, e depois reaplicar e conferir as três alterações.

`docs/event-contract.md` deve conter:

1. A tabela de eventos do plugin: hook OpenClaw → `type` → `state` do receptor → `AgentStatus`. As linhas são: `model_call_started` → `model_start` → `analisando` → `analyzing`; `model_call_ended` → `model_end` → `aguardando` → `analyzing`; `before_tool_call` → `tool_start` → `ferramenta` → `using_tool`; `after_tool_call` → `tool_end` → `ferramenta_concluida` → `analyzing`; `agent_end` → `agent_end` → `ocioso`/`erro` → `completed`/`error`. Registre também que `waiting` existe no modelo e tem rótulo na UI, mas o OpenClaw não emite hoje nenhum evento de "espera explícita por dependência". Por isso nenhum agente entra nesse estado até existir um evento real.
2. O formato de `GET /agents` (o exemplo real) e de `GET /events`: `event: snapshot` no início de cada conexão, depois `event: activity` com `{agentId,state,type,sessionKey,toolName,timestamp,receivedAt,seq}` e `: ping` a cada 25 s.
3. As regras de deduplicação e atraso (`seq`, com fallback por timestamp) e o reset no snapshot.
4. Os campos que chegam ao navegador: só os rótulos de atividade, os nomes visuais, os `agentId` e o `toolName`. Prompts, argumentos e resultados nunca saem do OpenClaw.
5. A tabela de variáveis `PIXEL_EVENTS_*` da Task 10.

`docs/deployment.md` deve conter os passos exatos da Task 13 (pré-requisitos, canário, produção, validação e rollback com comandos) e um campo "Digest da 1.0.0 em produção: `sha256:…`", preenchido na Task 13.

`README.md` deve ter: uma linha descrevendo o projeto, os comandos (`npm test`, `npm run typecheck`, `npm run build:vendor`, `npm run e2e`, `docker build`) e links para os três docs.

`CLAUDE.md`: substitua a seção "What this repo is" para refletir a arquitetura nova. Ela deve dizer que o vendor é um subtree com três alterações, que `src/trading` é empacotado pelo esbuild do upstream e que a tag da imagem vem da tag git. Atualize "Commands" com os scripts acima e um exemplo de teste único: `npx vitest run tests/unit/AgentStateMapper.test.ts -t "model_end"`. Na parte sobre o script de layout, acrescente que `criar-trading-room.sh` **não** deve ser rodado na Etapa 3 e que o layout de produção mora no volume.

- [ ] **Step 6: Verificar e fazer commit**

```bash
npm run typecheck && npm test
docker compose -f stack.yml config >/dev/null && docker compose -f stack.canary.yml config >/dev/null
git add .github/workflows stack.yml stack.canary.yml docs/architecture.md docs/event-contract.md docs/deployment.md README.md CLAUDE.md
git commit -m "ci,deploy: testes no CI, tag semver, stack 2.0.0 com receptor e docs"
```

O `docker compose config` só valida a sintaxe. Os avisos sobre `deploy` e `external` são esperados.

---

### Task 13: Publicação e validação no Docker Swarm (exige confirmação do usuário)

Todos os passos desta task têm efeito externo. **Antes de cada passo marcado com ⚠️, peça confirmação explícita ao usuário.** Se algum critério falhar, pare e relate. Não improvise uma correção em produção.

- [ ] **Step 1: Revisão final do branch.** Use a skill `superpowers:requesting-code-review` no branch inteiro. Depois use `superpowers:finishing-a-development-branch` para fazer o merge em `main` (o usuário escolhe a forma). Confirme que `criar-trading-room.sh` e `trading-room/layout.json` não entraram em nenhum commit do branch: `git diff main...feat/etapa3-openclaw --stat -- criar-trading-room.sh trading-room/` deve vir vazio.

- [ ] **Step 2: ⚠️ Registrar o digest atual (é o caminho de rollback).** Na VPS:

```bash
docker service inspect pixel-agents_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json
```

Anote o digest `ghcr.io/wrpaiva/pixel-agents-trading:1.0.0@sha256:…` e o hash do layout em `docs/deployment.md`, e faça commit.

- [ ] **Step 3: ⚠️ Atualizar o adapter (Task 2) no ambiente.** Isso vale para o receptor e para o plugin, seguindo o README do adapter. Só depois desse passo o `tool_start` passa a existir. Confirme:

```bash
docker exec $(docker ps -q -f label=com.docker.swarm.service.name=pixel-events_receiver | head -n1) \
  node -e "fetch('http://127.0.0.1:3188/agents',{headers:{authorization:'Bearer '+require('fs').readFileSync('/run/secrets/pixel_events_token','utf8').trim()}}).then(r=>r.json()).then(j=>console.log(j.agents.map(a=>a.agentId+':'+a.seq).join(' ')))"
```

Esperado: os 7 agentes, cada um com `seq` numérico. Se o receptor ainda lê o token de variável de ambiente, adapte o comando; nunca imprima o token.

- [ ] **Step 4: ⚠️ Criar o secret e conferir a rede**

```bash
docker network inspect trading_internal --format '{{.Name}} {{.Driver}} attachable={{.Attachable}}'
docker secret ls | grep pixel_events_token || printf '%s' "<mesmo token do receptor>" | docker secret create pixel_events_token -
```

O token é o mesmo do receptor. Nunca o grave em arquivo versionado nem o cole no chat.

- [ ] **Step 5: ⚠️ Publicar a 2.0.0**

```bash
git tag v2.0.0 && git push origin main v2.0.0
gh run watch $(gh run list --workflow "Publish Pixel Agents Trading" --limit 1 --json databaseId -q '.[0].databaseId')
```

Esperado: os jobs test, e2e e docker verdes, e `ghcr.io/wrpaiva/pixel-agents-trading:2.0.0` publicado. Confirme que a tag `1.0.0` não mudou (o digest deve ser igual ao do Step 2).

- [ ] **Step 6: ⚠️ Canário contra o receptor real**

```bash
docker stack deploy -c stack.canary.yml pixel-agents-canary
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents-canary_web | head -n1)
docker logs "$CID" 2>&1 | grep '\[trading\]'
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 5
```

Esperado: o log mostra `Trading Room ativa` e nenhum `conexão ... perdida` em sequência. O smoke diz "OK: 7 agentes presentes", sem `main`.

Peça ao usuário que dispare **uma única análise controlada em paper trading** do `crypto-btc`. Enquanto isso, rode `docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 180` e espere, só para o BTC Analyst, a sequência `Analisando` → `Ferramenta: <nome>` → `agentStatus waiting` → `agentStatus idle`. Nenhum outro agente deve mudar. Depois, `docker stack rm pixel-agents-canary`.

- [ ] **Step 7: ⚠️ Produção pelo Portainer.** Atualize a stack `pixel-agents` com o `stack.yml` novo (`PIXEL_AGENTS_TAG` vazio, ou seja, `2.0.0`, e `PIXEL_AUTH_USERS` mantido). Depois:

```bash
docker service ls --filter name=pixel-agents_web   # REPLICAS 1/1
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json   # igual ao Step 2
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 5
curl -s -o /dev/null -w '%{http_code}\n' https://ag.waurumai.com/          # 401 sem credenciais
curl -s -o /dev/null -w '%{http_code}\n' http://pixel-events_receiver:3188/agents 2>/dev/null || echo "receptor inacessível de fora (esperado)"
```

No navegador (`https://ag.waurumai.com`, com basic auth), percorra a checklist da seção 12 do spec com o usuário:

- 7 personagens com nomes, layout original intacto e nenhum `main`.
- Recarregar a página não duplica personagens.
- Uma análise real muda só o agente certo.
- Reiniciar o receptor (`docker service update --force pixel-events_receiver`) mostra "Sem conexão" depois de cerca de 30 s e volta sozinho.
- O código-fonte da página não contém o token. Verifique com `curl -s -u <user> https://ag.waurumai.com/ | grep -c pixel_events` → 0.

- [ ] **Step 8: ⚠️ Testar o rollback.** No Portainer, defina `PIXEL_AGENTS_TAG=1.0.0` (ou use o digest do Step 2) e atualize. Confirme `1/1`, que o escritório antigo abre e que o hash do layout está igual. Volte para `2.0.0` e confirme `1/1` de novo. Registre o resultado e a data em `docs/deployment.md` e faça commit.

- [ ] **Step 9: Definição de pronto.** A etapa está concluída somente quando os Steps 6–8 passarem no Swarm, conforme a seção 15 do spec. Relate ao usuário o que foi validado, com as saídas do smoke e o resultado do rollback.
