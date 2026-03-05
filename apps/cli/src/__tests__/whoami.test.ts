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

  it('handles network error gracefully and sets exit code 1', async () => {
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

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toMatch(/could not/i);
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('sets exit code 1 when server returns non-401 error', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_server-err',
        user: { name: 'Server User', email: 'srv@e.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('Could not verify token');
    expect(allOutput).toContain('tank login');
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints "Logged in (token verified)" when token exists, no user in config, server returns 200', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_no-user-token',
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true }), { status: 200 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Logged in (token verified)');
    expect(process.exitCode).toBe(0);

    process.exitCode = 0;
    logSpy.mockRestore();
  });

  it('sets exit code 1 when token exists, no user in config, server returns non-401 error', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_no-user-500',
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('Could not verify token');
    expect(allOutput).toContain('Server returned an error');
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('sets exit code 1 when token exists, no user in config, network error', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_no-user-network',
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('Could not verify token');
    expect(allOutput).toContain('Check your network connection');
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('uses custom registry URL when verifying token', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_custom-registry',
        user: { name: 'Custom User', email: 'custom@e.com' },
        registry: 'https://custom.example.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true }), { status: 200 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await whoamiCommand({ configDir: tmpDir });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('https://custom.example.dev');
    expect(url).toContain('/api/v1/auth/whoami');

    logSpy.mockRestore();
  });

  it('does NOT set exit code 1 when token is invalid (401)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        token: 'tank_401-test',
        user: { name: 'Test User', email: 'test@e.com' },
        registry: 'https://tankpkg.dev',
      }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    const { whoamiCommand } = await import('../commands/whoami.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.exitCode = 0;
    await whoamiCommand({ configDir: tmpDir });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('expired');
    expect(process.exitCode).toBe(0);

    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
