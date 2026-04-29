import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startProxy } from '../proxy.ts';

describe('startProxy — Phase 1 stdio pass-through + audit', () => {
  let tmpDir: string;
  let auditPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tank-proxy-e2e-'));
    auditPath = join(tmpDir, 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('forwards agent request to child and response back to agent', async () => {
    const agentIn = new PassThrough();
    const agentOut = new PassThrough();

    const mockChildScript = `
      process.stdin.setEncoding('utf8');
      let buf = '';
      process.stdin.on('data', (chunk) => {
        buf += chunk;
        let i = buf.indexOf('\\n');
        while (i !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          const msg = JSON.parse(line);
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } }) + '\\n');
          i = buf.indexOf('\\n');
        }
      });
    `;

    const handle = await startProxy({
      command: 'node',
      args: ['-e', mockChildScript],
      auditPath,
      stdin: agentIn,
      stdout: agentOut
    });

    const received: string[] = [];
    agentOut.setEncoding('utf8');
    let outBuf = '';
    agentOut.on('data', (chunk: string) => {
      outBuf += chunk;
      let i = outBuf.indexOf('\n');
      while (i !== -1) {
        received.push(outBuf.slice(0, i));
        outBuf = outBuf.slice(i + 1);
        i = outBuf.indexOf('\n');
      }
    });

    agentIn.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');

    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(1);
    const parsed = JSON.parse(received[0]!);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed.result).toEqual({ tools: [] });

    handle.kill();
    await handle.exitCode;
  });

  it('writes audit entries for inbound tools/call with tool_name', async () => {
    const agentIn = new PassThrough();
    const agentOut = new PassThrough();

    const mockChildScript = `
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', () => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\\n');
      });
    `;

    const handle = await startProxy({
      command: 'node',
      args: ['-e', mockChildScript],
      auditPath,
      permissionBudget: null,
      stdin: agentIn,
      stdout: agentOut
    });

    agentOut.on('data', () => {});

    agentIn.write(
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/etc/passwd"}}}\n'
    );

    await new Promise((r) => setTimeout(r, 300));

    const content = readFileSync(auditPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const toolCallEntry = lines.map((l) => JSON.parse(l)).find((e) => e.method === 'tools/call');
    expect(toolCallEntry).toBeDefined();
    expect(toolCallEntry.tool_name).toBe('read_file');
    expect(toolCallEntry.verdict).toBe('pass');

    handle.kill();
    await handle.exitCode;
  });

  it('audit entries do not contain tool arguments or secrets (@C37)', async () => {
    const agentIn = new PassThrough();
    const agentOut = new PassThrough();

    const handle = await startProxy({
      command: 'node',
      args: ['-e', 'process.stdin.on("data", () => {})'],
      auditPath,
      stdin: agentIn,
      stdout: agentOut
    });

    agentIn.write(
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"exec","arguments":{"token":"sk-live-SECRET123"}}}\n'
    );

    await new Promise((r) => setTimeout(r, 200));

    const content = readFileSync(auditPath, 'utf8');
    expect(content).not.toContain('sk-live-SECRET123');
    expect(content).not.toContain('arguments');

    handle.kill();
    await handle.exitCode;
  });

  it('emits JSON-RPC parse error for malformed inbound JSON (@C4 edge-case)', async () => {
    const agentIn = new PassThrough();
    const agentOut = new PassThrough();

    const handle = await startProxy({
      command: 'node',
      args: ['-e', 'process.stdin.on("data", () => {})'],
      auditPath,
      stdin: agentIn,
      stdout: agentOut
    });

    const received: string[] = [];
    agentOut.setEncoding('utf8');
    let buf = '';
    agentOut.on('data', (chunk: string) => {
      buf += chunk;
      let i = buf.indexOf('\n');
      while (i !== -1) {
        received.push(buf.slice(0, i));
        buf = buf.slice(i + 1);
        i = buf.indexOf('\n');
      }
    });

    agentIn.write('{"jsonrpc":"2.0",id:}\n');

    await new Promise((r) => setTimeout(r, 200));

    expect(received.length).toBeGreaterThan(0);
    const errResp = JSON.parse(received[0]!);
    expect(errResp.error.code).toBe(-32700);

    handle.kill();
    await handle.exitCode;
  });

  it('handles 50 rapid sequential requests in order (@C4 perf)', async () => {
    const agentIn = new PassThrough();
    const agentOut = new PassThrough();

    const mockChildScript = `
      process.stdin.setEncoding('utf8');
      let buf = '';
      process.stdin.on('data', (chunk) => {
        buf += chunk;
        let i = buf.indexOf('\\n');
        while (i !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          const msg = JSON.parse(line);
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }) + '\\n');
          i = buf.indexOf('\\n');
        }
      });
    `;

    const handle = await startProxy({
      command: 'node',
      args: ['-e', mockChildScript],
      auditPath,
      stdin: agentIn,
      stdout: agentOut
    });

    const N = 50;
    const received: string[] = [];
    agentOut.setEncoding('utf8');
    let buf = '';

    // Resolve as soon as N responses have been received so the measurement
    // reflects actual end-to-end proxy throughput, not a fixed sleep floor.
    // Hard timeout (5s) protects against hangs without bounding the metric.
    const allReceived = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`only got ${received.length}/${N} in 5s`)), 5000);
      agentOut.on('data', (chunk: string) => {
        buf += chunk;
        let i = buf.indexOf('\n');
        while (i !== -1) {
          received.push(buf.slice(0, i));
          buf = buf.slice(i + 1);
          i = buf.indexOf('\n');
        }
        if (received.length >= N) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const start = Date.now();
    for (let i = 1; i <= N; i++) {
      agentIn.write(`{"jsonrpc":"2.0","id":${i},"method":"tools/call","params":{"name":"noop"}}\n`);
    }
    await allReceived;
    const elapsed = Date.now() - start;

    expect(received).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      expect(JSON.parse(received[i]!).id).toBe(i + 1);
    }
    // End-to-end roundtrip ceiling: <20ms/msg including a Node child process hop.
    // True proxy overhead (parse + audit write + pipe) is sub-millisecond; the
    // budget accommodates OS scheduling + child interpreter variance on CI.
    const perMsgMs = elapsed / N;
    expect(perMsgMs).toBeLessThan(20);

    handle.kill();
    await handle.exitCode;
  });
});
