// Verifies issue #453: non-Node MCP tool atoms compile to real client config.
//
// Intent: idd/modules/atom-architecture/INTENT.md — Examples E24-E27.
//
// Adapters covered: opencode, claude-code, cursor, windsurf, cline, roo-code.
import { describe, expect, it } from 'vitest';

import { claudeCodeAdapter } from '~/adapters/claude-code.js';
import { clineAdapter } from '~/adapters/cline.js';
import { cursorAdapter } from '~/adapters/cursor.js';
import { opencodeAdapter } from '~/adapters/opencode.js';
import { rooCodeAdapter } from '~/adapters/roo-code.js';
import { windsurfAdapter } from '~/adapters/windsurf.js';

const ALL_ADAPTERS = [
  {
    name: 'opencode',
    adapter: opencodeAdapter,
    configPath: (toolName: string) => `.opencode/mcp/${toolName}.json`,
    servers: false
  },
  { name: 'claude-code', adapter: claudeCodeAdapter, configPath: () => '.mcp.json', servers: true },
  { name: 'cursor', adapter: cursorAdapter, configPath: () => '.cursor/mcp.json', servers: true },
  { name: 'windsurf', adapter: windsurfAdapter, configPath: () => '.windsurf/mcp.json', servers: true },
  { name: 'cline', adapter: clineAdapter, configPath: () => '.vscode/cline_mcp_settings.json', servers: true },
  { name: 'roo-code', adapter: rooCodeAdapter, configPath: () => '.vscode/mcp.json', servers: true }
];

function parseConfig(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

function readServer(
  config: Record<string, unknown>,
  useServersWrapper: boolean,
  name: string
): Record<string, unknown> {
  const root = useServersWrapper ? (config.mcpServers as Record<string, unknown>) : config;
  return root[name] as Record<string, unknown>;
}

describe('tool atom runtimes — issue #453', () => {
  // E24
  it.each(ALL_ADAPTERS)('$name: mcp.runtime "uvx" produces uvx command', ({ adapter, configPath, servers }) => {
    const atom = {
      kind: 'tool' as const,
      name: 'web-search',
      mcp: { runtime: 'uvx', package: 'web-search-mcp' }
    };
    const out = adapter.compileAtom(atom);
    expect(out.warnings).toEqual([]);
    expect(out.files).toHaveLength(1);
    expect(out.files[0].path).toBe(configPath('web-search'));
    const cfg = parseConfig(out.files[0].content);
    const server = readServer(cfg, servers, 'web-search');
    // opencode flattens `command` to an array; the others use {command, args}
    if (Array.isArray(server.command)) {
      expect(server.command).toEqual(['uvx', 'web-search-mcp']);
    } else {
      expect(server.command).toBe('uvx');
      expect(server.args).toEqual(['web-search-mcp']);
    }
  });

  // E25 — npx with extra args
  it.each(ALL_ADAPTERS)('$name: mcp.runtime "npx" produces npx -y command', ({ adapter, configPath, servers }) => {
    const atom = {
      kind: 'tool' as const,
      name: 'tool-x',
      mcp: { runtime: 'npx', package: 'my-mcp', args: ['--flag'] }
    };
    const out = adapter.compileAtom(atom);
    expect(out.warnings).toEqual([]);
    expect(out.files[0].path).toBe(configPath('tool-x'));
    const cfg = parseConfig(out.files[0].content);
    const server = readServer(cfg, servers, 'tool-x');
    if (Array.isArray(server.command)) {
      expect(server.command).toEqual(['npx', '-y', 'my-mcp', '--flag']);
    } else {
      expect(server.command).toBe('npx');
      expect(server.args).toEqual(['-y', 'my-mcp', '--flag']);
    }
  });

  // E26 — extensions fallback
  it.each(ALL_ADAPTERS)('$name: extensions.<adapter> produces MCP config when no mcp block', ({
    name,
    adapter,
    configPath,
    servers
  }) => {
    const atom = {
      kind: 'tool' as const,
      name: 'memory',
      extensions: {
        [name]: { command: 'uvx', args: ['mem-mcp'], env: { KEY: 'x' } }
      }
    };
    const out = adapter.compileAtom(atom);
    expect(out.warnings, `expected no warnings for ${name}, got: ${JSON.stringify(out.warnings)}`).toEqual([]);
    expect(out.files[0].path).toBe(configPath('memory'));
    const cfg = parseConfig(out.files[0].content);
    const server = readServer(cfg, servers, 'memory');
    if (Array.isArray(server.command)) {
      expect(server.command).toEqual(['uvx', 'mem-mcp']);
      // opencode uses `environment`, not `env`
      expect(server.environment).toEqual({ KEY: 'x' });
    } else {
      expect(server.command).toBe('uvx');
      expect(server.args).toEqual(['mem-mcp']);
      expect(server.env).toEqual({ KEY: 'x' });
    }
  });

  // E27 — no mcp, no extensions → preserve skip warning (regression guard)
  it.each(ALL_ADAPTERS)('$name: still skips tool with no mcp and no extensions for itself', ({ adapter }) => {
    const atom = {
      kind: 'tool' as const,
      name: 'orphan'
    };
    const out = adapter.compileAtom(atom);
    expect(out.files).toEqual([]);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0].level).toBe('skipped');
  });

  it('opencode does not consume extensions.cursor (extension bag is adapter-scoped)', () => {
    const atom = {
      kind: 'tool' as const,
      name: 'memory',
      extensions: {
        cursor: { command: 'uvx', args: ['mem-mcp'] }
      }
    };
    const out = opencodeAdapter.compileAtom(atom);
    expect(out.files).toEqual([]);
    expect(out.warnings[0].level).toBe('skipped');
  });
});
