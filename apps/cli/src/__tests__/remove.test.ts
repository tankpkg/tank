import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('removeCommand', () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

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
      '@test-org/my-skill@2.1.0': {
        resolved: 'https://storage.example.com/my-skill-2.1.0.tgz',
        integrity: 'sha512-def456',
        permissions: {},
        audit_score: 9.0,
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-remove-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
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

  function readSkillsJson(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
  }

  function readLockfile(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.lock'), 'utf-8'));
  }

  it('removes skill from skills.json', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    writeLockfile();

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    const updated = readSkillsJson();
    const skills = updated.skills as Record<string, string>;
    expect(skills['@test-org/my-skill']).toBeUndefined();
    expect(skills['simple-skill']).toBe('^1.0.0');
  });

  it('removes ALL lockfile entries for the skill name', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    writeLockfile();

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    const lock = readLockfile() as { skills: Record<string, unknown> };
    // Both @test-org/my-skill@2.0.0 and @test-org/my-skill@2.1.0 should be gone
    expect(lock.skills['@test-org/my-skill@2.0.0']).toBeUndefined();
    expect(lock.skills['@test-org/my-skill@2.1.0']).toBeUndefined();
    // simple-skill should remain
    expect(lock.skills['simple-skill@1.0.0']).toBeDefined();
  });

  it('deletes skill directory from .tank/skills/', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    writeLockfile();

    // Create the skill directory
    const skillDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill.json'), '{}');

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    expect(fs.existsSync(skillDir)).toBe(false);
  });

  it('handles scoped packages (@org/skill) correctly', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    writeLockfile();

    // Create scoped skill directory
    const skillDir = path.join(tmpDir, '.tank', 'skills', '@test-org', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'index.js'), 'module.exports = {}');

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    // Scoped directory should be removed
    expect(fs.existsSync(skillDir)).toBe(false);
    // skills.json should not have the skill
    const updated = readSkillsJson();
    expect((updated.skills as Record<string, string>)['@test-org/my-skill']).toBeUndefined();
  });

  it('errors when skills.json is missing', async () => {
    const { removeCommand } = await import('../commands/remove.js');

    await expect(
      removeCommand({ name: '@test-org/my-skill', directory: tmpDir }),
    ).rejects.toThrow(/skills\.json/i);
  });

  it('errors when skill is not in skills.json', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();

    await expect(
      removeCommand({ name: '@nonexistent/skill', directory: tmpDir }),
    ).rejects.toThrow(/not found|not installed/i);
  });

  it('handles missing skills.lock gracefully (just skips lockfile update)', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    // No lockfile written

    // Should not throw
    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    // skills.json should still be updated
    const updated = readSkillsJson();
    expect((updated.skills as Record<string, string>)['@test-org/my-skill']).toBeUndefined();
    // No lockfile should be created
    expect(fs.existsSync(path.join(tmpDir, 'skills.lock'))).toBe(false);
  });

  it('prints success message', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    const { logger } = await import('../lib/logger.js');
    writeSkillsJson();
    writeLockfile();

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    expect(vi.mocked(logger.success)).toHaveBeenCalledWith(
      expect.stringContaining('@test-org/my-skill'),
    );
  });

  it('writes skills.json with trailing newline', async () => {
    const { removeCommand } = await import('../commands/remove.js');
    writeSkillsJson();
    writeLockfile();

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    const raw = fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('writes skills.lock with sorted keys', async () => {
    const { removeCommand } = await import('../commands/remove.js');

    // Add skills in non-alphabetical order
    const skillsJson = {
      ...baseSkillsJson,
      skills: {
        'z-skill': '^1.0.0',
        '@test-org/my-skill': '^2.0.0',
        'a-skill': '^1.0.0',
      },
    };
    writeSkillsJson(skillsJson);

    const lockfile = {
      lockfileVersion: 1,
      skills: {
        'z-skill@1.0.0': {
          resolved: 'https://example.com/z.tgz',
          integrity: 'sha512-zzz',
          permissions: {},
          audit_score: 5.0,
        },
        '@test-org/my-skill@2.0.0': {
          resolved: 'https://example.com/my.tgz',
          integrity: 'sha512-abc',
          permissions: {},
          audit_score: 8.0,
        },
        'a-skill@1.0.0': {
          resolved: 'https://example.com/a.tgz',
          integrity: 'sha512-aaa',
          permissions: {},
          audit_score: 6.0,
        },
      },
    };
    writeLockfile(lockfile);

    await removeCommand({ name: '@test-org/my-skill', directory: tmpDir });

    const lock = readLockfile() as { skills: Record<string, unknown> };
    const keys = Object.keys(lock.skills);
    expect(keys).toEqual([...keys].sort());
  });
});
