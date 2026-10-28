/** Dependency guard for CVE-2026-102989; see web-registry intent C7. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { gte, valid } from 'semver';
import { expect, it } from 'vitest';

function resolvedVersions(tree: string, name: string): string[] {
  return [...tree.matchAll(new RegExp(`@tanstack/${name}@([^\\s]+)`, 'g'))].map((match) => match[1]);
}

function meetsMinimumVersion(version: string, minimum: string): boolean {
  return valid(version) !== null && gte(version, minimum);
}

it('resolves only patched TanStack Start server-function packages', () => {
  const root = path.resolve(__dirname, '../../..');
  const tree = execFileSync('bun', ['pm', 'ls', '--all'], { cwd: root, encoding: 'utf8' });
  for (const [name, minimum] of [
    ['react-start', '1.168.60'],
    ['start-server-core', '1.169.39']
  ]) {
    const versions = resolvedVersions(tree, name);
    expect(versions.length, `${name} must be present`).toBeGreaterThan(0);
    expect(
      versions.every((version) => meetsMinimumVersion(version, minimum)),
      `${name}: ${versions.join(', ')}`
    ).toBe(true);
  }
});

it.each([
  ['react-start', '1.168.60'],
  ['start-server-core', '1.169.39']
])('rejects prereleases below the patched %s version', (name, minimum) => {
  const tree = `@tanstack/${name}@${minimum}-rc.1\n@tanstack/${name}@${minimum}+build.1`;
  const versions = resolvedVersions(tree, name);
  expect(versions).toEqual([`${minimum}-rc.1`, `${minimum}+build.1`]);
  expect(meetsMinimumVersion(versions[0], minimum)).toBe(false);
  expect(meetsMinimumVersion(versions[1], minimum)).toBe(true);
  expect(meetsMinimumVersion(minimum, minimum)).toBe(true);
});
