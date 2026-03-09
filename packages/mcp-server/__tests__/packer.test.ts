import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pack, packForScan } from '../src/lib/packer.js';

const canCreateSymlinks = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-check-'));
  try {
    const target = path.join(dir, 'target');
    fs.writeFileSync(target, '');
    fs.symlinkSync(target, path.join(dir, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

describe('packer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-packer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('pack', () => {
    it('fails when directory does not exist', async () => {
      await expect(pack('/nonexistent/path')).rejects.toThrow('Directory does not exist');
    });

    it('fails when path is not a directory', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'test');

      await expect(pack(filePath)).rejects.toThrow('Not a directory');
    });

    it('fails when tank.json is missing', async () => {
      await expect(pack(tempDir)).rejects.toThrow('Missing required file: tank.json');
    });

    it('fails when tank.json is invalid JSON', async () => {
      fs.writeFileSync(path.join(tempDir, 'tank.json'), 'not json');
      await expect(pack(tempDir)).rejects.toThrow('Invalid tank.json: not valid JSON');
    });

    it('fails when SKILL.md is missing', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );

      await expect(pack(tempDir)).rejects.toThrow('Missing required file: SKILL.md');
    });

    it('packs a valid skill directory', async () => {
      // Create a valid skill structure
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({
          name: '@test/skill',
          version: '1.0.0',
          description: 'A test skill'
        })
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test Skill\n\nThis is a test skill.');
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hello");');

      const result = await pack(tempDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.tarball.length).toBeGreaterThan(0);
      expect(result.integrity).toMatch(/^sha512-/);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.readme).toContain('# Test Skill');
      expect(result.files).toContain('tank.json');
      expect(result.files).toContain('SKILL.md');
      expect(result.files).toContain('index.js');
    });

    it('ignores node_modules directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'some-package'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'some-package', 'index.js'), 'module.exports = {};');

      const result = await pack(tempDir);

      expect(result.files).not.toContainEqual(expect.stringContaining('node_modules'));
    });

    it('ignores .git directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.git', 'config'), '[core]');

      const result = await pack(tempDir);

      expect(result.files).not.toContainEqual(expect.stringContaining('.git'));
    });

    it('ignores .env files', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=token123');
      fs.writeFileSync(path.join(tempDir, '.env.local'), 'SECRET=token456');

      const result = await pack(tempDir);

      expect(result.files).not.toContain('.env');
      expect(result.files).not.toContain('.env.local');
    });

    it.skipIf(!canCreateSymlinks)('rejects symlinks', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, 'real.txt'), 'content');
      fs.symlinkSync(path.join(tempDir, 'real.txt'), path.join(tempDir, 'link.txt'));

      await expect(pack(tempDir)).rejects.toThrow('Symlink detected');
    });

    it('respects .tankignore file', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'tank.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, '.tankignore'), '*.log\ntest/');
      fs.writeFileSync(path.join(tempDir, 'debug.log'), 'log content');
      fs.mkdirSync(path.join(tempDir, 'test'));
      fs.writeFileSync(path.join(tempDir, 'test', 'file.txt'), 'test');

      const result = await pack(tempDir);

      expect(result.files).not.toContain('debug.log');
      expect(result.files).not.toContainEqual(expect.stringContaining('test/'));
    });
  });

  describe('packForScan', () => {
    it('fails when directory does not exist', async () => {
      await expect(packForScan('/nonexistent/path')).rejects.toThrow('Directory does not exist');
    });

    it('fails when path is not a directory', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'test');

      await expect(packForScan(filePath)).rejects.toThrow('Not a directory');
    });

    it('fails when directory is empty', async () => {
      await expect(packForScan(tempDir)).rejects.toThrow('No files to scan');
    });

    it('packs a directory without tank.json', async () => {
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export function run() {}');
      fs.writeFileSync(path.join(tempDir, 'utils.ts'), 'export const x = 1;');

      const result = await packForScan(tempDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.tarball.length).toBeGreaterThan(0);
      expect(result.integrity).toMatch(/^sha512-/);
      expect(result.fileCount).toBe(2);
      expect(result.files).toContain('index.ts');
      expect(result.files).toContain('utils.ts');
      expect(result.readme).toBe('');
    });

    it('synthesises a manifest with directory name', async () => {
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export function run() {}');

      const result = await packForScan(tempDir);

      expect(result.manifest).toEqual(
        expect.objectContaining({
          name: path.basename(tempDir),
          version: '0.0.0',
          description: 'Local scan'
        })
      );
    });

    it('reads SKILL.md if present', async () => {
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export function run() {}');
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# My Skill\n\nDescription.');

      const result = await packForScan(tempDir);

      expect(result.readme).toContain('# My Skill');
    });

    it('ignores node_modules and .git', async () => {
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export function run() {}');
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'pkg', 'index.js'), '');
      fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.git', 'config'), '[core]');

      const result = await packForScan(tempDir);

      expect(result.files).not.toContainEqual(expect.stringContaining('node_modules'));
      expect(result.files).not.toContainEqual(expect.stringContaining('.git'));
    });

    it.skipIf(!canCreateSymlinks)('rejects symlinks', async () => {
      fs.writeFileSync(path.join(tempDir, 'real.txt'), 'content');
      fs.symlinkSync(path.join(tempDir, 'real.txt'), path.join(tempDir, 'link.txt'));

      await expect(packForScan(tempDir)).rejects.toThrow('Symlink detected');
    });
  });
});
