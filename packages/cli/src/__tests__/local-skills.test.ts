import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lockedSkillSchema, type Permissions, type SkillsLock } from '@internals/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistryFetcher } from '~/lib/dependency-resolver.js';
import {
  buildLocalLockEntry,
  createLocalAwareFetcher,
  diffLocalLockEntry,
  dropStaleLocalEntries,
  isLinkSpec,
  type LocalSkill,
  mergeLocalLockEntries,
  readLocalSkill,
  readLocalSkills,
  resolveLinkSpec,
  splitSkillSpecs
} from '~/lib/local-skills.js';

// Validates: idd/modules/install/INTENT.md C19–C27

interface LocalSkillFixture {
  name: string;
  version?: string;
  permissions?: Permissions;
  skills?: Record<string, string>;
  withSkillMd?: boolean;
}

let root: string;

function writeLocalSkill(relDir: string, fixture: LocalSkillFixture): string {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  if (fixture.withSkillMd !== false) {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${fixture.name}\ndescription: test\n---\n# Skill\n`);
  }
  const manifest = {
    name: fixture.name,
    version: fixture.version ?? '1.0.0',
    ...(fixture.permissions ? { permissions: fixture.permissions } : {}),
    ...(fixture.skills ? { skills: fixture.skills } : {})
  };
  fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

function sampleLocal(overrides: Partial<LocalSkill> = {}): LocalSkill {
  return {
    name: '@acme/pr-description',
    version: '1.0.0',
    spec: 'link:./skills/pr-description',
    dir: path.join(root, 'skills', 'pr-description'),
    permissions: { subprocess: false },
    dependencies: { '@tank/crystal-clear-docs': '^1.1.0' },
    hasMcpServer: false,
    ...overrides
  };
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tank-local-skills-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('isLinkSpec / splitSkillSpecs', () => {
  it('separates link: specs from registry ranges', () => {
    const specs = splitSkillSpecs({
      '@tank/clean-code': '3.1.0',
      '@acme/pr-description': 'link:./skills/pr-description'
    });
    expect(specs.registry).toEqual({ '@tank/clean-code': '3.1.0' });
    expect(specs.local).toEqual({ '@acme/pr-description': 'link:./skills/pr-description' });
  });

  it('treats only the link: prefix as local', () => {
    expect(isLinkSpec('link:./x')).toBe(true);
    expect(isLinkSpec('^1.0.0')).toBe(false);
    expect(isLinkSpec('workspace:*')).toBe(false);
    expect(isLinkSpec(undefined)).toBe(false);
  });
});

describe('resolveLinkSpec', () => {
  it('normalizes the spec to a POSIX path relative to the root', () => {
    writeLocalSkill('skills/pr-description', { name: '@acme/pr-description' });
    const target = resolveLinkSpec('@acme/pr-description', 'link:skills/./pr-description', root);
    expect(target.spec).toBe('link:./skills/pr-description');
    expect(target.dir).toBe(path.join(root, 'skills', 'pr-description'));
  });

  it('rejects .. escapes', () => {
    expect(() => resolveLinkSpec('@acme/evil', 'link:../outside', root)).toThrow(/outside the project root/);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveLinkSpec('@acme/evil', 'link:/etc', root)).toThrow(/relative path/);
  });

  it('rejects the project root itself', () => {
    expect(() => resolveLinkSpec('@acme/evil', 'link:.', root)).toThrow(/outside the project root/);
  });

  it('rejects a symlink inside the root that points outside it', () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tank-outside-')));
    try {
      fs.symlinkSync(outside, path.join(root, 'sneaky'), 'dir');
      expect(() => resolveLinkSpec('@acme/evil', 'link:./sneaky', root)).toThrow(/symlink/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('accepts an in-project folder whose name starts with ..', () => {
    writeLocalSkill('..skills', { name: '@acme/dots' });
    expect(resolveLinkSpec('@acme/dots', 'link:./..skills', root).spec).toBe('link:./..skills');
  });

  it('rejects a missing folder', () => {
    expect(() => resolveLinkSpec('@acme/x', 'link:./nope', root)).toThrow(/not a folder/);
  });
});

describe('readLocalSkill', () => {
  it('reads name, version, permissions and registry deps', () => {
    writeLocalSkill('skills/pr-description', {
      name: '@acme/pr-description',
      permissions: { network: { outbound: ['api.github.com'] } },
      skills: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    const local = readLocalSkill('@acme/pr-description', 'link:./skills/pr-description', root);
    expect(local.version).toBe('1.0.0');
    expect(local.permissions).toEqual({ network: { outbound: ['api.github.com'] } });
    expect(local.dependencies).toEqual({ '@tank/crystal-clear-docs': '^1.1.0' });
  });

  it('fails on a name mismatch and shows both names', () => {
    writeLocalSkill('skills/b', { name: '@acme/b' });
    expect(() => readLocalSkill('@acme/a', 'link:./skills/b', root)).toThrow(/"@acme\/a".*"@acme\/b"/);
  });

  it('requires SKILL.md', () => {
    writeLocalSkill('skills/a', { name: '@acme/a', withSkillMd: false });
    expect(() => readLocalSkill('@acme/a', 'link:./skills/a', root)).toThrow(/no SKILL.md/);
  });

  it('rejects an invalid version in the local tank.json', () => {
    writeLocalSkill('skills/a', { name: '@acme/a', version: 'latest' });
    expect(() => readLocalSkill('@acme/a', 'link:./skills/a', root)).toThrow(/version/);
  });

  it('rejects a local skill that declares its own link: dependency', () => {
    writeLocalSkill('skills/a', { name: '@acme/a', skills: { '@acme/b': 'link:../b' } });
    expect(() => readLocalSkill('@acme/a', 'link:./skills/a', root)).toThrow(/List local skills in the root/);
  });

  it('flags a declared mcp_server', () => {
    writeLocalSkill('skills/a', { name: '@acme/a' });
    const manifestPath = path.join(root, 'skills', 'a', 'tank.json');
    const manifest = { name: '@acme/a', version: '1.0.0', mcp_server: { command: 'node', args: ['server.js'] } };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(readLocalSkill('@acme/a', 'link:./skills/a', root).hasMcpServer).toBe(true);
  });

  it('readLocalSkills validates every entry and returns them sorted', () => {
    writeLocalSkill('skills/b', { name: '@acme/b' });
    writeLocalSkill('skills/a', { name: '@acme/a' });
    const locals = readLocalSkills({ '@acme/b': 'link:./skills/b', '@acme/a': 'link:./skills/a' }, root);
    expect(locals.map((l) => l.name)).toEqual(['@acme/a', '@acme/b']);
  });
});

describe('createLocalAwareFetcher', () => {
  function baseFetcher(dependencies: Record<string, string> = {}): RegistryFetcher {
    return {
      fetchVersions: vi.fn().mockResolvedValue([]),
      fetchMetadata: vi.fn().mockResolvedValue({
        name: '@tank/x',
        version: '1.0.0',
        integrity: 'sha512-x',
        permissions: {},
        auditScore: 9,
        downloadUrl: 'https://example.com/x.tgz',
        dependencies
      })
    };
  }

  it('answers local skills from disk and never calls the registry for them', async () => {
    const base = baseFetcher();
    const fetcher = createLocalAwareFetcher(base, [sampleLocal()]);
    const versions = await fetcher.fetchVersions('@acme/pr-description');
    const meta = await fetcher.fetchMetadata('@acme/pr-description', '1.0.0');
    expect(versions.map((v) => v.version)).toEqual(['1.0.0']);
    expect(meta.dependencies).toEqual({ '@tank/crystal-clear-docs': '^1.1.0' });
    expect(base.fetchVersions).not.toHaveBeenCalled();
    expect(base.fetchMetadata).not.toHaveBeenCalled();
  });

  it('rejects a registry skill whose metadata declares a link: dependency', async () => {
    const fetcher = createLocalAwareFetcher(baseFetcher({ '@acme/a': 'link:./a' }), []);
    await expect(fetcher.fetchMetadata('@tank/x', '1.0.0')).rejects.toThrow(/@tank\/x@1.0.0/);
  });
});

describe('lock entries', () => {
  it('builds a schema-valid local entry with null integrity', () => {
    const entry = buildLocalLockEntry(sampleLocal());
    expect(entry).toMatchObject({ source: 'local', resolved: 'link:./skills/pr-description', integrity: null });
    expect(lockedSkillSchema.safeParse(entry).success).toBe(true);
  });

  it('mergeLocalLockEntries replaces stale versions of a local skill and keeps registry entries', () => {
    const lock: SkillsLock = {
      lockfileVersion: 2,
      skills: {
        '@acme/pr-description@0.9.0': buildLocalLockEntry(sampleLocal({ version: '0.9.0' })),
        '@tank/clean-code@3.1.0': {
          resolved: 'https://example.com/clean-code.tgz',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: 9
        }
      }
    };
    const merged = mergeLocalLockEntries(lock, [sampleLocal()]);
    expect(Object.keys(merged.skills)).toEqual(['@acme/pr-description@1.0.0', '@tank/clean-code@3.1.0']);
  });

  it('dropStaleLocalEntries removes local entries no longer linked in tank.json, keeps the rest', () => {
    const lock: SkillsLock = {
      lockfileVersion: 2,
      skills: {
        '@acme/pr-description@1.0.0': buildLocalLockEntry(sampleLocal()),
        '@acme/kept@1.0.0': buildLocalLockEntry(sampleLocal({ name: '@acme/kept', spec: 'link:./skills/kept' })),
        '@tank/clean-code@3.1.0': {
          resolved: 'https://example.com/clean-code.tgz',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: 9
        }
      }
    };
    const removed = dropStaleLocalEntries(lock, { '@acme/kept': 'link:./skills/kept' });
    expect(removed).toEqual(['@acme/pr-description@1.0.0']);
    expect(Object.keys(lock.skills)).toEqual(['@acme/kept@1.0.0', '@tank/clean-code@3.1.0']);
  });

  it('diffLocalLockEntry is empty when in sync and order-insensitive', () => {
    const local = sampleLocal({ permissions: { network: { outbound: ['a.com', 'b.com'] } } });
    const entry = buildLocalLockEntry(sampleLocal({ permissions: { network: { outbound: ['b.com', 'a.com'] } } }));
    expect(diffLocalLockEntry('1.0.0', entry, local)).toEqual([]);
  });

  it('diffLocalLockEntry names every changed field', () => {
    const entry = buildLocalLockEntry(sampleLocal());
    const changedLocal = sampleLocal({
      version: '1.1.0',
      permissions: { subprocess: true },
      dependencies: {},
      spec: 'link:./skills/other'
    });
    expect(diffLocalLockEntry('1.0.0', entry, changedLocal)).toEqual([
      'version 1.0.0 → 1.1.0',
      'path link:./skills/pr-description → link:./skills/other',
      'permissions',
      'dependencies'
    ]);
  });
});
