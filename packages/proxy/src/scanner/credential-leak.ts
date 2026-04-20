import { scan as credentialScan } from '@internals/helpers';

export interface CredentialLeakMatch {
  start: number;
  end: number;
  patternId: string;
}

export interface CredentialLeakResult {
  matched: boolean;
  matches: CredentialLeakMatch[];
}

export function scanForCredentialLeak(text: string): CredentialLeakResult {
  if (text.length === 0) return { matched: false, matches: [] };
  const raw = credentialScan(text, { mode: 'strict' });
  return {
    matched: raw.length > 0,
    matches: raw.map((m) => ({ start: m.start, end: m.end, patternId: m.patternId }))
  };
}
