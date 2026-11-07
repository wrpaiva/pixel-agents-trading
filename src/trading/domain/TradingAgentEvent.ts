export interface TradingAgentEvent {
  agentId: string;
  sessionKey: string | null;
  eventType: string;
  timestamp: string;
  toolName?: string | null;
  /** agent_end com success=false (o receptor publica state "erro"). */
  failed?: boolean;
  /** Sequência global do receptor; ausente em versões antigas. */
  seq?: number | null;
}
