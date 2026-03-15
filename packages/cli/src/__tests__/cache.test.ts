import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('cache clean command', () => {
  let fakeHome: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-cache-test-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('removes ~/.tank/cache recursively when running clean', async () => {
    const { cacheCleanCommand } = await import('../commands/cache.js');
    const cacheDir = path.join(fakeHome, '.tank', 'cache');
    fs.mkdirSync(path.join(cacheDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'abc.tgz'), 'tarball');
    fs.writeFileSync(path.join(cacheDir, 'nested', 'def.tgz'), 'tarball');

    await cacheCleanCommand({ homedir: fakeHome });

    expect(fs.existsSync(cacheDir)).toBe(false);
  });
});
