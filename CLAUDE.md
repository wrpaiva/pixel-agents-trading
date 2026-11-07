# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A deployment wrapper around the upstream `pixel-agents` npm package (it is not a fork — there is no app source here), plus a custom "trading room" office layout for it. There's no build system, no tests and no linter. The parts are:

- `Dockerfile`: installs `pixel-agents` globally on `node:22-bookworm-slim` and runs `pixel-agents --host 0.0.0.0 --port 3100 --no-terminal` as user `node`.
- `.github/workflows/docker-publish.yml`: builds and pushes `ghcr.io/wrpaiva/pixel-agents-trading:1.0.0` on `v*` tags or a manual dispatch. **The tag is hardcoded to `1.0.0`**, so every publish overwrites that tag. `stack.yml` pins the same tag.
- `stack.yml`: a Docker Swarm stack (service `web`, deployed as stack `pixel-agents`, so the service is named `pixel-agents_web`). It is pinned to node `waurumai` on the external network `waurumai_net`. Traefik serves it at `ag.waurumai.com` over TLS (letsencrypt), with basic auth from the `PIXEL_AUTH_USERS` env var, which must be set when you deploy. App data lives in the volume `pixel_agents_data` mounted at `/home/node/.pixel-agents`.
- `trading-room/`: office layout JSON files in the pixel-agents layout format.

## Commands

```bash
# Regenerate trading-room/layout.json (furniture + areas); prints TRADING_ROOM_ATUALIZADA on success
./criar-trading-room.sh

# Build the image locally / run it
docker build -t pixel-agents-trading .
docker run --rm -p 3100:3100 pixel-agents-trading

# Deploy to the swarm (on the manager)
PIXEL_AUTH_USERS='user:$$apr1$$...' docker stack deploy -c stack.yml pixel-agents
```

## Layout generation (`criar-trading-room.sh`)

- If a running `pixel-agents_web` container is found, the script first copies the package's built-in `dist/assets/default-layout-1.json` into `trading-room/default.json`. That file is only a format and furniture-type reference (21x22) and is never deployed.
- The embedded Python script **reads the existing `trading-room/layout.json` and keeps its `tiles`/`tileColors`** (floor and walls, drawn in the pixel-agents editor). It **overwrites** `furniture`, `areas` and `areaTiles`. It refuses to run unless the layout is exactly 30x20.
- So floor and wall changes are made in the app's editor and exported into `layout.json`. Furniture and area changes belong in the script; hand edits to those fields in `layout.json` get lost the next time the script runs.
- Grid conventions: `tiles`/`areaTiles` are flat row-major arrays (`index = row * cols + col`). Tile value `255` is void and `0` is wall; other values are floor variants. Furniture items are `{uid, type, col, row}`. `type` is a pixel-agents asset name such as `DESK_FRONT`, `PC_BACK` or `CUSHIONED_BENCH`, and a `:left` suffix mirrors it.
- Each workstation is a desk, a PC and a seat, with the uid suffix equal to the agent/area label: `crypto-btc`, `crypto-eth`, `forex-eur`, `forex-gbp`, `gold-analyst`, `risk-reviewer` and `trading-coordinator`. In the "pit", the north row faces south toward its desks (`PC_FRONT_OFF`), and the south row is mirrored (`PC_BACK`, bench on the corridor side). The coordinator sits at a side desk (`DESK_SIDE`/`PC_SIDE`) in the command room.
- The script only writes the file and never touches the running service ("Nenhum serviço foi alterado"). Nothing in the repo copies `layout.json` into the container or volume, so loading it into the app is a separate manual step.

Code comments and script output are in Portuguese; keep that convention.
