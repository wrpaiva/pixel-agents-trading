# Contrato de eventos

Contrato entre o plugin `pixel-events` do OpenClaw, o receptor do `openclaw-pixel-adapter` (porta 3188, rede interna `trading_internal`) e o Pixel Agents Trading. O receptor exige `Authorization: Bearer <token>` em todas as rotas.

## Eventos do plugin

| Hook OpenClaw | `type` | `state` do receptor | `AgentStatus` |
|---|---|---|---|
| `model_call_started` | `model_start` | `analisando` | `analyzing` |
| `model_call_ended` | `model_end` | `aguardando` | `analyzing` |
| `before_tool_call` | `tool_start` | `ferramenta` | `using_tool` |
| `after_tool_call` | `tool_end` | `ferramenta_concluida` | `analyzing` |
| `agent_end` | `agent_end` | `ocioso` / `erro` | `completed` / `error` |

Ciclo de uma rodada: `model_start` → `model_end` → `tool_start` → `tool_end` → `model_start` → … → `agent_end`. Por isso `model_end` mantém `analyzing`: só `agent_end` encerra a rodada. `agent_end` com falha vira `error`; caso contrário `completed`, que volta a `idle` após 4 s. `error` volta a `idle` após 2 min. Confira o nome real dos hooks com `openclaw plugins inspect pixel-events --runtime --json`.

O estado `waiting` existe no modelo e tem rótulo na UI ("Aguardando dependência"), mas o OpenClaw não emite hoje nenhum evento de "espera explícita por dependência". Por isso nenhum agente entra nesse estado até existir um evento real. O estado `disconnected` não vem do receptor: é aplicado quando a conexão com ele fica perdida por mais de `PIXEL_EVENTS_DISCONNECT_AFTER_MS`.

## `GET /agents`

Estado atual dos sete agentes (exemplo com um deles):

```json
{
  "agents": [
    {
      "agentId": "crypto-btc",
      "state": "ocioso",
      "lastEvent": "model_end",
      "lastSeen": "2026-11-04T01:53:15.504Z",
      "sessionKey": "agent:crypto-btc:main",
      "toolName": null,
      "count": 6,
      "seq": 41
    }
  ]
}
```

`seq` só existe a partir do adapter da branch `feat/tool-start-seq`; versões antigas omitem o campo e o consumidor cai no fallback por timestamp. O receptor expira o estado para `ocioso` após 2 min sem eventos.

## `GET /events` (SSE)

- No início de cada conexão: `event: snapshot`, com o mesmo conteúdo de `GET /agents`.
- Depois, um `event: activity` por evento, com `data` JSON `{agentId,state,type,sessionKey,toolName,timestamp,receivedAt,seq}`. `receivedAt` é um número: epoch em milissegundos (não uma string ISO); `timestamp` é ISO 8601.

Uma chamada de modelo ou ferramenta que dure mais que `PIXEL_EVENTS_STALE_ACTIVE_MS` (padrão 180 s) sem eventos aparece como `idle` até o próximo evento.
- `: ping` a cada 25 s (comentário SSE, só mantém a conexão viva).

```text
event: snapshot
data: {"agents":[...]}

event: activity
data: {"agentId":"crypto-btc","state":"ferramenta","type":"tool_start","sessionKey":"agent:crypto-btc:main","toolName":"web_search","timestamp":"2026-11-07T12:00:00.000Z","receivedAt":1794139200020,"seq":42}

: ping
```

## Deduplicação, ordem e atraso

- Com `seq` no evento e no agente: `seq <= último seq` é descartado como duplicado ou atrasado.
- Sem `seq`: timestamp menor que o último é descartado; timestamp igual só é descartado se a chave do evento (tipo, ferramenta, sessão) já foi vista naquele instante.
- Cada snapshot (`GET /agents` inicial e o `snapshot` de cada conexão SSE) redefine a linha de base, inclusive o `seq`, que zera quando o receptor reinicia.
- Agentes fora dos sete e tipos de evento desconhecidos são ignorados com um aviso no log.
- Silêncio total (nem `: ping`) além do limite é tratado como conexão perdida; a reconexão tem backoff a partir de `PIXEL_EVENTS_RETRY_MS`.

## O que chega ao navegador

Somente os rótulos de atividade ("Analisando", "Ferramenta: <nome>", …), os nomes visuais, os `agentId` e o `toolName`. Prompts, mensagens, argumentos e resultados de ferramentas nunca saem do OpenClaw, e o token nunca vai ao navegador. O navegador também não tem nenhum caminho para enviar ordens.

## Variáveis de ambiente

| Variável | Padrão | Função |
|---|---|---|
| `PIXEL_EVENTS_RECEIVER_URL` | `http://pixel-events_receiver:3188` | URL base do receptor |
| `PIXEL_EVENTS_TOKEN_FILE` | `/run/secrets/pixel_events_token` | Arquivo com o token Bearer |
| `PIXEL_EVENTS_DISCONNECT_AFTER_MS` | `30000` | Tempo de conexão perdida até marcar os agentes como desconectados |
| `PIXEL_EVENTS_RETRY_MS` | `1000` | Backoff inicial da reconexão SSE |
| `PIXEL_EVENTS_STALE_ACTIVE_MS` | `180000` | Sem eventos por esse tempo, um agente ativo volta a `idle` |
