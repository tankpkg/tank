import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remoteUpstreamFromSdkTransport, type SdkLikeTransport } from '~/transport/remote-upstream.js';

let sendCalls: unknown[] = [];
let startCalls = 0;
let closeCalls = 0;

function fakeSdkTransport(): SdkLikeTransport {
  const transport: SdkLikeTransport = {
    async start() {
      startCalls++;
    },
    async send(msg, _opts) {
      sendCalls.push(msg);
    },
    async close() {
      closeCalls++;
      if (transport.onclose) transport.onclose();
    }
  };
  return transport;
}

beforeEach(() => {
  sendCalls = [];
  startCalls = 0;
  closeCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('remoteUpstreamFromSdkTransport — wraps SDK Transport as UpstreamTransport', () => {
  it('start() calls underlying transport.start()', async () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    await upstream.start();
    expect(startCalls).toBe(1);
  });

  it('write(line) parses JSON and forwards as a JSONRPCMessage via send()', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    upstream.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
    expect(sendCalls).toEqual([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
  });

  it('write() is tolerant of a trailing newline', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    upstream.write('{"jsonrpc":"2.0","method":"ping"}\n');
    expect(sendCalls).toEqual([{ jsonrpc: '2.0', method: 'ping' }]);
  });

  it('write() returns true (no backpressure for async sends)', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    expect(upstream.write('{"jsonrpc":"2.0"}')).toBe(true);
  });

  it('onMessage callback fires when underlying transport emits onmessage', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    const received: string[] = [];
    upstream.onMessage((line) => received.push(line));

    sdk.onmessage?.({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    sdk.onmessage?.({ jsonrpc: '2.0', id: 2, result: { ok: false } });

    expect(received).toEqual([
      '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
      '{"jsonrpc":"2.0","id":2,"result":{"ok":false}}'
    ]);
  });

  it('multiple onMessage handlers all receive each message', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    const a: string[] = [];
    const b: string[] = [];
    upstream.onMessage((l) => a.push(l));
    upstream.onMessage((l) => b.push(l));
    sdk.onmessage?.({ jsonrpc: '2.0', id: 1 });
    expect(a).toEqual(['{"jsonrpc":"2.0","id":1}']);
    expect(b).toEqual(['{"jsonrpc":"2.0","id":1}']);
  });

  it('onExit fires with code 0 when the transport closes cleanly', async () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    let exitCode: number | null = null;
    upstream.onExit((code) => {
      exitCode = code;
    });
    await upstream.close();
    expect(exitCode).toBe(0);
  });

  it('onExit fires with code 1 when the transport emits onerror', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    let exitCode: number | null = null;
    upstream.onExit((code) => {
      exitCode = code;
    });
    sdk.onerror?.(new Error('upstream broke'));
    expect(exitCode).toBe(1);
  });

  it('close() is idempotent', async () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    await upstream.close();
    await upstream.close();
    expect(closeCalls).toBe(1);
  });

  it('write() after close() is a no-op and does not throw', async () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    await upstream.close();
    expect(() => upstream.write('{"x":1}')).not.toThrow();
    expect(sendCalls).toEqual([]);
  });

  it('malformed JSON on write() reports via onExit(1) without crashing', () => {
    const sdk = fakeSdkTransport();
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    let exitCode: number | null = null;
    upstream.onExit((code) => {
      exitCode = code;
    });
    upstream.write('not-valid-json');
    expect(exitCode).toBe(1);
  });

  it('propagates sessionId from the underlying transport when available', () => {
    const sdk = fakeSdkTransport();
    sdk.sessionId = 'sess-123';
    const upstream = remoteUpstreamFromSdkTransport(sdk);
    expect(upstream.sessionId?.()).toBe('sess-123');
  });
});
