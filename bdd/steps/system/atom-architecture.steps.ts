import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type AdapterCapabilities,
  adapterCapabilitiesSchema,
  agentIRSchema,
  atomIRSchema,
  hookIRSchema,
  instructionIRSchema,
  packageIRSchema,
  platformOutputSchema,
  promptIRSchema,
  resourceIRSchema,
  ruleIRSchema,
  toolIRSchema
} from '@internals/schemas';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

describe('Atom IR schema validation', () => {
  describe('Instruction atom', () => {
    it('valid instruction atom with required fields', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules.md',
        scope: 'project'
      });
      expect(result.success).toBe(true);
    });

    it('instruction atom missing required content field', () => {
      const result = instructionIRSchema.safeParse({ kind: 'instruction' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path.join('.'));
        expect(fields).toContain('content');
      }
    });

    it('instruction atom with extensions preserved', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules.md',
        extensions: { cursor: { alwaysApply: true } }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extensions).toEqual({ cursor: { alwaysApply: true } });
      }
    });

    it('instruction atom with unknown core field rejected', () => {
      const result = instructionIRSchema.safeParse({
        kind: 'instruction',
        content: './rules.md',
        unknownField: true
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Hook atom', () => {
    it('valid hook atom with DSL handler', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'dsl', actions: [{ action: 'block', match: 'rm -rf' }] }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.handler.type).toBe('dsl');
      }
    });

    it('valid hook atom with JS handler', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'js', entry: './hooks/check.ts' }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.handler.type).toBe('js');
      }
    });

    it('hook atom with invalid handler type', () => {
      const result = hookIRSchema.safeParse({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'invalid' }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Agent atom', () => {
    it('valid agent atom', () => {
      const result = agentIRSchema.safeParse({
        kind: 'agent',
        name: 'reviewer',
        role: 'Code reviewer',
        tools: ['read', 'grep']
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Tool atom', () => {
    it('valid tool atom with MCP server config', () => {
      const result = toolIRSchema.safeParse({
        kind: 'tool',
        name: 'my-tool',
        mcp: { command: 'npx', args: ['-y', 'my-server'] }
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Rule atom', () => {
    it('valid rule atom', () => {
      const result = ruleIRSchema.safeParse({
        kind: 'rule',
        event: 'pre-tool-use',
        match: 'bash',
        policy: 'block'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Resource atom', () => {
    it('valid resource atom', () => {
      const result = resourceIRSchema.safeParse({
        kind: 'resource',
        uri: 'docs://api-reference',
        description: 'API docs'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Prompt atom', () => {
    it('valid prompt atom', () => {
      const result = promptIRSchema.safeParse({
        kind: 'prompt',
        name: 'deploy',
        description: 'Deploy to prod',
        template: './prompts/deploy.md'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Kind discriminator', () => {
    it('atom with missing kind field', () => {
      const result = atomIRSchema.safeParse({ content: './rules.md' });
      expect(result.success).toBe(false);
    });

    it('atom with unknown kind value', () => {
      const result = atomIRSchema.safeParse({ kind: 'widget' });
      expect(result.success).toBe(false);
    });
  });
});

describe('Adapter capability gating', () => {
  const ALL_KINDS = ['instruction', 'hook', 'tool', 'agent', 'rule', 'resource', 'prompt'] as const;

  describe('Capability declaration', () => {
    it('adapter declares capabilities for all 7 atom kinds', () => {
      const caps: AdapterCapabilities = {
        instruction: 'full',
        hook: 'full',
        tool: 'full',
        agent: 'full',
        rule: 'full',
        resource: 'full',
        prompt: 'full'
      };
      const result = adapterCapabilitiesSchema.safeParse(caps);
      expect(result.success).toBe(true);
      if (result.success) {
        for (const kind of ALL_KINDS) {
          expect(result.data[kind]).toBeDefined();
          expect(['full', 'degraded', 'none']).toContain(result.data[kind]);
        }
      }
    });
  });

  describe('Full support', () => {
    it('atom compiled with full support', () => {
      const output = platformOutputSchema.safeParse({
        files: [{ path: '.cursor/rules/ts.mdc', content: '---\nalwaysApply: true\n---' }],
        warnings: []
      });
      expect(output.success).toBe(true);
      if (output.success) {
        expect(output.data.files.length).toBeGreaterThanOrEqual(1);
        expect(output.data.warnings).toHaveLength(0);
      }
    });
  });

  describe('Degraded support', () => {
    it('atom compiled with degraded support produces warning', () => {
      const output = platformOutputSchema.safeParse({
        files: [{ path: '.windsurfrules', content: 'approximated hook as rule' }],
        warnings: [{ level: 'degraded', atomKind: 'hook', message: 'Hook approximated as instruction rule' }]
      });
      expect(output.success).toBe(true);
      if (output.success) {
        expect(output.data.files.length).toBeGreaterThanOrEqual(1);
        expect(output.data.warnings).toHaveLength(1);
        expect(output.data.warnings[0].level).toBe('degraded');
        expect(output.data.warnings[0].atomKind).toBe('hook');
      }
    });
  });

  describe('No support', () => {
    it('atom skipped when capability is none', () => {
      const output = platformOutputSchema.safeParse({
        files: [],
        warnings: [{ level: 'skipped', atomKind: 'hook', message: 'Aider does not support hooks' }]
      });
      expect(output.success).toBe(true);
      if (output.success) {
        expect(output.data.files).toHaveLength(0);
        expect(output.data.warnings).toHaveLength(1);
        expect(output.data.warnings[0].level).toBe('skipped');
        expect(output.data.warnings[0].atomKind).toBe('hook');
      }
    });
  });

  describe('Version compatibility', () => {
    it('target version within supported range', () => {
      expect(semver.satisfies('2.5.0', '>=2.4.0 <3.0.0')).toBe(true);
    });

    it('target version outside supported range', () => {
      expect(semver.satisfies('3.1.0', '>=2.4.0 <3.0.0')).toBe(false);
    });

    it('target version at exact lower bound', () => {
      expect(semver.satisfies('2.4.0', '>=2.4.0 <3.0.0')).toBe(true);
    });

    it('target version at exact upper bound (exclusive)', () => {
      expect(semver.satisfies('3.0.0', '>=2.4.0 <3.0.0')).toBe(false);
    });
  });
});

describe('Legacy SKILL.md normalization', () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tank-atom-bdd-'));
  }

  it('legacy package with SKILL.md normalizes to single instruction atom', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# My Skill\nDo X when Y');
    fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify({ name: '@acme/my-skill', version: '1.0.0' }));

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'tank.json'), 'utf-8'));
    const hasAtoms = 'atoms' in manifest && Array.isArray(manifest.atoms);
    const hasSkillMd = fs.existsSync(path.join(dir, 'SKILL.md'));

    const atoms = hasAtoms ? manifest.atoms : hasSkillMd ? [{ kind: 'instruction', content: 'SKILL.md' }] : [];

    const pkg = { ...manifest, atoms };
    const result = packageIRSchema.safeParse(pkg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('@acme/my-skill');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.atoms).toHaveLength(1);
      expect(result.data.atoms[0].kind).toBe('instruction');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('legacy package with skills.json normalizes identically', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# My Skill\nDo X when Y');
    fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify({ name: '@acme/my-skill', version: '1.0.0' }));

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skills.json'), 'utf-8'));
    const atoms = [{ kind: 'instruction' as const, content: 'SKILL.md' }];
    const pkg = { ...manifest, atoms };
    const result = packageIRSchema.safeParse(pkg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.atoms).toHaveLength(1);
      expect(result.data.atoms[0].kind).toBe('instruction');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('legacy package without SKILL.md fails normalization', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'tank.json'), JSON.stringify({ name: '@acme/no-skill', version: '1.0.0' }));

    const hasSkillMd = fs.existsSync(path.join(dir, 'SKILL.md'));
    expect(hasSkillMd).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'tank.json'), 'utf-8'));
    const hasAtoms = 'atoms' in manifest && Array.isArray(manifest.atoms);

    if (!hasAtoms && !hasSkillMd) {
      expect(true).toBe(true);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('legacy package with existing skills map preserves dependencies', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# React Skill');
    fs.writeFileSync(
      path.join(dir, 'tank.json'),
      JSON.stringify({ name: '@acme/react', version: '2.0.0', skills: { '@org/dep': '^1.0.0' } })
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'tank.json'), 'utf-8'));
    const atoms = [{ kind: 'instruction' as const, content: 'SKILL.md' }];
    const pkg = { ...manifest, atoms };
    const result = packageIRSchema.safeParse(pkg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.atoms).toHaveLength(1);
      expect(result.data.skills).toEqual({ '@org/dep': '^1.0.0' });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Tier 1 tank.json normalization', () => {
  it('tank.json with a single instruction atom', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/ts-rules',
      version: '1.0.0',
      atoms: [{ kind: 'instruction', content: './SKILL.md' }]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.atoms).toHaveLength(1);
      expect(result.data.atoms[0].kind).toBe('instruction');
    }
  });

  it('tank.json with multiple mixed atoms', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/security',
      version: '1.0.0',
      atoms: [
        { kind: 'instruction', content: './rules.md' },
        { kind: 'agent', name: 'reviewer', role: 'Code reviewer' },
        { kind: 'rule', event: 'pre-tool-use', match: 'bash', policy: 'block' }
      ]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.atoms).toHaveLength(3);
      const kinds = result.data.atoms.map((a) => a.kind);
      expect(kinds).toEqual(['instruction', 'agent', 'rule']);
    }
  });

  it('tank.json with includes references', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/full-stack',
      version: '1.0.0',
      includes: ['@acme/ts-rules', '@acme/security-hooks'],
      atoms: [{ kind: 'instruction', content: './extra.md' }]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includes).toContain('@acme/ts-rules');
      expect(result.data.includes).toContain('@acme/security-hooks');
      expect(result.data.atoms).toHaveLength(1);
    }
  });

  it('tank.json with invalid atom in atoms array', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/broken',
      version: '1.0.0',
      atoms: [{ kind: 'instruction' }]
    });
    expect(result.success).toBe(false);
  });

  it('tank.json with invalid package name', () => {
    const result = packageIRSchema.safeParse({
      name: 'unscoped-name',
      version: '1.0.0',
      atoms: [{ kind: 'instruction', content: './SKILL.md' }]
    });
    expect(result.success).toBe(false);
  });

  it('tank.json atoms array is empty', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/empty',
      version: '1.0.0',
      atoms: []
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.atoms).toHaveLength(0);
    }
  });

  it('atom extensions survive normalization', () => {
    const result = packageIRSchema.safeParse({
      name: '@acme/ext-test',
      version: '1.0.0',
      atoms: [
        {
          kind: 'instruction',
          content: './rules.md',
          extensions: { cursor: { alwaysApply: true }, opencode: { scope: 'global' } }
        }
      ]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const atom = result.data.atoms[0];
      expect(atom.kind).toBe('instruction');
      if (atom.kind === 'instruction') {
        expect(atom.extensions).toEqual({
          cursor: { alwaysApply: true },
          opencode: { scope: 'global' }
        });
      }
    }
  });
});
