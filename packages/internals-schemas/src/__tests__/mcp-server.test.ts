import { describe, expect, it } from 'vitest';
import { isRemoteMcpServer, mcpServerSchema } from '~/schemas/mcp-server.js';

describe('mcpServerSchema — local MCP server', () => {
  it('accepts a minimal local server (command only, args default to [])', () => {
    const result = mcpServerSchema.safeParse({ command: 'npx' });
    expect(result.success).toBe(true);
    if (result.success && !isRemoteMcpServer(result.data)) {
      expect(result.data.args).toEqual([]);
    }
  });

  it('accepts a local server with command and args', () => {
    const result = mcpServerSchema.safeParse({
      command: 'npx',
      args: ['@org/mcp-tool']
    });
    expect(result.success).toBe(true);
  });

  it('accepts a local server with env overrides', () => {
    const result = mcpServerSchema.safeParse({
      command: 'node',
      args: ['server.js'],
      env: { DEBUG: '1' }
    });
    expect(result.success).toBe(true);
  });

  it('rejects a local server with empty command', () => {
    const result = mcpServerSchema.safeParse({ command: '', args: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a local server with non-string args', () => {
    const result = mcpServerSchema.safeParse({ command: 'npx', args: [123] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    const result = mcpServerSchema.safeParse({
      command: 'npx',
      args: [],
      bogus: 'field'
    });
    expect(result.success).toBe(false);
  });
});

describe('mcpServerSchema — remote MCP server', () => {
  it('accepts a remote server with URL only (requires_auth defaults to false)', () => {
    const result = mcpServerSchema.safeParse({ remote: 'https://remote.example.com/sse' });
    expect(result.success).toBe(true);
    if (result.success && isRemoteMcpServer(result.data)) {
      expect(result.data.requires_auth).toBe(false);
    }
  });

  it('accepts a remote server that requires auth', () => {
    const result = mcpServerSchema.safeParse({
      remote: 'https://remote.example.com/sse',
      requires_auth: true
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-URL remote value', () => {
    const result = mcpServerSchema.safeParse({ remote: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a remote server with command (mutually exclusive with remote)', () => {
    const result = mcpServerSchema.safeParse({
      remote: 'https://remote.example.com/sse',
      command: 'npx'
    });
    expect(result.success).toBe(false);
  });
});

describe('isRemoteMcpServer', () => {
  it('returns true for a parsed remote server', () => {
    const parsed = mcpServerSchema.parse({ remote: 'https://x.example.com/sse' });
    expect(isRemoteMcpServer(parsed)).toBe(true);
  });

  it('returns false for a parsed local server', () => {
    const parsed = mcpServerSchema.parse({ command: 'npx' });
    expect(isRemoteMcpServer(parsed)).toBe(false);
  });
});
