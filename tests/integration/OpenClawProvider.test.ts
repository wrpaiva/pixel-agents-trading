import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../../src/trading/application/TradingEventProcessor.js';
import { OpenClawProvider } from '../../src/trading/providers/OpenClawProvider.js';
import { addActivityReplayer, replayExtraActivity } from '../../vendor/pixel-agents/server/src/activityReplayers.js';
import { resendAgentActivity } from '../../vendor/pixel-agents/server/src/agentActivityResend.js';
import { createAgentState } from '../../vendor/pixel-agents/server/src/agentState.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';

const quiet = { info: () => {}, warn: () => {} };
let dir: string;
let store: AgentStateStore;
let registry: TradingAgentRegistry;
let processor: TradingEventProcessor;
let provider: OpenClawProvider;
let broadcasts: Array<Record<string, unknown>>;
let seq = 0;

const snapshotIdle = () =>
  registry.definitions().map((d) => ({ agentId: d.agentId, receiverState: 'ocioso', lastEvent: null, lastSeen: null, sessionKey: null, toolName: null, count: 0, seq: 0 }));
const emit = (agentId: string, eventType: string, extra: object = {}) =>
  processor.applyEvent({ agentId, eventType, sessionKey: `agent:${agentId}:main`, timestamp: new Date().toISOString(), seq: ++seq, ...extra });
function handshake(): Array<Record<string, unknown>> {
  const sent: Array<Record<string, unknown>> = [];
  const send = (m: Record<string, unknown>) => sent.push(m);
  resendAgentActivity(send, store);
  replayExtraActivity(send);
  return sent;
}
const forId = (id: number, list = broadcasts) => list.filter((m) => m.id === id).map((m) => `${m.type}:${m.status ?? ''}`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openclaw-provider-'));
  store = new AgentStateStore();
  registry = new TradingAgentRegistry();
  processor = new TradingEventProcessor({ registry, logger: quiet });
  provider = new OpenClawProvider({ store, registry, processor, addReplayer: addActivityReplayer, markerDir: dir, logger: quiet });
  broadcasts = [];
  store.on('broadcast', (m) => broadcasts.push(m));
  seq = 0;
});
afterEach(() => {
  provider.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('OpenClawProvider (falhas)', () => {
  it('start parcial não deixa personagens órfãos no store', () => {
    store.set(9004, createAgentState({ id: 9004, sessionId: 'outro', providerId: 'claude', projectDir: 'x', jsonlFile: 'x' } as never));
    expect(() => provider.start()).toThrow(/9004/);
    for (const id of [9001, 9002, 9003]) expect(store.has(id)).toBe(false);
    expect(store.has(9004)).toBe(true);
  });

  it('falha ao recriar personagem removido não escapa e avisa', async () => {
    const warns: string[] = [];
    provider = new OpenClawProvider({ store, registry, processor, addReplayer: addActivityReplayer, markerDir: dir, logger: { info: () => {}, warn: (m) => warns.push(m) } });
    provider.start();
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, 'arquivo');
    store.delete(9001);
    await new Promise((r) => setTimeout(r, 20));
    expect(warns.some((w) => w.includes('falha ao recriar'))).toBe(true);
    expect(store.has(9001)).toBe(false);
  });
});

describe('OpenClawProvider', () => {
  it('registra os sete personagens com identidade fixa e legível', () => {
    provider.start();
    expect(store.size).toBe(7);
    const btc = store.get(9002)!;
    expect(btc).toMatchObject({
      sessionId: 'openclaw:crypto-btc',
      providerId: 'openclaw',
      isExternal: true,
      hooksOnly: true,
      directoryName: 'crypto-btc',
      agentName: 'BTC Analyst',
      palette: 1,
    });
    expect(existsSync(btc.jsonlFile)).toBe(true); // impede a limpeza de agentes externos "stale"
  });

  it('start duas vezes não duplica personagens', () => {
    provider.start();
    provider.start();
    expect(store.size).toBe(7);
  });

  it('falha alto se outro agente já ocupa um id reservado', () => {
    store.set(9001, createAgentState({ id: 9001, sessionId: 'x', projectDir: 'p', jsonlFile: 'f', isExternal: true, providerId: 'claude' }));
    expect(() => provider.start()).toThrow(/9001/);
  });

  it('antes de qualquer snapshot todos mostram "Sem conexão" sem animação', () => {
    provider.start();
    const sent = handshake();
    expect(forId(9002, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Sem conexão com o receptor', 'agentStatus:idle']);
  });

  it('análise real: anima, mostra a ferramenta e conclui', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    broadcasts.length = 0;
    emit('crypto-btc', 'model_start');
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentToolStart:Analisando', 'agentStatus:active']);
    broadcasts.length = 0;
    emit('crypto-btc', 'tool_start', { toolName: 'web_search' });
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentToolStart:Ferramenta: web_search', 'agentStatus:active']);
    broadcasts.length = 0;
    emit('crypto-btc', 'agent_end');
    expect(forId(9002)).toEqual(['agentToolsClear:', 'agentStatus:waiting']);
    expect(broadcasts.filter((m) => m.id !== 9002)).toEqual([]);
  });

  it('recarregar o navegador reproduz o estado ativo sem duplicar', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    emit('crypto-eth', 'tool_start', { toolName: 'quote' });
    const sent = handshake();
    expect(forId(9003, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Ferramenta: quote']);
    expect(store.size).toBe(7);
  });

  it('recarregar durante error mantém o personagem parado (replayer)', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    emit('gold-analyst', 'model_start');
    emit('gold-analyst', 'agent_end', { failed: true });
    const sent = handshake();
    expect(forId(9006, sent)).toEqual(['agentTeamInfo:', 'agentToolStart:Erro na execução', 'agentStatus:idle']);
  });

  it('agentes idle não recebem atividade no handshake', () => {
    provider.start();
    processor.applySnapshot(snapshotIdle());
    expect(forId(9001, handshake())).toEqual(['agentTeamInfo:']);
  });

  it('personagem fechado pela UI reaparece com o mesmo id e nome', async () => {
    provider.start();
    store.delete(9004);
    await new Promise((resolve) => setImmediate(resolve));
    expect(store.get(9004)).toMatchObject({ agentName: 'EUR Analyst', directoryName: 'forex-eur' });
    expect(broadcasts).toContainEqual({ type: 'agentTeamInfo', id: 9004, agentName: 'EUR Analyst' });
  });

  it('depois de stop, não reage mais', () => {
    provider.start();
    provider.stop();
    broadcasts.length = 0;
    emit('crypto-btc', 'model_start');
    expect(broadcasts).toEqual([]);
    expect(handshake().filter((m) => m.type === 'agentStatus')).toEqual([]);
  });
});
