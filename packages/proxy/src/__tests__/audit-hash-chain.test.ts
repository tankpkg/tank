import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditLogger } from '~/audit/logger.js';

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tank-audit-chain-'));
  auditPath = join(tmpDir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function readEntries(): Array<Record<string, unknown>> {
  return readFileSync(auditPath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function canonicalize(entry: unknown): string {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return JSON.stringify(entry);
  }
  const obj = entry as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('createAuditLogger: hash chain (C36)', () => {
  it('first entry has prev_hash set to null (genesis)', async () => {
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'read_file' });
    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.prev_hash).toBeNull();
  });

  it('second entry prev_hash equals SHA-256 of canonicalized first entry', async () => {
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'read_file' });
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'write_file' });
    const entries = readEntries();
    expect(entries).toHaveLength(2);
    const expected = sha256Hex(canonicalize(entries[0]));
    expect(entries[1]?.prev_hash).toBe(expected);
  });

  it('3-entry chain: each entry links to the canonicalized prior entry', async () => {
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'a' });
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'b' });
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'c' });
    const entries = readEntries();
    expect(entries[1]?.prev_hash).toBe(sha256Hex(canonicalize(entries[0])));
    expect(entries[2]?.prev_hash).toBe(sha256Hex(canonicalize(entries[1])));
  });

  it('canonicalization produces key-order-independent hashes', () => {
    const a = { timestamp: 't', tool_name: 'x', verdict: 'pass' };
    const b = { verdict: 'pass', tool_name: 'x', timestamp: 't' };
    expect(sha256Hex(canonicalize(a))).toBe(sha256Hex(canonicalize(b)));
  });

  it('surviving proxy restart: new logger continues the chain from disk', async () => {
    const first = createAuditLogger(auditPath);
    await first.append({ method: 'tools/call', verdict: 'pass', tool_name: 'a' });
    const second = createAuditLogger(auditPath);
    await second.append({ method: 'tools/call', verdict: 'pass', tool_name: 'b' });
    const entries = readEntries();
    expect(entries).toHaveLength(2);
    expect(entries[1]?.prev_hash).toBe(sha256Hex(canonicalize(entries[0])));
  });

  it('every entry has a timestamp, method, verdict, and prev_hash field', async () => {
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/call', verdict: 'pass' });
    const [entry] = readEntries();
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('method', 'tools/call');
    expect(entry).toHaveProperty('verdict', 'pass');
    expect(entry).toHaveProperty('prev_hash', null);
  });

  it('block entries carry reason and still hash-chain correctly', async () => {
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/list', verdict: 'block', reason: 'poisoning_detected' });
    await logger.append({ method: 'tools/call', verdict: 'block', reason: 'domain_not_allowed', tool_name: 'fetch' });
    const entries = readEntries();
    expect(entries[0]?.reason).toBe('poisoning_detected');
    expect(entries[1]?.prev_hash).toBe(sha256Hex(canonicalize(entries[0])));
  });
});
