# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Pixel Agents 1.5.0 with a "Trading Room": seven native characters driven by the OpenClaw event receiver. Details are in `docs/architecture.md`, `docs/event-contract.md` and `docs/deployment.md`.

- `vendor/pixel-agents/`: git subtree of the upstream with exactly three patches (marked `pixel-agents-trading patch`): `server/src/activityReplayers.ts` (new), the `replayExtraActivity` call in `clientMessageHandler.ts`, and the `registerTradingProvider` block in `cli.ts` (which also passes `seats: adapter`). After a `git subtree pull`, re-check all three.
- `src/trading/`: the Trading Room (`config`, `domain`, `application`, `infrastructure`, `providers`, `bootstrap`). It is bundled by the upstream's own esbuild (`cli.ts` imports it), so there is no separate build. If setup fails it logs `[trading] Trading Room desativada: ...` and the server keeps running.
- `Dockerfile`: builds the upstream from `vendor/` (with `src/`), installs the packed tarball globally and runs `pixel-agents --host 0.0.0.0 --port 3100 --no-terminal` as user `node`. `scripts/smoke-ws.mjs` is copied to `/opt/trading/`.
- `.github/workflows/`: `test.yml` (typecheck, vitest, upstream server tests, Playwright e2e) and `docker-publish.yml`. **The image tag comes from the git tag**: `v2.0.0` publishes `2.0.0`. `1.0.0` is never rewritten; it is the rollback.
- `stack.yml`: Swarm stack (`pixel-agents`, service `pixel-agents_web`) on node `waurumai`, networks `waurumai_net` and `trading_internal`, secret `pixel_events_token`, Traefik at `ag.waurumai.com` with basic auth from `PIXEL_AUTH_USERS`. Image tag is `PIXEL_AGENTS_TAG` (default `2.1.0`). Data lives in the volume `pixel_agents_data` at `/home/node/.pixel-agents`. `stack.canary.yml` validates a new image without Traefik or ports.
- `trading-room/`: office layout JSON files in the pixel-agents layout format.

## Commands

```bash
npm test                  # vitest (unit + integration)
npm run typecheck
npm run build:vendor      # needed before e2e
npm run e2e               # Playwright
npx vitest run tests/unit/AgentStateMapper.test.ts -t "model_end"   # single test

docker build -t pixel-agents-trading .
docker run --rm -p 3100:3100 pixel-agents-trading

# Regenerate trading-room/layout.json (furniture + areas); prints TRADING_ROOM_ATUALIZADA on success
./criar-trading-room.sh   # local only; loading into production is in docs/deployment.md

# Deploy to the swarm (on the manager)
# single $ in the hash: the value comes from the environment, not from YAML
PIXEL_AUTH_USERS='user:$apr1$...' docker stack deploy -c stack.yml pixel-agents
```

The production layout lives in the `pixel_agents_data` volume (`layout.json`), read on every browser connection. Load `trading-room/layout.json` into it only with the backup procedure in `docs/deployment.md`. Each agent's `seatId` in `src/trading/config/agents.ts` must match a seat uid in that layout (`tests/unit/tradingLayout.test.ts` checks it).

## Layout generation (`criar-trading-room.sh`)

- If a running `pixel-agents_web` container is found, the script first copies the package's built-in `dist/assets/default-layout-1.json` into `trading-room/default.json`. That file is only a format and furniture-type reference (21x22) and is never deployed.
- The embedded Python script **reads the existing `trading-room/layout.json` and keeps its `tiles`/`tileColors`** (floor and walls, drawn in the pixel-agents editor). It **overwrites** `furniture`, `areas` and `areaTiles`. It refuses to run unless the layout is exactly 30x20.
- So floor and wall changes are made in the app's editor and exported into `layout.json`. Furniture and area changes belong in the script; hand edits to those fields in `layout.json` get lost the next time the script runs.
- Grid conventions: `tiles`/`areaTiles` are flat row-major arrays (`index = row * cols + col`). Tile value `255` is void and `0` is wall; other values are floor variants. Furniture items are `{uid, type, col, row}`. `type` is a pixel-agents asset name such as `DESK_FRONT`, `PC_BACK` or `CUSHIONED_BENCH`, and a `:left` suffix mirrors it.
- Each workstation is a desk, a PC and a seat, with the uid suffix equal to the agent/area label: `crypto-btc`, `crypto-eth`, `forex-eur`, `forex-gbp`, `gold-analyst`, `risk-reviewer` and `trading-coordinator`. In the "pit", the north row faces south toward its desks (`PC_FRONT_OFF`), and the south row is mirrored (`PC_BACK`, bench on the corridor side). The coordinator sits at a side desk (`DESK_SIDE`/`PC_SIDE`) in the command room.
- The script only writes the file and never touches the running service ("Nenhum serviço foi alterado"). Nothing in the repo copies `layout.json` into the container or volume automatically; see "Carregar a Trading Room" in `docs/deployment.md`.

Code comments and script output are in Portuguese; keep that convention.
