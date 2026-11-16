import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Permissions, type SkillsLock, skillsLockSchema } from '@internals/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

vi.mock('ora', () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: ''
  };
  return { default: vi.fn(() => spinner) };
});

vi.mock('tar', () => ({ extract: vi.fn().mockResolvedValue(undefined) }));

// Validates: idd/modules/install/INTENT.md C19–C27 (bdd/features/system/local-skills/local-skills.feature)

const REGISTRY = 'https://registry.test';

interface FakeSkill {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  permissions: Permissions;
  tarball: Buffer;
}

function fakeSkill(name: string, version: string, dependencies: Record<string, string> = {}): FakeSkill {
  return { name, version, dependencies, permissions: {}, tarball: Buffer.from(`${name}@${version}`) };
}

function integrityOf(buffer: Buffer): string {
  return `sha512-${crypto.createHash('sha512').update(buffer).digest('base64')}`;
}

const REGISTRY_SKILLS: FakeSkill[] = [
  fakeSkill('@tank/clean-code', '3.1.0'),
  fakeSkill('@tank/crystal-clear-docs', '1.1.0'),
  fakeSkill('@tank/crystal-clear-docs', '1.2.0')
];

interface RecordedRequest {
  url: string;
  body: string;
}

let requests: RecordedRequest[];

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function metaFor(skill: FakeSkill): object {
  return {
    name: skill.name,
    version: skill.version,
    integrity: integrityOf(skill.tarball),
    permissions: skill.permissions,
    auditScore: 9,
    auditStatus: 'completed',
    downloadUrl: `https://storage.test/${encodeURIComponent(skill.name)}-${skill.version}.tgz`,
    publishedAt: '2026-01-01T00:00:00Z',
    dependencies: skill.dependencies
  };
}

function routeRegistry(url: string): Response {
  const download = REGISTRY_SKILLS.find(
    (s) => url === `https://storage.test/${encodeURIComponent(s.name)}-${s.version}.tgz`
  );
  if (download) return new Response(new Uint8Array(download.tarball), { status: 200 });

  const match = url.match(/^https:\/\/registry\.test\/api\/v1\/skills\/([^/]+)\/([^/]+)$/);
  if (!match) return jsonResponse({ error: 'not found' }, 404);
  const name = decodeURIComponent(match[1]);
  const versions = REGISTRY_SKILLS.filter((s) => s.name === name);
  if (versions.length === 0) return jsonResponse({ error: 'not found' }, 404);
  if (match[2] === 'versions') {
    return jsonResponse({
      name,
      versions: versions.map((s) => ({
        version: s.version,
        integrity: integrityOf(s.tarball),
        auditScore: 9,
        auditStatus: 'completed',
        publishedAt: '2026-01-01T00:00:00Z'
      }))
    });
  }
  const skill = versions.find((s) => s.version === match[2]);
  return skill ? jsonResponse(metaFor(skill)) : jsonResponse({ error: 'not found' }, 404);
}

let root: string;
let home: string;
let configDir: string;

function writeJson(filePath: string, value: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeLocalSkill(relDir: string, manifest: object): void {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: local\ndescription: local skill\n---\n# Local\n');
  writeJson(path.join(dir, 'tank.json'), manifest);
}

function writeProject(skills: Record<string, string>, permissions?: Permissions): void {
  writeJson(path.join(root, 'tank.json'), {
    name: '@acme/skills-repo',
    version: '1.0.0',
    skills,
    ...(permissions ? { permissions } : {})
  });
}

function readLock(): SkillsLock {
  const parsed = skillsLockSchema.safeParse(JSON.parse(fs.readFileSync(path.join(root, 'tank.lock'), 'utf-8')));
  if (!parsed.success) throw new Error(`tank.lock failed schema: ${parsed.error.message}`);
  return parsed.data;
}

function claudeLinkTarget(symlinkName: string): string | null {
  const linkPath = path.join(home, '.claude', 'skills', symlinkName);
  return fs.existsSync(linkPath) ? fs.realpathSync(linkPath) : null;
}

function standardRepo(budget: Permissions = { subprocess: false }): void {
  writeProject(
    {
      '@tank/clean-code': '3.1.0',
      '@acme/pr-description': 'link:./skills/pr-description'
    },
    budget
  );
  writeLocalSkill('skills/pr-description', {
    name: '@acme/pr-description',
    version: '1.0.0',
    permissions: { subprocess: false },
    skills: { '@tank/crystal-clear-docs': '^1.1.0' }
  });
}

async function runInstallAll(): Promise<void> {
  const { installAll } = await import('~/commands/install.js');
  await installAll({ directory: root, configDir, homedir: home });
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tank-local-install-')));
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tank-local-home-')));
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-local-config-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  writeJson(path.join(configDir, 'config.json'), { registry: REGISTRY });

  requests = [];
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    return routeRegistry(url);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of [root, home, configDir]) fs.rmSync(dir, { recursive: true, force: true });
});

describe('tank install with link: skills (no lockfile)', () => {
  it('installs registry deps, resolves local skill deps and links the local skill', async () => {
    standardRepo();
    await runInstallAll();

    const lock = readLock();
    expect(Object.keys(lock.skills)).toEqual([
      '@acme/pr-description@1.0.0',
      '@tank/clean-code@3.1.0',
      '@tank/crystal-clear-docs@1.2.0'
    ]);
    expect(lock.skills['@acme/pr-description@1.0.0']).toEqual({
      source: 'local',
      resolved: 'link:./skills/pr-description',
      integrity: null,
      permissions: { subprocess: false },
      audit_score: null,
      dependencies: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    expect(lock.skills['@tank/clean-code@3.1.0'].integrity).toMatch(/^sha512-/);

    expect(claudeLinkTarget('acme--pr-description')).toBe(path.join(root, 'skills', 'pr-description'));
    expect(requests.some((r) => r.url.includes('pr-description'))).toBe(false);
    expect(requests.every((r) => r.body === '')).toBe(true);
  });

  it('rejects a local skill over the project budget, naming the skill and permission', async () => {
    standardRepo({ subprocess: false });
    writeLocalSkill('skills/code-review', {
      name: '@acme/code-review',
      version: '1.0.0',
      permissions: { subprocess: true }
    });
    writeProject(
      {
        '@tank/clean-code': '3.1.0',
        '@acme/pr-description': 'link:./skills/pr-description',
        '@acme/code-review': 'link:./skills/code-review'
      },
      { subprocess: false }
    );

    await expect(runInstallAll()).rejects.toThrow(
      /@acme\/code-review[\s\S]*subprocess|subprocess[\s\S]*@acme\/code-review/
    );
    expect(claudeLinkTarget('acme--code-review')).toBeNull();
    expect(claudeLinkTarget('acme--pr-description')).toBeNull();
    expect(fs.existsSync(path.join(root, 'tank.lock'))).toBe(false);
  });

  it('rejects a path escape before any request or link', async () => {
    writeProject({ '@tank/clean-code': '3.1.0', '@acme/evil': 'link:../outside' });
    await expect(runInstallAll()).rejects.toThrow(/outside the project root/);
    expect(requests).toEqual([]);
    expect(fs.existsSync(path.join(home, '.claude', 'skills'))).toBe(false);
  });

  it('rejects a name mismatch and shows both names', async () => {
    writeProject({ '@acme/a': 'link:./skills/b' });
    writeLocalSkill('skills/b', { name: '@acme/b', version: '1.0.0' });
    await expect(runInstallAll()).rejects.toThrow(/@acme\/a[\s\S]*@acme\/b/);
    expect(requests).toEqual([]);
  });

  it('reports a version conflict between a local skill and the root manifest', async () => {
    writeProject({
      '@tank/crystal-clear-docs': '1.1.0',
      '@acme/pr-description': 'link:./skills/pr-description'
    });
    writeLocalSkill('skills/pr-description', {
      name: '@acme/pr-description',
      version: '1.0.0',
      skills: { '@tank/crystal-clear-docs': '^1.2.0' }
    });
    await expect(runInstallAll()).rejects.toThrow(
      /Version conflict for @tank\/crystal-clear-docs[\s\S]*@acme\/pr-description@1.0.0/
    );
  });
});

describe('tank install from a lockfile with link: entries', () => {
  async function freshCloneWithLock(): Promise<void> {
    standardRepo();
    await runInstallAll();
    fs.rmSync(path.join(root, '.tank'), { recursive: true, force: true });
    fs.rmSync(path.join(home, '.claude', 'skills'), { recursive: true, force: true });
    requests = [];
  }

  it('never asks the registry for a local skill and links it', async () => {
    await freshCloneWithLock();
    await runInstallAll();

    expect(requests.some((r) => r.url.includes('pr-description'))).toBe(false);
    expect(requests.some((r) => r.url.includes('clean-code'))).toBe(true);
    expect(claudeLinkTarget('acme--pr-description')).toBe(path.join(root, 'skills', 'pr-description'));
  });

  it('fails when a local skill changed since the lockfile was written', async () => {
    await freshCloneWithLock();
    writeLocalSkill('skills/pr-description', {
      name: '@acme/pr-description',
      version: '1.0.0',
      permissions: { subprocess: true },
      skills: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    await expect(runInstallAll()).rejects.toThrow(/changed since tank.lock was written \(permissions\)/);
    expect(requests).toEqual([]);
  });

  it('fails when tank.json has a link: skill missing from the lockfile', async () => {
    await freshCloneWithLock();
    writeLocalSkill('skills/code-review', { name: '@acme/code-review', version: '1.0.0' });
    writeProject(
      {
        '@tank/clean-code': '3.1.0',
        '@acme/pr-description': 'link:./skills/pr-description',
        '@acme/code-review': 'link:./skills/code-review'
      },
      { subprocess: false }
    );
    await expect(runInstallAll()).rejects.toThrow(/@acme\/code-review .* is not in tank.lock/);
  });

  it('does not ask the registry for a machine-local file:// entry', async () => {
    writeProject({});
    writeJson(path.join(root, 'tank.lock'), {
      lockfileVersion: 2,
      skills: {
        'my-skill@0.0.0': {
          source: 'local',
          resolved: 'file:///somewhere/else/my-skill',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: null
        }
      }
    });
    await expect(runInstallAll()).rejects.toThrow(/another machine[\s\S]*link:/);
    expect(requests).toEqual([]);
  });
});

describe('other commands with link: skills', () => {
  it('tank install <name> refuses a name that is a local skill', async () => {
    standardRepo();
    const { installCommand } = await import('~/commands/install.js');
    await expect(
      installCommand({ name: '@acme/pr-description', directory: root, configDir, homedir: home })
    ).rejects.toThrow(/local skill/);
    expect(requests).toEqual([]);
  });

  it('tank install <name> keeps local entries and their deps in the lockfile', async () => {
    standardRepo();
    await runInstallAll();
    const { installCommand } = await import('~/commands/install.js');
    await installCommand({
      name: '@tank/crystal-clear-docs',
      versionRange: '^1.1.0',
      directory: root,
      configDir,
      homedir: home
    });
    expect(readLock().skills['@acme/pr-description@1.0.0']?.source).toBe('local');
  });

  it('tank verify checks local entries by path and name', async () => {
    standardRepo();
    await runInstallAll();
    // tar is mocked: give the registry skills' extract dirs content so only local checks matter.
    for (const name of ['clean-code', 'crystal-clear-docs']) {
      fs.writeFileSync(path.join(root, '.tank', 'skills', '@tank', name, 'SKILL.md'), '# x\n');
    }
    const { verifyCommand } = await import('~/commands/verify.js');
    await expect(verifyCommand({ directory: root })).resolves.toBeUndefined();

    fs.rmSync(path.join(root, 'skills', 'pr-description'), { recursive: true, force: true });
    await expect(verifyCommand({ directory: root })).rejects.toThrow(/Verification failed: 1 issue/);
  });

  it('tank remove unlinks a local skill without deleting its folder', async () => {
    standardRepo();
    await runInstallAll();
    const { removeCommand } = await import('~/commands/remove.js');
    await removeCommand({ name: '@acme/pr-description', directory: root, homedir: home });

    expect(fs.existsSync(path.join(root, 'skills', 'pr-description', 'SKILL.md'))).toBe(true);
    expect(claudeLinkTarget('acme--pr-description')).toBeNull();
    expect(Object.keys(readLock().skills).some((k) => k.startsWith('@acme/pr-description@'))).toBe(false);
  });

  it('tank update leaves local skills alone', async () => {
    standardRepo();
    await runInstallAll();
    requests = [];
    const { updateCommand } = await import('~/commands/update.js');
    await updateCommand({ name: '@acme/pr-description', directory: root, configDir, homedir: home });
    expect(requests).toEqual([]);
  });

  it('tank permissions marks local skills', async () => {
    standardRepo();
    await runInstallAll();
    writeLocalSkill('skills/pr-description', {
      name: '@acme/pr-description',
      version: '1.0.0',
      permissions: { network: { outbound: ['api.github.com'] } },
      skills: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    fs.rmSync(path.join(root, 'tank.lock'));
    writeProject(
      { '@tank/clean-code': '3.1.0', '@acme/pr-description': 'link:./skills/pr-description' },
      { network: { outbound: ['api.github.com'] } }
    );
    await runInstallAll();

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { permissionsCommand } = await import('~/commands/permissions.js');
    await permissionsCommand({ directory: root });
    const output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('@acme/pr-description (local)');
  });
});

describe('review regressions', () => {
  async function installedRepoWithLock(): Promise<void> {
    standardRepo();
    await runInstallAll();
    requests = [];
  }

  it('lockfile install fails when a locked local skill is no longer a link: entry (C25)', async () => {
    await installedRepoWithLock();
    writeProject({ '@tank/clean-code': '3.1.0' }, { subprocess: false });
    await expect(runInstallAll()).rejects.toThrow(/no longer "link:" entries[\s\S]*@acme\/pr-description/);
    expect(requests).toEqual([]);
  });

  it('lockfile install reports a tank.json/tank.lock path mismatch explicitly (C25)', async () => {
    await installedRepoWithLock();
    writeLocalSkill('skills/pr-description-v2', {
      name: '@acme/pr-description',
      version: '1.0.0',
      permissions: { subprocess: false },
      skills: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    writeProject(
      { '@tank/clean-code': '3.1.0', '@acme/pr-description': 'link:./skills/pr-description-v2' },
      { subprocess: false }
    );
    await expect(runInstallAll()).rejects.toThrow(
      /links link:\.\/skills\/pr-description-v2 but tank\.lock has link:\.\/skills\/pr-description/
    );
  });

  it('tank install <name> drops a stale local lock entry once the skill leaves link:', async () => {
    await installedRepoWithLock();
    writeProject({ '@tank/clean-code': '3.1.0' }, { subprocess: false });
    const { installCommand } = await import('~/commands/install.js');
    await installCommand({
      name: '@tank/crystal-clear-docs',
      versionRange: '^1.1.0',
      directory: root,
      configDir,
      homedir: home
    });
    expect(Object.keys(readLock().skills).some((key) => key.startsWith('@acme/pr-description@'))).toBe(false);
  });

  it('tank install <name> preserves tank.json key order and unknown nested fields', async () => {
    writeJson(path.join(root, 'tank.json'), {
      name: '@acme/skills-repo',
      version: '1.0.0',
      description: 'keep me',
      skills: {},
      audit: { min_score: 1, note: 'keep me too' }
    });
    const { installCommand } = await import('~/commands/install.js');
    await installCommand({
      name: '@tank/clean-code',
      versionRange: '3.1.0',
      directory: root,
      configDir,
      homedir: home
    });
    const written = fs.readFileSync(path.join(root, 'tank.json'), 'utf-8');
    expect(JSON.parse(written)).toEqual({
      name: '@acme/skills-repo',
      version: '1.0.0',
      description: 'keep me',
      skills: { '@tank/clean-code': '3.1.0' },
      audit: { min_score: 1, note: 'keep me too' }
    });
    expect(Object.keys(JSON.parse(written))).toEqual(['name', 'version', 'description', 'skills', 'audit']);
  });

  it('never registers a local skill mcp_server in user-level agent config', async () => {
    writeProject({ '@acme/tool': 'link:./skills/tool' });
    writeLocalSkill('skills/tool', {
      name: '@acme/tool',
      version: '1.0.0',
      mcp_server: { command: 'node', args: ['./server.js'] }
    });
    await runInstallAll();
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const settings = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf-8') : '';
    expect(settings).not.toContain('@acme/tool');
    expect(claudeLinkTarget('acme--tool')).toBe(path.join(root, 'skills', 'tool'));
  });

  it('tank verify fails when a local skill drifted from the lock', async () => {
    await installedRepoWithLock();
    for (const name of ['clean-code', 'crystal-clear-docs']) {
      fs.writeFileSync(path.join(root, '.tank', 'skills', '@tank', name, 'SKILL.md'), '# x\n');
    }
    writeLocalSkill('skills/pr-description', {
      name: '@acme/pr-description',
      version: '1.0.0',
      permissions: { subprocess: true },
      skills: { '@tank/crystal-clear-docs': '^1.1.0' }
    });
    const { verifyCommand } = await import('~/commands/verify.js');
    await expect(verifyCommand({ directory: root })).rejects.toThrow(/Verification failed: 1 issue/);
  });

  it('tank update with no name never asks the registry about local skills', async () => {
    await installedRepoWithLock();
    const { updateCommand } = await import('~/commands/update.js');
    await updateCommand({ directory: root, configDir, homedir: home });
    expect(requests.some((r) => r.url.includes('pr-description'))).toBe(false);
  });

  it('lockfile install rejects a lock whose permission field has the wrong type and names it', async () => {
    writeProject({});
    writeJson(path.join(root, 'tank.lock'), {
      lockfileVersion: 2,
      skills: {
        'x@1.0.0': {
          source: 'github',
          resolved: 'https://github.com/o/x',
          integrity: 'sha512-abc',
          permissions: { subprocess: 'yes' },
          audit_score: null
        }
      }
    });
    await expect(runInstallAll()).rejects.toThrow(/Invalid tank\.lock: skills\.x@1\.0\.0\.permissions\.subprocess/);
    expect(requests).toEqual([]);
  });
});

describe('backward compatibility with files users already have', () => {
  it('accepts a tank.json budget with the documented "environment" key (released 0.16.6 did)', async () => {
    writeProject({ '@tank/clean-code': '3.1.0' });
    const manifestPath = path.join(root, 'tank.json');
    writeJson(manifestPath, {
      skills: { '@tank/clean-code': '3.1.0' },
      permissions: { subprocess: false, environment: ['NODE_ENV'] }
    });
    await runInstallAll();
    expect(Object.keys(readLock().skills)).toEqual(['@tank/clean-code@3.1.0']);
  });

  it('installs from a lock written by the MCP tools (extra permission keys, no audit_score) and keeps the extras', async () => {
    const cleanCode = REGISTRY_SKILLS[0];
    writeProject({ '@tank/clean-code': '3.1.0' });
    writeJson(path.join(root, 'tank.lock'), {
      lockfileVersion: 2,
      skills: {
        '@tank/clean-code@3.1.0': {
          resolved: `https://storage.test/${encodeURIComponent(cleanCode.name)}-${cleanCode.version}.tgz`,
          integrity: integrityOf(cleanCode.tarball),
          permissions: { environment: ['NODE_ENV'] }
        }
      }
    });
    await runInstallAll();
    expect(claudeLinkTarget('tank--clean-code')).not.toBeNull();

    const { installCommand } = await import('~/commands/install.js');
    await installCommand({
      name: '@tank/crystal-clear-docs',
      versionRange: '1.1.0',
      directory: root,
      configDir,
      homedir: home
    });
    const rewritten = JSON.parse(fs.readFileSync(path.join(root, 'tank.lock'), 'utf-8'));
    expect(rewritten.skills['@tank/clean-code@3.1.0'].permissions).toEqual({ environment: ['NODE_ENV'] });
  });
});
