import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock ora — spinner is a side-effect UI concern
vi.mock('ora', () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  };
  return { default: vi.fn(() => spinner) };
});

// Mock tar extract — we don't want to actually extract tarballs in tests
vi.mock('tar', () => ({
  extract: vi.fn().mockResolvedValue(undefined),
}));

describe('installCommand', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const validSkillsJson = {
    name: 'my-project',
    version: '1.0.0',
    description: 'A test project',
    skills: {},
    permissions: {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false,
    },
  };

  const versionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      { version: '1.0.0', integrity: 'sha512-abc123', auditScore: 8.5, auditStatus: 'published', publishedAt: '2026-01-01T00:00:00Z' },
      { version: '1.1.0', integrity: 'sha512-def456', auditScore: 9.0, auditStatus: 'published', publishedAt: '2026-01-15T00:00:00Z' },
      { version: '2.0.0', integrity: 'sha512-ghi789', auditScore: 7.0, auditStatus: 'published', publishedAt: '2026-02-01T00:00:00Z' },
    ],
  };

  const versionMetadata = {
    name: '@test-org/my-skill',
    version: '2.0.0',
    description: 'A test skill',
    integrity: 'sha512-ghi789',
    permissions: {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false,
    },
    auditScore: 7.0,
    auditStatus: 'published',
    downloadUrl: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
    publishedAt: '2026-02-01T00:00:00Z',
  };

  // Create a fake tarball with known sha512
  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-config-'));

    // Write a valid skills.json in the "project" directory
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(validSkillsJson, null, 2),
    );

    // Write a config with registry URL (no auth needed for install)
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        registry: 'https://tankpkg.dev',
      }),
    );

    // Create a fake tarball and compute its real integrity
    const crypto = await import('node:crypto');
    fakeTarball = Buffer.from('fake-tarball-content-for-testing');
    const hash = crypto.createHash('sha512').update(fakeTarball).digest('base64');
    fakeTarballIntegrity = `sha512-${hash}`;

    mockFetch.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function getAllOutput(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
  }

  function setupSuccessfulInstall(overrides?: {
    versionMeta?: Record<string, unknown>;
    integrity?: string;
  }) {
    const integrity = overrides?.integrity ?? fakeTarballIntegrity;
    const meta = overrides?.versionMeta ?? {
      ...versionMetadata,
      integrity,
    };

    // 1. GET /api/v1/skills/{name}/versions
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    // 2. GET /api/v1/skills/{name}/{version}
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(meta), { status: 200 }),
    );

    // 3. Download tarball
    mockFetch.mockResolvedValueOnce(
      new Response(new Uint8Array(fakeTarball), { status: 200 }),
    );
  }

  it('installs a skill successfully: fetch versions → resolve → download → verify → extract → update files', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Verify 3 fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify versions fetch
    const [versionsUrl] = mockFetch.mock.calls[0];
    expect(versionsUrl).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/versions');

    // Verify version metadata fetch
    const [metaUrl] = mockFetch.mock.calls[1];
    expect(metaUrl).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/2.0.0');

    // Verify tarball download
    const [downloadUrl] = mockFetch.mock.calls[2];
    expect(downloadUrl).toBe('https://storage.example.com/download/my-skill-2.0.0.tgz');
  });

  it('errors when skills.json is missing', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Remove skills.json
    fs.unlinkSync(path.join(tmpDir, 'skills.json'));

    await expect(
      installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/skills\.json/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('errors when skill is not found (404)', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Versions endpoint returns 404
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Skill not found' }), { status: 404 }),
    );

    await expect(
      installCommand({ name: '@test-org/nonexistent', directory: tmpDir, configDir }),
    ).rejects.toThrow(/not found/i);
  });

  it('errors when no version satisfies the range', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Return versions that don't match the range
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    await expect(
      installCommand({
        name: '@test-org/my-skill',
        versionRange: '>=5.0.0',
        directory: tmpDir,
        configDir,
      }),
    ).rejects.toThrow(/no version/i);
  });

  it('aborts with error when integrity check fails', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Setup with mismatched integrity
    setupSuccessfulInstall({
      integrity: 'sha512-WRONG_HASH',
    });

    await expect(
      installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/integrity/i);
  });

  it('aborts when skill permissions exceed project budget', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Write skills.json with restrictive permissions
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify({
        ...validSkillsJson,
        permissions: {
          network: { outbound: ['*.example.com'] },
          filesystem: { read: ['./src/**'], write: ['./output/**'] },
          subprocess: false,
        },
      }, null, 2),
    );

    // Skill requests subprocess (project doesn't allow it)
    const metaWithSubprocess = {
      ...versionMetadata,
      integrity: fakeTarballIntegrity,
      permissions: {
        network: { outbound: ['*.example.com'] },
        filesystem: { read: ['./src/**'] },
        subprocess: true, // Project budget says false!
      },
    };

    // 1. GET versions
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    // 2. GET version metadata
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(metaWithSubprocess), { status: 200 }),
    );

    await expect(
      installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/permission/i);
  });

  it('installs with warning when no permission budget is defined', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Write skills.json WITHOUT permissions
    const noBudgetSkillsJson = {
      name: 'my-project',
      version: '1.0.0',
      skills: {},
    };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(noBudgetSkillsJson, null, 2),
    );

    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Should succeed but with a warning about missing budget
    const output = getAllOutput();
    expect(output).toMatch(/warning|budget|permission/i);
  });

  it('updates skills.json with the new dependency', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Read updated skills.json
    const updated = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'),
    );

    expect(updated.skills['@test-org/my-skill']).toBe('^2.0.0');
  });

  it('updates skills.lock with correct entry', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Read skills.lock
    const lockPath = path.join(tmpDir, 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(lock.lockfileVersion).toBe(1);
    expect(lock.skills['@test-org/my-skill@2.0.0']).toBeDefined();

    const entry = lock.skills['@test-org/my-skill@2.0.0'];
    expect(entry.integrity).toBe(fakeTarballIntegrity);
    expect(entry.audit_score).toBe(7.0);
    expect(entry.resolved).toBe('https://storage.example.com/download/my-skill-2.0.0.tgz');
    expect(entry.permissions).toBeDefined();
  });

  it('handles scoped package names correctly (URL encoding)', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Verify the URL was properly encoded
    const [versionsUrl] = mockFetch.mock.calls[0];
    expect(versionsUrl).toContain('%40test-org%2Fmy-skill');
  });

  it('skips install when same version is already installed', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Pre-populate skills.json with the skill already installed
    const existingSkillsJson = {
      ...validSkillsJson,
      skills: { '@test-org/my-skill': '^2.0.0' },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(existingSkillsJson, null, 2),
    );

    // Pre-populate skills.lock with the skill already locked
    const existingLock = {
      lockfileVersion: 1,
      skills: {
        '@test-org/my-skill@2.0.0': {
          resolved: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
          integrity: fakeTarballIntegrity,
          permissions: versionMetadata.permissions,
          audit_score: 7.0,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(existingLock, null, 2),
    );

    // Versions endpoint still called to resolve
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Should only call versions endpoint, not download
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const output = getAllOutput();
    expect(output).toMatch(/already installed/i);
  });

  it('extracts tarball to correct directory path', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    // Verify the extraction directory was created
    const expectedDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    expect(fs.existsSync(expectedDir)).toBe(true);
  });

  it('aborts when skill requests network domains not in project budget', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Skill requests domains not in project budget
    const metaWithExtraDomains = {
      ...versionMetadata,
      integrity: fakeTarballIntegrity,
      permissions: {
        network: { outbound: ['*.evil.com'] }, // Not in project budget
        filesystem: { read: ['./src/**'] },
        subprocess: false,
      },
    };

    // 1. GET versions
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    // 2. GET version metadata
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(metaWithExtraDomains), { status: 200 }),
    );

    await expect(
      installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/permission/i);
  });

  it('sorts lockfile keys alphabetically', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Pre-populate lock with an entry that comes after alphabetically
    const existingLock = {
      lockfileVersion: 1,
      skills: {
        'z-skill@1.0.0': {
          resolved: 'https://example.com/z.tgz',
          integrity: 'sha512-zzz',
          permissions: {},
          audit_score: 5.0,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(existingLock, null, 2),
    );

    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
    });

    const lock = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8'));
    const keys = Object.keys(lock.skills);
    expect(keys).toEqual([...keys].sort());
    expect(keys[0]).toBe('@test-org/my-skill@2.0.0');
    expect(keys[1]).toBe('z-skill@1.0.0');
  });

  it('uses specified version range instead of default *', async () => {
    const { installCommand } = await import('../commands/install.js');

    // 1. GET versions
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionsResponse), { status: 200 }),
    );

    // 2. GET version metadata for 1.1.0 (highest matching ^1.0.0)
    const meta110 = {
      ...versionMetadata,
      version: '1.1.0',
      integrity: fakeTarballIntegrity,
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(meta110), { status: 200 }),
    );

    // 3. Download tarball
    mockFetch.mockResolvedValueOnce(
      new Response(new Uint8Array(fakeTarball), { status: 200 }),
    );

    await installCommand({
      name: '@test-org/my-skill',
      versionRange: '^1.0.0',
      directory: tmpDir,
      configDir,
    });

    // Should resolve to 1.1.0 (highest matching ^1.0.0)
    const [metaUrl] = mockFetch.mock.calls[1];
    expect(metaUrl).toContain('1.1.0');

    // skills.json should use the provided range
    const updated = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'),
    );
    expect(updated.skills['@test-org/my-skill']).toBe('^1.0.0');
  });
});
