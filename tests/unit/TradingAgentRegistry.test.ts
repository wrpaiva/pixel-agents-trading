import { describe, expect, it } from 'vitest';

import { TradingAgentRegistry } from '../../src/trading/application/TradingAgentRegistry.js';
import { TRADING_AGENTS } from '../../src/trading/config/agents.js';

describe('TradingAgentRegistry', () => {
  it('registra exatamente os sete agentes do spec, na ordem do spec', () => {
    const registry = new TradingAgentRegistry();
    expect(registry.all().map((a) => [a.agentId, a.displayName])).toEqual([
      ['trading-coordinator', 'Coordinator'],
      ['crypto-btc', 'BTC Analyst'],
      ['crypto-eth', 'ETH Analyst'],
      ['forex-eur', 'EUR Analyst'],
      ['forex-gbp', 'GBP Analyst'],
      ['gold-analyst', 'Gold Analyst'],
      ['risk-reviewer', 'Risk Reviewer'],
    ]);
  });

  it('começa desconectado: nada é ativo antes de evidência do receptor', () => {
    const registry = new TradingAgentRegistry();
    for (const agent of registry.all()) {
      expect(agent).toMatchObject({ status: 'disconnected', sessionKey: null, eventCount: 0, toolName: null });
    }
  });

  it('dá a cada agente um officeId fixo e único', () => {
    const ids = TRADING_AGENTS.map((d) => d.officeId);
    expect(ids).toEqual([9001, 9002, 9003, 9004, 9005, 9006, 9007]);
  });

  it('não conhece o agente main', () => {
    const registry = new TradingAgentRegistry();
    expect(registry.isKnown('main')).toBe(false);
    expect(registry.get('main')).toBeUndefined();
  });

  it('get devolve cópia; só update altera o estado', () => {
    const registry = new TradingAgentRegistry();
    registry.get('crypto-btc')!.status = 'analyzing';
    expect(registry.get('crypto-btc')!.status).toBe('disconnected');
    const updated = registry.update('crypto-btc', { status: 'idle', eventCount: 2 });
    expect(updated).toMatchObject({ agentId: 'crypto-btc', displayName: 'BTC Analyst', status: 'idle', eventCount: 2 });
  });

  it('update de agente desconhecido falha', () => {
    expect(() => new TradingAgentRegistry().update('main', { status: 'idle' })).toThrow(/main/);
  });

  it('rejeita definições duplicadas', () => {
    const [first] = TRADING_AGENTS;
    expect(() => new TradingAgentRegistry([first!, { ...first!, officeId: 1 }])).toThrow(/duplicado/);
    expect(() => new TradingAgentRegistry([first!, { ...first!, agentId: 'x' }])).toThrow(/duplicado/);
  });
});
