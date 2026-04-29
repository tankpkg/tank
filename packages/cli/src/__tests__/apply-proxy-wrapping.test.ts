import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyProxyWrapping } from '~/lib/apply-proxy-wrapping.js';

let homedir: string;
let skillDir: string;

beforeEach(() => {
  homedir = mkdtempSync(path.join(tmpdir(), 'tank-apply-proxy-wrap-'));
  skillDir = path.join(homedir, 'skill');
  mkdirSync(skillDir, { recursive: true });
});

afterEach(() => {
  rmSync(homedir, { recursive: true, force: true });
});

function writeManifest(content: unknown): string {
  const p = path.join(skillDir, 'tank.json');
  writeFileSync(p, JSON.stringify(content));
  return p;
}

function readMcp(agentId: string, skillName: string): unknown {
  const pathsByAgent: Record<string, string> = {
    claude: path.join(homedir, '.claude', 'settings.json'),
    cursor: path.join(homedir, '.cursor', 'mcp.json')
  };
  const config = JSON.parse(readFileSync(pathsByAgent[agentId]!, 'utf-8')) as {
    mcpServers: Record<string, unknown>;
  };
  return config.mcpServers[skillName];
}

describe('applyProxyWrapping — skill manifest → agent configs', () => {
  it('does nothing when the manifest has no mcp_server', () => {
    writeManifest({ name: '@org/no-mcp', version: '1.0.0' });
    const result = applyProxyWrapping({
      skillName: '@org/no-mcp',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    expect(result.wrapped).toEqual([]);
    expect(result.skipped).toEqual(['no-mcp-server']);
  });

  it('wraps a local MCP into each agent config (claude, cursor)', () => {
    writeManifest({
      name: '@org/mcp-tool',
      version: '1.0.0',
      mcp_server: { command: 'npx', args: ['@org/mcp-tool'] }
    });
    const result = applyProxyWrapping({
      skillName: '@org/mcp-tool',
      skillDir,
      agentIds: ['claude', 'cursor'],
      homedir
    });
    expect(result.wrapped.sort()).toEqual(['claude', 'cursor']);
    expect(readMcp('claude', '@org/mcp-tool')).toEqual({
      command: 'tank',
      args: ['proxy', '--', 'npx', '@org/mcp-tool']
    });
    expect(readMcp('cursor', '@org/mcp-tool')).toEqual({
      command: 'tank',
      args: ['proxy', '--', 'npx', '@org/mcp-tool']
    });
  });

  it('respects dangerouslyNoTankProxy (opt-out) and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeManifest({
      name: '@org/mcp-tool',
      version: '1.0.0',
      mcp_server: { command: 'npx', args: ['@org/mcp-tool'] }
    });
    applyProxyWrapping({
      skillName: '@org/mcp-tool',
      skillDir,
      agentIds: ['claude'],
      homedir,
      dangerouslyNoTankProxy: true
    });
    expect(readMcp('claude', '@org/mcp-tool')).toEqual({
      command: 'npx',
      args: ['@org/mcp-tool']
    });
    const warnArg = warnSpy.mock.calls[0]?.[0] as string | undefined;
    expect(warnArg).toContain('Proxy disabled for @org/mcp-tool');
    warnSpy.mockRestore();
  });

  it('wraps a remote MCP with auth env reference', () => {
    writeManifest({
      name: '@org/remote-tool',
      version: '1.0.0',
      mcp_server: { remote: 'https://remote.example.com/sse', requires_auth: true }
    });
    applyProxyWrapping({
      skillName: '@org/remote-tool',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    expect(readMcp('claude', '@org/remote-tool')).toEqual({
      command: 'tank',
      args: ['proxy', '--remote', 'https://remote.example.com/sse'],
      env: { TANK_MCP_AUTH_REMOTE_TOOL: '<agent-config-resolves-this>' }
    });
  });

  it('returns no-manifest when tank.json is missing', () => {
    const result = applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    expect(result.skipped).toEqual(['no-manifest']);
    expect(result.wrapped).toEqual([]);
  });

  it('returns invalid-manifest on malformed tank.json', () => {
    writeFileSync(path.join(skillDir, 'tank.json'), 'not-json');
    const result = applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    expect(result.skipped).toEqual(['invalid-manifest']);
  });

  it('returns invalid-mcp-server when mcp_server fails schema validation', () => {
    writeManifest({
      name: '@org/x',
      version: '1.0.0',
      mcp_server: { command: '', args: [] }
    });
    const result = applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    expect(result.skipped).toEqual(['invalid-mcp-server']);
  });

  it('honors custom tankBinaryPath', () => {
    writeManifest({
      name: '@org/x',
      version: '1.0.0',
      mcp_server: { command: 'npx', args: [] }
    });
    applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir,
      tankBinaryPath: '/usr/local/bin/tank'
    });
    expect(readMcp('claude', '@org/x')).toMatchObject({
      command: '/usr/local/bin/tank'
    });
  });

  it('unwraps (removes mcp_server entry) when remove=true', () => {
    writeManifest({
      name: '@org/x',
      version: '1.0.0',
      mcp_server: { command: 'npx', args: [] }
    });
    applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir
    });
    applyProxyWrapping({
      skillName: '@org/x',
      skillDir,
      agentIds: ['claude'],
      homedir,
      remove: true
    });
    const parsed = JSON.parse(readFileSync(path.join(homedir, '.claude', 'settings.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers['@org/x']).toBeUndefined();
  });
});
