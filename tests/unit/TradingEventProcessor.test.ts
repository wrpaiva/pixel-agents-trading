import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../../src/trading/application/TradingEventProcessor.js';
import type { TradingAgent } from '../../src/trading/domain/TradingAgent.js';
import type { TradingAgentEvent } from '../../src/trading/domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../../src/trading/domain/TradingAgentSnapshot.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/receiver-agents.json', import.meta.url), 'utf8')) as {
  agents: Array<Record<string, unknown>>;
};
const realSnapshot = (): TradingAgentSnapshot[] =>
  fixture.agents.map((a) => ({
    agentId: a.agentId as string,
    receiverState: a.state as string,
    lastEvent: (a.lastEvent as string | null) ?? null,
    lastSeen: (a.lastSeen as string | null) ?? null,
    sessionKey: (a.sessionKey as string | null) ?? null,
    toolName: null,
    count: a.count as number,
    seq: null,
  }));

let now = Date.parse('2026-11-07T12:00:00.000Z');
const clock = { now: () => now };
const warnings: string[] = [];
const logger = { info: () => {}, warn: (m: string) => warnings.push(m) };
let registry: TradingAgentRegistry;
let processor: TradingEventProcessor;
let changes: Array<{ agent: TradingAgent; previous: TradingAgent }>;

let seq = 0;
const event = (eventType: string, extra: Partial<TradingAgentEvent> = {}): TradingAgentEvent => ({
  agentId: 'crypto-btc',
  sessionKey: 'agent:crypto-btc:main',
  eventType,
  timestamp: new Date(now).toISOString(),
  seq: ++seq,
  ...extra,
});
const status = (id: string) => registry.get(id)!.status;

beforeEach(() => {
  now = Date.parse('2026-11-07T12:00:00.000Z');
  seq = 0;
  warnings.length = 0;
  registry = new TradingAgentRegistry();
  processor = new TradingEventProcessor({ registry, clock, logger, completedHoldMs: 4000, errorHoldMs: 120_000, staleActiveMs: 180_000 });
  changes = [];
  processor.subscribe((agent, previous) => changes.push({ agent, previous }));
});

describe('snapshot inicial (resposta real do receptor)', () => {
  it('leva os sete agentes a idle, sem nenhum estado ativo', () => {
    processor.applySnapshot(realSnapshot());
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('idle'));
    expect(registry.get('crypto-btc')).toMatchObject({ lastEvent: 'model_end', eventCount: 6, sessionKey: 'agent:crypto-btc:main' });
  });

  it('snapshot com estado ativo e lastSeen recente vira analyzing', () => {
    processor.applySnapshot([{ ...realSnapshot()[1]!, receiverState: 'analisando', lastSeen: new Date(now - 5000).toISOString() }]);
    expect(status('crypto-btc')).toBe('analyzing');
  });
});

describe('eventos de execução', () => {
  beforeEach(() => {
    processor.applySnapshot(realSnapshot());
    changes.length = 0;
  });

  it('rodada completa: analyzing → using_tool → analyzing → completed → idle', () => {
    processor.applyEvent(event('model_start'));
    expect(status('crypto-btc')).toBe('analyzing');
    processor.applyEvent(event('model_end'));
    expect(status('crypto-btc')).toBe('analyzing');
    processor.applyEvent(event('tool_start', { toolName: 'web_search' }));
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'using_tool', toolName: 'web_search' });
    processor.applyEvent(event('tool_end', { toolName: 'web_search' }));
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'analyzing', toolName: null });
    processor.applyEvent(event('agent_end'));
    expect(status('crypto-btc')).toBe('completed');
    now += 3999;
    processor.tick();
    expect(status('crypto-btc')).toBe('completed');
    now += 1;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('não altera os outros agentes', () => {
    processor.applyEvent(event('model_start'));
    for (const agent of registry.all()) {
      if (agent.agentId !== 'crypto-btc') expect(agent.status).toBe('idle');
    }
    expect(changes.map((c) => c.agent.agentId)).toEqual(['crypto-btc']);
  });

  it('model_end não dispara listener (status inalterado)', () => {
    processor.applyEvent(event('model_start'));
    changes.length = 0;
    processor.applyEvent(event('model_end'));
    expect(changes).toEqual([]);
    expect(registry.get('crypto-btc')!.eventCount).toBe(8);
  });

  it('falha real vira error e expira para idle após errorHoldMs', () => {
    processor.applyEvent(event('model_start'));
    processor.applyEvent(event('agent_end', { failed: true }));
    expect(status('crypto-btc')).toBe('error');
    now += 120_000;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('várias sessões do mesmo agente atualizam o mesmo registro', () => {
    processor.applyEvent(event('model_start', { sessionKey: 'agent:crypto-btc:main' }));
    processor.applyEvent(event('tool_start', { sessionKey: 'agent:crypto-btc:cron-7', toolName: 'quote' }));
    expect(registry.all()).toHaveLength(7);
    expect(registry.get('crypto-btc')).toMatchObject({ status: 'using_tool', sessionKey: 'agent:crypto-btc:cron-7' });
  });
});

describe('resiliência', () => {
  beforeEach(() => {
    processor.applySnapshot(realSnapshot());
    changes.length = 0;
  });

  it('evento com seq repetido é ignorado', () => {
    const start = event('model_start');
    expect(processor.applyEvent(start)).toBe(true);
    expect(processor.applyEvent({ ...start })).toBe(false);
    expect(registry.get('crypto-btc')!.eventCount).toBe(7);
    expect(changes).toHaveLength(1);
  });

  it('evento atrasado (seq menor) não regride o estado', () => {
    const start = event('model_start');
    processor.applyEvent(event('agent_end'));
    expect(processor.applyEvent(start)).toBe(false);
    expect(status('crypto-btc')).toBe('completed');
  });

  it('sem seq: duplicado pelo par timestamp+chave e atraso pelo timestamp', () => {
    const t = new Date(now).toISOString();
    expect(processor.applyEvent(event('model_start', { seq: null, timestamp: t }))).toBe(true);
    expect(processor.applyEvent(event('model_start', { seq: null, timestamp: t }))).toBe(false);
    expect(processor.applyEvent(event('tool_start', { seq: null, timestamp: t, toolName: 'x' }))).toBe(true);
    expect(processor.applyEvent(event('agent_end', { seq: null, timestamp: new Date(now - 1000).toISOString() }))).toBe(false);
    expect(status('crypto-btc')).toBe('using_tool');
  });

  it('ignora o agente main e registra o motivo', () => {
    expect(processor.applyEvent(event('model_start', { agentId: 'main' }))).toBe(false);
    expect(warnings.some((w) => w.includes('"main"'))).toBe(true);
    expect(changes).toEqual([]);
  });

  it('ignora tipo de evento desconhecido e registra o motivo', () => {
    expect(processor.applyEvent(event('session_start'))).toBe(false);
    expect(warnings.some((w) => w.includes('session_start'))).toBe(true);
    expect(status('crypto-btc')).toBe('idle');
  });

  it('ignora timestamp inválido', () => {
    expect(processor.applyEvent(event('model_start', { timestamp: 'ontem' }))).toBe(false);
  });

  it('não fica eternamente em analyzing: expira após staleActiveMs sem eventos', () => {
    processor.applyEvent(event('model_start'));
    now += 170_000;
    processor.applyEvent(event('model_end')); // renova a atividade
    now += 179_999;
    processor.tick();
    expect(status('crypto-btc')).toBe('analyzing');
    now += 1;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
  });

  it('evento real depois da expiração reativa o agente', () => {
    processor.applyEvent(event('model_start'));
    now += 180_000;
    processor.tick();
    expect(status('crypto-btc')).toBe('idle');
    processor.applyEvent(event('tool_end'));
    expect(status('crypto-btc')).toBe('analyzing');
  });

  it('markDisconnected difere de idle e um snapshot novo restaura', () => {
    processor.applyEvent(event('model_start'));
    processor.markDisconnected();
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('disconnected'));
    processor.applySnapshot(realSnapshot());
    expect(registry.all().map((a) => a.status)).toEqual(Array(7).fill('idle'));
  });

  it('receptor reiniciado (seq volta a 0) continua aceitando eventos novos', () => {
    for (let i = 0; i < 50; i++) processor.applyEvent(event('model_end'));
    seq = 0;
    processor.applySnapshot(realSnapshot().map((s) => ({ ...s, seq: 0, lastEvent: null, lastSeen: null, count: 0 })));
    expect(processor.applyEvent(event('model_start'))).toBe(true);
    expect(status('crypto-btc')).toBe('analyzing');
  });

  it('receptor reiniciado sem histórico: não inventa atividade', () => {
    processor.applyEvent(event('model_start'));
    processor.applySnapshot(realSnapshot().map((s) => ({ ...s, lastEvent: null, lastSeen: null, count: 0 })));
    expect(status('crypto-btc')).toBe('idle');
  });
});
