import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runBuildHook } from '~/lib/build-hook.js';
import { pack } from '~/lib/packer.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-lifecycle-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): void {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('runBuildHook — issue #454 (C13/E11/E13)', () => {
  it('resolves when the command exits 0', async () => {
    await expect(runBuildHook(tmpDir, 'node -e "process.exit(0)"')).resolves.toBeUndefined();
  });

  it('rejects when the command exits non-zero, surfacing exit code', async () => {
    await expect(runBuildHook(tmpDir, 'node -e "process.exit(7)"')).rejects.toThrow(/exited with code 7/);
  });

  it('runs the command in the given directory', async () => {
    writeFile('marker.txt', 'hello');
    await expect(
      runBuildHook(tmpDir, "node -e \"require('node:fs').accessSync('marker.txt')\"")
    ).resolves.toBeUndefined();
  });
});

describe('pack({ files }) — issue #454 (C14/E12)', () => {
  const manifest = JSON.stringify({ name: '@test-org/lc-skill', version: '1.0.0' });

  it('with `files` allow-list includes ONLY matching files plus the manifest', async () => {
    writeFile('tank.json', manifest);
    writeFile('SKILL.md', '# Skill');
    writeFile('dist/index.js', "console.log('built');");
    writeFile('dist/sub/x.js', 'x');
    writeFile('src/index.ts', 'export {};');
    writeFile('node_modules/foo/index.js', 'noop');
    writeFile('.gitignore', 'dist/\nnode_modules/\n');

    const result = await pack(tmpDir, { files: ['dist/**', 'SKILL.md'] });

    const f = new Set(result.files);
    expect(f.has('tank.json')).toBe(true);
    expect(f.has('SKILL.md')).toBe(true);
    expect(f.has('dist/index.js')).toBe(true);
    expect(f.has('dist/sub/x.js')).toBe(true);
    expect(f.has('src/index.ts')).toBe(false);
    expect(f.has('node_modules/foo/index.js')).toBe(false);
  });

  it('with `files` still respects security baseline (node_modules, .git always excluded)', async () => {
    writeFile('tank.json', manifest);
    writeFile('node_modules/foo/index.js', 'noop');
    writeFile('.git/HEAD', 'ref:');
    writeFile('dist/index.js', 'ok');

    const result = await pack(tmpDir, { files: ['**/*'] });

    expect(result.files).not.toContain('node_modules/foo/index.js');
    expect(result.files).not.toContain('.git/HEAD');
    expect(result.files).toContain('dist/index.js');
  });

  it('without `files` preserves legacy .gitignore behavior (regression guard)', async () => {
    writeFile('tank.json', manifest);
    writeFile('SKILL.md', '# Skill');
    writeFile('dist/index.js', 'built');
    writeFile('.gitignore', 'dist/\n');

    const result = await pack(tmpDir);

    expect(result.files).not.toContain('dist/index.js');
    expect(result.files).toContain('tank.json');
    expect(result.files).toContain('SKILL.md');
  });
});
