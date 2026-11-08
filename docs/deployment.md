# Publicação e rollback

Todos os passos abaixo têm efeito externo (GHCR, Swarm, Portainer) e só devem ser executados com confirmação explícita do responsável. Se algum critério falhar, pare e relate; não improvise correção em produção.

A tag git `vX.Y.Z` publica a imagem `ghcr.io/wrpaiva/pixel-agents-trading:X.Y.Z`. A tag `1.0.0` nunca é reescrita: é o caminho de rollback.

Digest da 1.0.0 em produção: `ghcr.io/wrpaiva/pixel-agents-trading:1.0.0@sha256:e4de71de183ffeb56490611bfe8f30d0b846d5a6fa5dcf1420efc3cd1dd7997e` (anotado em 2026-11-07)
Hash do `layout.json` em produção (antes da 2.0.0): `…`
Resultado do teste de rollback (data e saída): `…`

(Os campos acima são preenchidos no momento do deploy.)

## 1. Pré-requisitos

1. Código revisado e na `main`, com o CI verde.
2. Registre o digest atual (caminho de rollback). Na VPS:

   ```bash
   docker service inspect pixel-agents_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
   CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
   docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json
   ```

   Anote o digest `ghcr.io/wrpaiva/pixel-agents-trading:1.0.0@sha256:…` e o hash do layout neste arquivo e faça commit.
3. Atualize o `openclaw-pixel-adapter` (`main`, com o commit de `tool_start`/`seq`) no ambiente, receptor e plugin, seguindo o README do adapter. Isso precisa vir primeiro: só depois dele existem `tool_start` e `seq`. Confira o nome dos hooks com `openclaw plugins inspect pixel-events --runtime --json` e o resultado com:

   ```bash
   docker exec $(docker ps -q -f label=com.docker.swarm.service.name=pixel-events_receiver | head -n1) \
     node -e "fetch('http://127.0.0.1:3188/agents',{headers:{authorization:'Bearer '+require('fs').readFileSync('/run/secrets/pixel_events_token','utf8').trim()}}).then(r=>r.json()).then(j=>console.log(j.agents.map(a=>a.agentId+':'+a.seq).join(' ')))"
   ```

   Esperado: os 7 agentes, cada um com `seq` numérico. Se o receptor ainda lê o token de variável de ambiente, adapte o comando; nunca imprima o token.
4. Crie o secret e confira a rede:

   ```bash
   docker network inspect trading_internal --format '{{.Name}} {{.Driver}} attachable={{.Attachable}}'
   docker secret ls | grep pixel_events_token || printf '%s' "<mesmo token do receptor>" | docker secret create pixel_events_token -
   ```

   O token é o mesmo do receptor. Nunca o grave em arquivo versionado nem o cole em chat.
5. Publique a imagem:

   ```bash
   git tag v2.0.0 && git push origin main v2.0.0
   gh run watch $(gh run list --workflow "Publish Pixel Agents Trading" --limit 1 --json databaseId -q '.[0].databaseId')
   ```

   Esperado: jobs `test`, `e2e` e `docker` verdes e `ghcr.io/wrpaiva/pixel-agents-trading:2.0.0` publicado. O digest da `1.0.0` deve continuar igual ao anotado.

## 2. Canário

Valida a 2.0.0 contra o receptor real antes de trocar a produção. A stack não tem Traefik, não publica porta e usa o volume separado `pixel_agents_canary_data`.

```bash
docker stack deploy -c stack.canary.yml pixel-agents-canary
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents-canary_web | head -n1)
docker logs "$CID" 2>&1 | grep '\[trading\]'
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 5
```

Esperado: o log mostra `Trading Room ativa` e nenhum `conexão ... perdida` em sequência; o smoke diz "OK: 7 agentes presentes", sem `main`.

Peça uma única análise controlada em paper trading do `crypto-btc` e rode, durante ela:

```bash
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 180
```

Esperado, só para o BTC Analyst: `Analisando` → `Ferramenta: <nome>` → `agentStatus waiting` → `agentStatus idle`. Nenhum outro agente muda. Depois: `docker stack rm pixel-agents-canary`.

## 3. Produção

No Portainer, atualize a stack `pixel-agents` com o `stack.yml` novo (`PIXEL_AGENTS_TAG` vazio, ou seja, a versão padrão do `stack.yml`; mantenha `PIXEL_AUTH_USERS`). Pela linha de comando, no manager:

```bash
PIXEL_AUTH_USERS='usuario:$apr1$...' docker stack deploy -c stack.yml pixel-agents
```

Sem `PIXEL_AUTH_USERS`, o label de basic auth fica vazio, o Traefik descarta a rota e `ag.waurumai.com` responde `404 page not found`. Os `$` do hash vão simples, porque o valor vem do ambiente e não do YAML. Confira o label depois do deploy:

```bash
docker service inspect pixel-agents_web --format '{{index .Spec.Labels "traefik.http.middlewares.pixel-agents-auth.basicauth.users"}}' | sed 's/:.*/:<hash>/'
```

Depois:

```bash
docker service ls --filter name=pixel-agents_web   # REPLICAS 1/1
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json   # igual ao anotado
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 5
curl -s -o /dev/null -w '%{http_code}\n' https://ag.waurumai.com/          # 401 sem credenciais
docker service inspect pixel-events_receiver --format '{{json .Endpoint.Ports}}'   # esperado: null ou []
docker service inspect pixel-events_receiver --format '{{json .Spec.Labels}}'       # não pode conter traefik.enable=true
```

## 4. Validação

No navegador (`https://ag.waurumai.com`, com basic auth):

- 7 personagens com nomes e nenhum `main`. Com a Trading Room carregada (seção 6), cada um no banco da sua estação.
- Recarregar a página não duplica personagens.
- Uma análise real muda só o agente certo.
- Reiniciar o receptor (`docker service update --force pixel-events_receiver`) mostra "Sem conexão" depois de cerca de 30 s e volta sozinho.
- O código-fonte da página não contém o token: `curl -s -u <user> https://ag.waurumai.com/ | grep -c pixel_events` deve dar 0.

O layout de produção mora no volume `pixel_agents_data`. Para trocá-lo pela Trading Room, use a seção 6.

## 5. Rollback

No Portainer, defina `PIXEL_AGENTS_TAG=1.0.0` (ou use o digest anotado no topo deste arquivo) e atualize a stack. A 1.0.0 ignora o secret e a rede extra, então o mesmo `stack.yml` serve. Confirme:

```bash
docker service ls --filter name=pixel-agents_web   # REPLICAS 1/1
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json   # igual ao anotado
```

**Limpeza obrigatória.** A 2.0.0 persiste os agentes 9001–9007 em `~/.pixel-agents/standalone-state.json` e cria marcadores em `~/.pixel-agents/openclaw/*.jsonl`, ambos no volume compartilhado. A 1.0.0 (upstream puro) restaura todo agente externo persistido cujo jsonl exista, então sem limpeza o escritório "antigo" mostraria 7 personagens ociosos permanentes. Com a 1.0.0 em `1/1`:

```bash
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" rm -rf /home/node/.pixel-agents/openclaw
docker service update --force pixel-agents_web
```

O upstream ignora agentes cujo arquivo sumiu e regrava o estado sem eles. Recarregue a página e confirme que nenhum personagem do OpenClaw permanece. Ao voltar para a 2.0.0, os marcadores são recriados automaticamente.

Só então o escritório antigo está de volta. O healthcheck do `stack.yml` usa `/api/health`, que a 1.0.0 (`pixel-agents` 1.5.0 do npm) expõe; confirme isso no teste de rollback, pois um healthcheck falho faz o Swarm reverter a atualização (`failure_action: rollback`). Para voltar, remova `PIXEL_AGENTS_TAG` (2.0.0) e confirme `1/1` de novo. Registre o resultado e a data no topo deste arquivo e faça commit.

## 6. Carregar a Trading Room

O servidor lê `/home/node/.pixel-agents/layout.json` a cada conexão de navegador, então não é preciso reiniciar o serviço. O arquivo do repositório tem `layoutRevision: 1`; sem isso, o upstream poderia trocá-lo pelo layout padrão. Cada banco `seat-<agente>` do layout é a cadeira fixa do agente (a partir da 2.1.0).

Na VPS, a partir de uma cópia atualizada deste repositório:

```bash
cd /opt/pixel-agents-trading && git pull
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
STAMP=$(date +%Y%m%d-%H%M%S)

# 1. Backup do layout atual (pode não existir: nesse caso o app usa o padrão do pacote)
docker exec "$CID" sh -c "cp /home/node/.pixel-agents/layout.json /home/node/.pixel-agents/layout.backup-$STAMP.json && echo backup ok || echo 'sem layout.json: o escritório usava o padrão'"

# 2. Copia a Trading Room e troca de forma atômica
docker cp trading-room/layout.json "$CID":/home/node/.pixel-agents/layout.json.new
docker exec -u root "$CID" chown node:node /home/node/.pixel-agents/layout.json.new
docker exec "$CID" mv /home/node/.pixel-agents/layout.json.new /home/node/.pixel-agents/layout.json
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json
sha256sum trading-room/layout.json   # os dois hashes devem ser iguais
```

Recarregue `https://ag.waurumai.com`: a sala 30x20 aparece, com os 7 agentes nas suas estações. Para desfazer, copie o backup de volta para `layout.json` com o mesmo `cp` dentro do container, ou apague `layout.json` para voltar ao padrão do pacote, e recarregue a página.

Não rode `criar-trading-room.sh` na VPS: ele regera o arquivo do repositório, não o do volume.

## Definição de pronto

A etapa só está concluída quando canário, produção e rollback passarem no Swarm. Relate o que foi validado, com as saídas do smoke e o resultado do rollback.
