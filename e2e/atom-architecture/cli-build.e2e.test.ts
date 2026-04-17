import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const TANK_BIN = path.resolve(__dirname, '../../packages/cli/dist/bin/tank.js');
const QUALITY_GATE_DIR = path.resolve(__dirname, '../../../tank-skills/skills/quality-gate');

const describeIfAvailable = fs.existsSync(QUALITY_GATE_DIR) ? describe : describe.skip;

function run(args: string, opts?: { cwd?: string }): string {
  return execSync(`node ${TANK_BIN} ${args} 2>&1`, {
    cwd: opts?.cwd ?? process.cwd(),
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
}

describeIfAvailable('E2E: `tank build` CLI command — real binary, real filesystem', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function tmpDir(prefix: string): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `tank-cli-e2e-${prefix}-`));
    dirs.push(d);
    return d;
  }

  it('builds quality-gate for opencode and writes correct files', () => {
    const out = tmpDir('opencode');
    const output = run(`build ${QUALITY_GATE_DIR} --platform opencode --out ${out}`);

    expect(output).toContain('Built');
    expect(output).toContain('opencode');

    expect(fs.existsSync(path.join(out, '.opencode/plugins/quality-gate.ts'))).toBe(true);
    expect(fs.existsSync(path.join(out, '.opencode/agent/code-reviewer.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, '.opencode/instructions/SKILL-md.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, '.opencode/plugins/handlers/quality-gate.handler.ts'))).toBe(true);

    const pluginContent = fs.readFileSync(path.join(out, '.opencode/plugins/quality-gate.ts'), 'utf-8');
    expect(pluginContent).toContain('session.idle');
    expect(pluginContent).toContain('./handlers/quality-gate.handler');

    const agentContent = fs.readFileSync(path.join(out, '.opencode/agent/code-reviewer.md'), 'utf-8');
    expect(agentContent).toContain('Senior code reviewer');

    const instrContent = fs.readFileSync(path.join(out, '.opencode/instructions/SKILL-md.md'), 'utf-8');
    expect(instrContent).toContain('Quality Gate');
    expect(instrContent).not.toContain('{file:');
  });

  it('builds quality-gate for claude-code and merges settings.json', () => {
    const out = tmpDir('claude-code');
    const output = run(`build ${QUALITY_GATE_DIR} --platform claude-code --out ${out}`);

    expect(output).toContain('Built');
    expect(output).toContain('claude-code');

    const settingsPath = path.join(out, '.claude/settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();

    expect(fs.existsSync(path.join(out, '.claude/agents/code-reviewer.md'))).toBe(true);
    const agentContent = fs.readFileSync(path.join(out, '.claude/agents/code-reviewer.md'), 'utf-8');
    expect(agentContent).toContain('code-reviewer');
    expect(agentContent).toContain('read-only');

    const hookWrapper = path.join(out, '.claude/hooks/quality-gate.mjs');
    if (fs.existsSync(hookWrapper)) {
      const wrapperContent = fs.readFileSync(hookWrapper, 'utf-8');
      expect(wrapperContent).toContain('Quality gate');
      expect(wrapperContent).toContain('getChangedCodeFiles');
    }
  });

  it('builds quality-gate for cursor and produces .mdc files', () => {
    const out = tmpDir('cursor');
    const output = run(`build ${QUALITY_GATE_DIR} --platform cursor --out ${out}`);

    expect(output).toContain('Built');

    const mdcFiles = fs
      .readdirSync(path.join(out, '.cursor/rules'), { recursive: true })
      .filter((f) => String(f).endsWith('.mdc'));
    expect(mdcFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('builds quality-gate for windsurf', () => {
    const out = tmpDir('windsurf');
    const output = run(`build ${QUALITY_GATE_DIR} --platform windsurf --out ${out}`);
    expect(output).toContain('Built');
    expect(
      fs.existsSync(path.join(out, '.windsurf/rules')) || fs.existsSync(path.join(out, '.windsurf/hooks.json'))
    ).toBe(true);
  });

  it('builds quality-gate for cline', () => {
    const out = tmpDir('cline');
    const output = run(`build ${QUALITY_GATE_DIR} --platform cline --out ${out}`);
    expect(output).toContain('Built');
    expect(fs.existsSync(path.join(out, '.clinerules'))).toBe(true);
  });

  it('builds quality-gate for roo-code and skips hooks', () => {
    const out = tmpDir('roo-code');
    const output = run(`build ${QUALITY_GATE_DIR} --platform roo-code --out ${out}`);
    expect(output).toContain('Built');
    expect(fs.existsSync(path.join(out, '.roomodes'))).toBe(true);
  });

  it('inlines SKILL.md content into generated instruction files', () => {
    const out = tmpDir('inline');
    run(`build ${QUALITY_GATE_DIR} --platform opencode --out ${out}`);

    const instrFile = path.join(out, '.opencode/instructions/SKILL-md.md');
    expect(fs.existsSync(instrFile)).toBe(true);
    const content = fs.readFileSync(instrFile, 'utf-8');
    expect(content).toContain('Quality Gate');
    expect(content).not.toContain('{file:');
  });

  it('fails with invalid platform name', () => {
    expect(() => run(`build ${QUALITY_GATE_DIR} --platform invalid-platform --out /tmp`)).toThrow();
  });

  it('fails with nonexistent skill directory', () => {
    expect(() => run(`build /nonexistent/path --platform opencode --out /tmp`)).toThrow();
  });
});
