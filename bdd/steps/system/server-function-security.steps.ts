/** Dependency guard for CVE-2026-102989; see web-registry intent C7. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { gte } from 'semver';
import { expect, it } from 'vitest';

it('resolves only patched TanStack Start server-function packages', () => {
  const root = path.resolve(__dirname, '../../..');
  const tree = execFileSync('bun', ['pm', 'ls', '--all'], { cwd: root, encoding: 'utf8' });
  for (const [name, minimum] of [
    ['react-start', '1.168.60'],
    ['start-server-core', '1.169.39']
  ]) {
    const versions = [...tree.matchAll(new RegExp(`@tanstack/${name}@([0-9]+\\.[0-9]+\\.[0-9]+)`, 'g'))].map(
      (match) => match[1]
    );
    expect(versions.length, `${name} must be present`).toBeGreaterThan(0);
    expect(
      versions.every((version) => gte(version, minimum)),
      `${name}: ${versions.join(', ')}`
    ).toBe(true);
  }
});
