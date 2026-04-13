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
import type { PackageIR, PlatformAdapter } from '@internals/schemas';
import { describe, expect, it } from 'vitest';

const ALL_ADAPTERS: Record<string, PlatformAdapter> = {
  opencode: opencodeAdapter,
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
  windsurf: windsurfAdapter,
  cline: clineAdapter,
  'roo-code': rooCodeAdapter
};

function fixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-7atom-'));

  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# All Atoms Fixture\n\nTest skill with all 7 atom kinds.\n');
  fs.writeFileSync(path.join(dir, 'prompts', 'review.md').replace('/prompts/', '/'), '');
  fs.mkdirSync(path.join(dir, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'prompts', 'review.md'), 'Review {{files}} at severity {{severity}}.\n');
  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hooks', 'guard.ts'), 'console.log("guard handler");\n');

  return dir;
}

const FIXTURE_PKG: PackageIR = {
  name: '@test/all-atoms',
  version: '1.0.0',
  description: 'Fixture with all 7 atom kinds',
  atoms: [
    {
      kind: 'instruction',
      content: 'SKILL.md'
    },
    {
      kind: 'hook',
      name: 'file-guard',
      event: 'pre-file-write',
      handler: {
        type: 'dsl',
        actions: [{ action: 'block', match: '*.env', reason: 'Protect env files' }]
      }
    },
    {
      kind: 'hook',
      name: 'js-guard',
      event: 'pre-stop',
      handler: {
        type: 'js',
        entry: 'hooks/guard.ts'
      }
    },
    {
      kind: 'agent',
      name: 'test-reviewer',
      role: 'You review code for correctness and security.',
      tools: ['file_read', 'grep', 'glob'],
      model: 'powerful',
      readonly: true
    },
    {
      kind: 'tool',
      name: 'test-analyzer',
      description: 'A test MCP tool',
      mcp: {
        command: 'npx',
        args: ['-y', '@test/analyzer-mcp'],
        env: { API_KEY: '${TEST_KEY}' }
      }
    },
    {
      kind: 'rule',
      event: 'pre-command',
      match: 'rm -rf /',
      policy: 'block',
      reason: 'Prevent destructive commands'
    },
    {
      kind: 'resource',
      name: 'test-criteria',
      uri: 'references/criteria.md',
      description: 'Review criteria document',
      mimeType: 'text/markdown'
    },
    {
      kind: 'prompt',
      name: 'review',
      description: 'Code review prompt',
      template: 'prompts/review.md',
      arguments: [
        { name: 'files', description: 'Files to review', required: true },
        { name: 'severity', description: 'Minimum severity' }
      ]
    }
  ]
};

describe('7-atom fixture through all 6 adapters', () => {
  const sourceDir = fixtureDir();

  for (const [platformId, adapter] of Object.entries(ALL_ADAPTERS)) {
    describe(platformId, () => {
      it('compiles without errors', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });
        expect(result.files.length).toBeGreaterThan(0);

        const errors = result.warnings.filter((w) => w.level !== 'skipped' && w.level !== 'degraded');
        expect(errors).toEqual([]);
      });

      it('produces instruction files', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });
        const instrFiles = result.files.filter(
          (f) => f.path.includes('instruction') || f.path.includes('rules') || f.path.includes('SKILL')
        );

        if (adapter.capabilities.instruction !== 'none') {
          expect(instrFiles.length).toBeGreaterThanOrEqual(1);
        }
      });

      it('produces tool/mcp config files', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });

        if (adapter.capabilities.tool !== 'none') {
          const toolFiles = result.files.filter(
            (f) => f.content.includes('test-analyzer') || f.content.includes('analyzer-mcp') || f.path.includes('mcp')
          );
          expect(toolFiles.length).toBeGreaterThanOrEqual(1);
        }
      });

      it('handles agent atoms', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });

        if (adapter.capabilities.agent === 'full') {
          const agentFiles = result.files.filter(
            (f) => f.content.includes('test-reviewer') || f.path.includes('agent') || f.path.includes('reviewer')
          );
          expect(agentFiles.length).toBeGreaterThanOrEqual(1);
        } else if (adapter.capabilities.agent !== 'none') {
          const anyRef = result.files.some(
            (f) => f.content.includes('test-reviewer') || f.content.includes('review code')
          );
          const wasSkipped = result.warnings.some((w) => w.atomKind === 'agent');
          expect(anyRef || wasSkipped).toBe(true);
        }
      });

      it('handles prompt atoms', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });

        if (adapter.capabilities.prompt === 'full') {
          const promptFiles = result.files.filter(
            (f) => f.path.includes('command') || f.path.includes('prompt') || f.content.includes('review')
          );
          expect(promptFiles.length).toBeGreaterThanOrEqual(1);
        } else if (adapter.capabilities.prompt !== 'none') {
          const wasHandled =
            result.files.some((f) => f.content.includes('review')) ||
            result.warnings.some((w) => w.atomKind === 'prompt');
          expect(wasHandled).toBe(true);
        }
      });

      it('reports skipped atoms as warnings not errors', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });

        for (const w of result.warnings) {
          expect(['skipped', 'degraded']).toContain(w.level);
        }
      });

      it('total file count is reasonable (1-20)', () => {
        const result = compilePackage(FIXTURE_PKG, adapter, { sourceDir });
        expect(result.files.length).toBeGreaterThanOrEqual(1);
        expect(result.files.length).toBeLessThanOrEqual(20);
      });
    });
  }
});
