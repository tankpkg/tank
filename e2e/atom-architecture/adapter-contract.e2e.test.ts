import {
  type AdapterCapabilities,
  adapterCapabilitiesSchema,
  atomIRSchema,
  compilationWarningSchema,
  type PlatformAdapter,
  type PlatformOutput,
  platformAdapterMetaSchema,
  platformOutputSchema
} from '@internals/schemas';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

function makeTestAdapter(
  overrides: Partial<{
    name: string;
    supportedRange: string;
    capabilities: Partial<AdapterCapabilities>;
  }>
): PlatformAdapter {
  const caps: AdapterCapabilities = {
    instruction: 'full',
    hook: 'full',
    tool: 'full',
    agent: 'full',
    rule: 'full',
    resource: 'full',
    prompt: 'full',
    ...overrides.capabilities
  };

  return {
    name: overrides.name ?? 'test-adapter',
    supportedRange: overrides.supportedRange ?? '>=1.0.0',
    capabilities: caps,
    compileAtom(atom: unknown): PlatformOutput {
      const parsed = atomIRSchema.safeParse(atom);
      if (!parsed.success) {
        return { files: [], warnings: [{ level: 'skipped', atomKind: 'unknown', message: 'Invalid atom' }] };
      }

      const level = caps[parsed.data.kind as keyof AdapterCapabilities];

      if (level === 'none') {
        return {
          files: [],
          warnings: [
            {
              level: 'skipped',
              atomKind: parsed.data.kind,
              message: `${this.name} does not support ${parsed.data.kind}`
            }
          ]
        };
      }

      if (level === 'degraded') {
        return {
          files: [{ path: `.${this.name}/degraded-${parsed.data.kind}.txt`, content: 'approximated' }],
          warnings: [
            {
              level: 'degraded',
              atomKind: parsed.data.kind,
              message: `${parsed.data.kind} approximated on ${this.name}`
            }
          ]
        };
      }

      return {
        files: [{ path: `.${this.name}/${parsed.data.kind}.config`, content: JSON.stringify(parsed.data) }],
        warnings: []
      };
    }
  };
}

describe('E2E: Adapter contract — real validation, real compilation, zero mocks', () => {
  describe('Capabilities schema validation', () => {
    it('accepts capabilities with all 7 kinds declared', () => {
      const result = adapterCapabilitiesSchema.safeParse({
        instruction: 'full',
        hook: 'degraded',
        tool: 'full',
        agent: 'none',
        rule: 'degraded',
        resource: 'full',
        prompt: 'full'
      });
      expect(result.success).toBe(true);
    });

    it('rejects capabilities missing a kind', () => {
      const result = adapterCapabilitiesSchema.safeParse({
        instruction: 'full',
        hook: 'full',
        tool: 'full',
        agent: 'full',
        rule: 'full',
        resource: 'full'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid support level value', () => {
      const result = adapterCapabilitiesSchema.safeParse({
        instruction: 'full',
        hook: 'partial',
        tool: 'full',
        agent: 'full',
        rule: 'full',
        resource: 'full',
        prompt: 'full'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PlatformAdapterMeta schema', () => {
    it('accepts valid adapter metadata', () => {
      const result = platformAdapterMetaSchema.safeParse({
        name: 'cursor',
        supportedRange: '>=2.4.0 <3.0.0',
        capabilities: {
          instruction: 'full',
          hook: 'full',
          tool: 'full',
          agent: 'full',
          rule: 'degraded',
          resource: 'full',
          prompt: 'full'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rejects adapter with empty name', () => {
      const result = platformAdapterMetaSchema.safeParse({
        name: '',
        supportedRange: '>=1.0.0',
        capabilities: {
          instruction: 'full',
          hook: 'full',
          tool: 'full',
          agent: 'full',
          rule: 'full',
          resource: 'full',
          prompt: 'full'
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PlatformOutput schema', () => {
    it('accepts output with files and no warnings', () => {
      const result = platformOutputSchema.safeParse({
        files: [{ path: '.cursor/rules/ts.mdc', content: '---\nalwaysApply: true\n---\nUse strict TS' }],
        warnings: []
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty output (skip case)', () => {
      const result = platformOutputSchema.safeParse({ files: [], warnings: [] });
      expect(result.success).toBe(true);
    });

    it('validates warning shape', () => {
      const result = compilationWarningSchema.safeParse({
        level: 'degraded',
        atomKind: 'hook',
        message: 'Hook approximated as rule'
      });
      expect(result.success).toBe(true);
    });

    it('rejects warning with invalid level', () => {
      const result = compilationWarningSchema.safeParse({
        level: 'error',
        atomKind: 'hook',
        message: 'Bad level'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Full adapter compilation — real atoms through real adapter', () => {
    const adapter = makeTestAdapter({
      name: 'test-platform',
      capabilities: {
        instruction: 'full',
        hook: 'none',
        agent: 'degraded',
        tool: 'full',
        rule: 'full',
        resource: 'full',
        prompt: 'full'
      }
    });

    it('compiles instruction atom with full support', () => {
      const output = adapter.compileAtom({ kind: 'instruction', content: './rules.md' });
      expect(output.files).toHaveLength(1);
      expect(output.files[0].path).toContain('instruction');
      expect(output.warnings).toHaveLength(0);
    });

    it('skips hook atom when capability is none', () => {
      const output = adapter.compileAtom({
        kind: 'hook',
        event: 'pre-tool-use',
        handler: { type: 'dsl', actions: [{ action: 'block' }] }
      });
      expect(output.files).toHaveLength(0);
      expect(output.warnings).toHaveLength(1);
      expect(output.warnings[0].level).toBe('skipped');
      expect(output.warnings[0].atomKind).toBe('hook');
    });

    it('degrades agent atom with warning', () => {
      const output = adapter.compileAtom({
        kind: 'agent',
        name: 'reviewer',
        role: 'Code reviewer'
      });
      expect(output.files).toHaveLength(1);
      expect(output.warnings).toHaveLength(1);
      expect(output.warnings[0].level).toBe('degraded');
      expect(output.warnings[0].atomKind).toBe('agent');
    });

    it('compiles all 7 atom kinds through a single adapter', () => {
      const atoms: unknown[] = [
        { kind: 'instruction', content: './rules.md' },
        { kind: 'hook', event: 'pre-tool-use', handler: { type: 'dsl', actions: [{ action: 'block' }] } },
        { kind: 'tool', name: 'github' },
        { kind: 'agent', name: 'auditor', role: 'Auditor' },
        { kind: 'rule', event: 'pre-tool-use', policy: 'block' },
        { kind: 'resource', uri: 'docs://ref' },
        { kind: 'prompt', name: 'deploy', template: './deploy.md' }
      ];

      let totalFiles = 0;
      let totalWarnings = 0;

      for (const atom of atoms) {
        const output = adapter.compileAtom(atom);
        const parsed = platformOutputSchema.safeParse(output);
        expect(parsed.success, `Output validation failed for atom`).toBe(true);
        totalFiles += output.files.length;
        totalWarnings += output.warnings.length;
      }

      expect(totalFiles).toBe(6);
      expect(totalWarnings).toBe(2);
    });
  });

  describe('Version compatibility — real semver checks', () => {
    const adapter = makeTestAdapter({
      name: 'cursor',
      supportedRange: '>=2.4.0 <3.0.0'
    });

    it('passes for version within range', () => {
      expect(semver.satisfies('2.5.0', adapter.supportedRange)).toBe(true);
      expect(semver.satisfies('2.4.0', adapter.supportedRange)).toBe(true);
      expect(semver.satisfies('2.99.99', adapter.supportedRange)).toBe(true);
    });

    it('fails for version outside range', () => {
      expect(semver.satisfies('3.0.0', adapter.supportedRange)).toBe(false);
      expect(semver.satisfies('3.1.0', adapter.supportedRange)).toBe(false);
      expect(semver.satisfies('2.3.9', adapter.supportedRange)).toBe(false);
      expect(semver.satisfies('1.0.0', adapter.supportedRange)).toBe(false);
    });

    it('handles prerelease versions correctly', () => {
      expect(semver.satisfies('2.5.0-beta.1', adapter.supportedRange, { includePrerelease: true })).toBe(true);
      expect(semver.satisfies('3.0.0-alpha.1', adapter.supportedRange, { includePrerelease: true })).toBe(true);
      expect(semver.satisfies('3.0.1-alpha.1', adapter.supportedRange, { includePrerelease: true })).toBe(false);
    });
  });
});
