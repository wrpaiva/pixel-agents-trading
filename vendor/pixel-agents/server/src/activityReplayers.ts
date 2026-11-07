/**
 * pixel-agents-trading patch: extension point for state that is not derived
 * from Claude transcripts. Each replayer runs on the webviewReady handshake
 * right after resendAgentActivity, so it can correct or extend what a
 * reconnecting client was just sent.
 */
export type ReplaySend = (message: Record<string, unknown>) => void;

const replayers = new Set<(send: ReplaySend) => void>();

export function addActivityReplayer(replay: (send: ReplaySend) => void): () => void {
  replayers.add(replay);
  return () => {
    replayers.delete(replay);
  };
}

export function replayExtraActivity(send: ReplaySend): void {
  for (const replay of replayers) {
    try {
      replay(send);
    } catch (err) {
      console.error('[Pixel Agents] activity replayer failed:', err);
    }
  }
}
