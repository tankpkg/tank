import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('whoamiCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-whoami-test-'));
    mockFetch.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints "Not logged in" when no token in config', async () => {
    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('Not logged in');
    expect(allOutput).toContain('tank login');

    // Should NOT have called fetch
    expect(mockFetch).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints user info when token is valid', async () => {
    // Write config with token
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_valid-token',
        user: { name: 'Test User', email: 'test@example.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    // Mock API verification response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ valid: true }),
        { status: 200 },
      ),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Test User');
    expect(allOutput).toContain('test@example.com');

    logSpy.mockRestore();
  });

  it('sends auth header when verifying token', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_verify-me',
        user: { name: 'Verify', email: 'v@e.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true }), { status: 200 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/whoami');
    expect(opts.headers['Authorization']).toBe('Bearer tank_verify-me');

    logSpy.mockRestore();
  });

  it('handles invalid/expired token', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_expired-token',
        user: { name: 'Old User', email: 'old@e.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('expired');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles network error gracefully', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_network-fail',
        user: { name: 'Net User', email: 'net@e.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    // Should show cached user info or error message
    expect(allOutput).toMatch(/error|failed|could not/i);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
