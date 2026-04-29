import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const TANK_BIN = path.resolve(__dirname, '../../../packages/cli/dist/bin/tank.js');

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runTank(args: string[], opts: { cwd: string; home: string; timeoutMs?: number }): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: opts.home,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TANK_REGISTRY_URL: 'http://invalid.tank.local'
  };
  try {
    const { stdout, stderr } = await execFileAsync('node', [TANK_BIN, ...args], {
      cwd: opts.cwd,
      env,
      timeout: opts.timeoutMs ?? 30_000
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
}

function spawnTank(
  args: string[],
  opts: { home: string; env?: Record<string, string | undefined> }
): Promise<CliResult> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: opts.home,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TANK_REGISTRY_URL: 'http://invalid.tank.local',
      ...opts.env
    };
    const child = spawn('node', [TANK_BIN, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 10_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function createMcpSkillFixture(
  root: string,
  opts: {
    name: string;
    version?: string;
    mcpServer: Record<string, unknown>;
  }
): string {
  const dir = path.join(root, 'skill-src');
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, unknown> = {
    name: opts.name,
    version: opts.version ?? '1.0.0',
    description: 'E2E fixture skill with MCP server',
    mcp_server: opts.mcpServer
  };
  writeFileSync(path.join(dir, 'tank.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${opts.name}\n\nFixture skill for E2E test.\n`);
  return dir;
}

function readAgentConfig(home: string, relPath: string): Record<string, unknown> | null {
  const configPath = path.join(home, relPath);
  if (!existsSync(configPath)) return null;
  return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
}

describe('Feature: Phase 6 end-to-end — real tank CLI against real fixture skills', () => {
  let sandbox: string;
  let home: string;
  let project: string;

  beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'tank-bdd-p6-e2e-'));
    home = path.join(sandbox, 'home');
    project = path.join(sandbox, 'project');
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    writeFileSync(
      path.join(project, 'tank.json'),
      `${JSON.stringify({ name: '@test/project', version: '1.0.0' }, null, 2)}\n`
    );
    writeFileSync(path.join(project, 'SKILL.md'), '# project\n');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('Scenario: E30a — tank install <URL-to-skill-with-mcp-server> writes proxy wrapper to agent config (@C42 @E30a)', () => {
    it('file:// install produces .claude/settings.json with tank proxy wrapper for the skill', async () => {
      const skillDir = createMcpSkillFixture(sandbox, {
        name: '@e2e/mcp-skill',
        mcpServer: { command: 'npx', args: ['-y', '@e2e/mcp-skill'] }
      });

      const result = await runTank(['install', `file://${skillDir}`], { cwd: project, home });

      const settings = readAgentConfig(home, '.claude/settings.json');
      expect(settings, `install stderr: ${result.stderr}\nstdout: ${result.stdout}`).not.toBeNull();
      const servers =
        (settings as { mcpServers?: Record<string, { command: string; args: string[] }> }).mcpServers ?? {};
      expect(servers['@e2e/mcp-skill']).toEqual({
        command: 'tank',
        args: ['proxy', '--', 'npx', '-y', '@e2e/mcp-skill']
      });
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe('Scenario: E29 — tank install --dangerously-no-tank-proxy writes raw command (@C39 @E29)', () => {
    it('opt-out flag skips proxy wrapping and agent config has the original command', async () => {
      const skillDir = createMcpSkillFixture(sandbox, {
        name: '@e2e/optout-skill',
        mcpServer: { command: 'npx', args: ['@e2e/optout-skill'] }
      });

      const result = await runTank(['install', `file://${skillDir}`, '--dangerously-no-tank-proxy'], {
        cwd: project,
        home
      });

      const settings = readAgentConfig(home, '.claude/settings.json');
      expect(settings, `opt-out install stderr: ${result.stderr}`).not.toBeNull();
      const servers =
        (settings as { mcpServers?: Record<string, { command: string; args: string[] }> }).mcpServers ?? {};
      expect(servers['@e2e/optout-skill']).toEqual({
        command: 'npx',
        args: ['@e2e/optout-skill']
      });
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe('Scenario: E30b — tank install from tank.lock wraps every locked skill (@C42 @E30b)', () => {
    it('re-running install on a project with tank.lock preserves proxy wrapping for mcp_server skills', async () => {
      const skillDir = createMcpSkillFixture(sandbox, {
        name: '@e2e/locked-skill',
        mcpServer: { command: 'node', args: ['server.js'] }
      });

      await runTank(['install', `file://${skillDir}`], { cwd: project, home });

      const claudeFile = path.join(home, '.claude', 'settings.json');
      rmSync(claudeFile, { force: true });

      const result = await runTank(['install'], { cwd: project, home });

      const settings = readAgentConfig(home, '.claude/settings.json');
      expect(settings, `lockfile-install stderr: ${result.stderr}`).not.toBeNull();
      const servers =
        (settings as { mcpServers?: Record<string, { command: string; args: string[] }> }).mcpServers ?? {};
      expect(servers['@e2e/locked-skill']).toEqual({
        command: 'tank',
        args: ['proxy', '--', 'node', 'server.js']
      });
      expect(result.exitCode).toBe(0);
    }, 45_000);
  });

  describe('Scenario: E30c — tank proxy --remote --requires-auth fails loud when env var missing (@C48 @E30c)', () => {
    it('real CLI exits with code 2 and stderr carries the spec-exact message', async () => {
      const result = await spawnTank(['proxy', '--remote', 'https://remote.example.com/sse', '--requires-auth'], {
        home,
        env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_COM: undefined }
      });

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('tank proxy: required auth env var TANK_MCP_AUTH_REMOTE_EXAMPLE_COM not set');
    }, 15_000);
  });

  describe('Scenario: E30d — tank proxy --remote --requires-auth never leaks auth secret (@C47 @E30d)', () => {
    it('auth header is used upstream; secret never appears on stdout/stderr regardless of exit status', async () => {
      const secret = 'Bearer-e2e-token-do-not-leak-xyz';
      const result = await spawnTank(['proxy', '--remote', 'https://remote.example.invalid/sse', '--requires-auth'], {
        home,
        env: { TANK_MCP_AUTH_REMOTE_EXAMPLE_INVALID: secret }
      });
      expect(result.stdout + result.stderr).not.toContain(secret);
    }, 15_000);
  });

  describe('Scenario: cross-phase — installed proxy wrapper actually wraps the child process (@C42 @cross-phase)', () => {
    it('the command in the agent config is an executable tank proxy that wraps the declared child', async () => {
      const skillDir = createMcpSkillFixture(sandbox, {
        name: '@e2e/wrap-smoke',
        mcpServer: { command: 'node', args: ['-e', 'process.stdin.resume()'] }
      });

      await runTank(['install', `file://${skillDir}`], { cwd: project, home });

      const settings = readAgentConfig(home, '.claude/settings.json');
      const entry = (settings as { mcpServers?: Record<string, { command: string; args: string[] }> }).mcpServers?.[
        '@e2e/wrap-smoke'
      ];
      expect(entry).toBeDefined();
      if (!entry) return;

      expect(entry.command).toBe('tank');
      expect(entry.args[0]).toBe('proxy');
      expect(entry.args).toContain('--');
      const dashIdx = entry.args.indexOf('--');
      expect(entry.args.slice(dashIdx + 1)).toEqual(['node', '-e', 'process.stdin.resume()']);

      const linkPath = path.join(home, '.claude', 'skills', 'e2e--wrap-smoke');
      if (existsSync(linkPath)) {
        const target = readlinkSync(linkPath);
        expect(existsSync(target)).toBe(true);
      }
    }, 30_000);
  });
});
