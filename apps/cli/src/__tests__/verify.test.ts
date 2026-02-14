import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SkillsLock } from '@tank/shared';

// Mock logger to capture output
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { verifyCommand } from '../commands/verify.js';
import { logger } from '../lib/logger.js';

describe('verifyCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-verify-test-'));
    vi.mocked(logger.success).mockReset();
    vi.mocked(logger.error).mockReset();
    vi.mocked(logger.info).mockReset();
    vi.mocked(logger.warn).mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLockfile(skills: SkillsLock['skills']) {
    const lock: SkillsLock = { lockfileVersion: 1, skills };
    fs.writeFileSync(
      path.join(tmpDir, 'skills.lock'),
      JSON.stringify(lock, null, 2) + '\n',
    );
  }

  function createSkillDir(skillName: string) {
    // skillName like "@org/skill" → .tank/skills/@org/skill
    const skillDir = path.join(tmpDir, '.tank', 'skills', ...skillName.split('/'));
    fs.mkdirSync(skillDir, { recursive: true });
    // Write a dummy file so the directory isn't empty
    fs.writeFileSync(path.join(skillDir, 'skill.json'), '{}');
  }

  it('passes when all skills are installed correctly', async () => {
    writeLockfile({
      '@org/skill@1.0.0': {
        resolved: 'https://example.com/skill.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: 8.0,
      },
      'simple-skill@2.0.0': {
        resolved: 'https://example.com/simple.tgz',
        integrity: 'sha512-def',
        permissions: {},
        audit_score: 9.0,
      },
    });
    createSkillDir('@org/skill');
    createSkillDir('simple-skill');

    await verifyCommand({ directory: tmpDir });

    expect(logger.success).toHaveBeenCalledWith(
      expect.stringMatching(/2 skills verified/i),
    );
  });

  it('fails when skill directory is missing', async () => {
    writeLockfile({
      'missing-skill@1.0.0': {
        resolved: 'https://example.com/missing.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: 8.0,
      },
    });
    // Don't create the skill directory

    await expect(verifyCommand({ directory: tmpDir })).rejects.toThrow(
      /verification failed/i,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/missing-skill/),
    );
  });

  it('fails when lockfile is missing', async () => {
    // No lockfile written
    await expect(verifyCommand({ directory: tmpDir })).rejects.toThrow(
      /skills\.lock/i,
    );
  });

  it('reports multiple issues', async () => {
    writeLockfile({
      'skill-a@1.0.0': {
        resolved: 'https://example.com/a.tgz',
        integrity: 'sha512-aaa',
        permissions: {},
        audit_score: 8.0,
      },
      'skill-b@2.0.0': {
        resolved: 'https://example.com/b.tgz',
        integrity: 'sha512-bbb',
        permissions: {},
        audit_score: 7.0,
      },
    });
    // Neither skill directory exists

    await expect(verifyCommand({ directory: tmpDir })).rejects.toThrow(
      /verification failed/i,
    );

    // Should report both missing skills
    const errorCalls = vi.mocked(logger.error).mock.calls.map(c => c[0]);
    const allErrors = errorCalls.join('\n');
    expect(allErrors).toContain('skill-a');
    expect(allErrors).toContain('skill-b');
  });

  it('works with scoped packages (@org/skill)', async () => {
    writeLockfile({
      '@my-org/deep-skill@3.0.0': {
        resolved: 'https://example.com/deep.tgz',
        integrity: 'sha512-deep',
        permissions: {},
        audit_score: 7.5,
      },
    });
    createSkillDir('@my-org/deep-skill');

    await verifyCommand({ directory: tmpDir });

    expect(logger.success).toHaveBeenCalledWith(
      expect.stringMatching(/1 skill verified/i),
    );
  });

  it('prints success message on pass', async () => {
    writeLockfile({
      'good-skill@1.0.0': {
        resolved: 'https://example.com/good.tgz',
        integrity: 'sha512-good',
        permissions: {},
        audit_score: 10.0,
      },
    });
    createSkillDir('good-skill');

    await verifyCommand({ directory: tmpDir });

    expect(logger.success).toHaveBeenCalled();
    const successMsg = vi.mocked(logger.success).mock.calls[0][0];
    expect(successMsg).toMatch(/verified/i);
  });

  it('defaults to process.cwd() when no directory specified', async () => {
    // This test just verifies the function signature accepts no options
    // It will fail because there's no lockfile in cwd, which is expected
    await expect(verifyCommand()).rejects.toThrow();
  });
});
