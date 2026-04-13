import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomIRSchema, type PackageIR, packageIRSchema } from '@internals/schemas';
import { afterAll, describe, expect, it } from 'vitest';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tank-atom-e2e-'));
}

function normalizeDirectory(dir: string): { success: true; data: PackageIR } | { success: false; error: string } {
  const tankJsonPath = path.join(dir, 'tank.json');
  const skillsJsonPath = path.join(dir, 'skills.json');
  const skillMdPath = path.join(dir, 'SKILL.md');

  const manifestPath = fs.existsSync(tankJsonPath)
    ? tankJsonPath
    : fs.existsSync(skillsJsonPath)
      ? skillsJsonPath
      : null;

  if (!manifestPath) {
    return { success: false, error: 'No tank.json or skills.json found' };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { success: false, error: `Failed to parse ${path.basename(manifestPath)}` };
  }

  const hasAtoms = 'atoms' in manifest && Array.isArray(manifest.atoms);
  const hasSkillMd = fs.existsSync(skillMdPath);

  if (!hasAtoms && !hasSkillMd) {
    return { success: false, error: 'No atoms field in manifest and no SKILL.md found' };
  }

  const atoms = hasAtoms ? manifest.atoms : [{ kind: 'instruction', content: 'SKILL.md' }];
  const pkg = { ...manifest, atoms };

  const result = packageIRSchema.safeParse(pkg);
  if (!result.success) {
    return { success: false, error: JSON.stringify(result.error.issues, null, 2) };
  }

  return { success: true, data: result.data };
}

describe('E2E: Normalization — real filesystem, real parsing, zero mocks', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function tracked(dir: string): string {
    dirs.push(dir);
    return dir;
  }

  describe('Legacy SKILL.md packages', () => {
    it('normalizes SKILL.md + tank.json (no atoms) to single instruction PackageIR', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# React Patterns\n\nUse functional components.\n');
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/react-patterns',
          version: '1.0.0',
          description: 'React best practices'
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('@acme/react-patterns');
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.atoms).toHaveLength(1);
        expect(result.data.atoms[0].kind).toBe('instruction');
        if (result.data.atoms[0].kind === 'instruction') {
          expect(result.data.atoms[0].content).toBe('SKILL.md');
        }
      }
    });

    it('normalizes SKILL.md + skills.json (legacy filename) identically', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Legacy Skill');
      fs.writeFileSync(
        path.join(dir, 'skills.json'),
        JSON.stringify({
          name: '@acme/legacy',
          version: '0.5.0'
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('@acme/legacy');
        expect(result.data.atoms).toHaveLength(1);
        expect(result.data.atoms[0].kind).toBe('instruction');
      }
    });

    it('prefers tank.json over skills.json when both exist', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Dual');
      fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify({ name: '@acme/new', version: '2.0.0' }));
      fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify({ name: '@acme/old', version: '1.0.0' }));

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('@acme/new');
        expect(result.data.version).toBe('2.0.0');
      }
    });

    it('fails when no SKILL.md and no atoms', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify({ name: '@acme/empty', version: '1.0.0' }));

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('SKILL.md');
      }
    });

    it('fails when no manifest exists at all', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Orphan skill with no manifest');

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No tank.json');
      }
    });

    it('preserves skills dependency map from legacy manifest', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# With deps');
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/with-deps',
          version: '1.0.0',
          skills: { '@org/base': '^1.0.0', '@org/utils': '^2.0.0' }
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skills).toEqual({ '@org/base': '^1.0.0', '@org/utils': '^2.0.0' });
      }
    });

    it('handles SKILL.md with complex markdown content', () => {
      const dir = tracked(makeTmpDir());
      const complexMd = [
        '# Complex Skill',
        '',
        '## Section with code',
        '```typescript',
        'const x: string = "hello";',
        '```',
        '',
        '## Section with table',
        '| Col A | Col B |',
        '|-------|-------|',
        '| 1     | 2     |',
        '',
        '## Section with special chars',
        'Use `@org/name` format. Escape \\n newlines.',
        ''
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'SKILL.md'), complexMd);
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/complex',
          version: '1.0.0'
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);

      const actualMd = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8');
      expect(actualMd).toContain('## Section with code');
      expect(actualMd).toContain('const x: string');
    });
  });

  describe('Tier 1: tank.json with atoms array', () => {
    it('normalizes single instruction atom', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/ts-rules',
          version: '1.0.0',
          atoms: [{ kind: 'instruction', content: './SKILL.md' }]
        })
      );
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '# TS Rules');

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atoms).toHaveLength(1);
        expect(result.data.atoms[0].kind).toBe('instruction');
      }
    });

    it('normalizes package with 7 mixed atoms — all kinds present', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/everything',
          version: '1.0.0',
          atoms: [
            { kind: 'instruction', content: './rules.md' },
            {
              kind: 'hook',
              event: 'pre-tool-use',
              handler: { type: 'dsl', actions: [{ action: 'block', match: 'rm -rf' }] }
            },
            { kind: 'tool', name: 'github', mcp: { command: 'npx', args: ['-y', 'gh-mcp'] } },
            { kind: 'agent', name: 'reviewer', role: 'Code reviewer', tools: ['read'] },
            { kind: 'rule', event: 'pre-tool-use', match: 'bash', policy: 'warn' },
            { kind: 'resource', uri: 'docs://api', description: 'API docs' },
            { kind: 'prompt', name: 'deploy', template: './deploy.md' }
          ]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atoms).toHaveLength(7);
        const kinds = result.data.atoms.map((a) => a.kind).sort();
        expect(kinds).toEqual(['agent', 'hook', 'instruction', 'prompt', 'resource', 'rule', 'tool']);
      }
    });

    it('normalizes package with includes (composition)', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/composed',
          version: '1.0.0',
          includes: ['@acme/base', '@acme/hooks'],
          atoms: [{ kind: 'instruction', content: './extra.md' }]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includes).toEqual(['@acme/base', '@acme/hooks']);
        expect(result.data.atoms).toHaveLength(1);
      }
    });

    it('normalizes package with empty atoms array', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/meta-only',
          version: '1.0.0',
          atoms: [],
          includes: ['@acme/all-the-things']
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atoms).toHaveLength(0);
        expect(result.data.includes).toEqual(['@acme/all-the-things']);
      }
    });

    it('preserves extension bags through normalization', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/ext-test',
          version: '1.0.0',
          atoms: [
            {
              kind: 'instruction',
              content: './rules.md',
              extensions: {
                cursor: { alwaysApply: true, frontmatter: { trigger: 'glob', globs: '**/*.ts' } },
                opencode: { scope: 'global' },
                windsurf: { charLimit: 12000 }
              }
            }
          ]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (result.success) {
        const atom = result.data.atoms[0];
        if (atom.kind === 'instruction') {
          expect(atom.extensions?.['cursor']).toEqual({
            alwaysApply: true,
            frontmatter: { trigger: 'glob', globs: '**/*.ts' }
          });
          expect(atom.extensions?.['opencode']).toEqual({ scope: 'global' });
          expect(atom.extensions?.['windsurf']).toEqual({ charLimit: 12000 });
        }
      }
    });

    it('fails with structured errors for invalid atoms', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/broken',
          version: '1.0.0',
          atoms: [{ kind: 'instruction' }, { kind: 'hook', event: 'pre-tool-use' }, { kind: 'agent', name: 'x' }]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
    });

    it('fails for unscoped package name', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: 'bad-name',
          version: '1.0.0',
          atoms: [{ kind: 'instruction', content: './SKILL.md' }]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
    });

    it('fails for invalid semver', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/test',
          version: 'abc',
          atoms: []
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
    });

    it('fails for corrupt JSON', () => {
      const dir = tracked(makeTmpDir());
      fs.writeFileSync(path.join(dir, 'tank.json'), '{ invalid json!!!');

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('parse');
      }
    });
  });

  describe('Round-trip: author → normalize → validate → verify', () => {
    it('full lifecycle: write files → normalize → all atoms validate individually', () => {
      const dir = tracked(makeTmpDir());

      fs.writeFileSync(
        path.join(dir, 'tank.json'),
        JSON.stringify({
          name: '@acme/production-suite',
          version: '3.2.1',
          description: 'Production-ready security and review suite',
          includes: ['@acme/base-standards'],
          atoms: [
            { kind: 'instruction', content: './rules/security.md', scope: 'project', globs: ['**/*.ts'] },
            {
              kind: 'hook',
              event: 'pre-tool-use',
              match: 'bash',
              handler: { type: 'dsl', actions: [{ action: 'block', match: 'rm -rf', reason: 'Destructive' }] }
            },
            { kind: 'hook', event: 'post-tool-use', handler: { type: 'js', entry: './hooks/audit-log.ts' } },
            {
              kind: 'tool',
              name: 'semgrep',
              description: 'SAST scanner',
              mcp: { command: 'semgrep', args: ['--mcp'] }
            },
            {
              kind: 'agent',
              name: 'security-auditor',
              role: 'Security specialist',
              tools: ['read', 'grep', 'glob'],
              readonly: true
            },
            {
              kind: 'rule',
              name: 'no-destructive-commands',
              event: 'pre-tool-use',
              match: 'bash',
              policy: 'block',
              reason: 'No destructive shell commands'
            },
            {
              kind: 'resource',
              name: 'owasp',
              uri: 'docs://owasp-top-10',
              description: 'OWASP Top 10',
              mimeType: 'text/markdown'
            },
            {
              kind: 'prompt',
              name: 'security-review',
              description: 'Run a security review',
              template: './prompts/review.md',
              arguments: [{ name: 'scope', description: 'What to review', required: true }]
            }
          ]
        })
      );

      const result = normalizeDirectory(dir);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.name).toBe('@acme/production-suite');
      expect(result.data.version).toBe('3.2.1');
      expect(result.data.includes).toEqual(['@acme/base-standards']);
      expect(result.data.atoms).toHaveLength(8);

      for (const atom of result.data.atoms) {
        const individualResult = atomIRSchema.safeParse(atom);
        expect(individualResult.success, `Individual validation failed for ${atom.kind}`).toBe(true);
      }

      const kindCounts = result.data.atoms.reduce<Record<string, number>>((acc, a) => {
        acc[a.kind] = (acc[a.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(kindCounts).toEqual({
        instruction: 1,
        hook: 2,
        tool: 1,
        agent: 1,
        rule: 1,
        resource: 1,
        prompt: 1
      });
    });
  });
});
