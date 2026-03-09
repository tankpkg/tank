import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    text: ''
  };
  return { default: vi.fn(() => spinner) };
});

// Mock tar extract — we don't want to actually extract tarballs in tests
vi.mock('tar', () => ({
  extract: vi.fn().mockResolvedValue(undefined)
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
      subprocess: false
    }
  };

  const versionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      {
        version: '1.0.0',
        integrity: 'sha512-abc123',
        auditScore: 8.5,
        auditStatus: 'published',
        publishedAt: '2026-01-01T00:00:00Z'
      },
      {
        version: '1.1.0',
        integrity: 'sha512-def456',
        auditScore: 9.0,
        auditStatus: 'published',
        publishedAt: '2026-01-15T00:00:00Z'
      },
      {
        version: '2.0.0',
        integrity: 'sha512-ghi789',
        auditScore: 7.0,
        auditStatus: 'published',
        publishedAt: '2026-02-01T00:00:00Z'
      }
    ]
  };

  const versionMetadata = {
    name: '@test-org/my-skill',
    version: '2.0.0',
    description: 'A test skill',
    integrity: 'sha512-ghi789',
    permissions: {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false
    },
    auditScore: 7.0,
    auditStatus: 'published',
    downloadUrl: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
    publishedAt: '2026-02-01T00:00:00Z'
  };

  // Create a fake tarball with known sha512
  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-config-'));

    // Write a valid skills.json in the "project" directory
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(validSkillsJson, null, 2));

    // Write a config with registry URL (no auth needed for install)
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        registry: 'https://tankpkg.dev'
      })
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
    return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
  }

  function setupSuccessfulInstall(overrides?: { versionMeta?: Record<string, unknown>; integrity?: string }) {
    const integrity = overrides?.integrity ?? fakeTarballIntegrity;
    const meta = overrides?.versionMeta ?? {
      ...versionMetadata,
      integrity
    };

    // 1. GET /api/v1/skills/{name}/versions
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    // 2. GET /api/v1/skills/{name}/{version}
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(meta), { status: 200 }));

    // 3. Download tarball
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));
  }

  it('installs a skill successfully: fetch versions → resolve → download → verify → extract → update files', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    // Verify 3 fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify versions fetch
    const [versionsUrl] = mockFetch.mock.calls[0];
    expect(versionsUrl).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/versions');

    const [, versionsOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((versionsOpts.headers as Record<string, string>).Authorization).toBeUndefined();

    // Verify version metadata fetch
    const [metaUrl] = mockFetch.mock.calls[1];
    expect(metaUrl).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/2.0.0');

    // Verify tarball download
    const [downloadUrl] = mockFetch.mock.calls[2];
    expect(downloadUrl).toBe('https://storage.example.com/download/my-skill-2.0.0.tgz');
  });

  it('auto-creates skills.json when missing', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.unlinkSync(path.join(tmpDir, 'skills.json'));

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...versionMetadata, integrity: fakeTarballIntegrity })))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)));

    await installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir });

    const created = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
    expect(created.skills['@test-org/my-skill']).toBe('^2.0.0');
  });

  it('errors when skill is not found (404)', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Versions endpoint returns 404
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Skill not found' }), { status: 404 }));

    await expect(installCommand({ name: '@test-org/nonexistent', directory: tmpDir, configDir })).rejects.toThrow(
      /not found/i
    );
  });

  it('sends bearer token when config contains token', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ registry: 'https://tankpkg.dev', token: 'tank_ci_token' })
    );

    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    const [, versionsOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((versionsOpts.headers as Record<string, string>).Authorization).toBe('Bearer tank_ci_token');
  });

  it('shows scope error when versions endpoint returns 403', async () => {
    const { installCommand } = await import('../commands/install.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Insufficient API key scope. Required: skills:read' }), { status: 403 })
    );

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /skills:read/i
    );
  });

  it('errors when no version satisfies the range', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Return versions that don't match the range
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    await expect(
      installCommand({
        name: '@test-org/my-skill',
        versionRange: '>=5.0.0',
        directory: tmpDir,
        configDir
      })
    ).rejects.toThrow(/no version/i);
  });

  it('aborts with error when integrity check fails', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Setup with mismatched integrity
    setupSuccessfulInstall({
      integrity: 'sha512-WRONG_HASH'
    });

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /integrity/i
    );
  });

  it('aborts when skill permissions exceed project budget', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Write skills.json with restrictive permissions
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(
        {
          ...validSkillsJson,
          permissions: {
            network: { outbound: ['*.example.com'] },
            filesystem: { read: ['./src/**'], write: ['./output/**'] },
            subprocess: false
          }
        },
        null,
        2
      )
    );

    // Skill requests subprocess (project doesn't allow it)
    const metaWithSubprocess = {
      ...versionMetadata,
      integrity: fakeTarballIntegrity,
      permissions: {
        network: { outbound: ['*.example.com'] },
        filesystem: { read: ['./src/**'] },
        subprocess: true // Project budget says false!
      }
    };

    // 1. GET versions
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    // 2. GET version metadata
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(metaWithSubprocess), { status: 200 }));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /permission/i
    );
  });

  it('installs with warning when no permission budget is defined', async () => {
    const { installCommand } = await import('../commands/install.js');

    // Write skills.json WITHOUT permissions
    const noBudgetSkillsJson = {
      name: 'my-project',
      version: '1.0.0',
      skills: {}
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(noBudgetSkillsJson, null, 2));

    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
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
      configDir
    });

    // Read updated skills.json
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));

    expect(updated.skills['@test-org/my-skill']).toBe('^2.0.0');
  });

  it('updates skills.lock with correct entry', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
    });

    // Read skills.lock
    const lockPath = path.join(tmpDir, 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(lock.lockfileVersion).toBe(2);
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
      configDir
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
      skills: { '@test-org/my-skill': '^2.0.0' }
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(existingSkillsJson, null, 2));

    // Pre-populate skills.lock with the skill already locked
    const existingLock = {
      lockfileVersion: 1,
      skills: {
        '@test-org/my-skill@2.0.0': {
          resolved: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
          integrity: fakeTarballIntegrity,
          permissions: versionMetadata.permissions,
          audit_score: 7.0
        }
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.lock'), JSON.stringify(existingLock, null, 2));

    // Versions endpoint still called to resolve
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
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
      configDir
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
        subprocess: false
      }
    };

    // 1. GET versions
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    // 2. GET version metadata
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(metaWithExtraDomains), { status: 200 }));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /permission/i
    );
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
          audit_score: 5.0
        }
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.lock'), JSON.stringify(existingLock, null, 2));

    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
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
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));

    // 2. GET version metadata for 1.1.0 (highest matching ^1.0.0)
    const meta110 = {
      ...versionMetadata,
      version: '1.1.0',
      integrity: fakeTarballIntegrity
    };
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(meta110), { status: 200 }));

    // 3. Download tarball
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));

    await installCommand({
      name: '@test-org/my-skill',
      versionRange: '^1.0.0',
      directory: tmpDir,
      configDir
    });

    // Should resolve to 1.1.0 (highest matching ^1.0.0)
    const [metaUrl] = mockFetch.mock.calls[1];
    expect(metaUrl).toContain('1.1.0');

    // skills.json should use the provided range
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
    expect(updated.skills['@test-org/my-skill']).toBe('^1.0.0');
  });

  it('creates agent symlinks after local install', async () => {
    vi.resetModules();
    const prepareAgentSkillDir = vi.fn().mockReturnValue('/mock/agent-skills/test-org--my-skill');
    const linkSkillToAgents = vi.fn().mockReturnValue({ linked: ['claude'], skipped: [], failed: [] });
    vi.doMock('../lib/frontmatter.js', () => ({ prepareAgentSkillDir }));
    vi.doMock('../lib/linker.js', () => ({ linkSkillToAgents }));

    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    const expectedExtractDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    expect(prepareAgentSkillDir).toHaveBeenCalledWith({
      skillName: '@test-org/my-skill',
      extractDir: expectedExtractDir,
      agentSkillsBaseDir: path.join(tmpDir, '.tank', 'agent-skills'),
      description: 'A test skill'
    });
    expect(linkSkillToAgents).toHaveBeenCalledWith({
      skillName: '@test-org/my-skill',
      sourceDir: '/mock/agent-skills/test-org--my-skill',
      linksDir: path.join(tmpDir, '.tank'),
      source: 'local',
      homedir: tmpDir
    });
  });

  it('succeeds with warning when no agents are detected', async () => {
    vi.resetModules();
    vi.doMock('../lib/linker.js', () => ({
      linkSkillToAgents: vi.fn().mockReturnValue({ linked: [], skipped: [], failed: [] })
    }));
    vi.doMock('../lib/agents.js', async () => {
      const actual = await vi.importActual<typeof import('../lib/agents.js')>('../lib/agents.js');
      return {
        ...actual,
        detectInstalledAgents: vi.fn().mockReturnValue([])
      };
    });
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
    });

    const output = getAllOutput();
    expect(output).toMatch(/no agents detected/i);
  });

  it('succeeds with warning when agent linking fails', async () => {
    vi.resetModules();
    vi.doMock('../lib/linker.js', () => ({
      linkSkillToAgents: vi.fn(() => {
        throw new Error('link failed');
      })
    }));

    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
    });

    const output = getAllOutput();
    expect(output).toMatch(/agent linking skipped/i);
  });

  it('agent symlink target is agent-skills wrapper dir, not raw extract dir', async () => {
    vi.resetModules();
    const prepareAgentSkillDir = vi.fn().mockReturnValue('/mock/agent-skills/test-org--my-skill');
    const linkSkillToAgents = vi.fn().mockReturnValue({ linked: [], skipped: [], failed: [] });
    vi.doMock('../lib/frontmatter.js', () => ({ prepareAgentSkillDir }));
    vi.doMock('../lib/linker.js', () => ({ linkSkillToAgents }));

    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir
    });

    const expectedExtractDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    const linkArgs = linkSkillToAgents.mock.calls[0]?.[0];
    expect(linkArgs?.sourceDir).toBe('/mock/agent-skills/test-org--my-skill');
    expect(linkArgs?.sourceDir).not.toBe(expectedExtractDir);
  });

  it('blocks install when audit score is below min_score threshold', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(
        {
          ...validSkillsJson,
          audit: { min_score: 8.0 }
        },
        null,
        2
      )
    );

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...versionMetadata,
          integrity: fakeTarballIntegrity,
          auditScore: 7.0
        }),
        { status: 200 }
      )
    );

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /audit score 7.*below minimum threshold 8/i
    );
  });

  it('allows install when audit score meets min_score threshold', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(
        {
          ...validSkillsJson,
          audit: { min_score: 7.0 }
        },
        null,
        2
      )
    );

    setupSuccessfulInstall({
      versionMeta: {
        ...versionMetadata,
        integrity: fakeTarballIntegrity,
        auditScore: 7.0
      }
    });

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const lockPath = path.join(tmpDir, 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('allows install with warning when audit score is null (not yet scored)', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(
        {
          ...validSkillsJson,
          audit: { min_score: 7.0 }
        },
        null,
        2
      )
    );

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...versionMetadata,
          integrity: fakeTarballIntegrity,
          auditScore: null
        }),
        { status: 200 }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    const output = getAllOutput();
    expect(output).toMatch(/audit score.*not yet available/i);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('skips audit score check when no audit.min_score is defined', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(
        {
          ...validSkillsJson
        },
        null,
        2
      )
    );

    setupSuccessfulInstall({
      versionMeta: {
        ...versionMetadata,
        integrity: fakeTarballIntegrity,
        auditScore: 2.0
      }
    });

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const lockPath = path.join(tmpDir, 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});

describe('installCommand --global', () => {
  let tmpDir: string;
  let configDir: string;
  let fakeHome: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const validSkillsJson = {
    name: 'my-project',
    version: '1.0.0',
    description: 'A test project',
    skills: {}
  };

  const versionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      {
        version: '2.0.0',
        integrity: 'sha512-ghi789',
        auditScore: 7.0,
        auditStatus: 'published',
        publishedAt: '2026-02-01T00:00:00Z'
      }
    ]
  };

  const versionMetadata = {
    name: '@test-org/my-skill',
    version: '2.0.0',
    description: 'A test skill',
    integrity: 'sha512-ghi789',
    permissions: {},
    auditScore: 7.0,
    auditStatus: 'published',
    downloadUrl: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
    publishedAt: '2026-02-01T00:00:00Z'
  };

  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-global-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-global-config-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-global-home-'));

    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(validSkillsJson, null, 2));

    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

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
    fs.rmSync(fakeHome, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.resetModules();
    vi.unmock('../lib/frontmatter.js');
    vi.unmock('../lib/linker.js');
  });

  function setupSuccessfulInstall() {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...versionMetadata, integrity: fakeTarballIntegrity }), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));
  }

  it('extracts to ~/.tank/skills/ for global install', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      global: true,
      homedir: fakeHome
    });

    const extractDir = path.join(fakeHome, '.tank', 'skills', '@test-org', 'my-skill');
    expect(fs.existsSync(extractDir)).toBe(true);
  });

  it('does NOT create or modify project skills.json for global install', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    const original = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      global: true,
      homedir: fakeHome
    });

    const updated = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
    expect(updated).toBe(original);
  });

  it('writes to ~/.tank/skills.lock for global install', async () => {
    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      global: true,
      homedir: fakeHome
    });

    const lockPath = path.join(fakeHome, '.tank', 'skills.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('creates agent symlinks with source "global"', async () => {
    vi.resetModules();
    const prepareAgentSkillDir = vi.fn().mockReturnValue('/mock/global-agent-skills/test-org--my-skill');
    const linkSkillToAgents = vi.fn().mockReturnValue({ linked: ['claude'], skipped: [], failed: [] });
    vi.doMock('../lib/frontmatter.js', () => ({ prepareAgentSkillDir }));
    vi.doMock('../lib/linker.js', () => ({ linkSkillToAgents }));

    const { installCommand } = await import('../commands/install.js');
    setupSuccessfulInstall();

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      global: true,
      homedir: fakeHome
    });

    expect(linkSkillToAgents).toHaveBeenCalledWith({
      skillName: '@test-org/my-skill',
      sourceDir: '/mock/global-agent-skills/test-org--my-skill',
      linksDir: path.join(fakeHome, '.tank'),
      source: 'global',
      homedir: fakeHome
    });
  });
});

describe('installFromLockfile', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Create fake tarballs with known integrity
  let fakeTarball1: Buffer;
  let fakeTarball1Integrity: string;
  let fakeTarball2: Buffer;
  let fakeTarball2Integrity: string;

  const _validSkillsJson = {
    name: 'my-project',
    version: '1.0.0',
    description: 'A test project',
    skills: {
      '@test-org/my-skill': '^2.0.0',
      'simple-skill': '^1.0.0'
    },
    permissions: {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false
    }
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-lockfile-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-lockfile-config-'));

    // Write config
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

    // Create fake tarballs with real integrity
    fakeTarball1 = Buffer.from('fake-tarball-content-skill-1');
    const hash1 = crypto.createHash('sha512').update(fakeTarball1).digest('base64');
    fakeTarball1Integrity = `sha512-${hash1}`;

    fakeTarball2 = Buffer.from('fake-tarball-content-skill-2');
    const hash2 = crypto.createHash('sha512').update(fakeTarball2).digest('base64');
    fakeTarball2Integrity = `sha512-${hash2}`;

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

  function _getAllOutput(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
  }

  function writeLockfile(
    skills: Record<
      string,
      { resolved: string; integrity: string; permissions: Record<string, unknown>; audit_score: number | null }
    >
  ) {
    fs.writeFileSync(path.join(tmpDir, 'skills.lock'), JSON.stringify({ lockfileVersion: 1, skills }, null, 2));
  }

  it('installs all skills from lockfile with correct integrity', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 8.0
      }
    });

    // Mock API metadata response (returns downloadUrl)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    // Mock tarball download
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    // Verify API was called for metadata
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/2.0.0');
    expect(mockFetch.mock.calls[1][0]).toBe('https://storage.example.com/my-skill-2.0.0.tgz');

    // Verify extraction directory was created
    const extractDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    expect(fs.existsSync(extractDir)).toBe(true);
  });

  it('sends bearer token when config contains token', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ registry: 'https://tankpkg.dev', token: 'tank_ci_token' })
    );

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 8.0
      }
    });

    // Mock API metadata response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    // Mock tarball download
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    const [, metaOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((metaOpts.headers as Record<string, string>).Authorization).toBe('Bearer tank_ci_token');
  });

  it('aborts entire install when integrity mismatch on any skill', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: 'sha512-WRONG_HASH_THAT_WILL_NOT_MATCH',
        permissions: {},
        audit_score: 8.0
      }
    });

    // Mock API metadata response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: 'sha512-WRONG_HASH_THAT_WILL_NOT_MATCH',
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    // Mock tarball download — content won't match the integrity
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await expect(installFromLockfile({ directory: tmpDir, configDir })).rejects.toThrow(/integrity/i);

    // .tank/skills directory should be cleaned up on abort
    expect(fs.existsSync(path.join(tmpDir, '.tank', 'skills'))).toBe(false);
  });

  it('prints summary with count after successful install', async () => {
    const { installFromLockfile } = await import('../commands/install.js');
    const ora = (await import('ora')).default;

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 8.0
      }
    });

    // Mock API metadata response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    const spinner = ora();
    const succeedCalls = vi.mocked(spinner.succeed).mock.calls;
    const lastSucceed = succeedCalls[succeedCalls.length - 1]?.[0] ?? '';
    expect(lastSucceed).toMatch(/installed 1 skill/i);
  });

  it('installs multiple skills from lockfile', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 8.0
      },
      'simple-skill@1.0.0': {
        resolved: 'https://storage.example.com/simple-skill-1.0.0.tgz',
        integrity: fakeTarball2Integrity,
        permissions: {},
        audit_score: 9.0
      }
    });

    // Mock API + tarball for first skill
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));
    // Mock API + tarball for second skill
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          version: '1.0.0',
          integrity: fakeTarball2Integrity,
          downloadUrl: 'https://storage.example.com/simple-skill-1.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball2), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Both extraction directories should exist
    expect(fs.existsSync(path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.tank', 'skills', 'simple-skill'))).toBe(true);

    const ora = (await import('ora')).default;
    const spinner = ora();
    const succeedCalls = vi.mocked(spinner.succeed).mock.calls;
    const lastSucceed = succeedCalls[succeedCalls.length - 1]?.[0] ?? '';
    expect(lastSucceed).toMatch(/installed 2 skills/i);
  });

  it('handles scoped package names with correct extraction paths', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    writeLockfile({
      '@my-org/deep-skill@3.0.0': {
        resolved: 'https://storage.example.com/deep-skill-3.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 7.5
      }
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@my-org/deep-skill',
          version: '3.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/deep-skill-3.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    // Scoped package: .tank/skills/@my-org/deep-skill
    const extractDir = path.join(tmpDir, '.tank', 'skills', '@my-org', 'deep-skill');
    expect(fs.existsSync(extractDir)).toBe(true);
  });

  it('re-extracts when directory already exists (fresh install)', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    // Pre-create the extraction directory with a marker file
    const existingDir = path.join(tmpDir, '.tank', 'skills', 'simple-skill');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'old-file.txt'), 'old content');

    writeLockfile({
      'simple-skill@1.0.0': {
        resolved: 'https://storage.example.com/simple-skill-1.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 9.0
      }
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          version: '1.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/simple-skill-1.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));

    await installFromLockfile({ directory: tmpDir, configDir });

    // Directory should still exist (re-created)
    expect(fs.existsSync(existingDir)).toBe(true);
    // Old file should be gone (directory was cleaned and re-extracted)
    expect(fs.existsSync(path.join(existingDir, 'old-file.txt'))).toBe(false);
  });

  it('cleans up .tank/skills on integrity failure mid-install', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    writeLockfile({
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: fakeTarball1Integrity,
        permissions: {},
        audit_score: 8.0
      },
      'bad-skill@1.0.0': {
        resolved: 'https://storage.example.com/bad-skill-1.0.0.tgz',
        integrity: 'sha512-DEFINITELY_WRONG',
        permissions: {},
        audit_score: 5.0
      }
    });

    // First skill: API + tarball
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarball1Integrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball1), { status: 200 }));
    // Second skill: API + tarball (integrity won't match)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'bad-skill',
          version: '1.0.0',
          integrity: 'sha512-DEFINITELY_WRONG',
          downloadUrl: 'https://storage.example.com/bad-skill-1.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball2), { status: 200 }));

    await expect(installFromLockfile({ directory: tmpDir, configDir })).rejects.toThrow(/integrity/i);

    // Even though first skill was extracted, the entire .tank/skills should be cleaned up
    expect(fs.existsSync(path.join(tmpDir, '.tank', 'skills'))).toBe(false);
  });

  it('errors when skills.lock file is missing', async () => {
    const { installFromLockfile } = await import('../commands/install.js');

    // No lockfile exists
    await expect(installFromLockfile({ directory: tmpDir, configDir })).rejects.toThrow(/skills\.lock/i);
  });
});

describe('installAll (no-args dispatch)', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  const validSkillsJson = {
    name: 'my-project',
    version: '1.0.0',
    description: 'A test project',
    skills: {
      '@test-org/my-skill': '^2.0.0'
    },
    permissions: {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false
    }
  };

  const versionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      {
        version: '2.0.0',
        integrity: 'sha512-ghi789',
        auditScore: 7.0,
        auditStatus: 'published',
        publishedAt: '2026-02-01T00:00:00Z'
      }
    ]
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-installall-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-installall-config-'));

    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

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
    return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
  }

  it('returns gracefully when neither skills.json nor skills.lock exists', async () => {
    const { installAll } = await import('../commands/install.js');

    await installAll({ directory: tmpDir, configDir });

    expect(getAllOutput()).toContain('nothing to install');
  });

  it('uses lockfile when skills.lock exists (deterministic mode)', async () => {
    const { installAll } = await import('../commands/install.js');

    // Write skills.json
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(validSkillsJson, null, 2));

    // Write skills.lock
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          skills: {
            '@test-org/my-skill@2.0.0': {
              resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
              integrity: fakeTarballIntegrity,
              permissions: {},
              audit_score: 7.0
            }
          }
        },
        null,
        2
      )
    );

    // Mock API metadata + tarball download
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarballIntegrity,
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));

    await installAll({ directory: tmpDir, configDir });

    // Should have called API for metadata, then downloaded tarball
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://tankpkg.dev/api/v1/skills/%40test-org%2Fmy-skill/2.0.0');
    expect(mockFetch.mock.calls[1][0]).toBe('https://storage.example.com/my-skill-2.0.0.tgz');
  });

  it('resolves from skills.json when no lockfile exists (first install)', async () => {
    const { installAll } = await import('../commands/install.js');

    // Write skills.json with a skill dependency
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(validSkillsJson, null, 2));

    // No skills.lock — should resolve via registry
    // Mock the 3-step install flow for @test-org/my-skill
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '2.0.0',
          integrity: fakeTarballIntegrity,
          permissions: { network: { outbound: ['*.example.com'] } },
          auditScore: 7.0,
          auditStatus: 'published',
          downloadUrl: 'https://storage.example.com/my-skill-2.0.0.tgz',
          publishedAt: '2026-02-01T00:00:00Z'
        }),
        { status: 200 }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));

    await installAll({ directory: tmpDir, configDir });

    // Should have made 3 fetch calls (versions, metadata, download) — the full install flow
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Lockfile should now exist (created by installCommand)
    expect(fs.existsSync(path.join(tmpDir, 'skills.lock'))).toBe(true);
  });
});

describe('installCommand — additional error paths', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const versionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      {
        version: '2.0.0',
        integrity: 'sha512-ghi789',
        auditScore: 7.0,
        auditStatus: 'published',
        publishedAt: '2026-02-01T00:00:00Z'
      }
    ]
  };

  const versionMetadata = {
    name: '@test-org/my-skill',
    version: '2.0.0',
    description: 'A test skill',
    integrity: 'sha512-placeholder',
    permissions: {},
    auditScore: 7.0,
    auditStatus: 'published',
    downloadUrl: 'https://storage.example.com/download/my-skill-2.0.0.tgz',
    publishedAt: '2026-02-01T00:00:00Z'
  };

  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-extra-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-install-extra-config-'));

    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify({ name: 'my-project', version: '1.0.0', skills: {} }, null, 2)
    );

    fakeTarball = Buffer.from('fake-tarball-content-for-extra-tests');
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

  it('throws network error when fetch rejects on versions endpoint', async () => {
    const { installCommand } = await import('../commands/install.js');

    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED: Connection refused'));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /network/i
    );
  });

  it('throws when tarball download returns non-ok status', async () => {
    const { installCommand } = await import('../commands/install.js');

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...versionMetadata, integrity: fakeTarballIntegrity }), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /404|download|failed/i
    );
  });

  it('throws network error when fetch rejects on tarball download', async () => {
    const { installCommand } = await import('../commands/install.js');

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...versionMetadata, integrity: fakeTarballIntegrity }), { status: 200 })
    );
    mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).rejects.toThrow(
      /network/i
    );
  });

  it('recovers gracefully when skills.lock contains invalid JSON', async () => {
    const { installCommand } = await import('../commands/install.js');

    fs.writeFileSync(path.join(tmpDir, 'skills.lock'), '{ this is not valid json !!!');

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(versionsResponse), { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...versionMetadata, integrity: fakeTarballIntegrity }), { status: 200 })
    );
    mockFetch.mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball), { status: 200 }));

    await expect(installCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir })).resolves.toBeUndefined();

    const lockRaw = fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8');
    const lock = JSON.parse(lockRaw);
    expect(lock.lockfileVersion).toBe(2);
    expect(lock.skills['@test-org/my-skill@2.0.0']).toBeDefined();
  });

  it('throws when skills.json contains invalid JSON (installAll)', async () => {
    const { installAll } = await import('../commands/install.js');

    fs.writeFileSync(path.join(tmpDir, 'skills.json'), '{ invalid json here !!!');

    await expect(installAll({ directory: tmpDir, configDir })).rejects.toThrow(/skills\.json|parse/i);
  });

  it('prints nothing-to-install message when skills.json has empty skills map', async () => {
    const { installAll } = await import('../commands/install.js');

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify({ name: 'my-project', version: '1.0.0', skills: {} }, null, 2)
    );

    await installAll({ directory: tmpDir, configDir });

    expect(mockFetch).not.toHaveBeenCalled();

    const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/no skills|nothing to install/i);
  });
});

describe('installCommand — transitive dependency resolution', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  let fakeTarball: Buffer;
  let fakeTarballIntegrity: string;

  const primaryVersionsResponse = {
    name: '@test-org/my-skill',
    versions: [
      {
        version: '1.0.0',
        integrity: 'sha512-abc',
        auditScore: 8.0,
        auditStatus: 'published',
        publishedAt: '2026-01-01T00:00:00Z'
      }
    ]
  };

  const depVersionsResponse = {
    name: '@dep/helper',
    versions: [
      {
        version: '1.0.0',
        integrity: 'sha512-dep1',
        auditScore: 9.0,
        auditStatus: 'published',
        publishedAt: '2026-01-01T00:00:00Z'
      },
      {
        version: '1.1.0',
        integrity: 'sha512-dep2',
        auditScore: 9.0,
        auditStatus: 'published',
        publishedAt: '2026-01-15T00:00:00Z'
      }
    ]
  };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-transitive-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-transitive-config-'));

    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify({ name: 'my-project', version: '1.0.0', skills: {} }, null, 2)
    );

    fakeTarball = Buffer.from('fake-tarball-transitive-test');
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

  function makeMeta(name: string, version: string) {
    return {
      name,
      version,
      description: `Test skill ${name}`,
      integrity: fakeTarballIntegrity,
      permissions: {},
      auditScore: 8.0,
      auditStatus: 'published',
      downloadUrl: `https://storage.example.com/${name}-${version}.tgz`,
      publishedAt: '2026-01-01T00:00:00Z'
    };
  }

  it('installs transitive dependencies declared in extracted skills.json', async () => {
    const { installCommand } = await import('../commands/install.js');
    const { extract } = await import('tar');

    // Primary skill's extract writes a skills.json with a dependency
    vi.mocked(extract)
      .mockImplementationOnce(async (opts: unknown) => {
        const { cwd } = opts as { cwd: string };
        fs.writeFileSync(
          path.join(cwd, 'skills.json'),
          JSON.stringify({
            name: '@test-org/my-skill',
            version: '1.0.0',
            skills: { '@dep/helper': '^1.0.0' }
          })
        );
      })
      .mockImplementationOnce(async () => {
        // Dependency has no further deps
      });

    // Fetch sequence: primary versions, primary meta, primary tarball,
    //                  dep versions, dep meta, dep tarball
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@test-org/my-skill', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)))
      .mockResolvedValueOnce(new Response(JSON.stringify(depVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@dep/helper', '1.1.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    expect(mockFetch).toHaveBeenCalledTimes(6);

    const lock = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8'));
    expect(lock.skills['@test-org/my-skill@1.0.0']).toBeDefined();
    expect(lock.skills['@dep/helper@1.1.0']).toBeDefined();
  });

  it('does not add transitive deps to project skills.json', async () => {
    const { installCommand } = await import('../commands/install.js');
    const { extract } = await import('tar');

    vi.mocked(extract)
      .mockImplementationOnce(async (opts: unknown) => {
        const { cwd } = opts as { cwd: string };
        fs.writeFileSync(
          path.join(cwd, 'skills.json'),
          JSON.stringify({
            name: '@test-org/my-skill',
            version: '1.0.0',
            skills: { '@dep/helper': '^1.0.0' }
          })
        );
      })
      .mockImplementationOnce(async () => {});

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@test-org/my-skill', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)))
      .mockResolvedValueOnce(new Response(JSON.stringify(depVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@dep/helper', '1.1.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    const skillsJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
    expect(skillsJson.skills['@test-org/my-skill']).toBe('^1.0.0');
    expect(skillsJson.skills['@dep/helper']).toBeUndefined();
  });

  it('skips already-installed transitive deps', async () => {
    const { installCommand } = await import('../commands/install.js');
    const { extract } = await import('tar');

    // Pre-populate lockfile with the dependency already installed
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          skills: {
            '@dep/helper@1.1.0': {
              resolved: 'https://storage.example.com/dep-helper-1.1.0.tgz',
              integrity: fakeTarballIntegrity,
              permissions: {},
              audit_score: 9.0
            }
          }
        },
        null,
        2
      )
    );

    vi.mocked(extract).mockImplementationOnce(async (opts: unknown) => {
      const { cwd } = opts as { cwd: string };
      fs.writeFileSync(
        path.join(cwd, 'skills.json'),
        JSON.stringify({
          name: '@test-org/my-skill',
          version: '1.0.0',
          skills: { '@dep/helper': '^1.0.0' }
        })
      );
    });

    // Primary: 3 fetches. Dep: only versions fetch (then skipped as already installed)
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@test-org/my-skill', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)))
      .mockResolvedValueOnce(new Response(JSON.stringify(depVersionsResponse)));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    // 3 for primary + 1 versions fetch for dep (skipped after resolution)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('handles circular dependencies without infinite recursion', async () => {
    const { installCommand } = await import('../commands/install.js');
    const { extract } = await import('tar');

    const circularDepVersions = {
      name: '@dep/circular',
      versions: [
        {
          version: '1.0.0',
          integrity: 'sha512-circ',
          auditScore: 8.0,
          auditStatus: 'published',
          publishedAt: '2026-01-01T00:00:00Z'
        }
      ]
    };

    // Primary depends on @dep/circular, @dep/circular depends back on primary
    vi.mocked(extract)
      .mockImplementationOnce(async (opts: unknown) => {
        const { cwd } = opts as { cwd: string };
        fs.writeFileSync(
          path.join(cwd, 'skills.json'),
          JSON.stringify({
            name: '@test-org/my-skill',
            version: '1.0.0',
            skills: { '@dep/circular': '^1.0.0' }
          })
        );
      })
      .mockImplementationOnce(async (opts: unknown) => {
        const { cwd } = opts as { cwd: string };
        fs.writeFileSync(
          path.join(cwd, 'skills.json'),
          JSON.stringify({
            name: '@dep/circular',
            version: '1.0.0',
            skills: { '@test-org/my-skill': '^1.0.0' }
          })
        );
      });

    // Primary: versions, meta, tarball
    // @dep/circular: versions, meta, tarball
    // @test-org/my-skill (cycle): versions fetch → already in lockfile → skip
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@test-org/my-skill', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)))
      .mockResolvedValueOnce(new Response(JSON.stringify(circularDepVersions)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@dep/circular', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)))
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    // 3 primary + 3 dep + 1 cycle detection = 7
    expect(mockFetch).toHaveBeenCalledTimes(7);

    const lock = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8'));
    expect(lock.skills['@test-org/my-skill@1.0.0']).toBeDefined();
    expect(lock.skills['@dep/circular@1.0.0']).toBeDefined();
  });

  it('works normally when skill has no dependencies', async () => {
    const { installCommand } = await import('../commands/install.js');
    const { extract } = await import('tar');

    // Extract writes a skills.json with no skills field
    vi.mocked(extract).mockImplementationOnce(async (opts: unknown) => {
      const { cwd } = opts as { cwd: string };
      fs.writeFileSync(path.join(cwd, 'skills.json'), JSON.stringify({ name: '@test-org/my-skill', version: '1.0.0' }));
    });

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(primaryVersionsResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeMeta('@test-org/my-skill', '1.0.0'))))
      .mockResolvedValueOnce(new Response(new Uint8Array(fakeTarball)));

    await installCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir: tmpDir
    });

    // Only 3 fetches for the primary skill
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
