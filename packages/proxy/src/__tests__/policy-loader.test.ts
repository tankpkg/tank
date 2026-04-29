import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PHASE_2_DEFAULTS } from '~/policy/defaults.js';
import { loadPolicy, resolvePerTool } from '~/policy/loader.js';

describe('PHASE_2_DEFAULTS (D16)', () => {
  it('defines perfBudgetMs = 5 per C10', () => {
    expect(PHASE_2_DEFAULTS.perfBudgetMs).toBe(5);
  });

  it('defaults blockOnMatch to true (block-by-default, D2)', () => {
    expect(PHASE_2_DEFAULTS.blockOnMatch).toBe(true);
  });

  it('defaults resetPinsOnMismatch to false', () => {
    expect(PHASE_2_DEFAULTS.resetPinsOnMismatch).toBe(false);
  });
});

describe('loadPolicy: missing files fall back to defaults', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-policy-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when no user-global or project policy exists', () => {
    const resolved = loadPolicy({
      userPolicyPath: path.join(dir, 'nope.json'),
      projectPolicyPath: path.join(dir, 'also-nope.json')
    });
    expect(resolved.blockOnMatch).toBe(true);
    expect(resolved.perfBudgetMs).toBe(5);
  });

  it('returns defaults when user-global JSON is malformed (safeParse rejection)', () => {
    const userPath = path.join(dir, 'policy.json');
    fs.writeFileSync(userPath, '{not json');
    const resolved = loadPolicy({
      userPolicyPath: userPath,
      projectPolicyPath: path.join(dir, 'missing.json')
    });
    expect(resolved.blockOnMatch).toBe(true);
  });

  it('returns defaults when user-global JSON fails schema validation', () => {
    const userPath = path.join(dir, 'policy.json');
    fs.writeFileSync(userPath, '{"perfBudgetMs": "not a number"}');
    const resolved = loadPolicy({
      userPolicyPath: userPath,
      projectPolicyPath: path.join(dir, 'missing.json')
    });
    expect(resolved.blockOnMatch).toBe(true);
  });
});

describe('loadPolicy: deep-merge (D8 — project wins over user-global)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-policy-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('user-global blockOnMatch=false lowers the default when no project override', () => {
    const userPath = path.join(dir, 'user.json');
    fs.writeFileSync(userPath, JSON.stringify({ blockOnMatch: false }));
    const resolved = loadPolicy({
      userPolicyPath: userPath,
      projectPolicyPath: path.join(dir, 'missing.json')
    });
    expect(resolved.blockOnMatch).toBe(false);
  });

  it('project blockOnMatch=true overrides user-global blockOnMatch=false', () => {
    fs.writeFileSync(path.join(dir, 'user.json'), JSON.stringify({ blockOnMatch: false }));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ blockOnMatch: true }));
    const resolved = loadPolicy({
      userPolicyPath: path.join(dir, 'user.json'),
      projectPolicyPath: path.join(dir, 'project.json')
    });
    expect(resolved.blockOnMatch).toBe(true);
  });

  it('merges perTool maps from both layers with project entries winning on name collision', () => {
    fs.writeFileSync(
      path.join(dir, 'user.json'),
      JSON.stringify({ perTool: { foo: { scan: false }, bar: { scan: true } } })
    );
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ perTool: { foo: { scan: true } } }));
    const resolved = loadPolicy({
      userPolicyPath: path.join(dir, 'user.json'),
      projectPolicyPath: path.join(dir, 'project.json')
    });
    expect(resolved.perTool?.foo?.scan).toBe(true);
    expect(resolved.perTool?.bar?.scan).toBe(true);
  });
});

describe('resolvePerTool (C40)', () => {
  it('returns a blockOnMatch inherited from the resolved global default', () => {
    const effective = resolvePerTool({ blockOnMatch: true }, 'anything');
    expect(effective.blockOnMatch).toBe(true);
  });

  it('per-tool blockOnMatch=false overrides the global default', () => {
    const effective = resolvePerTool({ blockOnMatch: true, perTool: { noisy: { blockOnMatch: false } } }, 'noisy');
    expect(effective.blockOnMatch).toBe(false);
  });

  it('per-tool scan=false exposes the opt-out flag to callers', () => {
    const effective = resolvePerTool({ blockOnMatch: true, perTool: { quiet: { scan: false } } }, 'quiet');
    expect(effective.scan).toBe(false);
  });
});

describe('loadPolicy + resolvePerTool: prototype pollution resistance (edge-case)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-policy-proto-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a policy file that tries to set __proto__ (Zod strict mode)', () => {
    const userPath = path.join(dir, 'user.json');
    fs.writeFileSync(userPath, JSON.stringify({ __proto__: { blockOnMatch: false } }));
    const resolved = loadPolicy({ userPolicyPath: userPath, projectPolicyPath: path.join(dir, 'missing.json') });
    expect(resolved.blockOnMatch).toBe(true);
  });

  it('handles perTool entries with keys that shadow Object.prototype methods', () => {
    const userPath = path.join(dir, 'user.json');
    fs.writeFileSync(
      userPath,
      JSON.stringify({ perTool: { hasOwnProperty: { scan: false }, toString: { blockOnMatch: false } } })
    );
    const resolved = loadPolicy({ userPolicyPath: userPath, projectPolicyPath: path.join(dir, 'missing.json') });
    expect(resolved.perTool?.hasOwnProperty?.scan).toBe(false);
    const effective = resolvePerTool(resolved, 'toString');
    expect(effective.blockOnMatch).toBe(false);
  });

  it('returns defaults when a lookup key is "__proto__" (no prototype walk)', () => {
    const resolved = loadPolicy({
      userPolicyPath: path.join(dir, 'missing-1.json'),
      projectPolicyPath: path.join(dir, 'missing-2.json')
    });
    const effective = resolvePerTool(resolved, '__proto__');
    expect(effective.scan).toBe(true);
    expect(effective.blockOnMatch).toBe(true);
  });

  it('treats unknown tool names as defaults, not lookups on Object.prototype', () => {
    const resolved = loadPolicy({
      userPolicyPath: path.join(dir, 'missing-1.json'),
      projectPolicyPath: path.join(dir, 'missing-2.json')
    });
    const effective = resolvePerTool(resolved, 'constructor');
    expect(effective.scan).toBe(true);
  });

  it('handles a very large policy.json (10k per-tool entries) without blowup', () => {
    const userPath = path.join(dir, 'user.json');
    const perTool: Record<string, { scan: boolean }> = {};
    for (let i = 0; i < 10_000; i++) {
      perTool[`tool_${i}`] = { scan: i % 2 === 0 };
    }
    fs.writeFileSync(userPath, JSON.stringify({ perTool }));
    const start = performance.now();
    const resolved = loadPolicy({ userPolicyPath: userPath, projectPolicyPath: path.join(dir, 'missing.json') });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(resolved.perTool?.tool_42?.scan).toBe(true);
    expect(resolved.perTool?.tool_43?.scan).toBe(false);
  });

  it('falls back to defaults when JSON is null', () => {
    const userPath = path.join(dir, 'user.json');
    fs.writeFileSync(userPath, 'null');
    const resolved = loadPolicy({ userPolicyPath: userPath, projectPolicyPath: path.join(dir, 'missing.json') });
    expect(resolved.blockOnMatch).toBe(true);
  });

  it('falls back to defaults when JSON is an array, not an object', () => {
    const userPath = path.join(dir, 'user.json');
    fs.writeFileSync(userPath, '[1,2,3]');
    const resolved = loadPolicy({ userPolicyPath: userPath, projectPolicyPath: path.join(dir, 'missing.json') });
    expect(resolved.blockOnMatch).toBe(true);
  });
});
