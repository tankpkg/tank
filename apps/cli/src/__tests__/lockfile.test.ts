import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SkillsLock, Permissions } from '@tank/shared';

import {
  readLockfile,
  writeLockfile,
  computeResolvedPermissions,
  computeBudgetCheck,
} from '../lib/lockfile.js';

describe('readLockfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-lockfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no lockfile exists', () => {
    const result = readLockfile(tmpDir);
    expect(result).toBeNull();
  });

  it('returns parsed lockfile when valid', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        '@org/skill@1.0.0': {
          resolved: 'https://example.com/skill-1.0.0.tgz',
          integrity: 'sha512-abc123',
          permissions: { network: { outbound: ['*.example.com'] } },
          audit_score: 8.5,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(lock, null, 2) + '\n',
    );

    const result = readLockfile(tmpDir);
    expect(result).toEqual(lock);
  });

  it('returns null on corrupt JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'skills.lock'), '{not valid json!!!');
    const result = readLockfile(tmpDir);
    expect(result).toBeNull();
  });
});

describe('writeLockfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-lockfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces deterministic output (same input → same bytes)', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        'b-skill@1.0.0': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-bbb',
          permissions: {},
          audit_score: 5.0,
        },
        'a-skill@2.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: {},
          audit_score: 9.0,
        },
      },
    };

    writeLockfile(lock, tmpDir);
    const first = fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8');

    // Write again — should produce identical bytes
    writeLockfile(lock, tmpDir);
    const second = fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8');

    expect(first).toBe(second);
  });

  it('sorts skill keys alphabetically', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        'z-skill@1.0.0': {
          resolved: 'https://example.com/z.tgz',
          integrity: 'sha512-zzz',
          permissions: {},
          audit_score: 5.0,
        },
        '@alpha/skill@2.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: {},
          audit_score: 9.0,
        },
        'middle@1.0.0': {
          resolved: 'https://example.com/m.tgz',
          integrity: 'sha512-mmm',
          permissions: {},
          audit_score: 7.0,
        },
      },
    };

    writeLockfile(lock, tmpDir);
    const raw = fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8');
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed.skills);
    expect(keys).toEqual(['@alpha/skill@2.0.0', 'middle@1.0.0', 'z-skill@1.0.0']);
  });

  it('includes trailing newline', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {},
    };

    writeLockfile(lock, tmpDir);
    const raw = fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('computeResolvedPermissions', () => {
  it('merges network outbound from multiple skills', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        'skill-a@1.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: { network: { outbound: ['*.example.com'] } },
          audit_score: 8.0,
        },
        'skill-b@1.0.0': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-bbb',
          permissions: { network: { outbound: ['*.api.io', '*.example.com'] } },
          audit_score: 7.0,
        },
      },
    };

    const result = computeResolvedPermissions(lock);
    expect(result.network?.outbound).toBeDefined();
    // Should contain unique union of all outbound domains
    expect(result.network!.outbound).toContain('*.example.com');
    expect(result.network!.outbound).toContain('*.api.io');
    // No duplicates
    const outbound = result.network!.outbound!;
    expect(outbound.length).toBe(new Set(outbound).size);
  });

  it('merges filesystem read/write from multiple skills', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        'skill-a@1.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: { filesystem: { read: ['./src/**'], write: ['./output/**'] } },
          audit_score: 8.0,
        },
        'skill-b@1.0.0': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-bbb',
          permissions: { filesystem: { read: ['./docs/**'], write: ['./output/**'] } },
          audit_score: 7.0,
        },
      },
    };

    const result = computeResolvedPermissions(lock);
    expect(result.filesystem?.read).toContain('./src/**');
    expect(result.filesystem?.read).toContain('./docs/**');
    expect(result.filesystem?.write).toContain('./output/**');
    // No duplicates in write
    expect(result.filesystem!.write!.length).toBe(1);
  });

  it('handles subprocess: true from any skill', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {
        'skill-a@1.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: { subprocess: false },
          audit_score: 8.0,
        },
        'skill-b@1.0.0': {
          resolved: 'https://example.com/b.tgz',
          integrity: 'sha512-bbb',
          permissions: { subprocess: true },
          audit_score: 7.0,
        },
      },
    };

    const result = computeResolvedPermissions(lock);
    // If ANY skill requests subprocess, the union is true
    expect(result.subprocess).toBe(true);
  });

  it('returns empty permissions for empty lockfile', () => {
    const lock: SkillsLock = {
      lockfileVersion: 1,
      skills: {},
    };

    const result = computeResolvedPermissions(lock);
    expect(result).toEqual({});
  });
});

describe('computeBudgetCheck', () => {
  it('returns "pass" when resolved permissions fit within budget', () => {
    const resolved: Permissions = {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false,
    };
    const budget: Permissions = {
      network: { outbound: ['*.example.com', '*.api.io'] },
      filesystem: { read: ['./src/**', './docs/**'], write: ['./output/**'] },
      subprocess: true,
    };

    expect(computeBudgetCheck(resolved, budget)).toBe('pass');
  });

  it('returns "fail" when resolved permissions exceed budget', () => {
    const resolved: Permissions = {
      network: { outbound: ['*.evil.com'] },
      subprocess: true,
    };
    const budget: Permissions = {
      network: { outbound: ['*.example.com'] },
      subprocess: false,
    };

    expect(computeBudgetCheck(resolved, budget)).toBe('fail');
  });

  it('returns "no_budget" when no project permissions defined', () => {
    const resolved: Permissions = {
      network: { outbound: ['*.example.com'] },
    };

    expect(computeBudgetCheck(resolved, undefined)).toBe('no_budget');
  });
});
