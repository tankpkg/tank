import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pack } from '../src/lib/packer.js';

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

    it('fails when skills.json is missing', async () => {
      await expect(pack(tempDir)).rejects.toThrow('Missing required file: skills.json');
    });

    it('fails when skills.json is invalid JSON', async () => {
      fs.writeFileSync(path.join(tempDir, 'skills.json'), 'not json');
      await expect(pack(tempDir)).rejects.toThrow('Invalid skills.json: not valid JSON');
    });

    it('fails when SKILL.md is missing', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );

      await expect(pack(tempDir)).rejects.toThrow('Missing required file: SKILL.md');
    });

    it('packs a valid skill directory', async () => {
      // Create a valid skill structure
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
        JSON.stringify({
          name: '@test/skill',
          version: '1.0.0',
          description: 'A test skill',
        }),
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
      expect(result.files).toContain('skills.json');
      expect(result.files).toContain('SKILL.md');
      expect(result.files).toContain('index.js');
    });

    it('ignores node_modules directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'some-package'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'node_modules', 'some-package', 'index.js'),
        'module.exports = {};',
      );

      const result = await pack(tempDir);

      expect(result.files).not.toContainEqual(expect.stringContaining('node_modules'));
    });

    it('ignores .git directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
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
        path.join(tempDir, 'skills.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=token123');
      fs.writeFileSync(path.join(tempDir, '.env.local'), 'SECRET=token456');

      const result = await pack(tempDir);

      expect(result.files).not.toContain('.env');
      expect(result.files).not.toContain('.env.local');
    });

    it('rejects symlinks', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
        JSON.stringify({ name: '@test/skill', version: '1.0.0' }),
      );
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, 'real.txt'), 'content');
      fs.symlinkSync(path.join(tempDir, 'real.txt'), path.join(tempDir, 'link.txt'));

      await expect(pack(tempDir)).rejects.toThrow('Symlink detected');
    });

    it('respects .tankignore file', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills.json'),
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
});
