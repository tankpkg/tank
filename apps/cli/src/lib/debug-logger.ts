import pino from 'pino';
import { writeFileSync, appendFileSync } from 'node:fs';

const lokiUrl = process.env.TANK_LOKI_URL || 'http://localhost:3100';
const debugEnabled = process.env.TANK_DEBUG === '1' || process.env.TANK_DEBUG === 'true';

// Buffer logs and push to Loki via HTTP (avoids pino.transport() worker thread serialization issues)
const logBuffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushToLoki() {
  if (logBuffer.length === 0) return;

  const logs = logBuffer.splice(0);
  const values: [string, string][] = logs.map((line) => {
    try {
      const parsed = JSON.parse(line);
      const ts = parsed.time
        ? String(new Date(parsed.time).getTime() * 1_000_000)
        : String(Date.now() * 1_000_000);
      return [ts, line];
    } catch {
      return [String(Date.now() * 1_000_000), line];
    }
  });

  try {
    await fetch(`${lokiUrl}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streams: [{ stream: { app: 'tank-cli' }, values }],
      }),
    });
  } catch {
    logBuffer.unshift(...logs);
  }
}

const lokiStream = {
  write(line: string) {
    const trimmed = line.trimEnd();
    logBuffer.push(trimmed);

    if (debugEnabled) {
      try {
        appendFileSync('/tmp/tank-cli-debug.log', trimmed + '\n');
      } catch {}
    }

    if (!flushTimer) {
      flushTimer = setInterval(flushToLoki, 2000);
    }
    if (logBuffer.length >= 50) {
      void flushToLoki();
    }
  },
};

export const debugLog = pino(
  {
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  },
  lokiStream as unknown as pino.DestinationStream,
);

export const httpLog = debugLog.child({ module: 'http' });
export const authFlowLog = debugLog.child({ module: 'auth-flow' });

/**
 * Flush pending logs before process exit.
 * Call this at the end of CLI commands to ensure logs are delivered.
 */
export async function flushLogs(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushToLoki();
}
