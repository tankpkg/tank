import { describe, expect, it, vi } from 'vitest';
import { proxyRemoteCommand } from '~/commands/proxy-remote.js';

describe('proxyRemoteCommand (C47 C48) — remote proxy entry point', () => {
  it('exits with code 2 and writes the C48 message when auth required but env var missing', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: {},
      exit: false
    });
    expect(result.exitCode).toBe(2);
    const msg = (stderr.mock.calls[0]?.[0] ?? '') as string;
    expect(msg).toContain('tank proxy: required auth env var TANK_MCP_AUTH_REMOTE_EXAMPLE_COM not set');
    stderr.mockRestore();
  });

  it('exits with code 0 when env var is present', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: 'Bearer xyz' },
      exit: false
    });
    expect(result.exitCode).toBe(0);
    stderr.mockRestore();
  });

  it('proceeds when no auth is required (exitCode 0)', async () => {
    const result = await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: false,
      env: {},
      exit: false
    });
    expect(result.exitCode).toBe(0);
  });

  it('prints a stub notice when auth passes — indicating remote transport lands in Phase 7', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: 'Bearer xyz' },
      exit: false
    });
    expect(result.exitCode).toBe(0);
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('remote MCP transport is not yet shipped');
    stderr.mockRestore();
  });

  it('rejects an invalid remote URL', async () => {
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

  it('does NOT log the auth value (not to stderr)', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const secretToken = 'Bearer-super-secret-xyz';
    await proxyRemoteCommand({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: secretToken },
      exit: false
    });
    const joined = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).not.toContain(secretToken);
    stderr.mockRestore();
  });
});
