import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_RING_SIZE, ROTATION_THRESHOLD_BYTES, rotateIfNeeded } from '~/audit/rotator.js';

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tank-audit-rotator-'));
  auditPath = join(tmpDir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('rotateIfNeeded (C38)', () => {
  it('exposes ROTATION_THRESHOLD_BYTES = 10 MB per plan Phase 4', () => {
    expect(ROTATION_THRESHOLD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('exposes MAX_RING_SIZE = 5 per plan Phase 4', () => {
    expect(MAX_RING_SIZE).toBe(5);
  });

  it('does nothing when file does not exist', () => {
    rotateIfNeeded(auditPath);
    expect(existsSync(auditPath)).toBe(false);
  });

  it('does nothing when file is under the threshold', () => {
    writeFileSync(auditPath, 'x'.repeat(1024));
    rotateIfNeeded(auditPath);
    expect(existsSync(auditPath)).toBe(true);
    expect(existsSync(`${auditPath}.1`)).toBe(false);
  });

  it('rotates audit.jsonl to audit.jsonl.1 when threshold is exceeded', () => {
    writeFileSync(auditPath, 'x'.repeat(ROTATION_THRESHOLD_BYTES + 1));
    rotateIfNeeded(auditPath);
    expect(existsSync(auditPath)).toBe(false);
    expect(existsSync(`${auditPath}.1`)).toBe(true);
    expect(statSync(`${auditPath}.1`).size).toBe(ROTATION_THRESHOLD_BYTES + 1);
  });

  it('shifts existing rotated files: .1→.2, .2→.3, etc.', () => {
    writeFileSync(`${auditPath}.1`, 'old-1');
    writeFileSync(`${auditPath}.2`, 'old-2');
    writeFileSync(auditPath, 'x'.repeat(ROTATION_THRESHOLD_BYTES + 1));
    rotateIfNeeded(auditPath);
    expect(readFileSync(`${auditPath}.2`, 'utf-8')).toBe('old-1');
    expect(readFileSync(`${auditPath}.3`, 'utf-8')).toBe('old-2');
    expect(statSync(`${auditPath}.1`).size).toBe(ROTATION_THRESHOLD_BYTES + 1);
  });

  it('drops the oldest file when the ring is full (audit.jsonl.5 is deleted)', () => {
    for (let i = 1; i <= 5; i++) {
      writeFileSync(`${auditPath}.${i}`, `ring-${i}`);
    }
    writeFileSync(auditPath, 'x'.repeat(ROTATION_THRESHOLD_BYTES + 1));
    rotateIfNeeded(auditPath);
    expect(readFileSync(`${auditPath}.1`, 'utf-8').length).toBe(ROTATION_THRESHOLD_BYTES + 1);
    expect(readFileSync(`${auditPath}.2`, 'utf-8')).toBe('ring-1');
    expect(readFileSync(`${auditPath}.5`, 'utf-8')).toBe('ring-4');
    expect(existsSync(`${auditPath}.6`)).toBe(false);
  });

  it('is idempotent: calling twice with an under-threshold file does not rotate', () => {
    writeFileSync(auditPath, 'tiny');
    rotateIfNeeded(auditPath);
    rotateIfNeeded(auditPath);
    expect(readFileSync(auditPath, 'utf-8')).toBe('tiny');
    expect(existsSync(`${auditPath}.1`)).toBe(false);
  });

  it('leaves audit.jsonl absent after rotation so the logger can create a fresh genesis entry', () => {
    writeFileSync(auditPath, 'x'.repeat(ROTATION_THRESHOLD_BYTES + 1));
    rotateIfNeeded(auditPath);
    expect(existsSync(auditPath)).toBe(false);
  });
});

describe('rotator + logger integration: chain resets after rotation', () => {
  it('after rotation, the next appended entry has prev_hash=null (fresh genesis)', async () => {
    const { createAuditLogger } = await import('~/audit/logger.js');
    writeFileSync(auditPath, 'x'.repeat(ROTATION_THRESHOLD_BYTES + 1));
    const logger = createAuditLogger(auditPath);
    await logger.append({ method: 'tools/call', verdict: 'pass', tool_name: 'post-rotation' });
    const content = readFileSync(auditPath, 'utf-8');
    const entries = content
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    expect(entries).toHaveLength(1);
    expect(entries[0].prev_hash).toBeNull();
    expect(existsSync(`${auditPath}.1`)).toBe(true);
  });
});
