import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnforcementBudget } from '~/enforcer/manifest-loader.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-manifest-loader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTankJson(dir: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify(content));
}

function writeTankLock(dir: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, 'tank.lock'), JSON.stringify(content));
}

describe('loadEnforcementBudget: no manifest anywhere', () => {
  it('returns { found: false, budget: null } and does not throw (C26a warn+allow upstream)', () => {
    const result = loadEnforcementBudget(tmpDir);
    expect(result.found).toBe(false);
    expect(result.budget).toBeNull();
  });
});

describe('loadEnforcementBudget: tank.json only', () => {
  it('reads top-level permissions from tank.json when no lockfile exists', () => {
    writeTankJson(tmpDir, {
      name: '@org/test',
      version: '1.0.0',
      permissions: {
        network: { outbound: ['api.example.com'] },
        filesystem: { read: ['./src/**'], write: ['./output/**'] },
        subprocess: false
      }
    });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.found).toBe(true);
    expect(result.source).toBe('tank.json');
    expect(result.budget?.network?.outbound).toEqual(['api.example.com']);
    expect(result.budget?.filesystem?.read).toEqual(['./src/**']);
  });

  it('treats tank.json without permissions field as no-budget (warn+allow fallback)', () => {
    writeTankJson(tmpDir, { name: '@org/test', version: '1.0.0' });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.found).toBe(false);
    expect(result.budget).toBeNull();
  });
});

describe('loadEnforcementBudget: tank.lock wins (D2)', () => {
  it('unions skill permissions from tank.lock and ignores tank.json when lockfile exists', () => {
    writeTankJson(tmpDir, {
      name: '@org/root',
      version: '1.0.0',
      permissions: { network: { outbound: ['should-not-appear.com'] } }
    });
    writeTankLock(tmpDir, {
      lockfileVersion: 2,
      skills: {
        '@org/a': {
          resolved: 'https://registry.example.com/a-1.0.0.tgz',
          integrity: 'sha512-abc',
          permissions: { network: { outbound: ['api.stripe.com'] } },
          audit_score: null
        },
        '@org/b': {
          resolved: 'https://registry.example.com/b-1.0.0.tgz',
          integrity: 'sha512-def',
          permissions: { network: { outbound: ['api.github.com'] } },
          audit_score: null
        }
      }
    });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.source).toBe('tank.lock');
    expect(new Set(result.budget?.network?.outbound)).toEqual(new Set(['api.stripe.com', 'api.github.com']));
    expect(result.budget?.network?.outbound).not.toContain('should-not-appear.com');
  });

  it('unions filesystem.read and filesystem.write independently per skill', () => {
    writeTankLock(tmpDir, {
      lockfileVersion: 2,
      skills: {
        '@org/a': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: { filesystem: { read: ['./src/**'], write: ['./tmp/**'] } },
          audit_score: null
        },
        '@org/b': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-bbb',
          permissions: { filesystem: { read: ['./docs/**'], write: ['./output/**'] } },
          audit_score: null
        }
      }
    });
    const result = loadEnforcementBudget(tmpDir);
    expect(new Set(result.budget?.filesystem?.read)).toEqual(new Set(['./src/**', './docs/**']));
    expect(new Set(result.budget?.filesystem?.write)).toEqual(new Set(['./tmp/**', './output/**']));
  });

  it('subprocess=true on any skill grants subprocess in the unioned budget', () => {
    writeTankLock(tmpDir, {
      lockfileVersion: 2,
      skills: {
        '@org/a': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-a',
          permissions: { subprocess: false },
          audit_score: null
        },
        '@org/b': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-b',
          permissions: { subprocess: true },
          audit_score: null
        }
      }
    });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.budget?.subprocess).toBe(true);
  });

  it('deduplicates repeated domains across skills', () => {
    writeTankLock(tmpDir, {
      lockfileVersion: 2,
      skills: {
        a: {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-a',
          permissions: { network: { outbound: ['api.example.com'] } },
          audit_score: null
        },
        b: {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-b',
          permissions: { network: { outbound: ['api.example.com'] } },
          audit_score: null
        }
      }
    });
    expect(result_outbound(tmpDir)).toEqual(['api.example.com']);
  });

  it('tank.lock with no skills yields empty permission budget (enforces zero access)', () => {
    writeTankLock(tmpDir, { lockfileVersion: 2, skills: {} });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.found).toBe(true);
    expect(result.source).toBe('tank.lock');
    expect(result.budget?.network?.outbound).toEqual([]);
  });

  it('falls back to tank.json when tank.lock is malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'tank.lock'), '{not json');
    writeTankJson(tmpDir, {
      name: '@org/test',
      version: '1.0.0',
      permissions: { network: { outbound: ['api.fallback.com'] } }
    });
    const result = loadEnforcementBudget(tmpDir);
    expect(result.source).toBe('tank.json');
    expect(result.budget?.network?.outbound).toEqual(['api.fallback.com']);
  });

  it('falls back to tank.json when tank.lock fails schema validation', () => {
    fs.writeFileSync(path.join(tmpDir, 'tank.lock'), JSON.stringify({ lockfileVersion: 99, skills: 'not-a-map' }));
    writeTankJson(tmpDir, {
      name: '@org/test',
      version: '1.0.0',
      permissions: { network: { outbound: ['api.fallback.com'] } }
    });
    expect(loadEnforcementBudget(tmpDir).source).toBe('tank.json');
  });
});

describe('loadEnforcementBudget: upward walk from nested cwd', () => {
  it('finds tank.lock in a parent directory up to 32 levels', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'working', 'dir');
    fs.mkdirSync(nested, { recursive: true });
    writeTankLock(tmpDir, {
      lockfileVersion: 2,
      skills: {
        a: {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-a',
          permissions: { network: { outbound: ['found.example.com'] } },
          audit_score: null
        }
      }
    });
    const result = loadEnforcementBudget(nested);
    expect(result.source).toBe('tank.lock');
    expect(result.budget?.network?.outbound).toContain('found.example.com');
  });

  it('stops walking at the filesystem root when nothing found', () => {
    const nested = path.join(tmpDir, 'no-manifest-here');
    fs.mkdirSync(nested, { recursive: true });
    const result = loadEnforcementBudget(nested);
    expect(result.found).toBe(false);
  });
});

function result_outbound(dir: string): string[] {
  return loadEnforcementBudget(dir).budget?.network?.outbound ?? [];
}
