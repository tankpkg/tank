import { describe, expect, it, vi } from 'vitest';
import { proxyRemoteCommand } from '~/commands/proxy-remote.js';

describe('proxyRemoteCommand — auth pre-check still fails loud (C48)', () => {
  it('exits with code 2 when auth required but env var missing', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: {},
      exit: false
    });
    expect(result.exitCode).toBe(2);
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('tank proxy: required auth env var TANK_MCP_AUTH_REMOTE_EXAMPLE_COM not set');
    stderr.mockRestore();
  });

  it('exits non-zero on malformed URL before any network I/O', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'not-a-url',
      requiresAuth: false,
      env: {},
      exit: false
    });
    expect(result.exitCode).toBe(1);
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('invalid remote URL');
    stderr.mockRestore();
  });

  it('exits non-zero on non-http scheme before any network I/O', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'file:///etc/passwd',
      requiresAuth: false,
      env: {},
      exit: false
    });
    expect(result.exitCode).toBe(1);
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined.toLowerCase()).toContain('must be http');
    stderr.mockRestore();
  });

  it('never logs the auth value on stderr', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const secretToken = 'Bearer-super-secret-xyz';
    await proxyRemoteCommand({
      url: 'not-a-url',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_OTHER: secretToken },
      exit: false
    });
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).not.toContain(secretToken);
    stderr.mockRestore();
  });
});
