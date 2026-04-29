import {
  CLAWGUARD_PATTERNS,
  type ClawGuardCategory,
  type ClawGuardSeverity,
  normalizeForScan
} from '@internals/helpers';

export interface ScanMatch {
  patternName: string;
  category: ClawGuardCategory;
  severity: ClawGuardSeverity;
}

export interface ScanResult {
  matched: boolean;
  matches: ScanMatch[];
}

export function scanToolDescription(text: string): ScanResult {
  if (text.length === 0) return { matched: false, matches: [] };
  const normalized = normalizeForScan(text);
  const matches: ScanMatch[] = [];
  const seen = new Set<string>();
  for (const pattern of CLAWGUARD_PATTERNS) {
    if (seen.has(pattern.name)) continue;
    if (pattern.regex.test(normalized)) {
      matches.push({
        patternName: pattern.name,
        category: pattern.category,
        severity: pattern.severity
      });
      seen.add(pattern.name);
    }
  }
  return { matched: matches.length > 0, matches };
}
