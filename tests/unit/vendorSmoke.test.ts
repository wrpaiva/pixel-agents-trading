import { describe, expect, it } from 'vitest';

import { createAgentState } from '../../vendor/pixel-agents/server/src/agentState.js';
import { AgentStateStore } from '../../vendor/pixel-agents/server/src/agentStateStore.js';

describe('vendor pixel-agents 1.5.0', () => {
  it('expõe AgentStateStore e createAgentState para a Trading Room', () => {
    const store = new AgentStateStore();
    store.set(
      1,
      createAgentState({ id: 1, sessionId: 's', projectDir: 'p', jsonlFile: 'f', isExternal: true }),
    );
    expect(store.get(1)?.activeToolStatuses.size).toBe(0);
  });
});
