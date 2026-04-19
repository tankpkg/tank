import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditLogger } from '../audit/logger.ts';

describe('createAuditLogger — Phase 1 minimal JSONL', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tank-proxy-audit-'));
    logPath = join(tmpDir, 'proxy', 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates parent directory on first write', async () => {
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/list', verdict: 'pass' });
    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('"method":"tools/list"');
  });

  it('writes minimal field set: timestamp, method, verdict', async () => {
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/list', verdict: 'pass' });
    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('method', 'tools/list');
    expect(entry).toHaveProperty('verdict', 'pass');
  });

  it('includes tool_name when provided', async () => {
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/call', tool_name: 'read_file', verdict: 'pass' });
    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(entry.tool_name).toBe('read_file');
  });

  it('includes reason when provided (Phase 2+ forward-compat)', async () => {
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/call', tool_name: 'exec', verdict: 'block', reason: 'tool_poisoning' });
    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(entry.verdict).toBe('block');
    expect(entry.reason).toBe('tool_poisoning');
  });

  it('appends entries as newline-delimited JSONL', async () => {
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/list', verdict: 'pass' });
    await logger.append({ method: 'tools/call', tool_name: 'read_file', verdict: 'pass' });
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).method).toBe('tools/list');
    expect(JSON.parse(lines[1]!).tool_name).toBe('read_file');
  });

  it('emits timestamp in ISO 8601 format', async () => {
    const before = Date.now();
    const logger = createAuditLogger(logPath);
    await logger.append({ method: 'tools/list', verdict: 'pass' });
    const after = Date.now();
    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    const ts = Date.parse(entry.timestamp);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
