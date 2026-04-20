import type { McpServer } from '@internals/schemas';
import { describe, expect, it } from 'vitest';
import { deriveAuthEnvVarName, rewriteMcpServerEntry } from '~/lib/adapter-rewriter.js';

describe('deriveAuthEnvVarName (C47) — TANK_MCP_AUTH_<SLUG>', () => {
  it('strips the @scope/ prefix and uppercases the remainder', () => {
    expect(deriveAuthEnvVarName('@org/remote-tool')).toBe('TANK_MCP_AUTH_REMOTE_TOOL');
  });

  it('replaces hyphens with underscores', () => {
    expect(deriveAuthEnvVarName('@vendor/some-cool-tool')).toBe('TANK_MCP_AUTH_SOME_COOL_TOOL');
  });

  it('replaces non-alphanumeric chars with underscores', () => {
    expect(deriveAuthEnvVarName('@org/weird.tool+1')).toBe('TANK_MCP_AUTH_WEIRD_TOOL_1');
  });

  it('works on unscoped package names', () => {
    expect(deriveAuthEnvVarName('plain-tool')).toBe('TANK_MCP_AUTH_PLAIN_TOOL');
  });

  it('collapses a run of non-alphanumeric chars into a single underscore', () => {
    expect(deriveAuthEnvVarName('@org/a--b.-c')).toBe('TANK_MCP_AUTH_A_B_C');
  });

  it('trims leading and trailing underscores from the derived slug', () => {
    expect(deriveAuthEnvVarName('@org/-leading-')).toBe('TANK_MCP_AUTH_LEADING');
  });

  it('is deterministic (same input → same output)', () => {
    expect(deriveAuthEnvVarName('@a/b')).toBe(deriveAuthEnvVarName('@a/b'));
  });
});

describe('rewriteMcpServerEntry (C47 @E30) — remote MCP server', () => {
  it('remote MCP is wrapped with --remote flag and upstream URL', () => {
    const mcp: McpServer = { remote: 'https://remote.example.com/sse', requires_auth: false };
    const entry = rewriteMcpServerEntry({ skillName: '@org/remote-tool', mcpServer: mcp });
    expect(entry.command).toBe('tank');
    expect(entry.args).toEqual(['proxy', '--remote', 'https://remote.example.com/sse']);
  });

  it('remote MCP requiring auth injects env-var reference with TANK_MCP_AUTH_<SLUG>', () => {
    const mcp: McpServer = { remote: 'https://remote.example.com/sse', requires_auth: true };
    const entry = rewriteMcpServerEntry({ skillName: '@org/remote-tool', mcpServer: mcp });
    expect(entry.env).toEqual({
      TANK_MCP_AUTH_REMOTE_TOOL: '<agent-config-resolves-this>'
    });
  });

  it('remote MCP without auth does NOT inject an auth env var', () => {
    const mcp: McpServer = { remote: 'https://remote.example.com/sse', requires_auth: false };
    const entry = rewriteMcpServerEntry({ skillName: '@org/remote-tool', mcpServer: mcp });
    expect(entry.env).toBeUndefined();
  });

  it('remote MCP merges user-declared env with auth env ref', () => {
    const mcp: McpServer = {
      remote: 'https://remote.example.com/sse',
      requires_auth: true,
      env: { CUSTOM: 'x' }
    };
    const entry = rewriteMcpServerEntry({ skillName: '@org/remote-tool', mcpServer: mcp });
    expect(entry.env).toEqual({
      CUSTOM: 'x',
      TANK_MCP_AUTH_REMOTE_TOOL: '<agent-config-resolves-this>'
    });
  });

  it('remote MCP honors custom tank binary path', () => {
    const mcp: McpServer = { remote: 'https://r.example.com', requires_auth: false };
    const entry = rewriteMcpServerEntry({
      skillName: '@org/x',
      mcpServer: mcp,
      tankBinaryPath: '/usr/local/bin/tank'
    });
    expect(entry.command).toBe('/usr/local/bin/tank');
  });

  it('opt-out throws on remote MCP (proxy transport is mandatory for remote)', () => {
    const mcp: McpServer = { remote: 'https://remote.example.com', requires_auth: false };
    expect(() =>
      rewriteMcpServerEntry({
        skillName: '@org/remote-tool',
        mcpServer: mcp,
        dangerouslyNoTankProxy: true
      })
    ).toThrow(/remote MCP/);
  });

  it('env-var slug uses the package (not scope) for @vendor/some-cool-tool', () => {
    const mcp: McpServer = { remote: 'https://r.example.com', requires_auth: true };
    const entry = rewriteMcpServerEntry({ skillName: '@vendor/some-cool-tool', mcpServer: mcp });
    expect(Object.keys(entry.env ?? {})).toContain('TANK_MCP_AUTH_SOME_COOL_TOOL');
  });
});
