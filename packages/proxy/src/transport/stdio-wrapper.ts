import { spawn } from 'node:child_process';

export interface StdioChildHandle {
  write(line: string): boolean;
  onMessage(cb: (line: string) => void): void;
  onExit(cb: (code: number) => void): void;
  kill(signal?: NodeJS.Signals): void;
}

export function spawnChild(command: string, args: string[]): StdioChildHandle {
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  if (child.stdin === null || child.stdout === null) {
    throw new Error('spawnChild: failed to obtain stdin/stdout pipes');
  }
  const childStdin = child.stdin;
  const childStdout = child.stdout;

  const messageHandlers: Array<(line: string) => void> = [];
  const exitHandlers: Array<(code: number) => void> = [];

  // Line-buffer stdout for NDJSON framing per MCP spec 2025-06-18: messages are
  // newline-delimited and MUST NOT contain embedded newlines. Accumulate partial
  // reads until a newline arrives, then dispatch one whole line at a time.
  let buffer = '';
  childStdout.setEncoding('utf8');
  childStdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        for (const cb of messageHandlers) cb(line);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });

  child.once('exit', (code, signal) => {
    const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
    for (const cb of exitHandlers) cb(exitCode);
  });

  child.once('error', () => {
    for (const cb of exitHandlers) cb(1);
  });

  return {
    write(line: string): boolean {
      // Contract: callers provide a pre-framed NDJSON line WITHOUT a trailing
      // newline. We append it here so misuse cannot emit double-newlines or
      // split a single message across two stdin writes.
      const framed = line.endsWith('\n') ? line : `${line}\n`;
      return childStdin.write(framed);
    },
    onMessage(cb) {
      messageHandlers.push(cb);
    },
    onExit(cb) {
      exitHandlers.push(cb);
    },
    kill(signal = 'SIGTERM') {
      child.kill(signal);
    }
  };
}
