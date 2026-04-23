import { describe, expect, it, vi } from 'vitest';
import { connectRemote, type TransportFactoryDeps, validateAuthHeaders } from '~/transport/connect-remote.js';

function okTransport(label: string) {
  return {
    label,
    async start() {},
    async send(_msg: unknown) {},
    async close() {},
    onclose: undefined as (() => void) | undefined,
    onmessage: undefined as ((m: unknown) => void) | undefined,
    onerror: undefined as ((e: Error) => void) | undefined,
    sessionId: undefined as string | undefined
  };
}

function buildDeps(opts: { streamableFailsOnStart?: boolean; sseFailsOnStart?: boolean }): TransportFactoryDeps {
  const createdUrls: string[] = [];
  const streamable = okTransport('streamable');
  const sse = okTransport('sse');
  const origStreamStart = streamable.start.bind(streamable);
  const origSseStart = sse.start.bind(sse);
  if (opts.streamableFailsOnStart) {
    streamable.start = async () => {
      throw new Error('streamable unreachable');
    };
  } else {
    streamable.start = origStreamStart;
  }
  if (opts.sseFailsOnStart) {
    sse.start = async () => {
      throw new Error('sse unreachable');
    };
  } else {
    sse.start = origSseStart;
  }
  return {
    createStreamableTransport: (url) => {
      createdUrls.push(`streamable:${url.toString()}`);
      return streamable;
    },
    createSseTransport: (url) => {
      createdUrls.push(`sse:${url.toString()}`);
      return sse;
    },
    createdUrlsView: () => createdUrls
  };
}

describe('validateAuthHeaders — never leaks secret into returned object keys/values', () => {
  it('returns empty headers when no auth required', () => {
    const h = validateAuthHeaders({
      url: 'https://x.example.com/mcp',
      requiresAuth: false,
      env: {}
    });
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.headers).toEqual({});
  });

  it('returns Authorization: Bearer <token> when TANK_MCP_AUTH_<HOST> is set', () => {
    const h = validateAuthHeaders({
      url: 'https://x.example.com/mcp',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_X_EXAMPLE_COM: 'abc123' }
    });
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.headers).toEqual({ Authorization: 'Bearer abc123' });
  });

  it('fails when requiresAuth but env var is missing', () => {
    const h = validateAuthHeaders({
      url: 'https://x.example.com/mcp',
      requiresAuth: true,
      env: {}
    });
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.exitCode).toBe(2);
      expect(h.message).toContain('TANK_MCP_AUTH_X_EXAMPLE_COM not set');
    }
  });

  it('does not include the secret value in the failure message', () => {
    const h = validateAuthHeaders({
      url: 'https://x.example.com/mcp',
      requiresAuth: true,
      env: { TANK_MCP_AUTH_OTHER: 'SHOULD_NOT_LEAK' }
    });
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.message).not.toContain('SHOULD_NOT_LEAK');
    }
  });
});

describe('connectRemote — StreamableHTTP first, SSE fallback', () => {
  it('returns StreamableHTTP upstream when streamable.start() succeeds', async () => {
    const deps = buildDeps({});
    const result = await connectRemote({ url: 'https://x.example.com/mcp', requiresAuth: false, env: {}, deps });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transportKind).toBe('streamable');
      expect(deps.createdUrlsView()).toEqual(['streamable:https://x.example.com/mcp']);
    }
  });

  it('falls back to SSE when StreamableHTTP start() throws', async () => {
    const deps = buildDeps({ streamableFailsOnStart: true });
    const result = await connectRemote({ url: 'https://x.example.com/mcp', requiresAuth: false, env: {}, deps });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transportKind).toBe('sse');
      expect(deps.createdUrlsView()).toEqual(['streamable:https://x.example.com/mcp', 'sse:https://x.example.com/mcp']);
    }
  });

  it('returns failure when both StreamableHTTP and SSE fail', async () => {
    const deps = buildDeps({ streamableFailsOnStart: true, sseFailsOnStart: true });
    const result = await connectRemote({ url: 'https://x.example.com/mcp', requiresAuth: false, env: {}, deps });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(1);
      expect(result.message.toLowerCase()).toContain('unreachable');
    }
  });

  it('auth failure short-circuits before any transport is created', async () => {
    const deps = buildDeps({});
    const result = await connectRemote({
      url: 'https://x.example.com/mcp',
      requiresAuth: true,
      env: {},
      deps
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('TANK_MCP_AUTH_X_EXAMPLE_COM not set');
      expect(deps.createdUrlsView()).toEqual([]);
    }
  });

  it('rejects non-http(s) URLs', async () => {
    const deps = buildDeps({});
    const result = await connectRemote({
      url: 'file:///etc/passwd',
      requiresAuth: false,
      env: {},
      deps
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain('must be http');
    }
  });

  it('rejects obviously malformed URLs before attempting connection', async () => {
    const deps = buildDeps({});
    const result = await connectRemote({
      url: 'not-a-url',
      requiresAuth: false,
      env: {},
      deps
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain('invalid');
      expect(deps.createdUrlsView()).toEqual([]);
    }
  });
});
