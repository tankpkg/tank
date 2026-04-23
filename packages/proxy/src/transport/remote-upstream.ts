import type { UpstreamTransport } from './upstream-transport.ts';

export interface SdkLikeTransport {
  start(): Promise<void>;
  send(message: unknown, options?: unknown): Promise<void>;
  close(): Promise<void>;
  onclose?: () => void;
  onerror?: (err: Error) => void;
  onmessage?: (message: unknown, extra?: unknown) => void;
  sessionId?: string;
}

export interface RemoteUpstreamHandle extends UpstreamTransport {
  sessionId?: () => string | undefined;
}

export function remoteUpstreamFromSdkTransport(sdk: SdkLikeTransport, alreadyStarted = false): RemoteUpstreamHandle {
  const messageHandlers: Array<(line: string) => void> = [];
  const exitHandlers: Array<(code: number) => void> = [];
  let closed = false;
  let started = alreadyStarted;

  sdk.onmessage = (message) => {
    if (closed) return;
    const line = JSON.stringify(message);
    for (const cb of messageHandlers) cb(line);
  };

  sdk.onerror = (_err) => {
    if (closed) return;
    closed = true;
    for (const cb of exitHandlers) cb(1);
  };

  sdk.onclose = () => {
    if (closed) return;
    closed = true;
    for (const cb of exitHandlers) cb(0);
  };

  function write(line: string): boolean {
    if (closed) return false;
    const trimmed = line.endsWith('\n') ? line.slice(0, -1) : line;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      closed = true;
      for (const cb of exitHandlers) cb(1);
      return false;
    }
    void sdk.send(parsed).catch(() => {
      if (closed) return;
      closed = true;
      for (const cb of exitHandlers) cb(1);
    });
    return true;
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    try {
      await sdk.close();
    } finally {
      for (const cb of exitHandlers) cb(0);
    }
  }

  return {
    async start(): Promise<void> {
      if (started) return;
      started = true;
      await sdk.start();
    },
    write,
    onMessage(cb): void {
      messageHandlers.push(cb);
    },
    onExit(cb): void {
      exitHandlers.push(cb);
    },
    close,
    sessionId(): string | undefined {
      return sdk.sessionId;
    }
  };
}
