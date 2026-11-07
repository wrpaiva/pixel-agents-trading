import type { AgentStatus } from './AgentStatus.js';

export interface TradingAgent {
  agentId: string;
  displayName: string;
  sessionKey: string | null;
  status: AgentStatus;
  lastEvent: string | null;
  lastSeen: string | null;
  toolName: string | null;
  eventCount: number;
}
