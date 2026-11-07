export const AGENT_STATUSES = [
  'idle',
  'analyzing',
  'using_tool',
  'waiting',
  'completed',
  'error',
  'disconnected',
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** Estados que só existem com evidência de execução real (e que expiram). */
export const ACTIVE_STATUSES: ReadonlySet<AgentStatus> = new Set<AgentStatus>(['analyzing', 'using_tool']);
