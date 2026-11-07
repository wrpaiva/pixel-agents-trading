import { describe, expect, it } from 'vitest';

import { readSecretFile } from '../../src/trading/infrastructure/SecretProvider.js';

const TOKEN = 'a'.repeat(32);

describe('readSecretFile', () => {
  it('aceita secret com \\n ou \\r\\n final (criado com echo)', () => {
    expect(readSecretFile('/x', () => `${TOKEN}\n`)).toBe(TOKEN);
    expect(readSecretFile('/x', () => `${TOKEN}\r\n`)).toBe(TOKEN);
  });
  it('arquivo ausente devolve null', () => {
    expect(
      readSecretFile('/x', () => {
        throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      }),
    ).toBeNull();
  });
  it('token curto devolve null', () => {
    expect(readSecretFile('/x', () => 'curto')).toBeNull();
  });
});
