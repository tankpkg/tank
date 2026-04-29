import type { StdioChildHandle } from './stdio-wrapper.ts';

export interface UpstreamTransport {
  start(): Promise<void>;
  write(line: string): boolean;
  onMessage(cb: (line: string) => void): void;
  onExit(cb: (code: number) => void): void;
  close(): Promise<void>;
}

export function stdioUpstreamFromChild(child: StdioChildHandle): UpstreamTransport {
  return {
    async start(): Promise<void> {
      return undefined;
    },
    write(line: string): boolean {
      return child.write(line);
    },
    onMessage(cb: (line: string) => void): void {
      child.onMessage(cb);
    },
    onExit(cb: (code: number) => void): void {
      child.onExit(cb);
    },
    async close(): Promise<void> {
      child.kill('SIGTERM');
    }
  };
}
