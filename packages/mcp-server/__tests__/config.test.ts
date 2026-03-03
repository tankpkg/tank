import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getConfig, setConfig, getConfigPath } from '../src/lib/config.js';

describe('config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-mcp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getConfig', () => {
    it('returns default config when file does not exist', () => {
      const config = getConfig(tempDir);
      expect(config.registry).toBe('https://tankpkg.dev');
      expect(config.token).toBeUndefined();
    });

    it('reads config from file', () => {
      fs.writeFileSync(
        getConfigPath(tempDir),
        JSON.stringify({ token: 'test-token', registry: 'https://custom.com' }),
      );

      const config = getConfig(tempDir);
      expect(config.token).toBe('test-token');
      expect(config.registry).toBe('https://custom.com');
    });

    it('TANK_TOKEN env var overrides file token', () => {
      process.env.TANK_TOKEN = 'env-token';
      fs.writeFileSync(
        getConfigPath(tempDir),
        JSON.stringify({ token: 'file-token' }),
      );

      const config = getConfig(tempDir);
      expect(config.token).toBe('env-token');

      delete process.env.TANK_TOKEN;
    });

    it('TANK_TOKEN env var works without config file', () => {
      process.env.TANK_TOKEN = 'env-token';

      const config = getConfig(tempDir);
      expect(config.token).toBe('env-token');

      delete process.env.TANK_TOKEN;
    });
  });

  describe('setConfig', () => {
    it('creates config directory with correct permissions', () => {
      setConfig({ token: 'new-token' }, tempDir);

      expect(fs.existsSync(tempDir)).toBe(true);
      const stat = fs.statSync(tempDir);
      // On Unix, check directory permissions (0o700 = rwx------)
      if (process.platform !== 'win32') {
        expect(stat.mode & 0o777).toBe(0o700);
      }
    });

    it('writes config file with correct permissions', () => {
      setConfig({ token: 'new-token' }, tempDir);

      const configPath = getConfigPath(tempDir);
      expect(fs.existsSync(configPath)).toBe(true);

      const stat = fs.statSync(configPath);
      // On Unix, check file permissions (0o600 = rw-------)
      if (process.platform !== 'win32') {
        expect(stat.mode & 0o777).toBe(0o600);
      }
    });

    it('merges with existing config', () => {
      setConfig({ token: 'first-token', user: { name: 'Test', email: 'test@example.com' } }, tempDir);
      setConfig({ token: 'second-token' }, tempDir);

      const config = getConfig(tempDir);
      expect(config.token).toBe('second-token');
      expect(config.user).toEqual({ name: 'Test', email: 'test@example.com' });
    });
  });
});
