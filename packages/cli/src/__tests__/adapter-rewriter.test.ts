import type { McpServer } from '@internals/schemas';
import { describe, expect, it } from 'vitest';
import { rewriteMcpServerEntry } from '~/lib/adapter-rewriter.js';

describe('rewriteMcpServerEntry (C42 @happy-flow) — local MCP server', () => {
  it('rewrites { command: "npx", args: ["@org/x"] } → tank proxy wrapper', () => {
    const mcp: McpServer = { command: 'npx', args: ['@org/mcp-tool'] };
    const entry = rewriteMcpServerEntry({ skillName: '@org/mcp-tool', mcpServer: mcp });
    expect(entry).toEqual({
      command: 'tank',
      args: ['proxy', '--', 'npx', '@org/mcp-tool']
    });
  });

  it('preserves original args array (no mutation)', () => {
    const originalArgs = ['server.js', '--flag'];
    const mcp: McpServer = { command: 'node', args: originalArgs };
    rewriteMcpServerEntry({ skillName: '@org/x', mcpServer: mcp });
    expect(originalArgs).toEqual(['server.js', '--flag']);
  });

  it('handles an empty args array', () => {
    const mcp: McpServer = { command: 'my-bin', args: [] };
    const entry = rewriteMcpServerEntry({ skillName: '@org/x', mcpServer: mcp });
    expect(entry.args).toEqual(['proxy', '--', 'my-bin']);
  });

  it('uses a custom tank binary path when provided', () => {
    const mcp: McpServer = { command: 'npx', args: ['@org/x'] };
    const entry = rewriteMcpServerEntry({
      skillName: '@org/x',
      mcpServer: mcp,
      tankBinaryPath: '/usr/local/bin/tank'
    });
    expect(entry.command).toBe('/usr/local/bin/tank');
    expect(entry.args).toEqual(['proxy', '--', 'npx', '@org/x']);
  });

  it('passes through local env overrides', () => {
    const mcp: McpServer = { command: 'node', args: ['server.js'], env: { DEBUG: '1' } };
    const entry = rewriteMcpServerEntry({ skillName: '@org/x', mcpServer: mcp });
    expect(entry.env).toEqual({ DEBUG: '1' });
  });

  it('returns no env field when none is declared', () => {
    const mcp: McpServer = { command: 'npx', args: [] };
    const entry = rewriteMcpServerEntry({ skillName: '@org/x', mcpServer: mcp });
    expect(entry.env).toBeUndefined();
  });
});

describe('rewriteMcpServerEntry — opt-out (C39 @fail-loud)', () => {
  it('returns the original command when dangerouslyNoTankProxy is set', () => {
    const mcp: McpServer = { command: 'npx', args: ['@org/mcp-tool'] };
    const entry = rewriteMcpServerEntry({
      skillName: '@org/x',
      mcpServer: mcp,
      dangerouslyNoTankProxy: true
    });
    expect(entry).toEqual({ command: 'npx', args: ['@org/mcp-tool'] });
  });

  it('opt-out with env preserves env', () => {
    const mcp: McpServer = { command: 'node', args: ['s.js'], env: { K: 'V' } };
    const entry = rewriteMcpServerEntry({
      skillName: '@org/x',
      mcpServer: mcp,
      dangerouslyNoTankProxy: true
    });
    expect(entry).toEqual({ command: 'node', args: ['s.js'], env: { K: 'V' } });
  });
});
