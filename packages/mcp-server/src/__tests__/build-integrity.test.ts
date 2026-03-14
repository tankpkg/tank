/**
 * Build artifact integrity — .idd/modules/cicd/INTENT.md C1/C2 (GH-158).
 * Reads ALREADY-BUILT dist/. Run `bun run build` first if stale.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DIST_DIR = path.join(PKG_ROOT, 'dist');
const PKG_JSON_PATH = path.join(PKG_ROOT, 'package.json');

function collectJsFiles(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

describe('Build artifact integrity (cicd C1/C2)', () => {
  it('dist/ directory exists', () => {
    expect(fs.existsSync(DIST_DIR), `Expected ${DIST_DIR} to exist. Run "bun run build" first.`).toBe(true);
  });

  it('C13: no .js file in dist/ imports from @internals/*', () => {
    const jsFiles = collectJsFiles(DIST_DIR);
    expect(jsFiles.length).toBeGreaterThan(0);

    const violations: { file: string; line: string }[] = [];
    const importPattern = /from\s+['"]@internals\//;

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const line of content.split('\n')) {
        if (importPattern.test(line)) {
          violations.push({ file: path.relative(PKG_ROOT, file), line: line.trim() });
        }
      }
    }

    expect(
      violations,
      `Found external imports to workspace-only @internals/* packages:\n${violations.map((v) => `  ${v.file}: ${v.line}`).join('\n')}`
    ).toHaveLength(0);
  });

  it('C14: package.json dependencies do not include @internals/* or workspace: protocol', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf-8'));
    const deps: Record<string, string> = pkg.dependencies ?? {};

    const workspaceEntries = Object.entries(deps).filter(
      ([name, version]) => name.startsWith('@internals/') || version.includes('workspace:')
    );

    expect(
      workspaceEntries,
      `Found workspace-only entries in dependencies (should be in devDependencies):\n${workspaceEntries.map(([n, v]) => `  "${n}": "${v}"`).join('\n')}`
    ).toHaveLength(0);
  });
});
