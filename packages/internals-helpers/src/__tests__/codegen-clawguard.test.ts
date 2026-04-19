import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractClawGuardPatterns,
  type ParsedPattern,
  renderPatternsModule,
  severityToEnum
} from '../../scripts/codegen-clawguard.js';

const FIXTURE_PYTHON = `
# Each pattern: (name, regex, severity, category, recommendation)

PROMPT_INJECTION_PATTERNS = [
    (
        "Direct Override (EN)",
        r"(?i)ignore\\s+(all\\s+)?(previous|prior)\\s+(instructions?|rules?)",
        Severity.CRITICAL,
        "Prompt Injection",
        "BLOCK this input immediately.",
    ),
    (
        "Token Smuggling",
        r"(?i)(ignore|bypass)\\s+(safety|filter)",
        Severity.HIGH,
        "Prompt Injection",
        "Attempt to disable security filters.",
    ),
]

DANGEROUS_COMMAND_PATTERNS = [
    (
        "Destructive Shell Command",
        r"rm\\s+-rf\\s+/",
        Severity.CRITICAL,
        "Dangerous Command",
        "BLOCK.",
    ),
]

ALL_PATTERNS = (
PROMPT_INJECTION_PATTERNS
+ DANGEROUS_COMMAND_PATTERNS
)
`.trim();

describe('extractClawGuardPatterns (codegen parser)', () => {
  it('parses 2 prompt-injection + 1 dangerous-command = 3 patterns from fixture', () => {
    expect(extractClawGuardPatterns(FIXTURE_PYTHON)).toHaveLength(3);
  });

  it('maps each tuple field to the ParsedPattern shape', () => {
    const first = extractClawGuardPatterns(FIXTURE_PYTHON)[0];
    expect(first?.name).toBe('Direct Override (EN)');
    expect(first?.severity).toBe('critical');
    expect(first?.category).toBe('prompt_injection');
    expect(first?.recommendation).toBe('BLOCK this input immediately.');
    expect(first?.regexSource).toContain('(?i)');
  });

  it('normalizes human category names to snake_case enum values', () => {
    const patterns = extractClawGuardPatterns(FIXTURE_PYTHON);
    expect(new Set(patterns.map((p) => p.category))).toEqual(new Set(['prompt_injection', 'dangerous_command']));
  });

  it('throws when fixture has no pattern sections', () => {
    expect(() => extractClawGuardPatterns('# empty fixture\n')).toThrow();
  });
});

describe('severityToEnum', () => {
  it('lowercases Severity.CRITICAL to critical', () => {
    expect(severityToEnum('Severity.CRITICAL')).toBe('critical');
  });

  it('lowercases Severity.HIGH to high', () => {
    expect(severityToEnum('Severity.HIGH')).toBe('high');
  });

  it('rejects unknown severity', () => {
    expect(() => severityToEnum('Severity.UNKNOWN')).toThrow();
  });
});

describe('renderPatternsModule', () => {
  const fixture: ParsedPattern[] = [
    {
      name: 'Test Pattern',
      regexSource: '(?i)ignore',
      severity: 'critical',
      category: 'prompt_injection',
      recommendation: 'Block.'
    }
  ];

  it('emits an AUTO-GENERATED warning and references the codegen script', () => {
    const module = renderPatternsModule(fixture);
    expect(module).toContain('AUTO-GENERATED FILE — DO NOT EDIT');
    expect(module).toContain('codegen-clawguard.ts');
  });

  it('emits CLAWGUARD_PATTERN_COUNT matching input length', () => {
    expect(renderPatternsModule(fixture)).toContain('export const CLAWGUARD_PATTERN_COUNT = 1');
  });

  it('emits each pattern as a typed object literal', () => {
    const module = renderPatternsModule(fixture);
    expect(module).toContain("name: 'Test Pattern'");
    expect(module).toContain("severity: 'critical'");
    expect(module).toContain("category: 'prompt_injection'");
  });

  it('emits regex via new RegExp() so pattern flags are preserved', () => {
    expect(renderPatternsModule(fixture)).toContain('new RegExp(');
  });
});

describe('codegen end-to-end against real ClawGuard submodule', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-codegen-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces patterns.ts with exactly 55 patterns from the pinned ClawGuard submodule', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../../..');
    const enginePath = path.join(repoRoot, 'packages/internals-helpers/vendor/clawguard/src/clawguard_core/_engine.py');
    if (!fs.existsSync(enginePath)) {
      throw new Error(`ClawGuard submodule missing: ${enginePath}`);
    }
    const patterns = extractClawGuardPatterns(fs.readFileSync(enginePath, 'utf-8'));
    expect(patterns).toHaveLength(55);

    const module = renderPatternsModule(patterns);
    fs.writeFileSync(path.join(tmpDir, 'patterns.ts'), module);
    expect(module).toContain('export const CLAWGUARD_PATTERN_COUNT = 55');
  });
});
