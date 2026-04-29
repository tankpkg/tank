import { describe, expect, it } from 'vitest';
import { deriveAuthEnvVarFromUrl, validateRemoteProxyEnv } from '~/transport/remote-transport.js';

describe('deriveAuthEnvVarFromUrl — derive env var name from remote URL hostname', () => {
  it('derives from a simple hostname', () => {
    expect(deriveAuthEnvVarFromUrl('https://remote.example.com/sse')).toBe('TANK_MCP_AUTH_REMOTE_EXAMPLE_COM');
  });

  it('ignores the URL path', () => {
    expect(deriveAuthEnvVarFromUrl('https://api.example.com/some/path')).toBe('TANK_MCP_AUTH_API_EXAMPLE_COM');
  });

  it('uppercases the hostname and replaces dots with underscores', () => {
    expect(deriveAuthEnvVarFromUrl('https://sub.service.io')).toBe('TANK_MCP_AUTH_SUB_SERVICE_IO');
  });

  it('replaces non-alphanumeric with underscores and collapses', () => {
    expect(deriveAuthEnvVarFromUrl('https://my--weird.host.example')).toBe('TANK_MCP_AUTH_MY_WEIRD_HOST_EXAMPLE');
  });

  it('throws on invalid URL', () => {
    expect(() => deriveAuthEnvVarFromUrl('not-a-url')).toThrow(/invalid remote URL/i);
  });
});

describe('validateRemoteProxyEnv — C48 fail-loud on missing auth', () => {
  it('returns { ok: true } when auth is not required', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://remote.example.com/sse',
      requiresAuth: false,
      env: {}
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when requires_auth and env var is set', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: 'Bearer xyz' }
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, code: 2 } with the expected message when auth var is missing (C48)', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: {}
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
      expect(result.message).toBe('tank proxy: required auth env var TANK_MCP_AUTH_REMOTE_EXAMPLE_COM not set');
    }
  });

  it('fail message uses the url-derived env var name', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://api.other.io/sse',
      requiresAuth: true,
      env: {}
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('TANK_MCP_AUTH_API_OTHER_IO');
    }
  });

  it('empty-string env var value counts as missing (C48)', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: '' }
    });
    expect(result.ok).toBe(false);
  });

  it('accepts custom envVarName override (for skill-slug-based names)', () => {
    const result = validateRemoteProxyEnv({
      url: 'https://remote.example.com/sse',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_REMOTE_TOOL: 'Bearer xyz' },
      envVarName: 'TANK_MCP_AUTH_REMOTE_TOOL'
    });
    expect(result).toEqual({ ok: true });
  });
});
