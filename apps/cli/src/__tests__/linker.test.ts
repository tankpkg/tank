import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  linkSkillToAgents,
  unlinkSkillFromAgents,
  getSkillLinkStatus,
  getAllLinkStatuses,
} from '../lib/linker.js';
import { readLinks } from '../lib/links.js';

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'tank-test-'));

const createFakeHome = (tmpDir: string): string => {
  const fakeHome = path.join(tmpDir, 'home');
  fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.config', 'opencode'), { recursive: true });
  return fakeHome;
};

const getAgentSkillDirs = (fakeHome: string) => ({
  claude: path.join(fakeHome, '.claude', 'skills'),
  opencode: path.join(fakeHome, '.config', 'opencode', 'skills'),
});

describe('linker', () => {
  let tmpDir: string;
  let fakeHome: string;
  let linksDir: string;
  let skillSource: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    fakeHome = createFakeHome(tmpDir);
    linksDir = path.join(tmpDir, '.tank');
    skillSource = path.join(tmpDir, 'skill-source');
    fs.mkdirSync(skillSource, { recursive: true });
    fs.writeFileSync(path.join(skillSource, 'SKILL.md'), '# Test Skill');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('linkSkillToAgents', () => {
    it('creates symlinks in each detected agent dir', () => {
      const result = linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const { claude, opencode } = getAgentSkillDirs(fakeHome);
      const expectedName = 'tank--test-skill';

      const claudeLink = path.join(claude, expectedName);
      const opencodeLink = path.join(opencode, expectedName);

      expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(opencodeLink).isSymbolicLink()).toBe(true);
      expect(result.linked.sort()).toEqual(['claude', 'opencode']);
    });

    it('creates agent skills directory if it does not exist', () => {
      const { claude } = getAgentSkillDirs(fakeHome);
      expect(fs.existsSync(claude)).toBe(false);

      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      expect(fs.existsSync(claude)).toBe(true);
    });

    it('skips when symlink already points to correct target', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const result = linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      expect(result.linked).toEqual([]);
      expect(result.skipped.sort()).toEqual(['claude', 'opencode']);
      expect(result.failed).toEqual([]);
    });

    it('overwrites symlink when it points to wrong target', () => {
      const { claude } = getAgentSkillDirs(fakeHome);
      fs.mkdirSync(claude, { recursive: true });

      const oldSource = path.join(tmpDir, 'old-source');
      fs.mkdirSync(oldSource, { recursive: true });
      const symlinkPath = path.join(claude, 'tank--test-skill');
      fs.symlinkSync(oldSource, symlinkPath, 'dir');

      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const resolvedTarget = path.resolve(path.dirname(symlinkPath), fs.readlinkSync(symlinkPath));
      expect(resolvedTarget).toBe(path.resolve(skillSource));
    });

    it('recreates dangling symlinks', () => {
      const { opencode } = getAgentSkillDirs(fakeHome);
      fs.mkdirSync(opencode, { recursive: true });

      const danglingTarget = path.join(tmpDir, 'missing-source');
      const symlinkPath = path.join(opencode, 'tank--test-skill');
      fs.symlinkSync(danglingTarget, symlinkPath, 'dir');

      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const resolvedTarget = path.resolve(path.dirname(symlinkPath), fs.readlinkSync(symlinkPath));
      expect(resolvedTarget).toBe(path.resolve(skillSource));
      expect(fs.existsSync(resolvedTarget)).toBe(true);
    });

    it('does not delete real directories when path exists', () => {
      const { claude } = getAgentSkillDirs(fakeHome);
      fs.mkdirSync(path.join(claude, 'tank--test-skill'), { recursive: true });

      const result = linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      expect(result.failed).toHaveLength(1);
      expect(fs.existsSync(path.join(claude, 'tank--test-skill'))).toBe(true);
    });

    it('returns failure on permission error without throwing', () => {
      if (process.platform === 'win32') return;

      const claudeConfig = path.join(fakeHome, '.claude');
      fs.chmodSync(claudeConfig, 0o500);

      try {
        const result = linkSkillToAgents({
          skillName: '@tank/test-skill',
          sourceDir: skillSource,
          linksDir,
          source: 'local',
          homedir: fakeHome,
        });

        expect(result.failed.some((entry) => entry.agentId === 'claude')).toBe(true);
      } finally {
        fs.chmodSync(claudeConfig, 0o700);
      }
    });

    it('updates links.json manifest after linking', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const manifest = readLinks(linksDir);
      const entry = manifest.links['@tank/test-skill'];
      expect(entry).toBeDefined();
      expect(entry.source).toBe('local');
      expect(entry.sourceDir).toBe(skillSource);
      expect(Object.keys(entry.agentLinks).sort()).toEqual(['claude', 'opencode']);
    });

    it('returns correct counts for linked, skipped, and failed', () => {
      const { claude } = getAgentSkillDirs(fakeHome);
      fs.mkdirSync(path.join(claude, 'tank--test-skill'), { recursive: true });

      const result = linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      expect(result.failed).toHaveLength(1);
      expect(result.linked).toEqual(['opencode']);
      expect(result.skipped).toEqual([]);
    });
  });

  describe('unlinkSkillFromAgents', () => {
    it('removes symlinks and updates manifest', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const result = unlinkSkillFromAgents({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(result.unlinked.sort()).toEqual(['claude', 'opencode']);
      const manifest = readLinks(linksDir);
      expect(manifest.links['@tank/test-skill']).toBeUndefined();
    });

    it('does not delete real directories', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const { claude } = getAgentSkillDirs(fakeHome);
      const realDir = path.join(claude, 'tank--test-skill');
      fs.unlinkSync(realDir);
      fs.mkdirSync(realDir, { recursive: true });

      const result = unlinkSkillFromAgents({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(result.notFound).toContain('claude');
      expect(fs.existsSync(realDir)).toBe(true);
    });

    it('handles missing symlinks gracefully', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const { opencode } = getAgentSkillDirs(fakeHome);
      const missingPath = path.join(opencode, 'tank--test-skill');
      fs.unlinkSync(missingPath);

      const result = unlinkSkillFromAgents({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(result.notFound).toContain('opencode');
    });
  });

  describe('getSkillLinkStatus', () => {
    it('reports linked skills as valid', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const statuses = getSkillLinkStatus({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(statuses.every((status) => status.linked && status.targetValid)).toBe(true);
    });

    it('reports unlinked skills correctly', () => {
      const statuses = getSkillLinkStatus({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(statuses.every((status) => status.linked === false)).toBe(true);
    });

    it('reports broken symlinks correctly', () => {
      const { claude } = getAgentSkillDirs(fakeHome);
      fs.mkdirSync(claude, { recursive: true });

      const danglingTarget = path.join(tmpDir, 'missing-source');
      const symlinkPath = path.join(claude, 'tank--test-skill');
      fs.symlinkSync(danglingTarget, symlinkPath, 'dir');

      const statuses = getSkillLinkStatus({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      const claudeStatus = statuses.find((status) => status.agentId === 'claude');
      expect(claudeStatus?.linked).toBe(true);
      expect(claudeStatus?.targetValid).toBe(false);
    });

    it('works with empty links manifest', () => {
      const statuses = getSkillLinkStatus({
        skillName: '@tank/test-skill',
        linksDir,
        homedir: fakeHome,
      });

      expect(statuses).toHaveLength(2);
    });
  });

  describe('getAllLinkStatuses', () => {
    it('returns status for all skills in manifest', () => {
      linkSkillToAgents({
        skillName: '@tank/test-skill',
        sourceDir: skillSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const otherSource = path.join(tmpDir, 'other-source');
      fs.mkdirSync(otherSource, { recursive: true });
      linkSkillToAgents({
        skillName: '@tank/other-skill',
        sourceDir: otherSource,
        linksDir,
        source: 'local',
        homedir: fakeHome,
      });

      const statuses = getAllLinkStatuses({ linksDir, homedir: fakeHome });
      expect(Object.keys(statuses).sort()).toEqual(['@tank/other-skill', '@tank/test-skill']);
      expect(statuses['@tank/test-skill']).toHaveLength(2);
    });

    it('returns empty record for empty manifest', () => {
      const statuses = getAllLinkStatuses({ linksDir, homedir: fakeHome });
      expect(statuses).toEqual({});
    });
  });
});
