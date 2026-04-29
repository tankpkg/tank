import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TANK_BIN = path.resolve(__dirname, '../../../packages/cli/dist/bin/tank.js');
const LIVE = process.env.TANK_BDD_LIVE === '1';

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runTankRemoteAgainst(
  url: string,
  home: string,
  requiresAuth = false,
  authEnv: string | null = null
): Promise<CliResult> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TANK_REGISTRY_URL: 'http://invalid.tank.local'
    };
    if (authEnv !== null) {
      const [varName, value] = authEnv.split('=');
      if (varName && value) env[varName] = value;
    }
    const args = ['proxy', '--remote', url];
    if (requiresAuth) args.push('--requires-auth');
    const child = spawn('node', [TANK_BIN, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'bdd', version: '1.0' } }
      })}\n`
    );
    setTimeout(() => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    }, 1500);

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 500);
    }, 8000);

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

describe('Feature: Phase 10 — real remote MCP proxy (@phase-10 @C3)', { timeout: 30000 }, () => {
  let sandbox: string;
  let home: string;

  beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'tank-bdd-p10-'));
    home = path.join(sandbox, 'home');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('Scenario: E43 — unreachable host fails loud without hanging (@C3 @fail-loud)', () => {
    it('exit code 1 with "unreachable" message when both StreamableHTTP and SSE fail', async () => {
      const result = await runTankRemoteAgainst('http://127.0.0.1:1/mcp', home);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toLowerCase()).toMatch(/unreachable|connect|econnrefused/);
    });
  });

  describe('Scenario: E44 — --requires-auth with missing env var exits 2 (@C48)', () => {
    it('exit code 2 with spec-exact message; no network I/O attempted', async () => {
      const result = await runTankRemoteAgainst('http://127.0.0.1:1/mcp', home, true, null);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('TANK_MCP_AUTH_127_0_0_1 not set');
    });
  });

  describe('Scenario: E40 — initialize roundtrip over fake HTTP MCP server', () => {
    it('proxy completes initialize against a Node-hosted MCP endpoint over StreamableHTTP', async () => {
      const { port, close } = await startFakeStreamableHttpServer();
      try {
        const result = await runTankRemoteAgainst(`http://127.0.0.1:${port}/mcp`, home);
        expect(result.stdout).toContain('"id":1');
        expect(result.stdout).toContain('"serverInfo"');
        const lines = result.stdout.split('\n').filter((l) => l.length > 0);
        const initResponse = lines
          .map((l) => safeJson(l))
          .find((p): p is { id: number; result: unknown } => p !== null && p.id === 1);
        expect(initResponse?.result).toBeDefined();
      } finally {
        close();
      }
    });
  });

  describe('Scenario: @live — real DeepWiki server (only with TANK_BDD_LIVE=1)', () => {
    it.skipIf(!LIVE)('tools/list returns the three DeepWiki tools through the proxy', async () => {
      const result = await runTankRemoteAgainst('https://mcp.deepwiki.com/mcp', home);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      const listResponse = lines
        .map((l) => safeJson(l))
        .find(
          (p): p is { id: number; result: { tools: Array<{ name: string }> } } =>
            p !== null &&
            p.id === 2 &&
            typeof p.result === 'object' &&
            p.result !== null &&
            Array.isArray((p.result as { tools?: unknown }).tools)
        );
      expect(listResponse?.result?.tools).toBeDefined();
      const toolNames = listResponse?.result.tools.map((t) => t.name) ?? [];
      expect(toolNames).toContain('read_wiki_structure');
      expect(toolNames).toContain('ask_question');
    });
  });
});

interface ParsedJsonRpc {
  id?: number | string;
  [k: string]: unknown;
}

function safeJson(line: string): ParsedJsonRpc | null {
  try {
    return JSON.parse(line) as ParsedJsonRpc;
  } catch {
    return null;
  }
}

async function startFakeStreamableHttpServer(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(handleRequest);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }
  let body = '';
  req.on('data', (c: Buffer) => {
    body += c.toString();
  });
  req.on('end', () => {
    let msg: { id?: unknown; method?: string } = {};
    try {
      msg = JSON.parse(body) as typeof msg;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (msg.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'fake-http-mcp', version: '1.0.0' }
        }
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } else if (msg.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: [{ name: 'fake_tool', description: 'Returns hi', inputSchema: { type: 'object' } }] }
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } else {
      res.writeHead(202);
      res.end();
    }
  });
}
