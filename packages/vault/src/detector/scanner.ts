import { scan as internalScan, type CredentialMatch } from '@internals/helpers';

export type { CredentialMatch };

/**
 * Vault scanner — permissive mode.
 *
 * Vault redacts credentials from agent→tool message flows. False negatives
 * (leaked secrets) are far costlier than false positives (redundant fake
 * tokens). Permissive mode skips the entropy gate and placeholder denylist
 * so any regex-matched shape is redacted. See D7 / INTENT C25d.
 */
export function scan(text: string): CredentialMatch[] {
  return internalScan(text, { mode: 'permissive' });
}
