import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditLogger } from '~/audit/logger.js';
import { verifyAuditChain } from '~/audit/verifier.js';

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tank-audit-verify-'));
  auditPath = join(tmpDir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function writeEntries(count: number): Promise<void> {
  const logger = createAuditLogger(auditPath);
  for (let i = 0; i < count; i++) {
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: `tool_${i}` });
  }
}

describe('verifyAuditChain (C36)', () => {
  it('returns ok=true for an untampered 5-entry chain', async () => {
    await writeEntries(5);
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(5);
    expect(result.brokenAtIndex).toBeNull();
  });

  it('returns ok=true for a single-entry chain (genesis only)', async () => {
    await writeEntries(1);
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(1);
  });

  it('returns ok=true for an empty file (no entries to verify)', () => {
    writeFileSync(auditPath, '');
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(0);
  });

  it('returns ok=false with brokenAtIndex when entry 3 is tampered (5 entries)', async () => {
    await writeEntries(5);
    const raw = readFileSync(auditPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const tampered = lines.map((line, i) => {
      if (i !== 2) return line;
      const obj = JSON.parse(line) as Record<string, unknown>;
      obj.verdict = 'block';
      return JSON.stringify(obj);
    });
    writeFileSync(auditPath, `${tampered.join('\n')}\n`);
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(false);
    expect(result.brokenAtIndex).toBe(3);
    expect(result.reason).toContain('prev_hash mismatch');
  });

  it('returns ok=false when the first entry has a non-null prev_hash (genesis invariant)', async () => {
    await writeEntries(2);
    const lines = readFileSync(auditPath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);
    const tamperedFirst = JSON.parse(lines[0]) as Record<string, unknown>;
    tamperedFirst.prev_hash = 'sha256:forged';
    writeFileSync(auditPath, `${JSON.stringify(tamperedFirst)}\n${lines[1]}\n`);
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
    expect(result.reason).toContain('genesis');
  });

  it('returns ok=false when a line is malformed JSON', async () => {
    await writeEntries(3);
    const lines = readFileSync(auditPath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);
    lines[1] = `${lines[1]}!!not-json!!`;
    writeFileSync(auditPath, `${lines.join('\n')}\n`);
    const result = verifyAuditChain(auditPath);
    expect(result.ok).toBe(false);
    expect(result.brokenAtIndex).toBeGreaterThanOrEqual(0);
  });

  it('returns ok=true when file does not exist (nothing to verify)', () => {
    const result = verifyAuditChain(join(tmpDir, 'does-not-exist.jsonl'));
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(0);
  });

  it('points to the exact first broken entry even when multiple later entries also mismatch', async () => {
    await writeEntries(6);
    const lines = readFileSync(auditPath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);
    const mutated = lines.map((line, i) => {
      if (i !== 1) return line;
      const obj = JSON.parse(line) as Record<string, unknown>;
      obj.reason = 'tampered';
      return JSON.stringify(obj);
    });
    writeFileSync(auditPath, `${mutated.join('\n')}\n`);
    const result = verifyAuditChain(auditPath);
    expect(result.brokenAtIndex).toBe(2);
  });
});
