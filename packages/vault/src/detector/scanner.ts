import { CREDENTIAL_PATTERNS } from './patterns.ts';

export interface CredentialMatch {
  start: number;
  end: number;
  patternId: string;
}

export function scan(text: string): CredentialMatch[] {
  if (text.length === 0) {
    return [];
  }

  const matches: CredentialMatch[] = [];

  for (const pattern of CREDENTIAL_PATTERNS) {
    const regex = new RegExp(
      pattern.regex.source,
      pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`
    );
    let result: RegExpExecArray | null = regex.exec(text);

    while (result) {
      const value = result[0];
      const rawStart = result.index;
      const start = rawStart > 1 && text[rawStart - 1] === ' ' && text[rawStart - 2] === ':' ? rawStart + 1 : rawStart;
      const end = rawStart + value.length + (start === rawStart ? 0 : 1);

      matches.push({
        start,
        end,
        patternId: pattern.id
      });

      result = regex.exec(text);
    }
  }

  matches.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    if (a.end !== b.end) {
      return a.end - b.end;
    }
    return a.patternId.localeCompare(b.patternId);
  });

  const deduped: CredentialMatch[] = [];

  for (const match of matches) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.start === match.start && prev.end === match.end && prev.patternId === match.patternId) {
      continue;
    }
    deduped.push(match);
  }

  return deduped;
}
