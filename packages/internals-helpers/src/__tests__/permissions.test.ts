import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkPermissionBudget,
  collectPermissionViolations,
  isDomainAllowed,
  isPathAllowed,
  isPathAllowedWithRealpath,
  PermissionBudgetError,
  type PermissionsShape
} from '~/permissions/index.js';

describe('isDomainAllowed', () => {
  it('returns true for exact match', () => {
    expect(isDomainAllowed('api.example.com', ['api.example.com'])).toBe(true);
  });

  it('returns false when no match in list', () => {
    expect(isDomainAllowed('api.example.com', ['api.other.com'])).toBe(false);
  });

  it('returns false for empty allowlist', () => {
    expect(isDomainAllowed('api.example.com', [])).toBe(false);
  });

  it('matches wildcard suffix', () => {
    expect(isDomainAllowed('api.example.com', ['*.example.com'])).toBe(true);
  });

  it('matches wildcard base domain (*.example.com allows example.com)', () => {
    expect(isDomainAllowed('example.com', ['*.example.com'])).toBe(true);
  });

  it('does not match wildcard across different parent', () => {
    expect(isDomainAllowed('api.other.com', ['*.example.com'])).toBe(false);
  });

  it('matches across multiple allowed entries', () => {
    expect(isDomainAllowed('api.b.com', ['*.a.com', '*.b.com'])).toBe(true);
  });
});

describe('isPathAllowed', () => {
  it('returns true for exact match', () => {
    expect(isPathAllowed('./src/index.ts', ['./src/index.ts'])).toBe(true);
  });

  it('matches glob suffix /**', () => {
    expect(isPathAllowed('./src/foo/bar.ts', ['./src/**'])).toBe(true);
  });

  it('matches glob suffix at boundary (./src matches ./src/**)', () => {
    expect(isPathAllowed('./src', ['./src/**'])).toBe(true);
  });

  it('rejects path traversal with ..', () => {
    expect(isPathAllowed('./src/../secrets', ['./src/**'])).toBe(false);
  });

  it('rejects traversal even if allowlist contains ..', () => {
    expect(isPathAllowed('../secrets', ['./src/**'])).toBe(false);
  });

  it('normalizes backslash paths to forward slash', () => {
    expect(isPathAllowed('.\\src\\index.ts', ['./src/index.ts'])).toBe(true);
  });

  it('returns false for non-matching path', () => {
    expect(isPathAllowed('./other/file.ts', ['./src/**'])).toBe(false);
  });

  it('returns false for empty allowlist', () => {
    expect(isPathAllowed('./src/index.ts', [])).toBe(false);
  });
});

describe('checkPermissionBudget', () => {
  it('returns without throwing when skillPerms is undefined', () => {
    expect(() => checkPermissionBudget({}, undefined, 'skill-a')).not.toThrow();
  });

  it('allows exact domain match', () => {
    const budget: PermissionsShape = { network: { outbound: ['api.example.com'] } };
    const perms: PermissionsShape = { network: { outbound: ['api.example.com'] } };
    expect(() => checkPermissionBudget(budget, perms, 'skill-a')).not.toThrow();
  });

  it('throws PermissionBudgetError when skill requests subprocess but budget denies', () => {
    expect(() => checkPermissionBudget({ subprocess: false }, { subprocess: true }, 'skill-a')).toThrow(
      PermissionBudgetError
    );
  });

  it('throws PermissionBudgetError when network outbound exceeds budget', () => {
    const budget: PermissionsShape = { network: { outbound: ['api.example.com'] } };
    const perms: PermissionsShape = { network: { outbound: ['api.evil.com'] } };
    expect(() => checkPermissionBudget(budget, perms, 'skill-a')).toThrow(/network access to "api\.evil\.com"/);
  });

  it('throws PermissionBudgetError when filesystem read exceeds budget', () => {
    const budget: PermissionsShape = { filesystem: { read: ['./src/**'] } };
    const perms: PermissionsShape = { filesystem: { read: ['./secrets/**'] } };
    expect(() => checkPermissionBudget(budget, perms, 'skill-a')).toThrow(/filesystem read access/);
  });

  it('throws PermissionBudgetError when filesystem write exceeds budget', () => {
    const budget: PermissionsShape = { filesystem: { write: ['./dist/**'] } };
    const perms: PermissionsShape = { filesystem: { write: ['./src/**'] } };
    expect(() => checkPermissionBudget(budget, perms, 'skill-a')).toThrow(/filesystem write access/);
  });

  it('includes skillName in thrown error message', () => {
    expect(() => checkPermissionBudget({ subprocess: false }, { subprocess: true }, 'my-malicious-skill')).toThrow(
      /my-malicious-skill/
    );
  });

  it('does not throw when budget allows subprocess', () => {
    expect(() => checkPermissionBudget({ subprocess: true }, { subprocess: true }, 'skill-a')).not.toThrow();
  });

  it('does not throw on empty outbound array', () => {
    const budget: PermissionsShape = {};
    const perms: PermissionsShape = { network: { outbound: [] } };
    expect(() => checkPermissionBudget(budget, perms, 'skill-a')).not.toThrow();
  });
});

describe('collectPermissionViolations', () => {
  it('returns empty array when skillPerms is undefined', () => {
    expect(collectPermissionViolations({}, undefined, 'skill-a')).toEqual([]);
  });

  it('returns empty array when all permissions within budget', () => {
    const budget: PermissionsShape = { network: { outbound: ['api.example.com'] } };
    const perms: PermissionsShape = { network: { outbound: ['api.example.com'] } };
    expect(collectPermissionViolations(budget, perms, 'skill-a')).toEqual([]);
  });

  it('collects subprocess violation', () => {
    const violations = collectPermissionViolations({ subprocess: false }, { subprocess: true }, 'skill-a');
    expect(violations).toEqual([{ skillName: 'skill-a', type: 'subprocess', requested: 'true' }]);
  });

  it('collects network outbound violation', () => {
    const budget: PermissionsShape = { network: { outbound: ['api.a.com'] } };
    const perms: PermissionsShape = { network: { outbound: ['api.b.com'] } };
    expect(collectPermissionViolations(budget, perms, 'skill-a')).toEqual([
      { skillName: 'skill-a', type: 'network.outbound', requested: 'api.b.com' }
    ]);
  });

  it('collects filesystem read violation', () => {
    const budget: PermissionsShape = { filesystem: { read: ['./src/**'] } };
    const perms: PermissionsShape = { filesystem: { read: ['./secrets'] } };
    expect(collectPermissionViolations(budget, perms, 'skill-a')).toEqual([
      { skillName: 'skill-a', type: 'filesystem.read', requested: './secrets' }
    ]);
  });

  it('collects filesystem write violation', () => {
    const budget: PermissionsShape = { filesystem: { write: ['./dist/**'] } };
    const perms: PermissionsShape = { filesystem: { write: ['./src'] } };
    expect(collectPermissionViolations(budget, perms, 'skill-a')).toEqual([
      { skillName: 'skill-a', type: 'filesystem.write', requested: './src' }
    ]);
  });

  it('collects multiple violations across types', () => {
    const budget: PermissionsShape = { subprocess: false };
    const perms: PermissionsShape = {
      subprocess: true,
      network: { outbound: ['evil.com'] },
      filesystem: { read: ['./secrets'], write: ['./etc'] }
    };
    const violations = collectPermissionViolations(budget, perms, 'skill-a');
    expect(violations).toHaveLength(4);
    expect(violations.map((v) => v.type).sort()).toEqual([
      'filesystem.read',
      'filesystem.write',
      'network.outbound',
      'subprocess'
    ]);
  });

  it('attributes violations to correct skillName', () => {
    const violations = collectPermissionViolations({ subprocess: false }, { subprocess: true }, 'pkg-xyz');
    expect(violations[0]?.skillName).toBe('pkg-xyz');
  });
});

describe('isPathAllowedWithRealpath', () => {
  let workDir: string;
  let allowedDir: string;
  let secretDir: string;
  let escapeLink: string;
  let normalFile: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'tank-symlink-test-'));
    allowedDir = join(workDir, 'allowed');
    secretDir = join(workDir, 'secrets');
    await mkdir(allowedDir, { recursive: true });
    await mkdir(secretDir, { recursive: true });
    normalFile = join(allowedDir, 'ok.txt');
    await writeFile(normalFile, 'ok');
    await writeFile(join(secretDir, 'leak.txt'), 'leak');
    escapeLink = join(allowedDir, 'escape');
    await symlink(secretDir, escapeLink, 'dir');
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('rejects symlink inside allowed dir that points outside (escape attack)', async () => {
    const result = await isPathAllowedWithRealpath(escapeLink, [`${allowedDir}/**`]);
    expect(result).toBe(false);
  });

  it('accepts real path inside allowed dir', async () => {
    const result = await isPathAllowedWithRealpath(normalFile, [`${allowedDir}/**`]);
    expect(result).toBe(true);
  });

  it('accepts exact allowed path with no symlink', async () => {
    const result = await isPathAllowedWithRealpath(normalFile, [normalFile]);
    expect(result).toBe(true);
  });

  it('rejects path containing .. even if realpath would resolve inside', async () => {
    const result = await isPathAllowedWithRealpath(`${allowedDir}/../secrets`, [`${allowedDir}/**`]);
    expect(result).toBe(false);
  });

  it('falls back to string-match when path does not exist on disk', async () => {
    const ghost = join(allowedDir, 'does-not-exist.txt');
    const result = await isPathAllowedWithRealpath(ghost, [`${allowedDir}/**`]);
    expect(result).toBe(true);
  });
});
