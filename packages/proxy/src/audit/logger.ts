import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  method: string;
  tool_name?: string;
  verdict: 'pass' | 'block';
  reason?: string;
}

export interface AuditLogger {
  append(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>;
  path: string;
}

export function createAuditLogger(logPath: string): AuditLogger {
  let directoryReady = false;

  async function ensureDirectory(): Promise<void> {
    if (directoryReady) return;
    await mkdir(dirname(logPath), { recursive: true });
    directoryReady = true;
  }

  return {
    path: logPath,
    async append(partial) {
      const entry: AuditEntry = { timestamp: new Date().toISOString(), ...partial };
      const line = `${JSON.stringify(entry)}\n`;

      try {
        await ensureDirectory();
        await appendFile(logPath, line, { encoding: 'utf8' });
      } catch (err) {
        // Proxy MUST remain available when audit write fails — Phase 1 prioritizes
        // availability over auditability. Phase 4 adds fallback path + alerting;
        // do not silently convert this to hard-fail before then.
        process.stderr.write(`[tank-proxy] audit write failed: ${(err as Error).message}\n`);
      }
    }
  };
}
