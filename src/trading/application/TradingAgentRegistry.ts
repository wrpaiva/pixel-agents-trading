import { TRADING_AGENTS, type TradingAgentDefinition } from '../config/agents.js';
import type { TradingAgent } from '../domain/TradingAgent.js';

export type AgentPatch = Partial<Omit<TradingAgent, 'agentId' | 'displayName'>>;

/** Os sete agentes conhecidos, com identidade estável por agentId (nunca por sessionKey). */
export class TradingAgentRegistry {
  private readonly defs = new Map<string, TradingAgentDefinition>();
  private readonly agents = new Map<string, TradingAgent>();

  constructor(definitions: readonly TradingAgentDefinition[] = TRADING_AGENTS) {
    const officeIds = new Set<number>();
    for (const def of definitions) {
      if (this.defs.has(def.agentId)) throw new Error(`Agente duplicado: ${def.agentId}`);
      if (officeIds.has(def.officeId)) throw new Error(`officeId duplicado: ${def.officeId}`);
      officeIds.add(def.officeId);
      this.defs.set(def.agentId, def);
      this.agents.set(def.agentId, {
        agentId: def.agentId,
        displayName: def.displayName,
        sessionKey: null,
        // Até o primeiro snapshot não sabemos nada: desconectado, nunca ativo.
        status: 'disconnected',
        lastEvent: null,
        lastSeen: null,
        toolName: null,
        eventCount: 0,
      });
    }
  }

  isKnown(agentId: string): boolean {
    return this.defs.has(agentId);
  }

  get(agentId: string): TradingAgent | undefined {
    const agent = this.agents.get(agentId);
    return agent ? { ...agent } : undefined;
  }

  all(): TradingAgent[] {
    return [...this.agents.values()].map((agent) => ({ ...agent }));
  }

  definitions(): readonly TradingAgentDefinition[] {
    return [...this.defs.values()];
  }

  definition(agentId: string): TradingAgentDefinition | undefined {
    return this.defs.get(agentId);
  }

  update(agentId: string, patch: AgentPatch): TradingAgent {
    const current = this.agents.get(agentId);
    if (!current) throw new Error(`Agente desconhecido: ${agentId}`);
    const next = { ...current, ...patch };
    this.agents.set(agentId, next);
    return { ...next };
  }
}
