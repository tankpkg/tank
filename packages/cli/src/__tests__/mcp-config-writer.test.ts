import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_CONFIG_PATHS, getAgentConfigPath, writeMcpServerEntry } from '~/lib/mcp-config-writer.js';

let homedir: string;

beforeEach(() => {
  homedir = mkdtempSync(path.join(tmpdir(), 'tank-mcp-writer-'));
});

afterEach(() => {
  rmSync(homedir, { recursive: true, force: true });
});

describe('getAgentConfigPath — resolves per-agent config file locations', () => {
  it('returns .claude/settings.json for claude', () => {
    const p = getAgentConfigPath('claude', homedir);
    expect(p).toBe(path.join(homedir, '.claude', 'settings.json'));
  });

  it('returns .cursor/mcp.json for cursor', () => {
    expect(getAgentConfigPath('cursor', homedir)).toBe(path.join(homedir, '.cursor', 'mcp.json'));
  });

  it('returns .config/opencode/mcp.json for opencode', () => {
    expect(getAgentConfigPath('opencode', homedir)).toBe(path.join(homedir, '.config', 'opencode', 'mcp.json'));
  });

  it('returns .codex/config.json for codex', () => {
    expect(getAgentConfigPath('codex', homedir)).toBe(path.join(homedir, '.codex', 'config.json'));
  });

  it('returns .openclaw/mcp.json for openclaw', () => {
    expect(getAgentConfigPath('openclaw', homedir)).toBe(path.join(homedir, '.openclaw', 'mcp.json'));
  });

  it('returns .config/mcp/servers.json for universal', () => {
    expect(getAgentConfigPath('universal', homedir)).toBe(path.join(homedir, '.config', 'mcp', 'servers.json'));
  });

  it('returns null for an unknown agent id', () => {
    expect(getAgentConfigPath('unknown', homedir)).toBeNull();
  });

  it('AGENT_CONFIG_PATHS contains all 6 supported agents', () => {
    expect(Object.keys(AGENT_CONFIG_PATHS).sort()).toEqual([
      'claude',
      'codex',
      'cursor',
      'openclaw',
      'opencode',
      'universal'
    ]);
  });
});

describe('writeMcpServerEntry — creates the mcpServers entry for each agent', () => {
  const entry = { command: 'tank', args: ['proxy', '--', 'npx', '@org/mcp-tool'] };

  it('creates a new config file when none exists (claude)', () => {
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/mcp-tool',
      entry,
      homedir
    });
    const configPath = path.join(homedir, '.claude', 'settings.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers['@org/mcp-tool']).toEqual(entry);
  });

  it('merges into an existing config, preserving other keys', () => {
    const cursorDir = path.join(homedir, '.cursor');
    const configPath = path.join(cursorDir, 'mcp.json');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ existing: 'value' }));
    writeMcpServerEntry({
      agentId: 'cursor',
      skillName: '@org/x',
      entry,
      homedir
    });
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      existing: string;
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.existing).toBe('value');
    expect(parsed.mcpServers['@org/x']).toEqual(entry);
  });

  it('overwrites an existing entry with the same skill name', () => {
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/x',
      entry: { command: 'old', args: [] },
      homedir
    });
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/x',
      entry,
      homedir
    });
    const configPath = path.join(homedir, '.claude', 'settings.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(parsed.mcpServers['@org/x'].command).toBe('tank');
  });

  it('preserves sibling mcpServers entries (other installed skills)', () => {
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/a',
      entry: { command: 'a', args: [] },
      homedir
    });
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/b',
      entry: { command: 'b', args: [] },
      homedir
    });
    const parsed = JSON.parse(readFileSync(path.join(homedir, '.claude', 'settings.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(parsed.mcpServers).sort()).toEqual(['@org/a', '@org/b']);
  });

  it('includes env when the entry has env', () => {
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/x',
      entry: { command: 'tank', args: ['proxy'], env: { DEBUG: '1' } },
      homedir
    });
    const parsed = JSON.parse(readFileSync(path.join(homedir, '.claude', 'settings.json'), 'utf-8')) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    expect(parsed.mcpServers['@org/x'].env).toEqual({ DEBUG: '1' });
  });

  it('creates parent directories recursively (opencode under .config/opencode)', () => {
    writeMcpServerEntry({
      agentId: 'opencode',
      skillName: '@org/x',
      entry,
      homedir
    });
    const configPath = path.join(homedir, '.config', 'opencode', 'mcp.json');
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toHaveProperty(['mcpServers', '@org/x']);
  });

  it('throws on unknown agent id', () => {
    expect(() =>
      writeMcpServerEntry({
        agentId: 'unknown',
        skillName: '@org/x',
        entry,
        homedir
      })
    ).toThrow(/unknown agent/);
  });
});

describe('writeMcpServerEntry — removal', () => {
  it('removes an mcpServers entry when remove=true', () => {
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/x',
      entry: { command: 'tank', args: ['proxy'] },
      homedir
    });
    writeMcpServerEntry({
      agentId: 'claude',
      skillName: '@org/x',
      remove: true,
      homedir
    });
    const parsed = JSON.parse(readFileSync(path.join(homedir, '.claude', 'settings.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers['@org/x']).toBeUndefined();
  });

  it('removal on a config that does not exist is a no-op', () => {
    expect(() =>
      writeMcpServerEntry({
        agentId: 'claude',
        skillName: '@org/x',
        remove: true,
        homedir
      })
    ).not.toThrow();
  });
});
