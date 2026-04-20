import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';

type StartProxyFn = (options: {
  command: string;
  args: string[];
  auditPath?: string;
  pinsDir?: string;
  registryPath?: string;
  permissionBudget?: unknown;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  allowlist?: string[];
}) => Promise<{ exitCode: Promise<number>; kill(signal?: NodeJS.Signals): void }>;

type VerifyFn = (logPath: string) => {
  ok: boolean;
  entriesVerified: number;
  brokenAtIndex: number | null;
  reason: string | null;
};

const PASS_THROUGH_CHILD = `
  process.stdin.setEncoding('utf8');
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i = buf.indexOf('\\n');
    while (i !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      if (msg.method === 'tools/call') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: 'ok' } }) + '\\n');
      }
      i = buf.indexOf('\\n');
    }
  });
`;

async function runCalls(startProxy: StartProxyFn, auditPath: string, toolNames: string[]): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'tank-bdd-phase4-scratch-'));
  const agentIn = new PassThrough();
  const agentOut = new PassThrough();
  const handle = await startProxy({
    command: 'node',
    args: ['-e', PASS_THROUGH_CHILD],
    auditPath,
    pinsDir: join(tmpDir, 'pins'),
    registryPath: join(tmpDir, 'registry.jsonl'),
    permissionBudget: null,
    stdin: agentIn,
    stdout: agentOut,
    allowlist: ['/**']
  });
  agentOut.on('data', () => {});
  let id = 1;
  for (const name of toolNames) {
    agentIn.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: {} } })}\n`
    );
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  handle.kill('SIGTERM');
  await handle.exitCode.catch(() => 0);
  rmSync(tmpDir, { recursive: true, force: true });
}

function readEntries(auditPath: string): Array<Record<string, unknown>> {
  return readFileSync(auditPath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function canonicalize(entry: unknown): string {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return JSON.stringify(entry);
  const obj = entry as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('Feature: Audit hash chain + rotation (Phase 4, @phase-4)', () => {
  let startProxy: StartProxyFn;
  let verifyAuditChain: VerifyFn;
  let tmpDir: string;
  let auditPath: string;

  beforeEach(async () => {
    const mod = (await import('@tankpkg/proxy')) as { startProxy: StartProxyFn; verifyAuditChain: VerifyFn };
    startProxy = mod.startProxy;
    verifyAuditChain = mod.verifyAuditChain;
    tmpDir = mkdtempSync(join(tmpdir(), 'tank-bdd-phase4-'));
    auditPath = join(tmpDir, 'audit.jsonl');
  });

  describe('Scenario: first entry prev_hash=null, subsequent entries chain (@C36)', () => {
    it('two tool calls produce a chained log where entry 2 prev_hash = sha256(canonicalize(entry 1))', async () => {
      try {
        await runCalls(startProxy, auditPath, ['read_file', 'write_file']);
        const entries = readEntries(auditPath);
        const toolCalls = entries.filter((e) => e.method === 'tools/call');
        expect(toolCalls.length).toBeGreaterThanOrEqual(2);
        expect(entries[0]?.prev_hash).toBeNull();
        const second = entries[1];
        expect(second?.prev_hash).toBe(sha256Hex(canonicalize(entries[0])));
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: verifyAuditChain passes on untampered log (@C36)', () => {
    it('verification succeeds on a fresh 3-call chain', async () => {
      try {
        await runCalls(startProxy, auditPath, ['a', 'b', 'c']);
        const result = verifyAuditChain(auditPath);
        expect(result.ok).toBe(true);
        expect(result.entriesVerified).toBeGreaterThanOrEqual(3);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: tampering entry 2 breaks verification (@C36 @tamper-evident)', () => {
    it('editing an entry mid-chain makes verifyAuditChain report brokenAtIndex', async () => {
      try {
        await runCalls(startProxy, auditPath, ['first', 'second', 'third', 'fourth']);
        const lines = readFileSync(auditPath, 'utf-8')
          .split('\n')
          .filter((l) => l.length > 0);
        const tampered = lines.map((line, i) => {
          if (i !== 1) return line;
          const obj = JSON.parse(line) as Record<string, unknown>;
          obj.tool_name = 'TAMPERED';
          return JSON.stringify(obj);
        });
        writeFileSync(auditPath, `${tampered.join('\n')}\n`);
        const result = verifyAuditChain(auditPath);
        expect(result.ok).toBe(false);
        expect(result.brokenAtIndex).toBe(2);
        expect(result.reason).toContain('prev_hash mismatch');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: rotation at 10MB threshold produces audit.jsonl.1 (@C38)', () => {
    it('pre-seeded 11 MB log rotates on the next append and preserves the rotated copy', async () => {
      try {
        const big = 'x'.repeat(11 * 1024 * 1024);
        writeFileSync(auditPath, big);
        await runCalls(startProxy, auditPath, ['post-rotation']);
        const rotated = `${auditPath}.1`;
        expect(readFileSync(rotated, 'utf-8').length).toBeGreaterThan(10 * 1024 * 1024);
        const fresh = readEntries(auditPath);
        expect(fresh.length).toBeGreaterThan(0);
        expect(fresh[0]?.prev_hash).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: rotation ring caps at 5 files (@C38)', () => {
    it('pre-seeding .1..5 + oversized live log drops .5 during rotation', async () => {
      try {
        for (let i = 1; i <= 5; i++) {
          writeFileSync(`${auditPath}.${i}`, `ring-${i}`);
        }
        const big = 'x'.repeat(11 * 1024 * 1024);
        writeFileSync(auditPath, big);
        await runCalls(startProxy, auditPath, ['trigger']);
        expect(readFileSync(`${auditPath}.2`, 'utf-8')).toBe('ring-1');
        expect(readFileSync(`${auditPath}.5`, 'utf-8')).toBe('ring-4');
        expect(() => readFileSync(`${auditPath}.6`)).toThrow();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Scenario: post-rotation chain is fresh genesis (@C38 @C36)', () => {
    it('first entry after rotation has prev_hash=null and verifies cleanly', async () => {
      try {
        writeFileSync(auditPath, 'x'.repeat(11 * 1024 * 1024));
        await runCalls(startProxy, auditPath, ['a', 'b']);
        const fresh = readEntries(auditPath);
        expect(fresh[0]?.prev_hash).toBeNull();
        const second = fresh[1];
        if (second) {
          expect(second.prev_hash).toBe(sha256Hex(canonicalize(fresh[0])));
        }
        expect(verifyAuditChain(auditPath).ok).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
