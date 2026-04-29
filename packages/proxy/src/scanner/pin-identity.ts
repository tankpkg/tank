import { createHash } from 'node:crypto';

export function computePinIdentity(argv: readonly string[]): string {
  if (argv.length === 0) {
    throw new Error('computePinIdentity: argv must not be empty');
  }
  const trimmed = argv.map((arg) => arg.trim());
  const canonical = JSON.stringify(trimmed);
  return createHash('sha256').update(canonical).digest('hex');
}
