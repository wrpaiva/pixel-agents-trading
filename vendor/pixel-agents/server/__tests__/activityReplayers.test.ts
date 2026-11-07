import { describe, expect, it, vi } from 'vitest';

import { addActivityReplayer, replayExtraActivity } from '../src/activityReplayers.js';

describe('activityReplayers', () => {
  it('runs registered replayers with the client send function until removed', () => {
    const sent: unknown[] = [];
    const remove = addActivityReplayer((send) => send({ type: 'agentStatus', id: 1, status: 'idle' }));
    replayExtraActivity((m) => sent.push(m));
    expect(sent).toEqual([{ type: 'agentStatus', id: 1, status: 'idle' }]);
    remove();
    sent.length = 0;
    replayExtraActivity((m) => sent.push(m));
    expect(sent).toEqual([]);
  });

  it('a failing replayer does not break the handshake or the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: unknown[] = [];
    const removeA = addActivityReplayer(() => {
      throw new Error('boom');
    });
    const removeB = addActivityReplayer((send) => send({ ok: true }));
    expect(() => replayExtraActivity((m) => sent.push(m))).not.toThrow();
    expect(sent).toEqual([{ ok: true }]);
    removeA();
    removeB();
    error.mockRestore();
  });
});
