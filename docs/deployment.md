# Publicação e rollback

Todos os passos abaixo têm efeito externo (GHCR, Swarm, Portainer) e só devem ser executados com confirmação explícita do responsável. Se algum critério falhar, pare e relate; não improvise correção em produção.

A tag git `vX.Y.Z` publica a imagem `ghcr.io/wrpaiva/pixel-agents-trading:X.Y.Z`. A tag `1.0.0` nunca é reescrita: é o caminho de rollback.

Digest da 1.0.0 em produção: `sha256:…`
Hash do `layout.json` em produção (antes da 2.0.0): `…`
Resultado do teste de rollback (data e saída): `…`

(Os campos acima são preenchidos no momento do deploy.)

## 1. Pré-requisitos

1. Branch revisado e mergeado em `main`. Confirme que o layout não entrou em nenhum commit: `git diff main...feat/etapa3-openclaw --stat -- criar-trading-room.sh trading-room/` deve vir vazio.
2. Registre o digest atual (caminho de rollback). Na VPS:

   ```bash
   docker service inspect pixel-agents_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
   CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
   docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json
   ```

   Anote o digest `ghcr.io/wrpaiva/pixel-agents-trading:1.0.0@sha256:…` e o hash do layout neste arquivo e faça commit.
3. Atualize o `openclaw-pixel-adapter` (branch `feat/tool-start-seq`) no ambiente, receptor e plugin, seguindo o README do adapter. Isso precisa vir primeiro: só depois dele existem `tool_start` e `seq`. Confira o nome dos hooks com `openclaw plugins inspect pixel-events --runtime --json` e o resultado com:

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

No Portainer, atualize a stack `pixel-agents` com o `stack.yml` novo (`PIXEL_AGENTS_TAG` vazio, ou seja, `2.0.0`; mantenha `PIXEL_AUTH_USERS`). Depois:

```bash
docker service ls --filter name=pixel-agents_web   # REPLICAS 1/1
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json   # igual ao anotado
docker exec "$CID" node /opt/trading/smoke-ws.mjs ws://127.0.0.1:3100/ws 5
curl -s -o /dev/null -w '%{http_code}\n' https://ag.waurumai.com/          # 401 sem credenciais
curl -s -o /dev/null -w '%{http_code}\n' http://pixel-events_receiver:3188/agents 2>/dev/null || echo "receptor inacessível de fora (esperado)"
```

## 4. Validação

No navegador (`https://ag.waurumai.com`, com basic auth):

- 7 personagens com nomes, layout original intacto e nenhum `main`.
- Recarregar a página não duplica personagens.
- Uma análise real muda só o agente certo.
- Reiniciar o receptor (`docker service update --force pixel-events_receiver`) mostra "Sem conexão" depois de cerca de 30 s e volta sozinho.
- O código-fonte da página não contém o token: `curl -s -u <user> https://ag.waurumai.com/ | grep -c pixel_events` deve dar 0.

O layout de produção mora no volume `pixel_agents_data`. Não rode `criar-trading-room.sh` nesta etapa.

## 5. Rollback

No Portainer, defina `PIXEL_AGENTS_TAG=1.0.0` (ou use o digest anotado no topo deste arquivo) e atualize a stack. A 1.0.0 ignora o secret e a rede extra, então o mesmo `stack.yml` serve. Confirme:

```bash
docker service ls --filter name=pixel-agents_web   # REPLICAS 1/1
CID=$(docker ps -q -f label=com.docker.swarm.service.name=pixel-agents_web | head -n1)
docker exec "$CID" sha256sum /home/node/.pixel-agents/layout.json   # igual ao anotado
```

O escritório antigo deve abrir. O healthcheck do `stack.yml` usa `/api/health`, que a 1.0.0 (`pixel-agents` 1.5.0 do npm) expõe; confirme isso no teste de rollback, pois um healthcheck falho faz o Swarm reverter a atualização (`failure_action: rollback`). Para voltar, remova `PIXEL_AGENTS_TAG` (2.0.0) e confirme `1/1` de novo. Registre o resultado e a data no topo deste arquivo e faça commit.

## Definição de pronto

A etapa só está concluída quando canário, produção e rollback passarem no Swarm. Relate o que foi validado, com as saídas do smoke e o resultado do rollback.
