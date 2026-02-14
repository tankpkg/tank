import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doctorCommand } from '../commands/doctor.js';
import { getSymlinkName } from '../lib/agents.js';

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
  },
}));

const writeSkillsJson = (dir: string, skills: Record<string, string>): void => {
  fs.writeFileSync(
    path.join(dir, 'skills.json'),
    JSON.stringify({ name: 'test-project', skills }, null, 2) + '\n',
  );
};

const createLocalExtractDir = (projectDir: string, skillName: string): void => {
  const base = path.join(projectDir, '.tank', 'skills');
  const parts = skillName.startsWith('@') ? skillName.split('/') : [skillName];
  fs.mkdirSync(path.join(base, ...parts), { recursive: true });
};

const writeGlobalLockfile = (homedir: string, skills: Record<string, unknown>): void => {
  const lockDir = path.join(homedir, '.tank');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'skills.lock'),
    JSON.stringify({ lockfileVersion: 1, skills }, null, 2) + '\n',
  );
};

const writeGlobalLinks = (homedir: string, manifest: Record<string, unknown>): void => {
  const linksDir = path.join(homedir, '.tank');
  fs.mkdirSync(linksDir, { recursive: true });
  fs.writeFileSync(path.join(linksDir, 'links.json'), JSON.stringify(manifest, null, 2) + '\n');
};

const collectOutput = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls.map(call => call.join(' ')).join('\n');

describe('doctorCommand', () => {
  let tmpDir: string;
  let fakeHome: string;
  let projectDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-doctor-test-'));
    fakeHome = path.join(tmpDir, 'home');
    projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports detected vs missing agents correctly', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.config', 'opencode'), { recursive: true });

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Detected Agents');
    expect(output).toContain('✅ Claude Code');
    expect(output).toContain('✅ OpenCode');
    expect(output).toContain('❌ Cursor');
  });

  it('reports local skills with linked status', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const skillName = '@tank/typescript';
    writeSkillsJson(projectDir, { [skillName]: '^1.0.0' });
    createLocalExtractDir(projectDir, skillName);

    const symlinkName = getSymlinkName(skillName);
    const skillSource = path.join(projectDir, 'skills', 'typescript');
    fs.mkdirSync(skillSource, { recursive: true });
    const symlinkPath = path.join(fakeHome, '.claude', 'skills', symlinkName);
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(skillSource, symlinkPath, 'dir');

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Local Skills (1)');
    expect(output).toContain(skillName);
    expect(output).toContain('linked');
  });

  it('reports global skills from lockfile', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    writeGlobalLockfile(fakeHome, {
      '@tank/python@1.0.0': {
        resolved: 'https://example.com/python.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: 8.0,
      },
    });

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Global Skills (1)');
    expect(output).toContain('@tank/python');
  });

  it('reports dev-linked skills', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const skillName = 'my-custom-skill';
    const symlinkName = getSymlinkName(skillName);
    const skillSource = path.join(projectDir, 'dev', skillName);
    fs.mkdirSync(skillSource, { recursive: true });
    const symlinkPath = path.join(fakeHome, '.claude', 'skills', symlinkName);
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(skillSource, symlinkPath, 'dir');

    writeGlobalLinks(fakeHome, {
      version: 1,
      links: {
        [skillName]: {
          source: 'dev',
          sourceDir: skillSource,
          installedAt: new Date().toISOString(),
          agentLinks: { claude: symlinkPath },
        },
      },
    });

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Dev Links (1)');
    expect(output).toContain(skillName);
  });

  it('reports broken symlinks with warning', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const skillName = '@tank/react';
    writeSkillsJson(projectDir, { [skillName]: '^1.0.0' });

    const symlinkName = getSymlinkName(skillName);
    const missingTarget = path.join(projectDir, 'missing', 'react');
    const symlinkPath = path.join(fakeHome, '.claude', 'skills', symlinkName);
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(missingTarget, symlinkPath, 'dir');

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('⚠️');
    expect(output).toContain('broken link');
    expect(output).toContain(skillName);
  });

  it('provides actionable suggestions for broken links', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const skillName = '@tank/react';
    writeSkillsJson(projectDir, { [skillName]: '^1.0.0' });

    const symlinkName = getSymlinkName(skillName);
    const missingTarget = path.join(projectDir, 'missing', 'react');
    const symlinkPath = path.join(fakeHome, '.claude', 'skills', symlinkName);
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(missingTarget, symlinkPath, 'dir');

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Suggestions');
    expect(output).toContain(`tank install ${skillName}`);
  });

  it('handles empty skills gracefully', async () => {
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });

    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Local Skills (0)');
    expect(output).toContain('Global Skills (0)');
    expect(output).toContain('tank install @tank/typescript');
  });

  it('handles no agents detected with a suggestion', async () => {
    await doctorCommand({ directory: projectDir, homedir: fakeHome });

    const output = collectOutput(logSpy);
    expect(output).toContain('Detected Agents');
    expect(output).toContain('No agents detected');
  });
});
