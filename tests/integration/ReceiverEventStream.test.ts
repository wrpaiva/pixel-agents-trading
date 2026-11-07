import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { TradingAgentEvent } from '../../src/trading/domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../../src/trading/domain/TradingAgentSnapshot.js';
import { ReceiverApiClient } from '../../src/trading/infrastructure/ReceiverApiClient.js';
import { ReceiverEventStream } from '../../src/trading/infrastructure/ReceiverEventStream.js';
import { type FakeReceiver, startFakeReceiver } from '../support/fakeReceiver.js';
import { waitFor } from '../support/waitFor.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const quiet = { info: () => {}, warn: () => {} };
let fake: FakeReceiver | undefined;
let stream: ReceiverEventStream | undefined;
let silent: http.Server | undefined;

afterEach(async () => {
  await stream?.stop();
  await fake?.close();
  if (silent) {
    silent.closeAllConnections();
    await new Promise((resolve) => silent!.close(resolve));
  }
  silent = undefined;
  stream = fake = undefined;
});

function collect() {
  const snapshots: TradingAgentSnapshot[][] = [];
  const events: TradingAgentEvent[] = [];
  const lost: string[] = [];
  return {
    snapshots,
    events,
    lost,
    handlers: {
      onSnapshot: (s: TradingAgentSnapshot[]) => snapshots.push(s),
      onEvent: (e: TradingAgentEvent) => events.push(e),
      onConnectionLost: (r: string) => lost.push(r),
    },
  };
}

describe('ReceiverEventStream', () => {
  it('recebe snapshot e depois eventos de atividade', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet });
    stream.start();
    await waitFor(() => c.snapshots.length === 1 && fake!.clientCount === 1);
    expect(c.snapshots[0]).toHaveLength(7);
    fake.emit({ agentId: 'crypto-btc', type: 'tool_start', toolName: 'web_search' });
    await waitFor(() => c.events.length === 1);
    expect(c.events[0]).toMatchObject({ agentId: 'crypto-btc', eventType: 'tool_start', toolName: 'web_search', seq: 1 });
  });

  it('reconecta após queda e recebe um snapshot novo', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.snapshots.length === 1);
    fake.dropClients();
    await waitFor(() => c.lost.length === 1 && c.snapshots.length === 2);
  });

  it('token errado: relata a perda e continua tentando', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: 'x'.repeat(30) }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.lost.length >= 2);
    expect(c.lost[0]).toContain('401');
    expect(c.lost.join(' ')).not.toContain('x'.repeat(30));
  });

  it('conexão silenciosa além de idleTimeoutMs é reaberta', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10, idleTimeoutMs: 100 });
    stream.start();
    await waitFor(() => c.snapshots.length >= 2);
    expect(c.lost[0]).toMatch(/sem dados/);
  });

  it('stop encerra sem novas tentativas', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.snapshots.length === 1);
    await stream.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(c.lost).toEqual([]);
    expect(fake.clientCount).toBe(0);
  });

  it('handler onConnectionLost que lança não derruba o loop de reconexão', async () => {
    fake = await startFakeReceiver({ token: TOKEN });
    const c = collect();
    const handlers = { ...c.handlers, onConnectionLost: () => { throw new Error('boom'); } };
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: fake.url, token: TOKEN }), handlers, logger: quiet, initialBackoffMs: 10 });
    stream.start();
    await waitFor(() => c.snapshots.length === 1);
    fake.dropClients();
    await waitFor(() => c.snapshots.length === 2);
  });

  it('servidor que aceita a conexão mas nunca responde é abortado pelo idle timeout', async () => {
    silent = http.createServer(() => {});
    await new Promise<void>((resolve) => silent!.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(silent.address() as AddressInfo).port}`;
    const c = collect();
    stream = new ReceiverEventStream({ client: new ReceiverApiClient({ baseUrl: url, token: TOKEN }), handlers: c.handlers, logger: quiet, initialBackoffMs: 10, idleTimeoutMs: 100 });
    stream.start();
    await waitFor(() => c.lost.length >= 1);
    expect(c.lost[0]).toMatch(/sem dados/);
  });
});
