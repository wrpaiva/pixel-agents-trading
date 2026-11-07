import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';

export class ReceiverError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ReceiverError';
  }
}

export interface ReceiverApiClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const str = (value: unknown, max: number): string | null => (typeof value === 'string' ? value.slice(0, max) : null);
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** Converte GET /agents (ou o evento SSE "snapshot") copiando só campos conhecidos. */
export function parseSnapshotPayload(payload: unknown): TradingAgentSnapshot[] {
  const agents = (payload as { agents?: unknown } | null)?.agents;
  if (!Array.isArray(agents)) throw new ReceiverError('Resposta do receptor sem a lista "agents"');
  return agents.flatMap((raw): TradingAgentSnapshot[] => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const agentId = str(r.agentId, 80);
    const receiverState = str(r.state, 40);
    if (!agentId || !receiverState) return [];
    return [
      {
        agentId,
        receiverState,
        lastEvent: str(r.lastEvent, 40),
        lastSeen: str(r.lastSeen, 40),
        sessionKey: str(r.sessionKey, 160),
        toolName: str(r.toolName, 80),
        count: count(r.count) ?? 0,
        seq: count(r.seq),
      },
    ];
  });
}

/** Converte um evento SSE "activity" copiando só campos conhecidos. */
export function parseActivityPayload(payload: unknown): TradingAgentEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  const agentId = str(r.agentId, 80);
  const eventType = str(r.type, 40);
  const timestamp = str(r.timestamp, 40);
  if (!agentId || !eventType || !timestamp) return null;
  return {
    agentId,
    eventType,
    timestamp,
    sessionKey: str(r.sessionKey, 160),
    toolName: str(r.toolName, 80),
    failed: r.state === 'erro',
    seq: count(r.seq),
  };
}

/** Adapter do contrato HTTP do openclaw-pixel-adapter (receiver/server.mjs). Só roda no backend. */
export class ReceiverApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ReceiverApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async getAgents(): Promise<TradingAgentSnapshot[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/agents`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new ReceiverError(`GET /agents respondeu ${res.status}`, res.status);
    return parseSnapshotPayload(await res.json());
  }

  openEvents(signal: AbortSignal): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}/events`, {
      headers: { authorization: `Bearer ${this.token}`, accept: 'text/event-stream' },
      signal,
    });
  }
}
