import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonicalizeSchema } from '../scanner/canonicalize.ts';
import { rotateIfNeeded } from './rotator.ts';

export interface AuditEntry {
  timestamp: string;
  method: string;
  tool_name?: string;
  verdict: 'pass' | 'block';
  reason?: string;
  source_tool?: string;
  prev_hash: string | null;
}

export interface AuditLogger {
  append(entry: Omit<AuditEntry, 'timestamp' | 'prev_hash'>): Promise<void>;
  path: string;
}

function hashEntry(entry: AuditEntry): string {
  return createHash('sha256').update(canonicalizeSchema(entry)).digest('hex');
}

function readLastEntryHash(logPath: string): string | null {
  if (!existsSync(logPath)) return null;
  const raw = readFileSync(logPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const lastLine = lines[lines.length - 1];
  if (!lastLine) return null;
  try {
    const parsed = JSON.parse(lastLine) as unknown;
    return hashEntry(parsed as AuditEntry);
  } catch {
    return null;
  }
}

export function createAuditLogger(logPath: string): AuditLogger {
  let directoryReady = false;
  let previousHash: string | null = readLastEntryHash(logPath);
  let writeChain: Promise<void> = Promise.resolve();

  async function ensureDirectory(): Promise<void> {
    if (directoryReady) return;
    await mkdir(dirname(logPath), { recursive: true });
    directoryReady = true;
  }

  async function appendOne(partial: Omit<AuditEntry, 'timestamp' | 'prev_hash'>): Promise<void> {
    try {
      await ensureDirectory();
      rotateIfNeeded(logPath);
      if (!existsSync(logPath)) previousHash = null;
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        prev_hash: previousHash,
        ...partial
      };
      const line = `${JSON.stringify(entry)}\n`;
      await appendFile(logPath, line, { encoding: 'utf8' });
      previousHash = hashEntry(entry);
    } catch (err) {
      process.stderr.write(`[tank-proxy] audit write failed: ${(err as Error).message}\n`);
    }
  }

  return {
    path: logPath,
    append(partial) {
      writeChain = writeChain.then(() => appendOne(partial));
      return writeChain;
    }
  };
}
