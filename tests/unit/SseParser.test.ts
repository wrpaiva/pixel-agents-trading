import { describe, expect, it } from 'vitest';

import { SseParser } from '../../src/trading/infrastructure/ReceiverEventStream.js';

describe('SseParser', () => {
  it('monta mensagens divididas entre chunks e aceita CRLF', () => {
    const parser = new SseParser();
    expect(parser.push('event: snap')).toEqual([]);
    expect(parser.push('shot\r\ndata: {"a"')).toEqual([]);
    expect(parser.push(':1}\r\n\r\nevent: activity\ndata: x\n\n')).toEqual([
      { event: 'snapshot', data: '{"a":1}' },
      { event: 'activity', data: 'x' },
    ]);
  });
  it('ignora comentários de keepalive e junta várias linhas data', () => {
    const parser = new SseParser();
    expect(parser.push(': ping\n\ndata: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});
