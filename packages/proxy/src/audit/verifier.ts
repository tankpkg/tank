import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { canonicalizeSchema } from '../scanner/canonicalize.ts';
import type { AuditEntry } from './logger.ts';

export interface ChainVerificationResult {
  ok: boolean;
  entriesVerified: number;
  brokenAtIndex: number | null;
  reason: string | null;
}

function hashEntry(entry: AuditEntry): string {
  return createHash('sha256').update(canonicalizeSchema(entry)).digest('hex');
}

function parseEntry(line: string): AuditEntry | null {
  try {
    return JSON.parse(line) as AuditEntry;
  } catch {
    return null;
  }
}

function buildFailure(index: number, reason: string): ChainVerificationResult {
  return { ok: false, entriesVerified: index, brokenAtIndex: index, reason };
}

export function verifyAuditChain(logPath: string): ChainVerificationResult {
  if (!existsSync(logPath)) {
    return { ok: true, entriesVerified: 0, brokenAtIndex: null, reason: null };
  }
  const raw = readFileSync(logPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { ok: true, entriesVerified: 0, brokenAtIndex: null, reason: null };
  }

  let expectedPrevHash: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const entry = parseEntry(lines[i] ?? '');
    if (entry === null) {
      return buildFailure(i, `entry ${i + 1}: malformed JSON`);
    }
    if (entry.prev_hash !== expectedPrevHash) {
      const kind = i === 0 ? 'genesis prev_hash must be null' : 'prev_hash mismatch';
      return buildFailure(i, `entry ${i + 1}: ${kind}`);
    }
    expectedPrevHash = hashEntry(entry);
  }
  return { ok: true, entriesVerified: lines.length, brokenAtIndex: null, reason: null };
}
