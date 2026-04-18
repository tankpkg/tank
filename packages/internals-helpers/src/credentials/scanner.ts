import { DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR, shannonEntropy } from '~/credentials/entropy.js';
import { CREDENTIAL_PATTERNS, type CredentialPattern } from '~/credentials/patterns.js';

export interface CredentialMatch {
  start: number;
  end: number;
  patternId: string;
}

export type ScanMode = 'strict' | 'permissive';

export interface ScanOptions {
  /**
   * Gate profile for the scanner.
   * - `strict` (default): full dual-gate — structural exempt, placeholder
   *   denylist, then per-pattern entropy floor. Used by mcp-proxy leak
   *   detection where false positives are costly.
   * - `permissive`: regex match alone is authoritative (plus structural
   *   exemption). Used by vault runtime redaction where false negatives
   *   leak real secrets to upstream AI providers.
   */
  mode?: ScanMode;
  entropyThreshold?: number;
}

export function scan(text: string, options: ScanOptions = {}): CredentialMatch[] {
  if (text.length === 0) {
    return [];
  }

  const mode: ScanMode = options.mode ?? 'strict';
  const overrideThreshold = options.entropyThreshold;
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

      if (passesCredentialGates(pattern, value, mode, overrideThreshold)) {
        matches.push({ start, end, patternId: pattern.id });
      }

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

function passesCredentialGates(
  pattern: CredentialPattern,
  value: string,
  mode: ScanMode,
  overrideThreshold: number | undefined
): boolean {
  if (pattern.structural === true) {
    return true;
  }

  if (mode === 'permissive') {
    return true;
  }

  if (containsPlaceholder(value, pattern.placeholderDenylist)) {
    return false;
  }

  const body = value.startsWith(pattern.prefix) ? value.slice(pattern.prefix.length) : value;
  if (body.length === 0) {
    return false;
  }

  const threshold = overrideThreshold ?? pattern.minEntropy ?? DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR;
  return shannonEntropy(body) >= threshold;
}

function containsPlaceholder(value: string, denylist: readonly string[] | undefined): boolean {
  if (!denylist || denylist.length === 0) {
    return false;
  }
  const upper = value.toUpperCase();
  for (const placeholder of denylist) {
    if (upper.includes(placeholder.toUpperCase())) {
      return true;
    }
  }
  return false;
}
