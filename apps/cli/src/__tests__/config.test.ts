import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfig, setConfig, getConfigPath, getConfigDir } from '../lib/config.js';

describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getConfigDir()', () => {
    it('returns custom dir when provided', () => {
      expect(getConfigDir('/custom/dir')).toBe('/custom/dir');
    });

    it('returns ~/.tank when no override', () => {
      const result = getConfigDir();
      expect(result).toBe(path.join(os.homedir(), '.tank'));
    });
  });

  describe('getConfigPath()', () => {
    it('returns config.json inside config dir', () => {
      expect(getConfigPath('/custom/dir')).toBe('/custom/dir/config.json');
    });

    it('returns ~/.tank/config.json when no override', () => {
      const result = getConfigPath();
      expect(result).toBe(path.join(os.homedir(), '.tank', 'config.json'));
    });
  });

  describe('getConfig()', () => {
    it('returns defaults when config file does not exist', () => {
      const config = getConfig(tmpDir);
      expect(config).toEqual({
        registry: 'https://tankpkg.dev',
      });
    });

    it('reads existing config file', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ token: 'abc123', registry: 'https://custom.dev' }),
      );
      const config = getConfig(tmpDir);
      expect(config.token).toBe('abc123');
      expect(config.registry).toBe('https://custom.dev');
    });

    it('merges with defaults (missing fields get defaults)', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ token: 'abc123' }),
      );
      const config = getConfig(tmpDir);
      expect(config.token).toBe('abc123');
      expect(config.registry).toBe('https://tankpkg.dev');
    });
  });

  describe('setConfig()', () => {
    it('creates config directory and file', () => {
      const configDir = path.join(tmpDir, 'newdir');
      setConfig({ token: 'mytoken' }, configDir);

      expect(fs.existsSync(configDir)).toBe(true);
      const config = getConfig(configDir);
      expect(config.token).toBe('mytoken');
      expect(config.registry).toBe('https://tankpkg.dev');
    });

    it('merges with existing config', () => {
      setConfig({ token: 'first' }, tmpDir);
      setConfig({ user: { name: 'Test', email: 'test@test.com' } }, tmpDir);

      const config = getConfig(tmpDir);
      expect(config.token).toBe('first');
      expect(config.user?.name).toBe('Test');
    });

    it('overwrites existing fields', () => {
      setConfig({ token: 'old' }, tmpDir);
      setConfig({ token: 'new' }, tmpDir);

      const config = getConfig(tmpDir);
      expect(config.token).toBe('new');
    });

    it('writes valid JSON', () => {
      setConfig({ token: 'test' }, tmpDir);
      const raw = fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('sets file permissions to 0600 on Unix', () => {
      if (process.platform === 'win32') return; // skip on Windows

      setConfig({ token: 'secret' }, tmpDir);
      const stats = fs.statSync(path.join(tmpDir, 'config.json'));
      // mode includes file type bits; mask with 0o777 to get permission bits
      expect(stats.mode & 0o777).toBe(0o600);
    });
  });
});
