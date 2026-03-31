import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ProxyServer, startProxy } from '../proxy/server.ts';
import { VaultStore } from '../tokenizer/vault.ts';

const REAL_STRIPE = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
const REAL_AWS = 'AKIAIOSFODNN7EXAMPLE';

const BOOTSTRAP_PATH = path.resolve(import.meta.dirname, '..', 'proxy', 'bootstrap.cjs');

function runScript(
  script: string,
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = path.join(os.tmpdir(), `tank-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(scriptPath, script);
  return new Promise((resolve) => {
    const child = spawn('node', ['--require', BOOTSTRAP_PATH, scriptPath], {
      env,
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
      fs.unlinkSync(scriptPath);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

describe('transparent proxy — real fetch() interception via bootstrap', () => {
  let targetServer: ReturnType<typeof createServer>;
  let targetPort: number;
  let targetLog: string[];
  let proxy: ProxyServer;
  let vault: VaultStore;

  beforeAll(async () => {
    targetLog = [];
    targetServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString();
      });
      req.on('end', () => {
        targetLog.push(body);
        const parsed = JSON.parse(body);
        const msg = parsed.messages?.[0]?.content ?? '';
        const fakeInMsg = msg.match(/sk_live_\w+/)?.[0] ?? 'none';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: `Use stripe.api_key = "${fakeInMsg}" to charge` } }]
          })
        );
      });
    });
    await new Promise<void>((resolve) => targetServer.listen(0, resolve));
    const addr = targetServer.address();
    targetPort = typeof addr === 'object' && addr ? addr.port : 0;

    vault = new VaultStore();
    proxy = await startProxy(vault);
  });

  afterAll(async () => {
    await proxy.close();
    targetServer.close();
  });

  it('child process fetch() is transparently intercepted — credentials redacted, response restored', async () => {
    const script = `
      const res = await fetch('http://127.0.0.1:${targetPort}/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Use Stripe key ${REAL_STRIPE} to charge $50' }]
        })
      });
      const data = await res.json();
      console.log(JSON.stringify(data));
    `;

    const result = await runScript(script, {
      PATH: process.env.PATH ?? '',
      TANK_VAULT_PROXY_URL: proxy.url
    });

    if (result.code !== 0) {
      throw new Error(
        `Child process failed (code ${result.code}):\nstderr: ${result.stderr}\nstdout: ${result.stdout}`
      );
    }

    const lastTargetBody = targetLog[targetLog.length - 1] as string;
    expect(lastTargetBody).not.toContain(REAL_STRIPE);

    const parsed = JSON.parse(lastTargetBody);
    const fwdContent = parsed.messages[0].content as string;
    expect(fwdContent).toContain('sk_live_');
    expect(fwdContent).not.toContain(REAL_STRIPE);
    const fake = fwdContent.match(/sk_live_\w+/)![0]!;
    expect(fake).toHaveLength(REAL_STRIPE.length);

    const responseData = JSON.parse(result.stdout.trim());
    expect(responseData.choices[0].message.content).toContain(REAL_STRIPE);
    expect(responseData.choices[0].message.content).not.toContain(fake);
  });

  it('child process fetch() to non-AI endpoint passes through unmodified', async () => {
    const beforeCount = targetLog.length;
    const script = `
      const res = await fetch('http://127.0.0.1:${targetPort}/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'SELECT 1' })
      });
      const data = await res.text();
      console.log('ok');
    `;

    const result = await runScript(script, {
      PATH: process.env.PATH ?? '',
      TANK_VAULT_PROXY_URL: proxy.url
    });

    expect(result.code).toBe(0);
    expect(targetLog[beforeCount]).toBe('{"query":"SELECT 1"}');
  });

  it('session consistency — same credential gets same fake across multiple fetch calls in one process', async () => {
    const newVault = new VaultStore();
    const newProxy = await startProxy(newVault);
    const beforeCount = targetLog.length;

    const script = `
      async function callAI(msg) {
      const res = await fetch('http://127.0.0.1:${targetPort}/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: msg }]
          })
        });
        return res.json();
      }
      await callAI('Key is ${REAL_STRIPE}');
      await callAI('Again: ${REAL_STRIPE}');
      console.log('done');
    `;

    const result = await runScript(script, {
      PATH: process.env.PATH ?? '',
      TANK_VAULT_PROXY_URL: newProxy.url
    });

    expect(result.code).toBe(0);

    const body1 = JSON.parse(targetLog[beforeCount]!);
    const body2 = JSON.parse(targetLog[beforeCount + 1]!);
    const fake1 = (body1.messages[0].content as string).match(/sk_live_\w+/)![0];
    const fake2 = (body2.messages[0].content as string).match(/sk_live_\w+/)![0];
    expect(fake1).toBe(fake2);
    expect(fake1).not.toBe(REAL_STRIPE);

    await newProxy.close();
  });

  it('multiple credential types are all redacted in a single fetch', async () => {
    const newVault = new VaultStore();
    const newProxy = await startProxy(newVault);
    const beforeCount = targetLog.length;

    const script = `
      const res = await fetch('http://127.0.0.1:${targetPort}/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Stripe: ${REAL_STRIPE} AWS: ${REAL_AWS}' }]
        })
      });
      console.log('ok');
    `;

    const result = await runScript(script, {
      PATH: process.env.PATH ?? '',
      TANK_VAULT_PROXY_URL: newProxy.url
    });

    expect(result.code).toBe(0);

    const body = targetLog[beforeCount]!;
    expect(body).not.toContain(REAL_STRIPE);
    expect(body).not.toContain(REAL_AWS);

    await newProxy.close();
  });

  it('without bootstrap, fetch goes directly to target — credentials exposed (control test)', async () => {
    const beforeCount = targetLog.length;
    const scriptPath = path.join(os.tmpdir(), `tank-vault-control-${Date.now()}.mjs`);
    fs.writeFileSync(
      scriptPath,
      `
      const res = await fetch('http://127.0.0.1:${targetPort}/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Key: ${REAL_STRIPE}' }]
        })
      });
      console.log('ok');
    `
    );

    const result = await new Promise<{ code: number }>((resolve) => {
      const child = spawn('node', [scriptPath], {
        env: { PATH: process.env.PATH ?? '' },
        stdio: 'pipe'
      });
      child.on('close', (code) => {
        fs.unlinkSync(scriptPath);
        resolve({ code: code ?? 1 });
      });
    });

    expect(result.code).toBe(0);
    expect(targetLog[beforeCount]).toContain(REAL_STRIPE);
  });
});
