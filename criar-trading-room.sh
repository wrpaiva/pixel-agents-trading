#!/usr/bin/env bash
set -euo pipefail

mkdir -p trading-room

CID=$(docker ps -q \
  --filter "label=com.docker.swarm.service.name=pixel-agents_web" \
  | head -n1 || true)

if [[ -n "${CID}" ]]; then
  docker cp \
    "$CID":/usr/local/lib/node_modules/pixel-agents/dist/assets/default-layout-1.json \
    trading-room/default.json
fi

python3 - <<'PY'
import json
from pathlib import Path

base = Path("trading-room")
layout_path = base / "layout.json"
if not layout_path.exists():
    raise SystemExit("trading-room/layout.json não encontrado. Piso e paredes precisam existir.")

layout = json.loads(layout_path.read_text())
cols, rows = layout["cols"], layout["rows"]
if cols != 30 or rows != 20:
    raise SystemExit(f"Layout inesperado {cols}x{rows}; esperado 30x20.")

def item(uid, type_, col, row):
    return {"uid": uid, "type": type_, "col": col, "row": row}

# Pit: fileira norte encostada na parede (agentes olham para a mesa, costas para o corredor).
# Fileira sul invertida (banco no corredor, mesa ao sul) — os dois times se encaram no corredor.
north = [
    ("crypto-btc", 2),
    ("crypto-eth", 8),
    ("forex-eur", 14),
]
south = [
    ("forex-gbp", 2),
    ("gold-analyst", 8),
    ("risk-reviewer", 14),
]

furniture = []

for name, col in north:
    furniture += [
        item(f"desk-{name}", "DESK_FRONT", col, 3),
        item(f"pc-{name}", "PC_FRONT_OFF", col + 1, 3),
        item(f"seat-{name}", "CUSHIONED_BENCH", col + 1, 5),
    ]

for name, col in south:
    furniture += [
        item(f"desk-{name}", "DESK_FRONT", col, 9),
        item(f"pc-{name}", "PC_BACK", col + 1, 9),
        item(f"seat-{name}", "CUSHIONED_BENCH", col + 1, 8),
    ]

# Uma mesa no comando, de lado, olhando o pit pela porta (cols 20, rows 8-11).
furniture += [
    item("desk-trading-coordinator", "DESK_SIDE", 21, 7),
    item("pc-trading-coordinator", "PC_SIDE", 21, 8),
    item("seat-trading-coordinator", "CUSHIONED_BENCH", 22, 9),
]

furniture += [
    item("meeting-table", "TABLE_FRONT", 8, 14),
    item("meeting-coffee", "COFFEE", 9, 15),
    item("meeting-chair-1", "WOODEN_CHAIR_SIDE", 7, 16),
    item("meeting-chair-2", "WOODEN_CHAIR_SIDE:left", 11, 16),
    item("lounge-sofa-front", "SOFA_FRONT", 24, 12),
    item("lounge-table", "COFFEE_TABLE", 24, 13),
    item("lounge-coffee", "COFFEE", 24, 14),
    item("lounge-sofa-back", "SOFA_BACK", 24, 15),
    item("kitchen-table", "SMALL_TABLE_FRONT", 25, 17),
    item("kitchen-coffee", "COFFEE", 25, 17),
    item("kitchen-bin", "BIN", 28, 19),
    item("plant-ops-corner", "PLANT", 19, 2),
    item("plant-ops-left", "PLANT_2", 1, 13),
    item("plant-ops-large", "LARGE_PLANT", 17, 16),
    item("plant-cmd", "CACTUS", 28, 7),
    item("plant-kitchen", "PLANT_2", 21, 16),
    item("ops-bin", "BIN", 1, 19),
    item("wall-hplant-1", "HANGING_PLANT", 1, 0),
    item("wall-books-1", "DOUBLE_BOOKSHELF", 3, 0),
    item("wall-clock", "CLOCK", 6, 0),
    item("wall-painting", "LARGE_PAINTING", 9, 0),
    item("wall-board-ops", "WHITEBOARD", 12, 0),
    item("wall-books-2", "DOUBLE_BOOKSHELF", 15, 0),
    item("wall-hplant-2", "HANGING_PLANT", 18, 0),
    item("wall-small-1", "SMALL_PAINTING", 21, 0),
    item("wall-board-cmd", "WHITEBOARD", 23, 0),
    item("wall-small-2", "SMALL_PAINTING_2", 28, 0),
]

areas = [
    {"label": "crypto-btc", "color": "#f7931a"},
    {"label": "crypto-eth", "color": "#627eea"},
    {"label": "forex-eur", "color": "#003399"},
    {"label": "forex-gbp", "color": "#c8102e"},
    {"label": "gold-analyst", "color": "#d4af37"},
    {"label": "risk-reviewer", "color": "#8b5cf6"},
    {"label": "trading-coordinator", "color": "#10b981"},
]

area_tiles = [None] * (cols * rows)

def paint(label, col0, col1, row0, row1):
    for r in range(row0, row1 + 1):
        for c in range(col0, col1 + 1):
            area_tiles[r * cols + c] = label

paint("crypto-btc", 2, 4, 3, 5)
paint("crypto-eth", 8, 10, 3, 5)
paint("forex-eur", 14, 16, 3, 5)
paint("forex-gbp", 2, 4, 8, 10)
paint("gold-analyst", 8, 10, 8, 10)
paint("risk-reviewer", 14, 16, 8, 10)
paint("trading-coordinator", 21, 23, 7, 10)

layout["furniture"] = furniture
layout["areas"] = areas
layout["areaTiles"] = area_tiles
layout.setdefault("pets", [])

layout_path.write_text(json.dumps(layout, indent=2) + "\n")

print("TRADING_ROOM_ATUALIZADA")
print("Dimensões: 30 x 20")
print("Estações: 7 (6 no pit + coordenador)")
print("Areas:", ", ".join(a["label"] for a in areas))
print("Arquivo:", layout_path)
PY

echo "Layout gerado. Nenhum serviço foi alterado."
