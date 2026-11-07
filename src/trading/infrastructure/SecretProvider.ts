import { readFileSync } from 'node:fs';

const MIN_TOKEN_LENGTH = 24;

/** Lê um Docker secret. Nunca registra o conteúdo; devolve null se ausente ou inválido. */
export function readSecretFile(
  path: string,
  read: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): string | null {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return null;
  }
  const token = raw.trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}
