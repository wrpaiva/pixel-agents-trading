/** Um item de GET /agents (ou do evento SSE "snapshot"), já validado. */
export interface TradingAgentSnapshot {
  agentId: string;
  /** Estado em português publicado pelo receptor: ocioso, analisando, ... */
  receiverState: string;
  lastEvent: string | null;
  lastSeen: string | null;
  sessionKey: string | null;
  toolName: string | null;
  count: number;
  seq: number | null;
}
