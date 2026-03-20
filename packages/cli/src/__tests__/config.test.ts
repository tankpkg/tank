import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, getConfigDir, getConfigPath, setConfig } from '~/lib/config.js';

describe('config', () => {
  let tmpDir: string;
  let originalTankToken: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-test-'));
    originalTankToken = process.env.TANK_TOKEN;
    delete process.env.TANK_TOKEN;
  });

  afterEach(() => {
    if (originalTankToken === undefined) {
      delete process.env.TANK_TOKEN;
    } else {
      process.env.TANK_TOKEN = originalTankToken;
    }
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
        registry: 'https://www.tankpkg.dev'
      });
    });

    it('reads existing config file', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ token: 'abc123', registry: 'https://custom.dev' })
      );
      const config = getConfig(tmpDir);
      expect(config.token).toBe('abc123');
      expect(config.registry).toBe('https://custom.dev');
    });

    it('uses TANK_TOKEN when config file does not exist', () => {
      process.env.TANK_TOKEN = 'tank_env_token';
      const config = getConfig(tmpDir);
      expect(config.token).toBe('tank_env_token');
    });

    it('prefers TANK_TOKEN over config token', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ token: 'tank_file_token', registry: 'https://custom.dev' })
      );
      process.env.TANK_TOKEN = 'tank_env_token';
      const config = getConfig(tmpDir);
      expect(config.token).toBe('tank_env_token');
      expect(config.registry).toBe('https://custom.dev');
    });

    it('merges with defaults (missing fields get defaults)', () => {
      fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ token: 'abc123' }));
      const config = getConfig(tmpDir);
      expect(config.token).toBe('abc123');
      expect(config.registry).toBe('https://www.tankpkg.dev');
    });
  });

  describe('setConfig()', () => {
    it('creates config directory and file', () => {
      const configDir = path.join(tmpDir, 'newdir');
      setConfig({ token: 'mytoken' }, configDir);

      expect(fs.existsSync(configDir)).toBe(true);
      const config = getConfig(configDir);
      expect(config.token).toBe('mytoken');
      expect(config.registry).toBe('https://www.tankpkg.dev');
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
