import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonicalizeSchema } from '../scanner/canonicalize.ts';

export interface AuditEntry {
  timestamp: string;
  method: string;
  tool_name?: string;
  verdict: 'pass' | 'block';
  reason?: string;
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

  async function ensureDirectory(): Promise<void> {
    if (directoryReady) return;
    await mkdir(dirname(logPath), { recursive: true });
    directoryReady = true;
  }

  return {
    path: logPath,
    async append(partial) {
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        prev_hash: previousHash,
        ...partial
      };
      const line = `${JSON.stringify(entry)}\n`;

      try {
        await ensureDirectory();
        await appendFile(logPath, line, { encoding: 'utf8' });
        previousHash = hashEntry(entry);
      } catch (err) {
        process.stderr.write(`[tank-proxy] audit write failed: ${(err as Error).message}\n`);
      }
    }
  };
}
