import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { stdioUpstreamFromChild, type UpstreamTransport } from '~/transport/upstream-transport.js';

function fakeChild(): {
  messageIn: PassThrough;
  messageOut: PassThrough;
  exitFn: (code: number) => void;
  killCalls: NodeJS.Signals[];
  handle: {
    write(line: string): boolean;
    onMessage(cb: (line: string) => void): void;
    onExit(cb: (code: number) => void): void;
    kill(signal?: NodeJS.Signals): void;
  };
} {
  const messageIn = new PassThrough();
  const messageOut = new PassThrough();
  const messageHandlers: Array<(line: string) => void> = [];
  const exitHandlers: Array<(code: number) => void> = [];
  const killCalls: NodeJS.Signals[] = [];

  messageOut.setEncoding('utf8');
  let buf = '';
  messageOut.on('data', (chunk: string) => {
    buf += chunk;
    let i = buf.indexOf('\n');
    while (i !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.length > 0) for (const cb of messageHandlers) cb(line);
      i = buf.indexOf('\n');
    }
  });

  return {
    messageIn,
    messageOut,
    exitFn: (code) => {
      for (const cb of exitHandlers) cb(code);
    },
    killCalls,
    handle: {
      write(line: string) {
        return messageIn.write(line.endsWith('\n') ? line : `${line}\n`);
      },
      onMessage(cb) {
        messageHandlers.push(cb);
      },
      onExit(cb) {
        exitHandlers.push(cb);
      },
      kill(signal: NodeJS.Signals = 'SIGTERM') {
        killCalls.push(signal);
      }
    }
  };
}

describe('UpstreamTransport — minimum common contract', () => {
  it('stdioUpstreamFromChild wraps a StdioChildHandle losslessly', async () => {
    const child = fakeChild();
    const upstream: UpstreamTransport = stdioUpstreamFromChild(child.handle);

    const received: string[] = [];
    upstream.onMessage((line) => received.push(line));

    let exitCode: number | null = null;
    upstream.onExit((code) => {
      exitCode = code;
    });

    upstream.write('{"jsonrpc":"2.0","id":1}');
    expect(child.messageIn.read()?.toString()).toBe('{"jsonrpc":"2.0","id":1}\n');

    child.messageOut.write('{"jsonrpc":"2.0","id":1,"result":{}}\n');
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}']);

    child.exitFn(0);
    expect(exitCode).toBe(0);
  });

  it('close() forwards to the child kill() method', async () => {
    const child = fakeChild();
    const upstream = stdioUpstreamFromChild(child.handle);
    await upstream.close();
    expect(child.killCalls).toEqual(['SIGTERM']);
  });

  it('start() is a no-op for stdio since the child is already spawned', async () => {
    const child = fakeChild();
    const upstream = stdioUpstreamFromChild(child.handle);
    await expect(upstream.start()).resolves.toBeUndefined();
  });

  it('write() returns the bool the underlying child returned (backpressure signal)', () => {
    const child = fakeChild();
    const upstream = stdioUpstreamFromChild(child.handle);
    const result = upstream.write('line');
    expect(typeof result).toBe('boolean');
  });

  it('multiple messages flow through in order', async () => {
    const child = fakeChild();
    const upstream = stdioUpstreamFromChild(child.handle);
    const received: string[] = [];
    upstream.onMessage((line) => received.push(line));

    child.messageOut.write('{"a":1}\n{"b":2}\n{"c":3}\n');
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });
});
