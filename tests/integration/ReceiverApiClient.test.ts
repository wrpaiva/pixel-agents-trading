import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseActivityPayload,
  ReceiverApiClient,
  ReceiverError,
} from '../../src/trading/infrastructure/ReceiverApiClient.js';

const TOKEN = 'test-test-test-test-test-test-12345678';
const fixture = readFileSync(new URL('../fixtures/receiver-agents.json', import.meta.url), 'utf8');
let server: http.Server | undefined;

async function serve(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

describe('ReceiverApiClient.getAgents', () => {
  it('lê a resposta real do receptor com Bearer token', async () => {
    let auth: string | undefined;
    const baseUrl = await serve((req, res) => {
      auth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' }).end(fixture);
    });
    const agents = await new ReceiverApiClient({ baseUrl: `${baseUrl}/`, token: TOKEN }).getAgents();
    expect(auth).toBe(`Bearer ${TOKEN}`);
    expect(agents).toHaveLength(7);
    expect(agents[1]).toEqual({
      agentId: 'crypto-btc',
      receiverState: 'ocioso',
      lastEvent: 'model_end',
      lastSeen: '2026-11-04T01:53:15.504Z',
      sessionKey: 'agent:crypto-btc:main',
      toolName: null,
      count: 6,
      seq: null,
    });
  });

  it('401 vira ReceiverError sem vazar o token', async () => {
    const baseUrl = await serve((_req, res) => res.writeHead(401).end('{"error":"unauthorized"}'));
    const error = await new ReceiverApiClient({ baseUrl, token: TOKEN }).getAgents().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReceiverError);
    expect((error as ReceiverError).status).toBe(401);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it('payload sem "agents" vira ReceiverError', async () => {
    const baseUrl = await serve((_req, res) => res.writeHead(200).end('{"ok":true}'));
    await expect(new ReceiverApiClient({ baseUrl, token: TOKEN }).getAgents()).rejects.toBeInstanceOf(ReceiverError);
  });

  it('timeout vira erro (não trava o boot)', async () => {
    const baseUrl = await serve(() => {
      /* nunca responde */
    });
    await expect(new ReceiverApiClient({ baseUrl, token: TOKEN, timeoutMs: 50 }).getAgents()).rejects.toThrow();
  });
});

describe('parseActivityPayload', () => {
  it('mantém só os campos da lista branca (nada de prompts ou resultados)', () => {
    const parsed = parseActivityPayload({
      agentId: 'crypto-btc',
      state: 'ferramenta',
      type: 'tool_start',
      sessionKey: 'agent:crypto-btc:main',
      toolName: 'web_search',
      timestamp: '2026-11-07T12:00:00.000Z',
      receivedAt: 1,
      seq: 9,
      prompt: 'SEGREDO',
      result: { price: 1 },
    });
    expect(parsed).toEqual({
      agentId: 'crypto-btc',
      eventType: 'tool_start',
      timestamp: '2026-11-07T12:00:00.000Z',
      sessionKey: 'agent:crypto-btc:main',
      toolName: 'web_search',
      failed: false,
      seq: 9,
    });
  });
  it('state "erro" vira failed=true', () => {
    expect(parseActivityPayload({ agentId: 'a', type: 'agent_end', state: 'erro', timestamp: 't' })?.failed).toBe(true);
  });
  it('payload incompleto devolve null', () => {
    expect(parseActivityPayload({ agentId: 'a' })).toBeNull();
    expect(parseActivityPayload(null)).toBeNull();
  });
});
