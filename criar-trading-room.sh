#!/usr/bin/env bash
set -euo pipefail

CID=$(docker ps -q \
  --filter "label=com.docker.swarm.service.name=pixel-agents_web" \
  | head -n1)

test -n "$CID" || {
  echo "Pixel Agents não encontrado"
  exit 1
}

mkdir -p trading-room

docker cp \
  "$CID":/usr/local/lib/node_modules/pixel-agents/dist/assets/default-layout-1.json \
  trading-room/default.json

python3 - <<'PY'
import json
import re
from pathlib import Path
from collections import Counter

base = Path("trading-room")
layout = json.loads((base / "default.json").read_text())

original = layout.get("furniture", [])

def find_item(pattern):
    for item in original:
        if re.search(pattern, str(item.get("type", "")), re.I):
            return item
    return None

desk = find_item(r"DESK")
chair = find_item(r"CHAIR")

if not desk or not chair:
    print("Não foi possível identificar mesa e cadeira no layout original.")
    print("Tipos encontrados:")
    for item in original:
        print(item.get("type"))
    raise SystemExit(1)

cols, rows = layout["cols"], layout["rows"]
tiles = layout["tiles"]

if not isinstance(tiles, list) or len(tiles) != cols * rows:
    raise SystemExit("Formato de tiles não reconhecido. Layout preservado.")

floor = Counter(tiles).most_common(1)[0][0]

# Escritório ampliado.
layout["cols"] = 34
layout["rows"] = 28
layout["tiles"] = [floor] * (34 * 28)

if "tileColors" in layout:
    colors = layout["tileColors"]
    valid = [c for c in colors if c is not None]
    color = valid[0] if valid else None
    layout["tileColors"] = [color] * (34 * 28)

positions = [
    ("trading-coordinator", 14, 20),
    ("crypto-btc",          4, 4),
    ("crypto-eth",         14, 4),
    ("forex-eur",          24, 4),
    ("forex-gbp",           4, 12),
    ("gold-analyst",       14, 12),
    ("risk-reviewer",      24, 12),
]

furniture = []

for agent, x, y in positions:
    d = dict(desk)
    d.update(uid=f"trading-desk-{agent}", col=x, row=y)
    furniture.append(d)

    c = dict(chair)
    c.update(uid=f"trading-chair-{agent}", col=x+1, row=y+3)
    furniture.append(c)

layout["furniture"] = furniture

(base / "layout.json").write_text(
    json.dumps(layout, indent=2) + "\n"
)

print("TRADING_ROOM_GERADA")
print("Dimensões: 34 x 28")
print("Estações:", len(positions))
print("Arquivo:", base / "layout.json")
PY

echo "Layout gerado. Nenhum serviço foi alterado."
