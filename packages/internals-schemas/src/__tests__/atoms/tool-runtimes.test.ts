import { describe, expect, it } from 'vitest';

import { packageIRSchema } from '~/schemas/atoms/package.js';
import { toolIRSchema } from '~/schemas/atoms/tool.js';
import { publishManifestSchema } from '~/schemas/skills-json.js';

describe('toolIRSchema — runtime variants (issue #453)', () => {
  it('accepts mcp.runtime "uvx" with package', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'web-search',
      mcp: { runtime: 'uvx', package: 'web-search-mcp' }
    });
    expect(r.success).toBe(true);
  });

  it('accepts mcp.runtime "npx" with package and args', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'tool-x',
      mcp: { runtime: 'npx', package: 'my-mcp', args: ['--flag'] }
    });
    expect(r.success).toBe(true);
  });

  it('still accepts legacy {command, args}', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'legacy',
      mcp: { command: 'uvx', args: ['my-mcp'] }
    });
    expect(r.success).toBe(true);
  });

  it('still accepts legacy {runtime: "node", entry}', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'node-tool',
      mcp: { runtime: 'node', entry: 'dist/index.js' }
    });
    expect(r.success).toBe(true);
  });

  it('accepts a tool with only extensions (no mcp)', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'memory',
      extensions: { opencode: { command: 'uvx', args: ['mem-mcp'] } }
    });
    expect(r.success).toBe(true);
  });

  it('rejects mcp with neither command nor (runtime + package/entry)', () => {
    const r = toolIRSchema.safeParse({
      kind: 'tool',
      name: 'broken',
      mcp: { args: ['x'] }
    });
    expect(r.success).toBe(false);
  });
});

describe('publishManifestSchema — publish lifecycle block (issue #454)', () => {
  const base = { name: '@org/p', version: '1.0.0' };

  it('accepts manifest with publish.build', () => {
    const r = publishManifestSchema.safeParse({ ...base, publish: { build: 'npm run build' } });
    expect(r.success).toBe(true);
  });

  it('accepts manifest with publish.files', () => {
    const r = publishManifestSchema.safeParse({ ...base, publish: { files: ['dist/**'] } });
    expect(r.success).toBe(true);
  });

  it('accepts manifest with both publish.build and publish.files', () => {
    const r = publishManifestSchema.safeParse({
      ...base,
      publish: { build: 'tsc', files: ['dist/**', 'README.md'] }
    });
    expect(r.success).toBe(true);
  });

  it('accepts manifest with NO publish block (backwards compatible)', () => {
    const r = publishManifestSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects unknown keys inside publish block', () => {
    const r = publishManifestSchema.safeParse({ ...base, publish: { rogue: 'x' } });
    expect(r.success).toBe(false);
  });

  it('rejects non-string entries in publish.files', () => {
    const r = publishManifestSchema.safeParse({ ...base, publish: { files: ['ok', 42] } });
    expect(r.success).toBe(false);
  });
});

describe('packageIRSchema accepts publish field (regression: tank build broke when both atoms and publish present)', () => {
  it('accepts an atom-bearing package with a publish block', () => {
    const r = packageIRSchema.safeParse({
      name: '@org/p',
      version: '1.0.0',
      atoms: [{ kind: 'instruction', content: './SKILL.md' }],
      publish: { build: 'npm run build', files: ['dist/**'] }
    });
    expect(r.success).toBe(true);
  });

  it('still rejects unknown top-level keys', () => {
    const r = packageIRSchema.safeParse({
      name: '@org/p',
      version: '1.0.0',
      atoms: [{ kind: 'instruction', content: './SKILL.md' }],
      rogue: true
    });
    expect(r.success).toBe(false);
  });
});
