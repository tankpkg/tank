/**
 * BDD step definitions for CI/CD build artifact integrity.
 *
 * Intent: .idd/modules/cicd/INTENT.md
 * Feature: .bdd/features/cicd/build-integrity.feature
 *
 * Runs against REAL build output — zero mocks.
 * Requires `bun run build` to have been run in both CLI and MCP server packages.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

// ── Paths ──────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CLI_ROOT = path.join(REPO_ROOT, 'packages', 'cli');
const MCP_ROOT = path.join(REPO_ROOT, 'packages', 'mcp-server');

const CLI_DIST = path.join(CLI_ROOT, 'dist');
const MCP_DIST = path.join(MCP_ROOT, 'dist');
const CLI_PKG = path.join(CLI_ROOT, 'package.json');
const MCP_PKG = path.join(MCP_ROOT, 'package.json');

// ── Helpers ────────────────────────────────────────────────────────────────

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

function findInternalImports(distDir: string, rootDir: string): { file: string; line: string }[] {
  const violations: { file: string; line: string }[] = [];
  const pattern = /from\s+['"]@internal\//;
  for (const file of collectJsFiles(distDir)) {
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      if (pattern.test(line)) {
        violations.push({ file: path.relative(rootDir, file), line: line.trim() });
      }
    }
  }
  return violations;
}

function readDeps(pkgPath: string): Record<string, string> {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.dependencies ?? {};
}

// ── Build gate ─────────────────────────────────────────────────────────────

const cliBuilt = fs.existsSync(CLI_DIST) && collectJsFiles(CLI_DIST).length > 0;
const mcpBuilt = fs.existsSync(MCP_DIST) && collectJsFiles(MCP_DIST).length > 0;

// ── Scenarios ──────────────────────────────────────────────────────────────

describe('Feature: Build artifact integrity for npm-published packages', () => {
  beforeAll(() => {
    if (!cliBuilt || !mcpBuilt) {
    }
  });

  // ── C1: No workspace imports in dist ──────────────────────────────────

  describe('Scenario: CLI dist contains no @internal/* imports (E1)', () => {
    it.skipIf(!cliBuilt)('no file contains an import from @internal/', () => {
      const violations = findInternalImports(CLI_DIST, CLI_ROOT);
      expect(
        violations,
        `Found @internal/* imports in CLI dist:\n${violations.map((v) => `  ${v.file}: ${v.line}`).join('\n')}`
      ).toHaveLength(0);
    });
  });

  describe('Scenario: MCP server dist contains no @internal/* imports (E3)', () => {
    it.skipIf(!mcpBuilt)('no file contains an import from @internal/', () => {
      const violations = findInternalImports(MCP_DIST, MCP_ROOT);
      expect(
        violations,
        `Found @internal/* imports in MCP server dist:\n${violations.map((v) => `  ${v.file}: ${v.line}`).join('\n')}`
      ).toHaveLength(0);
    });
  });

  // ── C2: No workspace deps in published package.json ───────────────────

  describe('Scenario: CLI package.json has no workspace-only dependencies (E2)', () => {
    const deps = readDeps(CLI_PKG);

    it('no dependency name starts with @internal/', () => {
      const internal = Object.keys(deps).filter((n) => n.startsWith('@internal/'));
      expect(internal, `Found @internal/* in CLI dependencies: ${internal.join(', ')}`).toHaveLength(0);
    });

    it('no dependency version contains workspace:', () => {
      const ws = Object.entries(deps).filter(([, v]) => v.includes('workspace:'));
      expect(
        ws,
        `Found workspace: protocol in CLI deps:\n${ws.map(([n, v]) => `  "${n}": "${v}"`).join('\n')}`
      ).toHaveLength(0);
    });
  });

  describe('Scenario: MCP server package.json has no workspace-only dependencies (E4)', () => {
    const deps = readDeps(MCP_PKG);

    it('no dependency name starts with @internal/', () => {
      const internal = Object.keys(deps).filter((n) => n.startsWith('@internal/'));
      expect(internal, `Found @internal/* in MCP server dependencies: ${internal.join(', ')}`).toHaveLength(0);
    });

    it('no dependency version contains workspace:', () => {
      const ws = Object.entries(deps).filter(([, v]) => v.includes('workspace:'));
      expect(
        ws,
        `Found workspace: protocol in MCP server deps:\n${ws.map(([n, v]) => `  "${n}": "${v}"`).join('\n')}`
      ).toHaveLength(0);
    });
  });

  // ── C3: Transitive deps surfaced ──────────────────────────────────────

  describe('Scenario: CLI lists transitive deps of bundled @internal/shared', () => {
    const deps = readDeps(CLI_PKG);

    it('"semver" is listed as a dependency', () => {
      expect(deps).toHaveProperty('semver');
    });

    it('"zod" is listed as a dependency', () => {
      expect(deps).toHaveProperty('zod');
    });
  });

  describe('Scenario: MCP server lists transitive deps of bundled @internal/shared', () => {
    const deps = readDeps(MCP_PKG);

    it('"semver" is listed as a dependency', () => {
      expect(deps).toHaveProperty('semver');
    });
  });
});
