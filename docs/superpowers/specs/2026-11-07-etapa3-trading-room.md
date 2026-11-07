# SPEC — Pixel Agents Trading Room

**Projeto:** `wrpaiva/pixel-agents-trading`  
**Versão-alvo:** 2.0.0  
**Pixel Agents base:** 1.5.0  
**Status:** Especificação de implementação — Etapa 3  
**Prioridade:** Integração funcional antes de melhorias visuais

> Decisões registradas em 2026-11-07, durante o planejamento:
> - `using_tool` passa a ser alimentado por um novo evento `tool_start` (hook `before_tool_call`) no `openclaw-pixel-adapter`.
> - O fonte do Pixel Agents 1.5.0 é versionado via `git subtree --squash` em `vendor/pixel-agents`.

---

## 1. Objetivo

Evoluir o repositório `pixel-agents-trading` para representar visualmente os sete agentes reais da instância `openclaw-trading`, utilizando os eventos já capturados e disponibilizados pelo projeto `openclaw-pixel-adapter`.

O sistema deve manter os personagens animados nativos do Pixel Agents e representar seus estados de execução.

Não criar outro frontend, repositório, stack ou domínio.

### Resultado esperado

Quando um agente do OpenClaw iniciar uma análise, o personagem correspondente deve:

1. Ser identificado no escritório.
2. Assumir um estado visual de atividade.
3. Refletir chamadas de ferramentas e conclusão de análises.
4. Retornar ao estado ocioso ao terminar.
5. Manter a identidade após atualização da página e reconexão.

O sistema não deve executar ordens financeiras nem permitir iniciar comandos do OpenClaw pela interface.

---

## 2. Arquitetura obrigatória

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

### Responsabilidades

**OpenClaw Trading**
- Continua executando agentes e análises.
- Emite eventos de observação.
- Não recebe alterações na lógica de trading.

**openclaw-pixel-adapter**
- Recebe eventos reais do OpenClaw.
- Mantém o estado dos sete agentes.
- Disponibiliza APIs internas autenticadas.
- Permanece como serviço independente existente.

**pixel-agents-trading**
- Consome os eventos do receptor.
- Normaliza os eventos para o modelo do Pixel Agents.
- Gerencia identidade, estado e animação dos personagens.
- Disponibiliza a interface no domínio existente.

### Restrições

- Proibido criar outro projeto frontend.
- Proibido introduzir uma segunda interface visual sobreposta.
- Proibido alterar a versão do OpenClaw sem necessidade.
- Proibido expor a API interna do receptor publicamente.
- Proibido enviar o token do receptor ao navegador.
- Proibido simular eventos como se fossem execuções reais.

---

## 3. Agentes suportados

| Identificador | Nome visual | Papel |
|---|---|---|
| trading-coordinator | Coordinator | Orquestração |
| crypto-btc | BTC Analyst | Criptomoedas |
| crypto-eth | ETH Analyst | Criptomoedas |
| forex-eur | EUR Analyst | Forex |
| forex-gbp | GBP Analyst | Forex |
| gold-analyst | Gold Analyst | Ouro |
| risk-reviewer | Risk Reviewer | Gestão de risco |

O agente `main` não deve aparecer na primeira versão.

Cada agente deve possuir uma identidade visual estável, independente de seu `sessionKey`.

O mesmo agente pode possuir diferentes sessões sem criar personagens duplicados.

---

## 4. Estados de execução

Estados internos padronizados:

```typescript
type AgentStatus =
  | "idle"
  | "analyzing"
  | "using_tool"
  | "waiting"
  | "completed"
  | "error"
  | "disconnected";
```

### Regras de transição

| Evento recebido | Estado esperado |
|---|---|
| Agente sem execução confirmada | idle |
| Início de chamada ao modelo | analyzing |
| Início de ferramenta | using_tool |
| Fim de ferramenta | analyzing, se a execução continua |
| Espera explícita por dependência | waiting |
| Execução concluída | completed, depois idle |
| Falha real | error |
| Fonte indisponível além do limite configurado | disconnected |

O receptor já apresentou o evento `model_end`, que deverá ser tratado conforme seu significado no ciclo de execução, sem supor que todo término de chamada ao modelo equivale ao fim da rodada.

Não inferir atividade a partir da simples existência de uma sessão.

Não atribuir estados ativos a agentes que ainda não emitiram eventos.

---

## 5. Contrato interno do adaptador

Definir um contrato tipado e independente da implementação HTTP.

```typescript
interface TradingAgent {
  agentId: string;
  displayName: string;
  sessionKey: string | null;
  status: AgentStatus;
  lastEvent: string | null;
  lastSeen: string | null;
  toolName: string | null;
  eventCount: number;
}

interface TradingAgentEvent {
  agentId: string;
  sessionKey: string | null;
  eventType: string;
  timestamp: string;
  toolName?: string | null;
}
```

### Fonte de estado inicial

```text
GET http://pixel-events_receiver:3188/agents
Authorization: Bearer <token>
```

Resposta já validada:

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
      "count": 6
    }
  ]
}
```

Esse exemplo mostra apenas um dos sete agentes.

### Fonte de eventos

Utilizar o endpoint existente `GET /events` do receptor.

Antes de implementar o cliente, respeitar o formato efetivo da resposta: SSE, polling ou outro contrato existente. Não presumir um formato sem conferir o código versionado do `openclaw-pixel-adapter`.

### Segurança

O consumo deve ocorrer no backend do Pixel Agents Trading.

O token deve ser lido de `/run/secrets/pixel_events_token`.

O frontend recebe somente os estados normalizados necessários para animação.

Não encaminhar prompts, mensagens completas, resultados de ferramentas ou credenciais.

---

## 6. Integração nativa com Pixel Agents

Priorizar a arquitetura existente do Pixel Agents 1.5.0.

Implementar um provedor `OpenClawProvider` compatível com o mecanismo de eventos normalizados do Pixel Agents.

O provedor deve:

1. Registrar os sete agentes conhecidos.
2. Converter os estados recebidos em eventos compatíveis com o runtime.
3. Associar cada `agentId` a um personagem persistente.
4. Atualizar o `AgentStateStore`.
5. Transmitir alterações pelo WebSocket já utilizado pelo escritório.
6. Restaurar personagens após reconexão do navegador.
7. Evitar personagens duplicados quando houver múltiplas sessões.

A criação de personagens deve utilizar os mecanismos nativos do Pixel Agents, não elementos HTML posicionados sobre o Canvas.

### Integração de código-fonte

A imagem atual instala `pixel-agents@1.5.0` por npm.

Como essa distribuição contém bundles compilados, a implementação deve passar a construir o Pixel Agents Trading a partir do código-fonte da versão 1.5.0, mantendo esse código como dependência versionada ou fork interno do mesmo repositório.

Não editar bundles minificados manualmente.

Não depender de modificações feitas diretamente no container em execução.

---

## 7. Layout

Preservar o layout original restaurado.

O arquivo persistente é:

```text
/home/node/.pixel-agents/layout.json
```

Nenhuma alteração nas seguintes estruturas nesta fase:

- `tiles`
- `tileColors`
- `furniture`
- paredes e divisórias
- decoração original

Não recriar o layout 34 × 28 anteriormente gerado.

A distribuição definitiva das sete mesas será tratada em uma melhoria visual posterior, após a integração funcional.

---

## 8. Estrutura do repositório

Estrutura-alvo:

```text
pixel-agents-trading/
│
├── .github/
│   └── workflows/
│       ├── docker-publish.yml
│       └── test.yml
│
├── src/
│   └── trading/
│       ├── config/
│       │   └── agents.ts
│       │
│       ├── domain/
│       │   ├── AgentStatus.ts
│       │   ├── TradingAgent.ts
│       │   └── TradingAgentEvent.ts
│       │
│       ├── application/
│       │   ├── TradingAgentRegistry.ts
│       │   ├── AgentStateMapper.ts
│       │   └── TradingEventProcessor.ts
│       │
│       ├── infrastructure/
│       │   ├── ReceiverApiClient.ts
│       │   ├── ReceiverEventStream.ts
│       │   └── SecretProvider.ts
│       │
│       ├── providers/
│       │   └── OpenClawProvider.ts
│       │
│       └── bootstrap/
│           └── registerTradingProvider.ts
│
├── vendor/
│   └── pixel-agents/
│       └── (código-fonte versionado do upstream)
│
├── tests/
│   ├── unit/
│   │   ├── AgentStateMapper.test.ts
│   │   ├── TradingAgentRegistry.test.ts
│   │   └── TradingEventProcessor.test.ts
│   │
│   ├── integration/
│   │   ├── ReceiverApiClient.test.ts
│   │   └── OpenClawProvider.test.ts
│   │
│   └── e2e/
│       └── trading-room.spec.ts
│
├── docs/
│   ├── architecture.md
│   ├── event-contract.md
│   └── deployment.md
│
├── Dockerfile
├── stack.yml
├── package.json
├── README.md
└── .gitignore
```

A organização acima é a estrutura desejada, não uma afirmação de que os arquivos já existem.

A integração com o código-fonte upstream deve utilizar a menor alteração necessária e preservar os componentes originais.

---

## 9. Padrões de projeto

### Adapter

`ReceiverApiClient` adapta o contrato HTTP existente para o domínio da Trading Room.

### Strategy

`AgentStateMapper` converte eventos do receptor em estados visuais, mantendo as regras testáveis e independentes do transporte.

### Registry

`TradingAgentRegistry` garante os sete agentes conhecidos e uma identidade estável por `agentId`.

### Observer / Event-driven

`TradingEventProcessor` distribui atualizações para o runtime do Pixel Agents.

### Dependency Injection

As dependências de transporte, autenticação, relógio e persistência devem ser injetáveis, permitindo testes sem Docker ou Gateway real.

Evitar serviços monolíticos e dependências diretas do frontend para o receptor.

---

## 10. Resiliência

O sistema deve:

- Carregar um snapshot inicial antes de processar eventos incrementais.
- Reconectar automaticamente após perda de conexão.
- Tratar eventos duplicados.
- Ignorar eventos de agentes desconhecidos, registrando o motivo.
- Evitar regressão de estado por eventos atrasados.
- Não deixar agentes eternamente no estado `analyzing`.
- Diferenciar `idle` de `disconnected`.
- Garantir que uma falha de observabilidade não afete o OpenClaw Trading.

Se o receptor reiniciar e perder eventos, o frontend não deve inventar o histórico ausente.

---

## 11. Docker Swarm

Manter a stack existente:

```text
pixel-agents
└── pixel-agents_web
```

Imagem:

```text
ghcr.io/wrpaiva/pixel-agents-trading:2.0.0
```

Requisitos:

- Rede `waurumai_net` para o Traefik.
- Rede `trading_internal` para acessar o receptor.
- Docker Secret `pixel_events_token`.
- Sem publicação direta da porta HTTP.
- Mesmo volume persistente do Pixel Agents.
- Mesmas regras HTTPS e autenticação existentes.
- `--no-terminal` preservado.
- Limites de recursos definidos no Swarm.

A imagem deve ser produzida no GitHub Actions e publicada no GHCR.

Não instalar dependências manualmente no container de produção.

Não armazenar tokens no Dockerfile, repositório ou frontend.

---

## 12. Critérios de aceite

### Identidade

- [ ] Os sete agentes aparecem no escritório.
- [ ] Cada agente possui uma identificação legível.
- [ ] Não aparecem duplicações quando há múltiplas sessões.
- [ ] O agente `main` permanece oculto.

### Estados reais

- [ ] `crypto-btc` muda para atividade quando uma análise real começa.
- [ ] A utilização de ferramenta altera o estado visual.
- [ ] O término da execução retorna o agente ao estado ocioso.
- [ ] Estados de outros agentes não são alterados indevidamente.
- [ ] Não há animações de atividade sem evidência de execução.

### Resiliência

- [ ] Reiniciar o navegador não duplica personagens.
- [ ] Reiniciar o receptor não quebra o escritório.
- [ ] A perda de conectividade é apresentada corretamente.
- [ ] Eventos duplicados não provocam transições incorretas.

### Segurança

- [ ] O token permanece exclusivamente no backend.
- [ ] O receptor não possui rota pública.
- [ ] O domínio permanece protegido por HTTPS e autenticação.
- [ ] Nenhuma ordem financeira pode ser enviada pela interface.

### Deploy

- [ ] Build automatizado concluído.
- [ ] Testes unitários e de integração aprovados.
- [ ] Serviço Docker Swarm em `1/1`.
- [ ] Interface original preservada.
- [ ] Nova versão validada antes de substituir a atual.
- [ ] Rollback documentado e testado.

---

## 13. Ordem de implementação

### Entrega 3.1 — Domínio e cliente de eventos

Implementar:
- `TradingAgentRegistry`
- `ReceiverApiClient`
- `AgentStateMapper`
- `TradingEventProcessor`

Validar com testes usando a resposta real já conhecida do receptor.

### Entrega 3.2 — Provedor nativo

Implementar:
- `OpenClawProvider`
- Registro do provedor no runtime
- Identidade estável dos sete personagens
- Atualizações via transporte existente do Pixel Agents

### Entrega 3.3 — Integração completa

Validar:
- BTC
- ETH
- Forex EUR
- Forex GBP
- Gold
- Risk Reviewer
- Trading Coordinator

Não executar ordens financeiras.

### Entrega 3.4 — Publicação

- Atualizar Dockerfile.
- Atualizar `stack.yml`.
- Executar testes.
- Publicar imagem `2.0.0`.
- Implantar pelo Portainer.
- Validar os personagens no domínio existente.
- Preservar a possibilidade de voltar à imagem `1.0.0`.

---

## 14. Fora de escopo

Nesta fase, não implementar:

- Novo escritório 3D.
- Dashboards financeiros.
- Novas mesas e cadeiras.
- Execução de ordens.
- Alterações no Market Data Service.
- Novos agentes OpenClaw.
- Nova stack visual.
- Novo domínio.
- Reescrita completa do Pixel Agents.

---

## 15. Definição de pronto

A Etapa 3 estará concluída somente quando os sete agentes reais estiverem representados por personagens nativos do Pixel Agents, com identidade persistente e estados atualizados por eventos reais recebidos do `openclaw-pixel-adapter`.

A conclusão exige teste integrado em ambiente Docker Swarm.

Testes unitários aprovados, isoladamente, não significam que a etapa esteja concluída.
