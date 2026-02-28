import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkForUpgrade } from '../lib/upgrade-check.js';

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
  },
}));

const collectOutput = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls.map(call => call.join(' ')).join('\n');

describe('checkForUpgrade', () => {
  let tmpDir: string;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-check-test-'));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    originalFetch = globalThis.fetch;
    originalEnv = { ...process.env };
    delete process.env.TANK_NO_UPDATE_CHECK;
    delete process.env.CI;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips check when TANK_NO_UPDATE_CHECK is set', async () => {
    process.env.TANK_NO_UPDATE_CHECK = '1';
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    await checkForUpgrade(tmpDir);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips check when CI is set', async () => {
    process.env.CI = 'true';
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    await checkForUpgrade(tmpDir);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses cached result within 24 hours', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const cache = { lastCheck: Date.now(), latestVersion: '99.0.0' };
    fs.writeFileSync(path.join(tmpDir, 'upgrade_check.json'), JSON.stringify(cache));

    await checkForUpgrade(tmpDir);

    expect(mockFetch).not.toHaveBeenCalled();
    const output = collectOutput(errorSpy);
    expect(output).toContain('New version available');
    expect(output).toContain('99.0.0');
  });

  it('fetches from GitHub when cache is stale', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const staleCache = { lastCheck: Date.now() - 25 * 60 * 60 * 1000, latestVersion: '0.1.0' };
    fs.writeFileSync(path.join(tmpDir, 'upgrade_check.json'), JSON.stringify(staleCache));

    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ tag_name: 'v99.0.0' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await checkForUpgrade(tmpDir);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const updatedCache = JSON.parse(fs.readFileSync(path.join(tmpDir, 'upgrade_check.json'), 'utf-8'));
    expect(updatedCache.latestVersion).toBe('99.0.0');
  });

  it('shows banner when new version available', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ tag_name: 'v99.0.0' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await checkForUpgrade(tmpDir);

    const output = collectOutput(errorSpy);
    expect(output).toContain('New version available');
    expect(output).toContain('99.0.0');
    expect(output).toContain('tank upgrade');
  });

  it('silently swallows fetch errors', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(checkForUpgrade(tmpDir)).resolves.toBeUndefined();
  });

  it('silently swallows timeout errors', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    await expect(checkForUpgrade(tmpDir)).resolves.toBeUndefined();
  });
});
