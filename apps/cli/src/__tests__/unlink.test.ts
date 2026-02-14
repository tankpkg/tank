import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unlinkCommand } from '../commands/unlink.js';
import { linkSkillToAgents } from '../lib/linker.js';
import { getGlobalAgentSkillsDir, getSymlinkName } from '../lib/agents.js';
import { readLinks } from '../lib/links.js';
import { logger } from '../lib/logger.js';

const writeSkillsJson = (dir: string, data: Record<string, unknown>): void => {
  fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify(data, null, 2) + '\n');
};

const snapshotDirectory = (dir: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const visit = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relative = path.relative(dir, fullPath);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        result[relative] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
  };

  visit(dir);
  return result;
};

describe('unlinkCommand', () => {
  let tmpDir: string;
  let fakeHome: string;
  let skillDir: string;
  let linksDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-unlink-test-'));
    fakeHome = path.join(tmpDir, 'home');
    skillDir = path.join(tmpDir, 'my-skill');
    linksDir = path.join(fakeHome, '.tank');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.config', 'opencode'), { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes symlinks for a previously linked skill', async () => {
    const skillName = '@tank/unlink-test';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');

    linkSkillToAgents({
      skillName,
      sourceDir: skillDir,
      linksDir,
      source: 'dev',
      homedir: fakeHome,
    });

    const symlinkName = getSymlinkName(skillName);
    const claudeLink = path.join(fakeHome, '.claude', 'skills', symlinkName);
    const opencodeLink = path.join(fakeHome, '.config', 'opencode', 'skills', symlinkName);
    expect(fs.existsSync(claudeLink)).toBe(true);
    expect(fs.existsSync(opencodeLink)).toBe(true);

    await unlinkCommand({ directory: skillDir, homedir: fakeHome });

    expect(fs.existsSync(claudeLink)).toBe(false);
    expect(fs.existsSync(opencodeLink)).toBe(false);
  });

  it('removes the agent-skills wrapper directory when present', async () => {
    const skillName = '@tank/wrapper-cleanup';
    writeSkillsJson(skillDir, { name: skillName, description: 'Wrapper test' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');

    linkSkillToAgents({
      skillName,
      sourceDir: skillDir,
      linksDir,
      source: 'dev',
      homedir: fakeHome,
    });

    const symlinkName = getSymlinkName(skillName);
    const wrapperDir = path.join(getGlobalAgentSkillsDir(fakeHome), symlinkName);
    fs.mkdirSync(wrapperDir, { recursive: true });
    fs.writeFileSync(path.join(wrapperDir, 'SKILL.md'), '# Wrapped');

    await unlinkCommand({ directory: skillDir, homedir: fakeHome });

    expect(fs.existsSync(wrapperDir)).toBe(false);
  });

  it('throws when skills.json is missing', async () => {
    await expect(unlinkCommand({ directory: skillDir, homedir: fakeHome }))
      .rejects
      .toThrow('No skills.json found. Run this command from a skill directory.');
  });

  it('throws when skills.json has no name', async () => {
    writeSkillsJson(skillDir, { description: 'Missing name' });
    await expect(unlinkCommand({ directory: skillDir, homedir: fakeHome }))
      .rejects
      .toThrow("Missing 'name' in skills.json");
  });

  it('logs info when the skill was never linked', async () => {
    const skillName = '@tank/never-linked';
    writeSkillsJson(skillDir, { name: skillName, description: 'Missing entry' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await unlinkCommand({ directory: skillDir, homedir: fakeHome });

    expect(infoSpy).toHaveBeenCalledWith(`No links found for ${skillName}`);
  });

  it('does not modify the skill directory contents', async () => {
    const skillName = '@tank/keep-dir';
    writeSkillsJson(skillDir, { name: skillName, description: 'Keep contents' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');
    fs.writeFileSync(path.join(skillDir, 'extra.txt'), 'unchanged');

    linkSkillToAgents({
      skillName,
      sourceDir: skillDir,
      linksDir,
      source: 'dev',
      homedir: fakeHome,
    });

    const before = snapshotDirectory(skillDir);
    await unlinkCommand({ directory: skillDir, homedir: fakeHome });
    const after = snapshotDirectory(skillDir);

    expect(after).toEqual(before);
  });

  it('is idempotent when run twice', async () => {
    const skillName = '@tank/idempotent-unlink';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');

    linkSkillToAgents({
      skillName,
      sourceDir: skillDir,
      linksDir,
      source: 'dev',
      homedir: fakeHome,
    });

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await unlinkCommand({ directory: skillDir, homedir: fakeHome });
    await unlinkCommand({ directory: skillDir, homedir: fakeHome });

    expect(infoSpy).toHaveBeenCalledWith(`No links found for ${skillName}`);
  });

  it('removes the skill entry from links.json', async () => {
    const skillName = '@tank/remove-links-entry';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');

    linkSkillToAgents({
      skillName,
      sourceDir: skillDir,
      linksDir,
      source: 'dev',
      homedir: fakeHome,
    });

    await unlinkCommand({ directory: skillDir, homedir: fakeHome });

    const manifest = readLinks(linksDir);
    expect(manifest.links[skillName]).toBeUndefined();
  });
});
