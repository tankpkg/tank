import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

type ApplyProxyWrappingFn = (options: {
  skillName: string;
  skillDir: string;
  agentIds: string[];
  homedir?: string;
  tankBinaryPath?: string;
  dangerouslyNoTankProxy?: boolean;
  remove?: boolean;
}) => { wrapped: string[]; skipped: string[] };

type ValidateRemoteEnvFn = (input: {
  url: string;
  requiresAuth: boolean;
  env: Record<string, string | undefined>;
  envVarName?: string;
}) => { ok: true } | { ok: false; exitCode: 2; message: string; missingVar: string };

const AGENT_CONFIG_RELATIVE: Record<string, string> = {
  claude: '.claude/settings.json',
  cursor: '.cursor/mcp.json',
  opencode: '.config/opencode/mcp.json',
  codex: '.codex/config.json',
  openclaw: '.openclaw/mcp.json',
  universal: '.config/mcp/servers.json'
};

function readMcpServers(homedir: string, agentId: string): Record<string, { command: string; args: string[] }> {
  const configPath = path.join(homedir, AGENT_CONFIG_RELATIVE[agentId]!);
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as { mcpServers: Record<string, { command: string; args: string[] }> };
  return parsed.mcpServers;
}

function writeManifest(skillDir: string, manifest: unknown): void {
  writeFileSync(path.join(skillDir, 'tank.json'), JSON.stringify(manifest));
}

describe('Feature: Adapter rewriting + remote auth (Phase 6, @phase-6)', () => {
  let applyProxyWrapping: ApplyProxyWrappingFn;
  let validateRemoteProxyEnv: ValidateRemoteEnvFn;
  let homedir: string;
  let skillDir: string;

  beforeEach(async () => {
    const cliLib = (await import('../../../packages/cli/src/lib/apply-proxy-wrapping.js')) as {
      applyProxyWrapping: ApplyProxyWrappingFn;
    };
    applyProxyWrapping = cliLib.applyProxyWrapping;
    const proxyMod = (await import('@tankpkg/proxy')) as { validateRemoteProxyEnv: ValidateRemoteEnvFn };
    validateRemoteProxyEnv = proxyMod.validateRemoteProxyEnv;
    homedir = mkdtempSync(path.join(tmpdir(), 'tank-bdd-phase6-'));
    skillDir = path.join(homedir, 'skill');
    mkdirSync(skillDir, { recursive: true });
  });

  describe('Scenario: tank install rewrites agent config to use proxy wrapper (@C42 @E28 @happy-flow)', () => {
    it('claude settings.json contains the tank proxy wrapper entry for the installed skill', () => {
      try {
        writeManifest(skillDir, {
          name: '@org/mcp-tool',
          version: '1.0.0',
          mcp_server: { command: 'npx', args: ['@org/mcp-tool'] }
        });
        applyProxyWrapping({
          skillName: '@org/mcp-tool',
          skillDir,
          agentIds: ['claude'],
          homedir
        });
        const servers = readMcpServers(homedir, 'claude');
        expect(servers['@org/mcp-tool']).toEqual({
          command: 'tank',
          args: ['proxy', '--', 'npx', '@org/mcp-tool']
        });
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: proxy wrapping is the default — no flag needed (@C42)', () => {
    it('without opt-out, the agent config command is "tank" with proxy first arg', () => {
      try {
        writeManifest(skillDir, {
          name: '@org/tool',
          version: '1.0.0',
          mcp_server: { command: 'npx', args: ['@org/tool'] }
        });
        applyProxyWrapping({
          skillName: '@org/tool',
          skillDir,
          agentIds: ['claude'],
          homedir
        });
        const servers = readMcpServers(homedir, 'claude');
        expect(servers['@org/tool']?.command).toBe('tank');
        expect(servers['@org/tool']?.args[0]).toBe('proxy');
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: opt-out skips proxy wrapping (@C39 @E29)', () => {
    it('with dangerouslyNoTankProxy, the agent config uses the original command', () => {
      try {
        writeManifest(skillDir, {
          name: '@org/tool',
          version: '1.0.0',
          mcp_server: { command: 'npx', args: ['@org/tool'] }
        });
        applyProxyWrapping({
          skillName: '@org/tool',
          skillDir,
          agentIds: ['claude'],
          homedir,
          dangerouslyNoTankProxy: true
        });
        const servers = readMcpServers(homedir, 'claude');
        expect(servers['@org/tool']).toEqual({ command: 'npx', args: ['@org/tool'] });
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: remote MCP wrapped with --remote and env-var auth reference (@C47 @E30)', () => {
    it('agent config carries the proxy --remote wrapper plus TANK_MCP_AUTH_<SLUG> placeholder', () => {
      try {
        writeManifest(skillDir, {
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
        const servers = readMcpServers(homedir, 'claude') as Record<
          string,
          { command: string; args: string[]; env?: Record<string, string> }
        >;
        expect(servers['@org/remote-tool']).toEqual({
          command: 'tank',
          args: ['proxy', '--remote', 'https://remote.example.com/sse'],
          env: { TANK_MCP_AUTH_REMOTE_TOOL: '<agent-config-resolves-this>' }
        });
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: env-var slug follows TANK_MCP_AUTH_<PACKAGE_SLUG_UPPERCASED> (@C47)', () => {
    it('derives TANK_MCP_AUTH_SOME_COOL_TOOL for @vendor/some-cool-tool', () => {
      try {
        writeManifest(skillDir, {
          name: '@vendor/some-cool-tool',
          version: '1.0.0',
          mcp_server: { remote: 'https://r.example.com', requires_auth: true }
        });
        applyProxyWrapping({
          skillName: '@vendor/some-cool-tool',
          skillDir,
          agentIds: ['claude'],
          homedir
        });
        const servers = readMcpServers(homedir, 'claude') as Record<string, { env?: Record<string, string> }>;
        expect(Object.keys(servers['@vendor/some-cool-tool']?.env ?? {})).toContain('TANK_MCP_AUTH_SOME_COOL_TOOL');
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: missing auth env var causes proxy to fail loud with exit 2 (@C48 @fail-loud)', () => {
    it('validateRemoteProxyEnv returns exitCode=2 and the spec-exact error message', () => {
      try {
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
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario Outline: proxy wrapping works for all 6 supported agents (@C42)', () => {
    it.each([
      'claude',
      'cursor',
      'opencode',
      'codex',
      'openclaw',
      'universal'
    ])('agent %s gets the tank proxy wrapper entry in its config', (agentId) => {
      try {
        writeManifest(skillDir, {
          name: '@org/mcp-tool',
          version: '1.0.0',
          mcp_server: { command: 'npx', args: ['@org/mcp-tool'] }
        });
        applyProxyWrapping({
          skillName: '@org/mcp-tool',
          skillDir,
          agentIds: [agentId],
          homedir
        });
        const servers = readMcpServers(homedir, agentId);
        expect(servers['@org/mcp-tool']).toEqual({
          command: 'tank',
          args: ['proxy', '--', 'npx', '@org/mcp-tool']
        });
      } finally {
        rmSync(homedir, { recursive: true, force: true });
        homedir = mkdtempSync(path.join(tmpdir(), 'tank-bdd-phase6-'));
        skillDir = path.join(homedir, 'skill');
        mkdirSync(skillDir, { recursive: true });
      }
    });
  });

  describe('Scenario: existing non-proxy config is upgraded to proxy on reinstall (@C42 @edge-case)', () => {
    it('a reinstall replaces the direct-command entry with the proxy wrapper', () => {
      try {
        mkdirSync(path.join(homedir, '.claude'), { recursive: true });
        writeFileSync(
          path.join(homedir, '.claude', 'settings.json'),
          JSON.stringify({
            mcpServers: {
              '@org/mcp-tool': { command: 'npx', args: ['@org/mcp-tool'] }
            }
          })
        );
        writeManifest(skillDir, {
          name: '@org/mcp-tool',
          version: '1.0.0',
          mcp_server: { command: 'npx', args: ['@org/mcp-tool'] }
        });
        applyProxyWrapping({
          skillName: '@org/mcp-tool',
          skillDir,
          agentIds: ['claude'],
          homedir
        });
        const servers = readMcpServers(homedir, 'claude');
        expect(servers['@org/mcp-tool']?.command).toBe('tank');
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: tank binary path is honored when not in PATH (@C39 @edge-case)', () => {
    it('uses the explicit path /usr/local/bin/tank in the agent config', () => {
      try {
        writeManifest(skillDir, {
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
        const servers = readMcpServers(homedir, 'claude');
        expect(servers['@org/x']?.command).toBe('/usr/local/bin/tank');
      } finally {
        rmSync(homedir, { recursive: true, force: true });
      }
    });
  });
});
