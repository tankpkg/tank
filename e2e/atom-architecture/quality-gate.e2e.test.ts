import fs from 'node:fs';
import path from 'node:path';
import { atomIRSchema, packageIRSchema } from '@internals/schemas';
import { describe, expect, it } from 'vitest';

const QUALITY_GATE_DIR = path.resolve(__dirname, '../../../tank-skills/skills/quality-gate');

describe('E2E: @tank/quality-gate — real skill package, real schemas, zero mocks', () => {
  describe('Package validation against PackageIR', () => {
    it('tank.json exists and is valid JSON', () => {
      const manifestPath = path.join(QUALITY_GATE_DIR, 'tank.json');
      expect(fs.existsSync(manifestPath), `${manifestPath} not found`).toBe(true);
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('tank.json validates against PackageIR schema', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      const result = packageIRSchema.safeParse(manifest);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.issues, null, 2));
      }
      expect(result.success).toBe(true);
    });

    it('package name is scoped @tank/', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      expect(manifest.name).toBe('@tank/quality-gate');
    });

    it('contains exactly 3 atoms', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      expect(manifest.atoms).toHaveLength(3);
    });

    it('has one hook atom with event pre-stop', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      const hooks = manifest.atoms.filter((a: { kind: string }) => a.kind === 'hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].event).toBe('pre-stop');
      expect(hooks[0].handler.type).toBe('js');
      expect(hooks[0].handler.entry).toBe('./hooks/quality-gate.ts');
    });

    it('has one agent atom named code-reviewer', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      const agents = manifest.atoms.filter((a: { kind: string }) => a.kind === 'agent');
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('code-reviewer');
      expect(agents[0].readonly).toBe(true);
    });

    it('has one instruction atom pointing to SKILL.md', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      const instructions = manifest.atoms.filter((a: { kind: string }) => a.kind === 'instruction');
      expect(instructions).toHaveLength(1);
      expect(instructions[0].content).toBe('./SKILL.md');
    });

    it('every atom individually validates against AtomIR', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      for (const atom of manifest.atoms) {
        const result = atomIRSchema.safeParse(atom);
        expect(
          result.success,
          `Atom ${atom.kind}/${atom.name ?? ''} failed: ${JSON.stringify(result.success ? null : result.error.issues)}`
        ).toBe(true);
      }
    });

    it('all referenced files exist on disk', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(QUALITY_GATE_DIR, 'tank.json'), 'utf-8'));
      for (const atom of manifest.atoms) {
        if (atom.kind === 'instruction' && atom.content) {
          const filePath = path.join(QUALITY_GATE_DIR, atom.content);
          expect(fs.existsSync(filePath), `Missing: ${atom.content}`).toBe(true);
        }
        if (atom.kind === 'hook' && atom.handler?.entry) {
          const filePath = path.join(QUALITY_GATE_DIR, atom.handler.entry);
          expect(fs.existsSync(filePath), `Missing: ${atom.handler.entry}`).toBe(true);
        }
      }
    });
  });

  describe('Hook handler logic — real functions, real data', () => {
    async function importHandler() {
      return await import(path.join(QUALITY_GATE_DIR, 'hooks/quality-gate.ts'));
    }

    it('detects code files correctly', async () => {
      const { hasCodeChanges, getCodeFiles } = await importHandler();

      expect(hasCodeChanges([{ path: 'src/index.ts' }])).toBe(true);
      expect(hasCodeChanges([{ path: 'src/main.py' }])).toBe(true);
      expect(hasCodeChanges([{ path: 'lib/handler.go' }])).toBe(true);
      expect(hasCodeChanges([{ path: 'README.md' }])).toBe(false);
      expect(hasCodeChanges([{ path: 'package.json' }])).toBe(false);
      expect(hasCodeChanges([{ path: '.env' }])).toBe(false);
      expect(hasCodeChanges([])).toBe(false);

      const codeFiles = getCodeFiles([
        { path: 'src/index.ts' },
        { path: 'README.md' },
        { path: 'src/utils.js' },
        { path: 'config.yaml' }
      ]);
      expect(codeFiles).toHaveLength(2);
      expect(codeFiles.map((f: { path: string }) => f.path)).toEqual(['src/index.ts', 'src/utils.js']);
    });

    it('parses review output into structured issues', async () => {
      const { parseReviewOutput } = await importHandler();

      const output = [
        '[critical] - src/auth.ts:42 - Hardcoded API key in source',
        '[high] - src/db.ts:15 - SQL query built from unsanitized input',
        '[medium] - src/utils.ts:88 - Function exceeds 50 lines',
        '[low] - src/config.ts:3 - Inconsistent naming convention'
      ].join('\n');

      const issues = parseReviewOutput(output);
      expect(issues).toHaveLength(4);
      expect(issues[0]).toEqual({
        severity: 'critical',
        file: 'src/auth.ts',
        line: 42,
        message: 'Hardcoded API key in source'
      });
      expect(issues[1].severity).toBe('high');
      expect(issues[2].severity).toBe('medium');
      expect(issues[3].severity).toBe('low');
    });

    it('parses NO_ISSUES_FOUND as empty', async () => {
      const { parseReviewOutput } = await importHandler();
      const issues = parseReviewOutput('NO_ISSUES_FOUND');
      expect(issues).toHaveLength(0);
    });

    it('handles malformed review output gracefully', async () => {
      const { parseReviewOutput } = await importHandler();
      const issues = parseReviewOutput('This is not a valid review format\nNeither is this');
      expect(issues).toHaveLength(0);
    });

    it('formats issues for the agent with blocking/non-blocking sections', async () => {
      const { formatIssuesForAgent } = await importHandler();

      const formatted = formatIssuesForAgent([
        { severity: 'critical', file: 'auth.ts', line: 10, message: 'Hardcoded secret' },
        { severity: 'high', file: 'db.ts', line: 20, message: 'SQL injection' },
        { severity: 'medium', file: 'utils.ts', line: 30, message: 'Long function' },
        { severity: 'low', file: 'config.ts', message: 'Naming' }
      ]);

      expect(formatted).toContain('blocking issue');
      expect(formatted).toContain('[CRITICAL]');
      expect(formatted).toContain('[HIGH]');
      expect(formatted).toContain('non-blocking');
      expect(formatted).toContain('[medium]');
      expect(formatted).toContain('[low]');
    });

    it('builds a review prompt listing only code files', async () => {
      const { buildReviewPrompt } = await importHandler();

      const prompt = buildReviewPrompt([{ path: 'src/index.ts' }, { path: 'src/auth.ts' }]);

      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('src/auth.ts');
      expect(prompt).toContain('[SEVERITY]');
      expect(prompt).toContain('critical');
      expect(prompt).toContain('NO_ISSUES_FOUND');
    });

    it('full qualityGate flow — no code files → passes without review', async () => {
      const { qualityGate } = await importHandler();
      let continued = false;

      await qualityGate({
        sessionId: 'test-1',
        modifiedFiles: [{ path: 'README.md' }, { path: 'package.json' }],
        delegateToAgent: async () => {
          throw new Error('Should not be called');
        },
        continueWithMessage: () => {
          continued = true;
        }
      });

      expect(continued).toBe(false);
    });

    it('full qualityGate flow — code files, no issues → passes', async () => {
      const { qualityGate } = await importHandler();
      let continued = false;

      await qualityGate({
        sessionId: 'test-2',
        modifiedFiles: [{ path: 'src/index.ts' }],
        delegateToAgent: async () => 'NO_ISSUES_FOUND',
        continueWithMessage: () => {
          continued = true;
        }
      });

      expect(continued).toBe(false);
    });

    it('full qualityGate flow — critical issues → blocks and forces fix', async () => {
      const { qualityGate } = await importHandler();
      let blockMessage = '';

      await qualityGate({
        sessionId: 'test-3',
        modifiedFiles: [{ path: 'src/auth.ts' }],
        delegateToAgent: async () => '[critical] - src/auth.ts:42 - Hardcoded API key',
        continueWithMessage: (msg: string) => {
          blockMessage = msg;
        }
      });

      expect(blockMessage).toContain('BLOCKED');
      expect(blockMessage).toContain('CRITICAL');
      expect(blockMessage).toContain('must fix');
    });

    it('full qualityGate flow — only medium/low → passes with report', async () => {
      const { qualityGate } = await importHandler();
      let passMessage = '';

      await qualityGate({
        sessionId: 'test-4',
        modifiedFiles: [{ path: 'src/utils.ts' }],
        delegateToAgent: async () => '[medium] - src/utils.ts:50 - Long function\n[low] - src/utils.ts:10 - Naming',
        continueWithMessage: (msg: string) => {
          passMessage = msg;
        }
      });

      expect(passMessage).toContain('PASSED');
      expect(passMessage).toContain('non-blocking');
    });
  });

  describe('File completeness', () => {
    it('SKILL.md exists', () => {
      expect(fs.existsSync(path.join(QUALITY_GATE_DIR, 'SKILL.md'))).toBe(true);
    });

    it('references/review-criteria.md exists', () => {
      expect(fs.existsSync(path.join(QUALITY_GATE_DIR, 'references/review-criteria.md'))).toBe(true);
    });

    it('hooks/quality-gate.ts exists', () => {
      expect(fs.existsSync(path.join(QUALITY_GATE_DIR, 'hooks/quality-gate.ts'))).toBe(true);
    });

    it('LICENSE exists', () => {
      expect(fs.existsSync(path.join(QUALITY_GATE_DIR, 'LICENSE'))).toBe(true);
    });
  });
});
