import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock `open` package
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock crypto.randomUUID
const MOCK_STATE = 'mock-state-uuid-1234';
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: vi.fn().mockReturnValue(MOCK_STATE),
});

describe('loginCommand', () => {
  let tmpDir: string;
  let openMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-login-test-'));
    mockFetch.mockReset();

    // Get the mocked open function
    const openModule = await import('open');
    openMock = openModule.default as unknown as ReturnType<typeof vi.fn>;
    openMock.mockReset();
    openMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes full login flow successfully', async () => {
    // Mock POST /api/v1/cli-auth/start
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-code-123',
          sessionCode: 'sess-code-123',
        }),
        { status: 200 },
      ),
    );

    // Mock POST /api/v1/cli-auth/exchange — immediate success (user already authorized)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_test-token-abc',
          user: { name: 'Test User', email: 'test@example.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 2000 });

    // Verify config was written
    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'),
    );
    expect(config.token).toBe('tank_test-token-abc');
    expect(config.user).toEqual({ name: 'Test User', email: 'test@example.com' });

    // Verify success message
    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Logged in as Test User');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('calls POST /api/v1/cli-auth/start with state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-123',
          sessionCode: 'sess-123',
        }),
        { status: 200 },
      ),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_tok',
          user: { name: 'User', email: 'u@e.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 2000 });

    // Verify the start call
    const [startUrl, startOpts] = mockFetch.mock.calls[0];
    expect(startUrl).toContain('/api/v1/cli-auth/start');
    expect(startOpts.method).toBe('POST');
    const startBody = JSON.parse(startOpts.body);
    expect(startBody.state).toBe(MOCK_STATE);

    logSpy.mockRestore();
  });

  it('calls POST /api/v1/cli-auth/exchange with sessionCode and state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-456',
          sessionCode: 'sess-456',
        }),
        { status: 200 },
      ),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_tok2',
          user: { name: 'User2', email: 'u2@e.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 2000 });

    // Verify the exchange call
    const [exchangeUrl, exchangeOpts] = mockFetch.mock.calls[1];
    expect(exchangeUrl).toContain('/api/v1/cli-auth/exchange');
    expect(exchangeOpts.method).toBe('POST');
    const exchangeBody = JSON.parse(exchangeOpts.body);
    expect(exchangeBody.sessionCode).toBe('sess-456');
    expect(exchangeBody.state).toBe(MOCK_STATE);

    logSpy.mockRestore();
  });

  it('handles start endpoint failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loginCommand({ configDir: tmpDir, timeout: 2000 }),
    ).rejects.toThrow('Failed to start auth session');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles exchange endpoint server error (non-400)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-789',
          sessionCode: 'sess-789',
        }),
        { status: 200 },
      ),
    );

    // Exchange returns 500 (server error, not 400 pending)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loginCommand({ configDir: tmpDir, timeout: 2000 }),
    ).rejects.toThrow('Exchange failed');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('polls exchange until authorized then succeeds', async () => {
    // Start succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-poll',
          sessionCode: 'sess-poll',
        }),
        { status: 200 },
      ),
    );

    // First exchange: 400 (not yet authorized)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Session was not properly authorized' }),
        { status: 400 },
      ),
    );

    // Second exchange: 200 (authorized!)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_polled',
          user: { name: 'Polled User', email: 'poll@e.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 10000, pollInterval: 10 });

    // Should have called fetch 3 times: start + 2 exchanges
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify config was written with polled result
    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'),
    );
    expect(config.token).toBe('tank_polled');

    logSpy.mockRestore();
  });

  it('times out when authorization never completes', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-timeout',
          sessionCode: 'sess-timeout',
        }),
        { status: 200 },
      ),
    );

    // Always return 400 (never authorized)
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Session was not properly authorized' }),
        { status: 400 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loginCommand({ configDir: tmpDir, timeout: 100, pollInterval: 10 }),
    ).rejects.toThrow('Login timed out');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints URL manually when browser fails to open', async () => {
    openMock.mockRejectedValueOnce(new Error('No browser found'));

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-browser-fail',
          sessionCode: 'sess-browser-fail',
        }),
        { status: 200 },
      ),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_fallback',
          user: { name: 'Fallback', email: 'f@e.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 2000 });

    // Should have printed the URL for manual opening
    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
    expect(allOutput).toContain('https://tankpkg.dev/cli-login?session=sess-browser-fail');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('opens browser with authUrl', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authUrl: 'https://tankpkg.dev/cli-login?session=sess-open',
          sessionCode: 'sess-open',
        }),
        { status: 200 },
      ),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'tank_open',
          user: { name: 'Open', email: 'o@e.com' },
        }),
        { status: 200 },
      ),
    );

    const { loginCommand } = await import('../commands/login.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loginCommand({ configDir: tmpDir, timeout: 2000 });

    expect(openMock).toHaveBeenCalledWith(
      'https://tankpkg.dev/cli-login?session=sess-open',
    );

    logSpy.mockRestore();
  });
});
