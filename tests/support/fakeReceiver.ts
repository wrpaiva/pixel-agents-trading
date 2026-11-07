// SOMENTE PARA TESTES. Reproduz o contrato HTTP/SSE de openclaw-pixel-adapter/receiver/server.mjs
// para exercitar o cliente sem Docker. Nunca é empacotado nem usado em produção.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { TRADING_AGENTS } from '../../src/trading/config/agents.js';

const STATES: Record<string, string> = {
  model_start: 'analisando',
  model_end: 'aguardando',
  tool_start: 'ferramenta',
  tool_end: 'ferramenta_concluida',
  agent_end: 'ocioso',
};

export interface FakeReceiver {
  url: string;
  emit(event: { agentId: string; type: string; toolName?: string | null; sessionKey?: string; failed?: boolean }): void;
  dropClients(): void;
  readonly clientCount: number;
  close(): Promise<void>;
}

export async function startFakeReceiver({ token }: { token: string }): Promise<FakeReceiver> {
  const agents = TRADING_AGENTS.map((d) => ({
    agentId: d.agentId,
    state: 'ocioso',
    lastEvent: null,
    lastSeen: null,
    sessionKey: null,
    toolName: null,
    count: 0,
    seq: 0,
  }));
  const clients = new Set<http.ServerResponse>();
  let seq = 0;
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end('{"error":"unauthorized"}');
      return;
    }
    if (req.url === '/agents') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ agents }));
      return;
    }
    if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ agents })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const dropClients = () => {
    for (const client of clients) client.destroy();
    clients.clear();
  };

  return {
    url,
    emit({ agentId, type, toolName = null, sessionKey = `agent:${agentId}:main`, failed = false }) {
      const record = {
        agentId,
        state: type === 'agent_end' && failed ? 'erro' : STATES[type],
        type,
        sessionKey,
        toolName,
        timestamp: new Date().toISOString(),
        receivedAt: Date.now(),
        seq: ++seq,
      };
      const agent = agents.find((a) => a.agentId === agentId);
      if (agent) Object.assign(agent, { state: record.state, lastEvent: type, lastSeen: record.timestamp, sessionKey, toolName, count: agent.count + 1, seq });
      for (const client of clients) client.write(`event: activity\ndata: ${JSON.stringify(record)}\n\n`);
    },
    dropClients,
    get clientCount() {
      return clients.size;
    },
    close: async () => {
      dropClients();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
