import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractSafely } from '~/lib/install-pipeline.js';

interface FileSpec {
  path: string;
  content: string;
}

async function createTarballFromFiles(files: FileSpec[]): Promise<Buffer> {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-tarball-staging-'));
  try {
    for (const file of files) {
      const fullPath = path.join(stagingDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content);
    }
    const tarballPath = path.join(stagingDir, '__tarball__.tgz');
    const entries = fs.readdirSync(stagingDir).filter((entry) => entry !== '__tarball__.tgz');
    await tar.create({ gzip: true, file: tarballPath, cwd: stagingDir }, entries);
    return fs.readFileSync(tarballPath);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function createMalformedTarball(): Buffer {
  return Buffer.from('this is not a valid gzipped tar archive', 'utf-8');
}

function listAllFiles(root: string): string[] {
  const results: string[] = [];
  function walk(current: string, relative: string): void {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const childRel = relative ? `${relative}/${entry.name}` : entry.name;
      const childAbs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else {
        results.push(childRel);
      }
    }
  }
  walk(root, '');
  return results.sort();
}

function readFileText(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf-8');
}

function listStaleBackupSiblings(installPath: string): string[] {
  const parent = path.dirname(installPath);
  if (!fs.existsSync(parent)) return [];
  const installName = path.basename(installPath);
  return fs.readdirSync(parent).filter((name) => name.startsWith(`${installName}.tank-old-`));
}

describe('extractSafely (atomic install/update)', () => {
  let workDir: string;
  let destDir: string;

  beforeEach(() => {
    workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tank-extract-test-')));
    destDir = path.join(workDir, 'install', '@tank', 'sample-skill');
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('extracts a fresh install into an empty destDir', async () => {
    fs.mkdirSync(destDir, { recursive: true });
    const tarball = await createTarballFromFiles([
      { path: 'tank.json', content: '{"name":"@tank/sample-skill","version":"1.0.0"}' },
      { path: 'SKILL.md', content: '# Sample\n' },
      { path: 'references/guide.md', content: 'guide v1' }
    ]);

    await extractSafely(tarball, destDir);

    expect(listAllFiles(destDir)).toEqual(['SKILL.md', 'references/guide.md', 'tank.json']);
    expect(readFileText(destDir, 'references/guide.md')).toBe('guide v1');
  });

  it('replaces a previous install when the new version removes files inside a kept directory', async () => {
    fs.mkdirSync(path.join(destDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(destDir, 'tank.json'), '{"name":"@tank/sample-skill","version":"1.0.0"}');
    fs.writeFileSync(path.join(destDir, 'references', 'guide.md'), 'guide v1');
    fs.writeFileSync(path.join(destDir, 'references', 'source-coverage.md'), 'leftover');

    const tarball = await createTarballFromFiles([
      { path: 'tank.json', content: '{"name":"@tank/sample-skill","version":"1.0.1"}' },
      { path: 'references/guide.md', content: 'guide v2' }
    ]);

    await extractSafely(tarball, destDir);

    expect(listAllFiles(destDir)).toEqual(['references/guide.md', 'tank.json']);
    expect(readFileText(destDir, 'references/guide.md')).toBe('guide v2');
    expect(fs.existsSync(path.join(destDir, 'references', 'source-coverage.md'))).toBe(false);
  });

  it('removes top-level directories that no longer exist in the new version', async () => {
    fs.mkdirSync(path.join(destDir, 'assets', 'evals'), { recursive: true });
    fs.writeFileSync(path.join(destDir, 'tank.json'), '{"name":"@tank/sample-skill","version":"1.0.0"}');
    fs.writeFileSync(path.join(destDir, 'assets', 'ATTRIBUTION.md'), 'old attribution');
    fs.writeFileSync(path.join(destDir, 'assets', 'evals', 'eval.json'), '{}');

    const tarball = await createTarballFromFiles([
      { path: 'tank.json', content: '{"name":"@tank/sample-skill","version":"2.0.0"}' },
      { path: 'SKILL.md', content: '# Slimmer skill\n' }
    ]);

    await extractSafely(tarball, destDir);

    expect(listAllFiles(destDir)).toEqual(['SKILL.md', 'tank.json']);
    expect(fs.existsSync(path.join(destDir, 'assets'))).toBe(false);
  });

  it('does not leave stale backup directories next to the install on success', async () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'old.txt'), 'old');

    const tarball = await createTarballFromFiles([{ path: 'new.txt', content: 'new' }]);

    await extractSafely(tarball, destDir);

    expect(listStaleBackupSiblings(destDir)).toEqual([]);
  });

  it('preserves the previous install when extraction fails (rollback)', async () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'tank.json'), '{"name":"@tank/sample-skill","version":"1.0.0"}');
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), 'previous version');

    const tarball = createMalformedTarball();

    await expect(extractSafely(tarball, destDir)).rejects.toThrow();

    expect(listAllFiles(destDir)).toEqual(['SKILL.md', 'tank.json']);
    expect(readFileText(destDir, 'SKILL.md')).toBe('previous version');
    expect(readFileText(destDir, 'tank.json')).toBe('{"name":"@tank/sample-skill","version":"1.0.0"}');
    expect(listStaleBackupSiblings(destDir)).toEqual([]);
  });
});
