import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerTradingProvider, type TradingRoomHandle } from '../../src/trading/bootstrap/registerTradingProvider.js';
import { addActivityReplayer } from '../../vendor/pixel-agents/server/src/activityReplayers.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';
import { type FakeReceiver, startFakeReceiver } from '../support/fakeReceiver.js';
import { waitFor } from '../support/waitFor.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const warnings: string[] = [];
const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
let dir: string;
let store: AgentStateStore;
let broadcasts: Array<Record<string, unknown>>;
let fake: FakeReceiver | undefined;
let handle: TradingRoomHandle | undefined;

const statusOf = (id: number) => store.get(id)?.activeToolStatuses.get('openclaw-activity');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trading-boot-'));
  writeFileSync(join(dir, 'token'), `${TOKEN}\n`);
  store = new AgentStateStore();
  broadcasts = [];
  store.on('broadcast', (m) => broadcasts.push(m));
  warnings.length = 0;
});
afterEach(async () => {
  await handle?.stop();
  await fake?.close();
  handle = fake = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const env = (url: string) => ({
  PIXEL_EVENTS_RECEIVER_URL: url,
  PIXEL_EVENTS_TOKEN_FILE: join(dir, 'token'),
  PIXEL_EVENTS_DISCONNECT_AFTER_MS: '50',
  PIXEL_EVENTS_RETRY_MS: '10',
});

describe('registerTradingProvider', () => {
  it('ponta a ponta: snapshot → idle; model_start real → crypto-btc ativo', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(fake.url), logger });
    expect(store.size).toBe(7);
    await waitFor(() => fake!.clientCount === 1 && statusOf(9002) === undefined);
    fake.emit({ agentId: 'crypto-btc', type: 'model_start' });
    await waitFor(() => statusOf(9002) === 'Analisando');
    expect(broadcasts).toContainEqual({ type: 'agentStatus', id: 9002, status: 'active' });
    expect(statusOf(9003)).toBeUndefined();
  });

  it('o agente main é ignorado', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(fake.url), logger });
    await waitFor(() => fake!.clientCount === 1);
    fake.emit({ agentId: 'main', type: 'model_start' });
    await waitFor(() => warnings.some((w) => w.includes('"main"')));
    expect(store.size).toBe(7);
  });

  it('receptor fora do ar além do limite: todos "Sem conexão"', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const url = fake.url;
    handle = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: env(url), logger });
    await waitFor(() => fake!.clientCount === 1 && statusOf(9001) === undefined);
    await fake.close();
    fake = undefined;
    await waitFor(() => statusOf(9001) === 'Sem conexão com o receptor');
  });

  it('sem token: personagens aparecem desconectados e o token não vaza nos logs', () => {
    handle = registerTradingProvider({
      store,
      addReplayer: addActivityReplayer,
      dataDir: dir,
      env: { PIXEL_EVENTS_TOKEN_FILE: join(dir, 'inexistente') },
      logger,
    });
    expect(store.size).toBe(7);
    expect(statusOf(9005)).toBe('Sem conexão com o receptor');
    expect(warnings.some((w) => w.includes('token'))).toBe(true);
    expect(warnings.join(' ')).not.toContain(TOKEN);
  });

  it('falha ao compor no boot: não lança, avisa "desativada" e stop() resolve', async () => {
    writeFileSync(join(dir, 'openclaw'), 'arquivo, não diretório');
    let result: TradingRoomHandle | undefined;
    expect(() => {
      result = registerTradingProvider({ store, addReplayer: addActivityReplayer, dataDir: dir, env: { PIXEL_EVENTS_TOKEN_FILE: join(dir, 'token') }, logger });
    }).not.toThrow();
    expect(warnings.some((w) => w.includes('desativada'))).toBe(true);
    expect(warnings.join(' ')).not.toContain(TOKEN);
    await expect(result!.stop()).resolves.toBeUndefined();
  });
});
