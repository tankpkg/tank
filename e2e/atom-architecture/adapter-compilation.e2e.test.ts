import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  claudeCodeAdapter,
  clineAdapter,
  compilePackage,
  cursorAdapter,
  opencodeAdapter,
  rooCodeAdapter,
  windsurfAdapter
} from '@internals/adapters';

import { type PackageIR, type PlatformAdapter, packageIRSchema } from '@internals/schemas';
import { afterAll, describe, expect, it } from 'vitest';

const QUALITY_GATE_DIR = path.resolve(__dirname, '../../../tank-skills/skills/quality-gate');

const describeIfAvailable = fs.existsSync(QUALITY_GATE_DIR) ? describe : describe.skip;

function loadQualityGate(): PackageIR {
  const raw = fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8');
  const result = packageIRSchema.safeParse(JSON.parse(raw));
  if (!result.success) throw new Error(`Quality-gate manifest invalid: ${JSON.stringify(result.error.issues)}`);
  return result.data;
}

function writeToTmpDir(prefix: string, files: Array<{ path: string; content: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tank-adapter-e2e-${prefix}-`));
  for (const f of files) {
    const fullPath = path.join(dir, f.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, f.content);
  }
  return dir;
}

describeIfAvailable('E2E: quality-gate compiled through all 6 adapters — real files on real filesystem', () => {
  const tmpDirs: string[] = [];
  const pkg = loadQualityGate();

  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function compileAndWrite(adapter: PlatformAdapter) {
    const result = compilePackage(pkg, adapter);
    const dir = writeToTmpDir(adapter.name, result.files);
    tmpDirs.push(dir);
    return { result, dir };
  }

  describe('OpenCode adapter', () => {
    it('compiles quality-gate to .opencode/ files', () => {
      const { result, dir } = compileAndWrite(opencodeAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(3);
      expect(result.skipped).toHaveLength(0);

      const pluginFiles = result.files.filter((f) => f.path.startsWith('.opencode/plugins/'));
      expect(pluginFiles.length).toBeGreaterThanOrEqual(1);

      const agentFiles = result.files.filter((f) => f.path.startsWith('.opencode/agent/'));
      expect(agentFiles).toHaveLength(1);
      expect(agentFiles[0].path).toContain('code-reviewer');

      const instrFiles = result.files.filter((f) => f.path.startsWith('.opencode/instructions/'));
      expect(instrFiles).toHaveLength(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing on disk: ${f.path}`).toBe(true);
        expect(fs.readFileSync(fullPath, 'utf-8')).toBe(f.content);
      }
    });

    it('hook plugin references session.idle event', () => {
      const { result } = compileAndWrite(opencodeAdapter);
      const hookPlugin = result.files.find((f) => f.path.includes('quality-gate'));
      expect(hookPlugin).toBeDefined();
      expect(hookPlugin!.content).toContain('session.idle');
    });

    it('agent file contains role description', () => {
      const { result } = compileAndWrite(opencodeAdapter);
      const agentFile = result.files.find((f) => f.path.includes('code-reviewer'));
      expect(agentFile).toBeDefined();
      expect(agentFile!.content).toContain('Senior code reviewer');
    });
  });

  describe('Claude Code adapter', () => {
    it('compiles quality-gate to .claude/ files', () => {
      const { result, dir } = compileAndWrite(claudeCodeAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(3);
      expect(result.skipped).toHaveLength(0);

      const settingsFiles = result.files.filter((f) => f.path.includes('settings.json'));
      expect(settingsFiles.length).toBeGreaterThanOrEqual(1);

      const agentFiles = result.files.filter((f) => f.path.startsWith('.claude/agents/'));
      expect(agentFiles).toHaveLength(1);
      expect(agentFiles[0].path).toContain('code-reviewer');

      const ruleFiles = result.files.filter((f) => f.path.includes('settings.json'));
      expect(ruleFiles.length).toBeGreaterThanOrEqual(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing on disk: ${f.path}`).toBe(true);
      }
    });

    it('settings.json contains Stop hook config', () => {
      const { result } = compileAndWrite(claudeCodeAdapter);
      const settings = result.files.find((f) => f.path === '.claude/settings.json' && f.content.includes('Stop'));
      expect(settings).toBeDefined();
      const parsed = JSON.parse(settings!.content);
      expect(parsed.hooks).toHaveProperty('Stop');
    });

    it('agent file is valid markdown with role', () => {
      const { result } = compileAndWrite(claudeCodeAdapter);
      const agentFile = result.files.find((f) => f.path.includes('code-reviewer'));
      expect(agentFile).toBeDefined();
      expect(agentFile!.content).toContain('# code-reviewer');
      expect(agentFile!.content).toContain('read-only');
    });

    it('command file generated for prompt atom', () => {
      const { result } = compileAndWrite(claudeCodeAdapter);
      const hasCommand = result.files.some(
        (f) => f.path.startsWith('.claude/commands/') || f.path.startsWith('.claude/rules/')
      );
      expect(hasCommand).toBe(true);
    });
  });

  describe('Cursor adapter', () => {
    it('compiles quality-gate to .cursor/ files', () => {
      const { result, dir } = compileAndWrite(cursorAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(3);

      const ruleFiles = result.files.filter((f) => f.path.endsWith('.mdc'));
      expect(ruleFiles.length).toBeGreaterThanOrEqual(1);

      const agentFiles = result.files.filter((f) => f.path.startsWith('.cursor/agents/'));
      expect(agentFiles).toHaveLength(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing: ${f.path}`).toBe(true);
      }
    });

    it('rule files use MDC frontmatter format', () => {
      const { result } = compileAndWrite(cursorAdapter);
      const mdcFile = result.files.find((f) => f.path.endsWith('.mdc'));
      expect(mdcFile).toBeDefined();
      expect(mdcFile!.content).toContain('---');
      expect(mdcFile!.content).toContain('alwaysApply');
    });
  });

  describe('Windsurf adapter', () => {
    it('compiles quality-gate to .windsurf/ files', () => {
      const { result, dir } = compileAndWrite(windsurfAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(2);

      const ruleFiles = result.files.filter((f) => f.path.startsWith('.windsurf/rules/'));
      expect(ruleFiles.length).toBeGreaterThanOrEqual(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing: ${f.path}`).toBe(true);
      }
    });

    it('agent atom degrades with warning (Windsurf has fixed modes)', () => {
      const { result } = compileAndWrite(windsurfAdapter);
      const agentWarning = result.warnings.find((w) => w.atomKind === 'agent');
      expect(agentWarning).toBeDefined();
      expect(agentWarning!.level).toBe('degraded');
    });

    it('hook compiles to hooks.json with post_cascade_response', () => {
      const { result } = compileAndWrite(windsurfAdapter);
      const hooksJson = result.files.find((f) => f.path === '.windsurf/hooks.json');
      expect(hooksJson).toBeDefined();
      const parsed = JSON.parse(hooksJson!.content);
      expect(parsed.hooks).toHaveProperty('post_cascade_response');
    });
  });

  describe('Cline adapter', () => {
    it('compiles quality-gate to .clinerules/ files', () => {
      const { result, dir } = compileAndWrite(clineAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(2);

      const ruleFiles = result.files.filter((f) => f.path.startsWith('.clinerules/'));
      expect(ruleFiles.length).toBeGreaterThanOrEqual(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing: ${f.path}`).toBe(true);
      }
    });

    it('agent atom degrades with warning (Cline has Plan/Act only)', () => {
      const { result } = compileAndWrite(clineAdapter);
      const agentWarning = result.warnings.find((w) => w.atomKind === 'agent');
      expect(agentWarning).toBeDefined();
      expect(agentWarning!.level).toBe('degraded');
    });

    it('hook compiles to .clinerules/hooks/ script', () => {
      const { result } = compileAndWrite(clineAdapter);
      const hookFile = result.files.find((f) => f.path.startsWith('.clinerules/hooks/'));
      expect(hookFile).toBeDefined();
    });
  });

  describe('Roo Code adapter', () => {
    it('compiles quality-gate to .roo/ and .roomodes files', () => {
      const { result, dir } = compileAndWrite(rooCodeAdapter);

      expect(result.files.length).toBeGreaterThanOrEqual(1);

      for (const f of result.files) {
        const fullPath = path.join(dir, f.path);
        expect(fs.existsSync(fullPath), `Missing: ${f.path}`).toBe(true);
      }
    });

    it('hook atom is skipped (Roo Code has no hooks)', () => {
      const { result } = compileAndWrite(rooCodeAdapter);
      const hookSkip = result.warnings.find((w) => w.atomKind === 'hook' && w.level === 'skipped');
      expect(hookSkip).toBeDefined();
      expect(result.skipped).toContain('hook');
    });

    it('agent compiles to .roomodes with custom mode config', () => {
      const { result } = compileAndWrite(rooCodeAdapter);
      const roomodes = result.files.find((f) => f.path === '.roomodes');
      expect(roomodes).toBeDefined();
      const parsed = JSON.parse(roomodes!.content);
      expect(parsed.customModes).toHaveLength(1);
      expect(parsed.customModes[0].slug).toBe('code-reviewer');
      expect(parsed.customModes[0].roleDefinition).toContain('Senior code reviewer');
    });
  });

  describe('Cross-adapter consistency', () => {
    const allAdapters: PlatformAdapter[] = [
      opencodeAdapter,
      claudeCodeAdapter,
      cursorAdapter,
      windsurfAdapter,
      clineAdapter,
      rooCodeAdapter
    ];

    it('every adapter produces at least 1 file for the quality-gate package', () => {
      for (const adapter of allAdapters) {
        const result = compilePackage(pkg, adapter);
        expect(result.files.length, `${adapter.name} produced 0 files`).toBeGreaterThanOrEqual(1);
      }
    });

    it('no adapter crashes or throws on any atom', () => {
      for (const adapter of allAdapters) {
        expect(() => compilePackage(pkg, adapter)).not.toThrow();
      }
    });

    it('instruction atom produces at least 1 file on every adapter', () => {
      const instrAtom = pkg.atoms.find((a) => a.kind === 'instruction');
      expect(instrAtom).toBeDefined();

      for (const adapter of allAdapters) {
        const output = adapter.compileAtom(instrAtom);
        expect(output.files.length, `${adapter.name} produced 0 files for instruction`).toBeGreaterThanOrEqual(1);
      }
    });

    it('hook-capable adapters produce hook files, others skip or degrade', () => {
      const hookAtom = pkg.atoms.find((a) => a.kind === 'hook');
      expect(hookAtom).toBeDefined();

      for (const adapter of allAdapters) {
        const output = adapter.compileAtom(hookAtom);
        if (adapter.capabilities.hook === 'full') {
          expect(output.files.length, `${adapter.name} should produce hook files`).toBeGreaterThanOrEqual(1);
        } else if (adapter.capabilities.hook === 'none') {
          expect(output.files).toHaveLength(0);
          expect(output.warnings.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });
});
