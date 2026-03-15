import pino from 'pino';

const lokiUrl = process.env.LOKI_URL || 'http://localhost:3100';

const MAX_BUFFER_SIZE = 1000;

// Buffer logs and push to Loki via HTTP (no worker threads — compatible with Next.js dev)
const logBuffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

async function flushToLoki() {
  if (logBuffer.length === 0) return;

  const logs = logBuffer.splice(0);
  const values: [string, string][] = logs.map((line) => {
    try {
      const parsed = JSON.parse(line);
      // Loki expects nanoseconds
      const ts = parsed.time ? String(new Date(parsed.time).getTime() * 1_000_000) : String(Date.now() * 1_000_000);
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
        streams: [
          {
            stream: { app: 'tank-web' },
            values
          }
        ]
      })
    });
    consecutiveFailures = 0;
  } catch {
    consecutiveFailures++;

    if (consecutiveFailures >= 10) {
      process.stderr.write(
        `[logger] Loki unreachable after ${consecutiveFailures} consecutive failures — dropping ${logs.length} logs\n`
      );
      return;
    }

    if (logBuffer.length + logs.length > MAX_BUFFER_SIZE) {
      const capacity = MAX_BUFFER_SIZE - logBuffer.length;
      if (capacity > 0) {
        logBuffer.unshift(...logs.slice(-capacity));
      }
    } else {
      logBuffer.unshift(...logs);
    }
  }
}

const lokiStream = {
  write(line: string) {
    logBuffer.push(line.trimEnd());
    if (!flushTimer) {
      flushTimer = setInterval(flushToLoki, 2000);
    }
    if (logBuffer.length >= 50) {
      void flushToLoki();
    }
  }
};

export const log = pino(
  {
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      }
    }
  },
  pino.multistream([
    { stream: process.stdout, level: 'debug' },
    { stream: lokiStream as unknown as pino.DestinationStream, level: 'debug' }
  ])
);

export const authLog = log.child({ module: 'cli-auth' });
export const apiLog = log.child({ module: 'api' });
export const dbLog = log.child({ module: 'db' });
