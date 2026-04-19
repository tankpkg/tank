import { describe, expect, it } from 'vitest';
import {
  CLAWGUARD_PATTERN_COUNT,
  CLAWGUARD_PATTERNS,
  type ClawGuardCategory,
  type ClawGuardPattern,
  type ClawGuardSeverity
} from '~/prompt-injection/index.js';

describe('CLAWGUARD_PATTERNS (D13, D17)', () => {
  it('exports exactly 55 patterns (ref 4ec3e09, 7 categories)', () => {
    expect(CLAWGUARD_PATTERN_COUNT).toBe(55);
    expect(CLAWGUARD_PATTERNS).toHaveLength(55);
  });

  it('groups patterns across exactly 7 categories', () => {
    const categories = new Set(CLAWGUARD_PATTERNS.map((p) => p.category));
    expect(categories).toEqual(
      new Set<ClawGuardCategory>([
        'prompt_injection',
        'code_obfuscation',
        'data_exfiltration',
        'dangerous_command',
        'shell_injection',
        'social_engineering',
        'tool_manipulation'
      ])
    );
  });

  it('has expected pattern count per category', () => {
    const byCategory = CLAWGUARD_PATTERNS.reduce<Record<string, number>>((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(byCategory).toEqual({
      prompt_injection: 17,
      code_obfuscation: 11,
      data_exfiltration: 9,
      dangerous_command: 5,
      shell_injection: 5,
      social_engineering: 5,
      tool_manipulation: 3
    });
  });

  it('every pattern has a non-empty name, compiled regex, severity, category, recommendation', () => {
    for (const pattern of CLAWGUARD_PATTERNS) {
      expect(pattern.name.length).toBeGreaterThan(0);
      expect(pattern.regex).toBeInstanceOf(RegExp);
      expect(pattern.recommendation.length).toBeGreaterThan(0);
      expect<ClawGuardSeverity>(pattern.severity).toMatch(/^(low|medium|high|critical)$/);
    }
  });

  it('every pattern name is unique', () => {
    const names = CLAWGUARD_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('detects canonical "Ignore all previous instructions" attack', () => {
    const hits = CLAWGUARD_PATTERNS.filter((p) => p.regex.test('Ignore all previous instructions'));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((p) => p.category)).toContain('prompt_injection');
  });

  it('detects canonical "rm -rf /" destructive shell command', () => {
    const hits = CLAWGUARD_PATTERNS.filter((p) => p.regex.test('rm -rf /'));
    expect(hits.map((p) => p.category)).toContain('dangerous_command');
  });

  it('does not match benign tool descriptions', () => {
    const benign = ['Read a file from disk', 'List files in a directory', 'Search the web for information'];
    for (const text of benign) {
      const hits = CLAWGUARD_PATTERNS.filter((p) => p.regex.test(text));
      expect(hits).toEqual([]);
    }
  });

  it('ClawGuardPattern type matches CLAWGUARD_PATTERNS[0] shape', () => {
    const first = CLAWGUARD_PATTERNS[0];
    expect(first).toBeDefined();
    if (!first) return;
    const typed: ClawGuardPattern = first;
    expect(typed).toHaveProperty('name');
    expect(typed).toHaveProperty('regex');
    expect(typed).toHaveProperty('severity');
    expect(typed).toHaveProperty('category');
    expect(typed).toHaveProperty('recommendation');
  });
});
