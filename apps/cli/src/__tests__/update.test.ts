import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock install command — update delegates to install for the actual download
vi.mock('../commands/install.js', () => ({
  installCommand: vi.fn().mockResolvedValue(undefined),
}));

// Mock ora
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

describe('updateCommand', () => {
  let tmpDir: string;
  let configDir: string;
  let homedir: string;

  const baseSkillsJson = {
    name: 'my-project',
    version: '1.0.0',
    skills: {
      '@test-org/my-skill': '^2.0.0',
      'simple-skill': '^1.0.0',
    },
    permissions: {},
  };

  const baseLockfile = {
    lockfileVersion: 1,
    skills: {
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {},
        audit_score: 8.0,
      },
      'simple-skill@1.0.0': {
        resolved: 'https://storage.example.com/simple-skill-1.0.0.tgz',
        integrity: 'sha512-ghi789',
        permissions: {},
        audit_score: 7.0,
      },
    },
  };

  const baseGlobalLockfile = {
    lockfileVersion: 1,
    skills: {
      '@test-org/my-skill@2.0.0': {
        resolved: 'https://storage.example.com/my-skill-2.0.0.tgz',
        integrity: 'sha512-abc123',
        permissions: {},
        audit_score: 8.0,
      },
      'simple-skill@1.0.0': {
        resolved: 'https://storage.example.com/simple-skill-1.0.0.tgz',
        integrity: 'sha512-ghi789',
        permissions: {},
        audit_score: 7.0,
      },
    },
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-update-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-update-config-'));
    homedir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-update-home-'));

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ registry: 'https://tankpkg.dev' }),
    );

    mockFetch.mockReset();
    vi.mocked((async () => (await import('../commands/install.js')).installCommand)()).constructor;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(homedir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeSkillsJson(data: Record<string, unknown> = baseSkillsJson) {
    fs.writeFileSync(
      path.join(tmpDir, 'skills.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }

  function writeLockfile(data: Record<string, unknown> = baseLockfile) {
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }

  function writeGlobalLockfile(data: Record<string, unknown> = baseGlobalLockfile) {
    const tankDir = path.join(homedir, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    fs.writeFileSync(
      path.join(tankDir, 'skills.lock'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }

  function mockVersionsResponse(versions: string[]) {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: '@test-org/my-skill',
          versions: versions.map((v) => ({
            version: v,
            integrity: `sha512-${v}`,
            auditScore: 8.0,
            auditStatus: 'published',
            publishedAt: '2026-01-01T00:00:00Z',
          })),
        }),
        { status: 200 },
      ),
    );
  }

  function mockVersionsResponseFor(name: string, versions: string[]) {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name,
          versions: versions.map((v) => ({
            version: v,
            integrity: `sha512-${v}`,
            auditScore: 8.0,
            auditStatus: 'published',
            publishedAt: '2026-01-01T00:00:00Z',
          })),
        }),
        { status: 200 },
      ),
    );
  }

  it('updates skill when newer version available', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeSkillsJson();
    writeLockfile();

    // Registry returns versions including a newer 2.1.0
    mockVersionsResponse(['2.0.0', '2.1.0']);

    await updateCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir });

    // Should call installCommand with the skill name and version range
    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '@test-org/my-skill',
        versionRange: '^2.0.0',
        directory: tmpDir,
        configDir,
      }),
    );
  });

  it('prints "Already at latest" when no newer version', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    const { logger } = await import('../lib/logger.js');
    writeSkillsJson();
    writeLockfile();

    // Registry returns only the currently installed version
    mockVersionsResponse(['2.0.0']);

    await updateCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir });

    // Should NOT call installCommand
    expect(vi.mocked(installCommand)).not.toHaveBeenCalled();

    // Should print "already at latest"
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringMatching(/already.*latest|up.to.date/i),
    );
  });

  it('errors when skills.json is missing', async () => {
    const { updateCommand } = await import('../commands/update.js');

    await expect(
      updateCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/skills\.json/i);
  });

  it('errors when skill is not in skills.json', async () => {
    const { updateCommand } = await import('../commands/update.js');
    writeSkillsJson();

    await expect(
      updateCommand({ name: '@nonexistent/skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/not found|not installed/i);
  });

  it('handles network errors gracefully', async () => {
    const { updateCommand } = await import('../commands/update.js');
    writeSkillsJson();
    writeLockfile();

    // Simulate network failure
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(
      updateCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir }),
    ).rejects.toThrow(/network/i);
  });

  it('updates all skills when no name provided', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeSkillsJson();
    writeLockfile();

    // First skill: @test-org/my-skill has newer version
    mockVersionsResponse(['2.0.0', '2.1.0']);

    // Second skill: simple-skill has newer version
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          versions: [
            { version: '1.0.0', integrity: 'sha512-100', auditScore: 7.0, auditStatus: 'published', publishedAt: '2026-01-01T00:00:00Z' },
            { version: '1.1.0', integrity: 'sha512-110', auditScore: 8.0, auditStatus: 'published', publishedAt: '2026-01-15T00:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    await updateCommand({ directory: tmpDir, configDir });

    // Both skills should be updated via installCommand
    expect(vi.mocked(installCommand)).toHaveBeenCalledTimes(2);
  });

  it('prints summary after updating all', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { logger } = await import('../lib/logger.js');
    writeSkillsJson();
    writeLockfile();

    // Both skills have newer versions
    mockVersionsResponse(['2.0.0', '2.1.0']);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          versions: [
            { version: '1.0.0', integrity: 'sha512-100', auditScore: 7.0, auditStatus: 'published', publishedAt: '2026-01-01T00:00:00Z' },
            { version: '1.1.0', integrity: 'sha512-110', auditScore: 8.0, auditStatus: 'published', publishedAt: '2026-01-15T00:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    await updateCommand({ directory: tmpDir, configDir });

    // Should print summary
    expect(vi.mocked(logger.success)).toHaveBeenCalledWith(
      expect.stringMatching(/updated 2 skill/i),
    );
  });

  it('handles mix of up-to-date and outdated skills', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    const { logger } = await import('../lib/logger.js');
    writeSkillsJson();
    writeLockfile();

    // First skill: @test-org/my-skill is up to date (only 2.0.0 available)
    mockVersionsResponse(['2.0.0']);

    // Second skill: simple-skill has newer version
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          versions: [
            { version: '1.0.0', integrity: 'sha512-100', auditScore: 7.0, auditStatus: 'published', publishedAt: '2026-01-01T00:00:00Z' },
            { version: '1.2.0', integrity: 'sha512-120', auditScore: 9.0, auditStatus: 'published', publishedAt: '2026-02-01T00:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    await updateCommand({ directory: tmpDir, configDir });

    // Only simple-skill should be installed (the outdated one)
    expect(vi.mocked(installCommand)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'simple-skill' }),
    );

    // Summary should say 1 updated
    expect(vi.mocked(logger.success)).toHaveBeenCalledWith(
      expect.stringMatching(/updated 1 skill/i),
    );
  });

  it('prints "All skills up to date" when nothing to update', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    const { logger } = await import('../lib/logger.js');
    writeSkillsJson();
    writeLockfile();

    // Both skills are at latest
    mockVersionsResponse(['2.0.0']);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'simple-skill',
          versions: [
            { version: '1.0.0', integrity: 'sha512-100', auditScore: 7.0, auditStatus: 'published', publishedAt: '2026-01-01T00:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    await updateCommand({ directory: tmpDir, configDir });

    // No installs should happen
    expect(vi.mocked(installCommand)).not.toHaveBeenCalled();

    // Should print "all up to date"
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringMatching(/all skills up to date/i),
    );
  });

  it('handles missing lockfile gracefully (treats all as needing update)', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeSkillsJson();
    // No lockfile written

    // Registry returns versions
    mockVersionsResponse(['2.0.0', '2.1.0']);

    await updateCommand({ name: '@test-org/my-skill', directory: tmpDir, configDir });

    // Should call installCommand since there's no lockfile to compare against
    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '@test-org/my-skill',
        versionRange: '^2.0.0',
      }),
    );
  });

  it('updates global skill using global lockfile entry', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeGlobalLockfile();

    mockVersionsResponse(['2.0.0', '2.1.0']);

    await updateCommand({
      name: '@test-org/my-skill',
      configDir,
      global: true,
      homedir,
    });

    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '@test-org/my-skill',
        versionRange: '>=2.0.0',
        global: true,
        homedir,
        configDir,
      }),
    );
  });

  it('does not require skills.json for global updates', async () => {
    const { updateCommand } = await import('../commands/update.js');
    writeGlobalLockfile();

    mockVersionsResponse(['2.0.0', '2.1.0']);

    await expect(
      updateCommand({
        name: '@test-org/my-skill',
        configDir,
        global: true,
        homedir,
      }),
    ).resolves.toBeUndefined();
  });

  it('updates all global skills from global lockfile', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeGlobalLockfile();

    mockVersionsResponseFor('@test-org/my-skill', ['2.0.0', '2.1.0']);
    mockVersionsResponseFor('simple-skill', ['1.0.0', '1.1.0']);

    await updateCommand({ configDir, global: true, homedir });

    expect(vi.mocked(installCommand)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '@test-org/my-skill',
        versionRange: '*',
        global: true,
      }),
    );
    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'simple-skill',
        versionRange: '*',
        global: true,
      }),
    );
  });

  it('errors when global lockfile is missing', async () => {
    const { updateCommand } = await import('../commands/update.js');

    await expect(
      updateCommand({ configDir, global: true, homedir }),
    ).rejects.toThrow(/skills\.lock|global/i);
  });

  it('prints "Already at latest" for global updates', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    const { logger } = await import('../lib/logger.js');
    writeGlobalLockfile();

    mockVersionsResponse(['2.0.0']);

    await updateCommand({
      name: '@test-org/my-skill',
      configDir,
      global: true,
      homedir,
    });

    expect(vi.mocked(installCommand)).not.toHaveBeenCalled();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringMatching(/already.*latest|up.to.date/i),
    );
  });

  it('errors when global skill is not in lockfile', async () => {
    const { updateCommand } = await import('../commands/update.js');
    writeGlobalLockfile({
      lockfileVersion: 1,
      skills: {
        'simple-skill@1.0.0': {
          resolved: 'https://storage.example.com/simple-skill-1.0.0.tgz',
          integrity: 'sha512-ghi789',
          permissions: {},
          audit_score: 7.0,
        },
      },
    });

    await expect(
      updateCommand({
        name: '@test-org/my-skill',
        configDir,
        global: true,
        homedir,
      }),
    ).rejects.toThrow(/not found|not installed|lockfile/i);
  });

  it('passes homedir through for local updates', async () => {
    const { updateCommand } = await import('../commands/update.js');
    const { installCommand } = await import('../commands/install.js');
    writeSkillsJson();
    writeLockfile();

    mockVersionsResponse(['2.0.0', '2.1.0']);

    await updateCommand({
      name: '@test-org/my-skill',
      directory: tmpDir,
      configDir,
      homedir,
    });

    expect(vi.mocked(installCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '@test-org/my-skill',
        versionRange: '^2.0.0',
        global: false,
        homedir,
      }),
    );
  });
});
