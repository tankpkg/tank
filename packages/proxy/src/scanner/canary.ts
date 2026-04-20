import { randomBytes } from 'node:crypto';

const CANARY_BYTES = 8;

export function mintCanary(): string {
  return randomBytes(CANARY_BYTES).toString('hex');
}
