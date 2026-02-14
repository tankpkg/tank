import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkCommand } from '../commands/link.js';
import { getGlobalAgentSkillsDir, getSymlinkName } from '../lib/agents.js';
import { readGlobalLinks } from '../lib/links.js';
import { logger } from '../lib/logger.js';

const writeSkillsJson = (dir: string, data: Record<string, unknown>): void => {
  fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify(data, null, 2) + '\n');
};

const resolveSymlinkTarget = (symlinkPath: string): string => {
  const raw = fs.readlinkSync(symlinkPath);
  return path.resolve(path.dirname(symlinkPath), raw);
};

describe('linkCommand', () => {
  let tmpDir: string;
  let fakeHome: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-link-test-'));
    fakeHome = path.join(tmpDir, 'home');
    skillDir = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.config', 'opencode'), { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('links the current skill directory when SKILL.md has frontmatter', async () => {
    const skillName = '@tank/my-skill';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\n---\n\n# Title\n');

    await linkCommand({ directory: skillDir, homedir: fakeHome });

    const symlinkName = getSymlinkName(skillName);
    const claudeLink = path.join(fakeHome, '.claude', 'skills', symlinkName);
    const opencodeLink = path.join(fakeHome, '.config', 'opencode', 'skills', symlinkName);

    expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(opencodeLink).isSymbolicLink()).toBe(true);
    expect(resolveSymlinkTarget(claudeLink)).toBe(path.resolve(skillDir));
    expect(resolveSymlinkTarget(opencodeLink)).toBe(path.resolve(skillDir));
  });

  it('links a generated wrapper when SKILL.md lacks frontmatter', async () => {
    const skillName = '@tank/no-frontmatter';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    const skillContent = '# Heading\n\nSome content.';
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    await linkCommand({ directory: skillDir, homedir: fakeHome });

    const symlinkName = getSymlinkName(skillName);
    const wrapperDir = path.join(getGlobalAgentSkillsDir(fakeHome), symlinkName);
    const claudeLink = path.join(fakeHome, '.claude', 'skills', symlinkName);

    expect(resolveSymlinkTarget(claudeLink)).toBe(path.resolve(wrapperDir));
    expect(fs.existsSync(path.join(wrapperDir, 'SKILL.md'))).toBe(true);
    const wrapped = fs.readFileSync(path.join(wrapperDir, 'SKILL.md'), 'utf-8');
    expect(wrapped.startsWith('---\n')).toBe(true);
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).toBe(skillContent);
  });

  it('throws when skills.json is missing', async () => {
    await expect(linkCommand({ directory: skillDir, homedir: fakeHome }))
      .rejects
      .toThrow('No skills.json found. Run this command from a skill directory.');
  });

  it('throws when skills.json has no name', async () => {
    writeSkillsJson(skillDir, { description: 'Missing name' });
    await expect(linkCommand({ directory: skillDir, homedir: fakeHome }))
      .rejects
      .toThrow("Missing 'name' in skills.json");
  });

  it('logs info and returns when no agents are detected', async () => {
    const emptyHome = path.join(tmpDir, 'empty-home');
    fs.mkdirSync(emptyHome, { recursive: true });
    writeSkillsJson(skillDir, { name: '@tank/no-agents', description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Title');

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await linkCommand({ directory: skillDir, homedir: emptyHome });

    expect(infoSpy).toHaveBeenCalledWith(
      'No AI agents detected. Skills linked to agents will be available once agents are installed.',
    );
  });

  it('is idempotent when run twice', async () => {
    const skillName = '@tank/idempotent';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: idempotent\n---\n');

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await linkCommand({ directory: skillDir, homedir: fakeHome });

    warnSpy.mockClear();
    await linkCommand({ directory: skillDir, homedir: fakeHome });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('already linked');
  });

  it('records dev links in global links.json', async () => {
    const skillName = '@tank/dev-link';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: dev-link\n---\n');

    await linkCommand({ directory: skillDir, homedir: fakeHome });

    const manifest = readGlobalLinks(fakeHome);
    const entry = manifest.links[skillName];
    expect(entry).toBeDefined();
    expect(entry.source).toBe('dev');
  });

  it('prints a summary with the linked count', async () => {
    const skillName = '@tank/summary';
    writeSkillsJson(skillDir, { name: skillName, description: 'Test skill' });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: summary\n---\n');

    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => undefined);
    await linkCommand({ directory: skillDir, homedir: fakeHome });

    const lastCall = successSpy.mock.calls[successSpy.mock.calls.length - 1]?.[0];
    expect(lastCall).toBe(`Linked ${skillName} to 2 agent(s)`);
  });
});
