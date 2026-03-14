import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { upgradeCommand } from '~/commands/upgrade.js';

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s
  }
}));

const collectOutput = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');

describe('upgradeCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalArgv1: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    originalArgv1 = process.argv[1];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.argv[1] = originalArgv1;
    globalThis.fetch = originalFetch;
  });

  it('detects Homebrew installation and warns', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-test-'));
    try {
      const fakeBrewBin = path.join(tmpDir, 'Cellar', 'tank', 'bin', 'tank');
      fs.mkdirSync(path.dirname(fakeBrewBin), { recursive: true });
      fs.writeFileSync(fakeBrewBin, '#!/bin/sh\n');
      process.argv[1] = fakeBrewBin;

      await upgradeCommand();

      const output = collectOutput(logSpy);
      expect(output).toContain('Homebrew');
      expect(output).toContain('brew upgrade tank');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('shows already up-to-date when versions match', async () => {
    const { VERSION } = await import('~/version.js');
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: `v${VERSION}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await upgradeCommand();

    const output = collectOutput(logSpy);
    expect(output).toContain('Already on latest version');
    expect(output).toContain(VERSION);
  });

  it('dry-run shows what would happen without downloading', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: 'v99.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await upgradeCommand({ dryRun: true });

    const output = collectOutput(logSpy);
    expect(output).toContain('Would upgrade');
    expect(output).toContain('99.0.0');
    // Only the version-check fetch, no binary download
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects on checksum mismatch', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const fakeBinary = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const wrongHash = 'deadbeef'.repeat(8);
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const binaryName = `tank-${platform}-${arch}`;

    // 1. Latest version response
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: 'v99.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    // 2. Binary download
    mockFetch.mockResolvedValueOnce(new Response(fakeBinary, { status: 200 }));

    // 3. SHA256SUMS with wrong hash
    mockFetch.mockResolvedValueOnce(new Response(`${wrongHash}  ${binaryName}\n`, { status: 200 }));

    await upgradeCommand();

    const output = collectOutput(logSpy);
    expect(output).toContain('Checksum mismatch');
  });

  it('successfully upgrades with valid checksum', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-target-'));
    try {
      // Create a fake binary that process.argv[1] points to so copyFileSync
      // writes to our temp file instead of the real vitest process
      const fakeBinPath = path.join(tmpDir, 'tank');
      fs.writeFileSync(fakeBinPath, 'old-binary');
      process.argv[1] = fakeBinPath;

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const fakeBinary = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
      const actualHash = crypto.createHash('sha256').update(fakeBinary).digest('hex');
      const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const binaryName = `tank-${platform}-${arch}`;

      // 1. Latest version response
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ tag_name: 'v99.0.0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // 2. Binary download
      mockFetch.mockResolvedValueOnce(new Response(fakeBinary, { status: 200 }));

      // 3. SHA256SUMS with correct hash
      mockFetch.mockResolvedValueOnce(new Response(`${actualHash}  ${binaryName}\n`, { status: 200 }));

      await upgradeCommand();

      const output = collectOutput(logSpy);
      expect(output).toContain('Upgraded tank');
      expect(output).toContain('99.0.0');
      expect(output).toContain('Release notes');

      // Verify the binary was actually written
      const written = fs.readFileSync(fakeBinPath);
      expect(Buffer.from(fakeBinary).equals(written)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('force flag bypasses version check', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-upgrade-force-'));
    try {
      const fakeBinPath = path.join(tmpDir, 'tank');
      fs.writeFileSync(fakeBinPath, 'old-binary');
      process.argv[1] = fakeBinPath;

      const { VERSION } = await import('~/version.js');
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const fakeBinary = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const actualHash = crypto.createHash('sha256').update(fakeBinary).digest('hex');
      const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const binaryName = `tank-${platform}-${arch}`;

      // Return current version — without force, this would short-circuit
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ tag_name: `v${VERSION}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      mockFetch.mockResolvedValueOnce(new Response(fakeBinary, { status: 200 }));

      mockFetch.mockResolvedValueOnce(new Response(`${actualHash}  ${binaryName}\n`, { status: 200 }));

      await upgradeCommand({ force: true });

      const output = collectOutput(logSpy);
      // Should NOT say "already up to date" — force bypasses that
      expect(output).not.toContain('Already on latest version');
      // Should have made all 3 fetches (version + binary + sums)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws when latest release fetch fails', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(upgradeCommand()).rejects.toThrow(/failed to fetch latest release/i);
  });

  it('throws when binary download fails', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    // 1. Latest version response
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: 'v99.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    // 2. Binary download fails
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(upgradeCommand()).rejects.toThrow(/failed to download binary/i);
  });

  it('throws when SHA256SUMS download fails', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const fakeBinary = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);

    // 1. Latest version response
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: 'v99.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    // 2. Binary download succeeds
    mockFetch.mockResolvedValueOnce(new Response(fakeBinary, { status: 200 }));

    // 3. SHA256SUMS download fails
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(upgradeCommand()).rejects.toThrow(/failed to download SHA256SUMS/i);
  });
});
