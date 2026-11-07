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
