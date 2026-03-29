import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startProxy } from '../proxy/server.ts';
import { buildAgentEnv } from '../runner/run.ts';
import { VaultStore } from '../tokenizer/vault.ts';

const REAL_STRIPE = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';

describe('run E2E — real process through real proxy', () => {
  let mockProviderPort: number;
  let mockProviderServer: ReturnType<typeof createServer>;
  let providerLog: string[];

  beforeAll(async () => {
    providerLog = [];
    mockProviderServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString();
      });
      req.on('end', () => {
        providerLog.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'Done.' } }]
          })
        );
      });
    });
    await new Promise<void>((resolve) => mockProviderServer.listen(0, resolve));
    const addr = mockProviderServer.address();
    mockProviderPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(() => {
    mockProviderServer.close();
  });

  it('spawns a child process with proxy env vars and credentials are redacted in traffic', async () => {
    const vault = new VaultStore();
    const proxy = await startProxy(vault);

    const agentScript = path.join(os.tmpdir(), `tank-vault-e2e-agent-${Date.now()}.mjs`);
    fs.writeFileSync(
      agentScript,
      `
      const proxyUrl = process.env.TANK_VAULT_PROXY_URL || process.env.HTTPS_PROXY;
      const targetUrl = process.env.TEST_TARGET_URL;
      if (!proxyUrl || !targetUrl) {
        console.error('Missing env vars');
        process.exit(1);
      }
      const body = JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Use key ${REAL_STRIPE} for Stripe' }]
      });
      const res = await fetch(proxyUrl + '/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Target-URL': targetUrl + '/v1/chat/completions'
        },
        body
      });
      const data = await res.json();
      console.log(JSON.stringify({ status: res.status, response: data }));
    `
    );

    const env = buildAgentEnv('https-proxy', proxy.url, {
      ...process.env,
      TANK_VAULT_PROXY_URL: proxy.url,
      TEST_TARGET_URL: `http://localhost:${mockProviderPort}`
    });

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const child = spawn('node', [agentScript], {
        env: env as Record<string, string>,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"status":200');

    const providerBody = providerLog[providerLog.length - 1]!;
    expect(providerBody).not.toContain(REAL_STRIPE);

    const parsed = JSON.parse(providerBody);
    const fwdMsg = parsed.messages[0].content as string;
    expect(fwdMsg).toContain('sk_live_');
    expect(fwdMsg).not.toContain(REAL_STRIPE);

    expect(vault.size).toBeGreaterThan(0);

    fs.unlinkSync(agentScript);
    await proxy.close();
  });

  it('child process exit code is captured correctly', async () => {
    const vault = new VaultStore();
    const proxy = await startProxy(vault);

    const agentScript = path.join(os.tmpdir(), `tank-vault-e2e-exit-${Date.now()}.mjs`);
    fs.writeFileSync(agentScript, 'process.exit(42);');

    const env = buildAgentEnv('https-proxy', proxy.url, { ...process.env });

    const result = await new Promise<number>((resolve) => {
      const child = spawn('node', [agentScript], {
        env: env as Record<string, string>,
        stdio: 'pipe'
      });
      child.on('close', (code) => resolve(code ?? 1));
    });

    expect(result).toBe(42);

    fs.unlinkSync(agentScript);
    await proxy.close();
  });
});
