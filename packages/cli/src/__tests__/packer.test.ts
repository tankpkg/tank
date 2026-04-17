import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pack, packForScan } from '~/lib/packer.js';

// Minimal valid tank.json content
const VALID_SKILLS_JSON = JSON.stringify({
  name: '@test-org/test-skill',
  version: '1.0.0',
  description: 'A test skill'
});

const VALID_SKILL_MD = '# Test Skill\n\nThis is a test skill.\n';

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tank-packer-test-'));
}

function writeFile(dir: string, filePath: string, content: string): void {
  const fullPath = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('pack()', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('valid directory', () => {
    it('produces a valid tarball with correct structure', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, 'src/index.ts', 'export const hello = "world";');

      const result = await pack(tmpDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.tarball.length).toBeGreaterThan(0);
      expect(result.fileCount).toBe(3); // tank.json, SKILL.md, src/index.ts
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    });

    it('computes correct sha512 integrity hash', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      const result = await pack(tmpDir);

      // Verify the integrity hash independently
      const expectedHash = crypto.createHash('sha512').update(result.tarball).digest('base64');
      expect(result.integrity).toBe(`sha512-${expectedHash}`);
    });

    it('tarball is valid gzip', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      const result = await pack(tmpDir);

      // Gzip magic bytes: 0x1f 0x8b
      expect(result.tarball[0]).toBe(0x1f);
      expect(result.tarball[1]).toBe(0x8b);
    });
  });

  describe('missing required files', () => {
    it('throws when tank.json is missing', async () => {
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      await expect(pack(tmpDir)).rejects.toThrow(/tank\.json/i);
    });

    it('succeeds when SKILL.md is missing (optional for non-skill packages)', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);

      const result = await pack(tmpDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.fileCount).toBe(1); // tank.json only
      expect(result.readme).toBe('');
    });

    it('throws when tank.json is invalid', async () => {
      writeFile(tmpDir, 'tank.json', JSON.stringify({ invalid: true }));
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      await expect(pack(tmpDir)).rejects.toThrow(/tank\.json/i);
    });

    it('throws when tank.json is not valid JSON', async () => {
      writeFile(tmpDir, 'tank.json', 'not json {{{');
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      await expect(pack(tmpDir)).rejects.toThrow(/tank\.json/i);
    });
  });

  describe('security: symlinks', () => {
    it('skips symlinks instead of throwing', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      // Create a symlink
      fs.symlinkSync('/etc/passwd', path.join(tmpDir, 'evil-link'));

      const result = await pack(tmpDir);

      // Symlink should be skipped, not cause an error
      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.fileCount).toBe(2); // tank.json, SKILL.md — symlink skipped
    });
  });

  describe('security: path traversal', () => {
    it('skips symlinks that would enable path traversal', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      // Create a symlink pointing outside the package root
      fs.symlinkSync(path.join(tmpDir, '..'), path.join(subDir, 'escape'));

      const result = await pack(tmpDir);

      // Symlink is skipped, not thrown
      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.fileCount).toBe(2); // tank.json, SKILL.md (symlinked sub/escape skipped)
    });
  });

  describe('file count limit', () => {
    it('throws when file count exceeds 1000', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);

      // Create 999 additional files (+ tank.json + SKILL.md = 1001)
      for (let i = 0; i < 999; i++) {
        writeFile(tmpDir, `files/file-${i}.txt`, `content-${i}`);
      }

      await expect(pack(tmpDir)).rejects.toThrow(/file count|too many files|1000/i);
    });
  });

  describe('ignore patterns', () => {
    it('respects .tankignore file', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, '.tankignore', 'secret.txt\nbuild/\n');
      writeFile(tmpDir, 'secret.txt', 'super secret');
      writeFile(tmpDir, 'build/output.js', 'compiled code');
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      const result = await pack(tmpDir);

      // Should include: tank.json, SKILL.md, src/index.ts
      // Should NOT include: secret.txt, build/output.js, .tankignore itself
      expect(result.fileCount).toBe(3);
    });

    it('falls back to .gitignore when no .tankignore', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, '.gitignore', 'dist/\n*.log\n');
      writeFile(tmpDir, 'dist/bundle.js', 'bundled code');
      writeFile(tmpDir, 'error.log', 'some error');
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      const result = await pack(tmpDir);

      // Should include: tank.json, SKILL.md, src/index.ts
      // Should NOT include: dist/bundle.js, error.log, .gitignore itself
      expect(result.fileCount).toBe(3);
    });

    it('applies default ignores when no ignore file exists', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      // Create files that should be ignored by default
      writeFile(tmpDir, 'node_modules/dep/index.js', 'module code');
      writeFile(tmpDir, '.env', 'SECRET=abc');
      writeFile(tmpDir, '.env.local', 'LOCAL_SECRET=xyz');
      writeFile(tmpDir, 'debug.log', 'debug info');

      const result = await pack(tmpDir);

      // Should include: tank.json, SKILL.md, src/index.ts
      // Should NOT include: node_modules/*, .env, .env.local, debug.log
      expect(result.fileCount).toBe(3);
    });

    it('always ignores node_modules and .git even with custom ignore', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      // .tankignore that does NOT list node_modules or .git
      writeFile(tmpDir, '.tankignore', 'temp/\n');
      writeFile(tmpDir, 'node_modules/dep/index.js', 'module code');
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      const result = await pack(tmpDir);

      // node_modules should still be ignored even though .tankignore doesn't list it
      // Should include: tank.json, SKILL.md, src/index.ts
      expect(result.fileCount).toBe(3);
    });

    it('ignores .DS_Store by default', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, '.DS_Store', 'binary junk');
      writeFile(tmpDir, 'src/.DS_Store', 'more binary junk');

      const result = await pack(tmpDir);

      expect(result.fileCount).toBe(2); // tank.json, SKILL.md
    });

    it('ignores .tank directory by default', async () => {
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, '.tank/cache/data.json', '{}');

      const result = await pack(tmpDir);

      expect(result.fileCount).toBe(2); // tank.json, SKILL.md
    });
  });

  describe('directory does not exist', () => {
    it('throws when directory does not exist', async () => {
      await expect(pack('/nonexistent/path/to/skill')).rejects.toThrow(/does not exist|no such|ENOENT/i);
    });
  });

  describe('totalSize accuracy', () => {
    it('totalSize matches sum of file sizes', async () => {
      const content1 = 'a'.repeat(100);
      const content2 = 'b'.repeat(200);
      writeFile(tmpDir, 'tank.json', VALID_SKILLS_JSON);
      writeFile(tmpDir, 'SKILL.md', VALID_SKILL_MD);
      writeFile(tmpDir, 'data.txt', content1);
      writeFile(tmpDir, 'more.txt', content2);

      const result = await pack(tmpDir);

      const expectedSize =
        Buffer.byteLength(VALID_SKILLS_JSON) +
        Buffer.byteLength(VALID_SKILL_MD) +
        Buffer.byteLength(content1) +
        Buffer.byteLength(content2);
      expect(result.totalSize).toBe(expectedSize);
    });
  });
});

describe('packForScan()', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('optional files', () => {
    it('should pack directory without tank.json', async () => {
      writeFile(tmpDir, 'README.md', '# My Skill\n');
      writeFile(tmpDir, 'src/index.py', 'print("hello")');

      const result = await packForScan(tmpDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.tarball.length).toBeGreaterThan(0);
      expect(result.fileCount).toBe(2); // README.md, src/index.py
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
      expect(result.readme).toBe(''); // No SKILL.md
    });

    it('should pack directory without SKILL.md', async () => {
      writeFile(tmpDir, 'src/main.ts', 'export const main = () => {};');
      writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await packForScan(tmpDir);

      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.fileCount).toBe(2);
      expect(result.readme).toBe('');
    });

    it('should include SKILL.md content in readme if present', async () => {
      const skillMdContent = '# Test Skill\n\nThis is a test skill for scanning.\n';
      writeFile(tmpDir, 'SKILL.md', skillMdContent);
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      const result = await packForScan(tmpDir);

      expect(result.readme).toBe(skillMdContent);
      expect(result.fileCount).toBe(2); // SKILL.md, src/index.ts
    });
  });

  describe('security checks', () => {
    it('should enforce file count limit', async () => {
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');

      // Create 1001 files (exceeds limit of 1000)
      for (let i = 0; i < 1001; i++) {
        writeFile(tmpDir, `files/file-${i}.txt`, `content-${i}`);
      }

      await expect(packForScan(tmpDir)).rejects.toThrow(/file count|too many files|1000/i);
    });

    it('should skip symlinks', async () => {
      writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');
      // Create a symlink
      fs.symlinkSync('/etc/passwd', path.join(tmpDir, 'evil-link'));

      const result = await packForScan(tmpDir);

      // Symlink should be skipped, not cause an error
      expect(result.tarball).toBeInstanceOf(Buffer);
      expect(result.fileCount).toBe(1); // src/index.ts only
    });

    it('should reject non-existent directory', async () => {
      await expect(packForScan('/nonexistent/path/to/skill')).rejects.toThrow(/does not exist|no such|ENOENT/i);
    });
  });
});
