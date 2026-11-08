import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TRADING_AGENTS } from '../../src/trading/config/agents.js';

const root = new URL('../../', import.meta.url).pathname;
const layout = JSON.parse(readFileSync(join(root, 'trading-room/layout.json'), 'utf-8')) as {
  cols: number;
  rows: number;
  layoutRevision?: number;
  furniture: Array<{ uid: string; type: string }>;
};

/** Ids de móveis cuja categoria é "chairs" nos assets do upstream. */
function chairTypes(): Set<string> {
  const dir = join(root, 'vendor/pixel-agents/webview-ui/public/assets/furniture');
  const ids = new Set<string>();
  const walk = (node: unknown, inheritedChair: boolean): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const isChair = inheritedChair || obj.category === 'chairs';
    if (isChair && typeof obj.id === 'string') ids.add(obj.id);
    for (const value of Object.values(obj)) walk(value, isChair);
  };
  for (const folder of readdirSync(dir)) {
    try {
      walk(JSON.parse(readFileSync(join(dir, folder, 'manifest.json'), 'utf-8')), false);
    } catch {
      // pasta sem manifest
    }
  }
  return ids;
}

describe('trading-room/layout.json', () => {
  it('tem revisão >= 1, para o servidor não trocar pelo layout padrão', () => {
    expect(layout.layoutRevision ?? 0).toBeGreaterThanOrEqual(1);
    expect([layout.cols, layout.rows]).toEqual([30, 20]);
  });

  it('cada agente tem seu banco no layout, e o banco é um assento', () => {
    const chairs = chairTypes();
    for (const def of TRADING_AGENTS) {
      const item = layout.furniture.find((f) => f.uid === def.seatId);
      expect(item, def.seatId).toBeDefined();
      expect(chairs.has(item!.type.replace(/:left$/, '')), `${def.seatId} (${item!.type})`).toBe(true);
    }
  });
});
