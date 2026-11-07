import { describe, expect, it } from 'vitest';

import { AgentStateMapper } from '../../src/trading/application/AgentStateMapper.js';
import type { AgentStatus } from '../../src/trading/domain/AgentStatus.js';

const mapper = new AgentStateMapper();
const ev = (eventType: string, extra: object = {}) => ({
  agentId: 'crypto-btc',
  sessionKey: 'agent:crypto-btc:main',
  eventType,
  timestamp: '2026-11-07T12:00:00.000Z',
  ...extra,
});

describe('AgentStateMapper.fromEvent', () => {
  it.each<[string, AgentStatus, object, AgentStatus]>([
    ['model_start', 'idle', {}, 'analyzing'],
    ['model_start', 'completed', {}, 'analyzing'],
    ['tool_start', 'analyzing', { toolName: 'web_search' }, 'using_tool'],
    ['tool_end', 'using_tool', {}, 'analyzing'],
    ['agent_end', 'analyzing', {}, 'completed'],
    ['agent_end', 'analyzing', { failed: true }, 'error'],
  ])('%s em %s -> %s', (type, current, extra, expected) => {
    expect(mapper.fromEvent(current, ev(type, extra))).toBe(expected);
  });

  it('model_end NÃO encerra a rodada: a execução segue até agent_end', () => {
    expect(mapper.fromEvent('analyzing', ev('model_end'))).toBe('analyzing');
    // model_end visto após reconexão também é evidência de execução em andamento.
    expect(mapper.fromEvent('idle', ev('model_end'))).toBe('analyzing');
  });

  it('tipo desconhecido devolve null', () => {
    expect(mapper.fromEvent('idle', ev('session_start'))).toBeNull();
  });
});

describe('AgentStateMapper.fromReceiverState', () => {
  it.each<[string, AgentStatus]>([
    ['ocioso', 'idle'],
    ['analisando', 'analyzing'],
    ['aguardando', 'analyzing'],
    ['ferramenta', 'using_tool'],
    ['ferramenta_concluida', 'analyzing'],
    ['erro', 'error'],
    ['qualquer-outro', 'idle'],
  ])('%s -> %s', (state, expected) => {
    expect(mapper.fromReceiverState(state)).toBe(expected);
  });
});
