import type { AgentStatus } from '../domain/AgentStatus.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';

/**
 * Regras de transição do spec (seção 4), isoladas do transporte.
 *
 * Ciclo de uma rodada no OpenClaw: model_start → model_end → tool_start → tool_end
 * → model_start → ... → agent_end. Por isso model_end mantém "analyzing": só
 * agent_end encerra a rodada.
 */
export class AgentStateMapper {
  fromEvent(_current: AgentStatus, event: TradingAgentEvent): AgentStatus | null {
    switch (event.eventType) {
      case 'model_start':
      case 'model_end':
      case 'tool_end':
        return 'analyzing';
      case 'tool_start':
        return 'using_tool';
      case 'agent_end':
        return event.failed ? 'error' : 'completed';
      default:
        return null;
    }
  }

  /** Estado publicado pelo receptor em GET /agents; ele já expira para "ocioso" após 2 min sem eventos. */
  fromReceiverState(state: string): AgentStatus {
    switch (state) {
      case 'analisando':
      case 'aguardando':
      case 'ferramenta_concluida':
        return 'analyzing';
      case 'ferramenta':
        return 'using_tool';
      case 'erro':
        return 'error';
      default:
        return 'idle';
    }
  }
}
