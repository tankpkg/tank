import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logoutCommand } from '../commands/logout.js';
import { getConfig, setConfig } from '../lib/config.js';

describe('logout', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes token and user from config when logged in', async () => {
    // Arrange: Set up a logged-in config
    setConfig(
      {
        token: 'test-token-123',
        user: { name: 'Test User', email: 'test@example.com' },
      },
      tmpDir,
    );

    // Act: Call logout
    await logoutCommand({ configDir: tmpDir });

    // Assert: Token and user are removed
    const config = getConfig(tmpDir);
    expect(config.token).toBeUndefined();
    expect(config.user).toBeUndefined();
    // Registry should still exist (default)
    expect(config.registry).toBe('https://tankpkg.dev');
  });

  it('prints "Not logged in" when no token exists', async () => {
    // Arrange: Empty config (no token)
    const consoleSpy = { calls: [] as string[] };
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleSpy.calls.push(args.map(String).join(' '));
    };

    try {
      // Act: Call logout
      await logoutCommand({ configDir: tmpDir });

      // Assert: Should print "Not logged in"
      expect(consoleSpy.calls.some((call) => call.includes('Not logged in'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('prints success message when logout succeeds', async () => {
    // Arrange: Set up a logged-in config
    setConfig(
      {
        token: 'test-token-123',
        user: { name: 'Test User', email: 'test@example.com' },
      },
      tmpDir,
    );

    const consoleSpy = { calls: [] as string[] };
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleSpy.calls.push(args.map(String).join(' '));
    };

    try {
      // Act: Call logout
      await logoutCommand({ configDir: tmpDir });

      // Assert: Should print success message with checkmark
      expect(consoleSpy.calls.some((call) => call.includes('Logged out'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('keeps config file intact after logout (just removes token/user)', async () => {
    // Arrange: Set up a logged-in config with custom registry
    setConfig(
      {
        token: 'test-token-123',
        user: { name: 'Test User', email: 'test@example.com' },
        registry: 'https://custom.registry.dev',
      },
      tmpDir,
    );

    // Act: Call logout
    await logoutCommand({ configDir: tmpDir });

    // Assert: Config file still exists and registry is preserved
    const configPath = path.join(tmpDir, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = getConfig(tmpDir);
    expect(config.registry).toBe('https://custom.registry.dev');
    expect(config.token).toBeUndefined();
    expect(config.user).toBeUndefined();
  });
});
