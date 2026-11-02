import { createConnection, createServer, type Socket } from 'node:net';

import { type OwnedTestRedis, verifyAuthRedis } from '../fixtures/auth-isolation.js';

type Acquisition<T> = { kind: 'ready'; value: T } | { kind: 'failed'; error: unknown };

/** Stop progressing at the deadline, but await and close any late-owned resource. */
export async function acquireOwnedBeforeDeadline<T>(
  create: () => Promise<T>,
  close: (resource: T) => Promise<void>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: signal.reason });
  const pending: Promise<Acquisition<T>> = Promise.resolve()
    .then(() => {
      if (signal.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: signal.reason });
      return create();
    })
    .then(
      (value) => ({ kind: 'ready', value }),
      (error: unknown) => ({ kind: 'failed', error })
    );
  let onAbort = () => {};
  const aborted = new Promise<{ kind: 'aborted' }>((resolve) => {
    onAbort = () => resolve({ kind: 'aborted' });
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const first = await Promise.race([pending, aborted]);
    if (first.kind !== 'aborted' && !signal.aborted) {
      if (first.kind === 'failed') throw first.error;
      return first.value;
    }
    const timeout = new Error('Owned fixture setup deadline exceeded', { cause: signal.reason });
    const final = first.kind === 'aborted' ? await pending : first;
    if (final.kind === 'failed') throw new AggregateError([timeout, final.error], 'Fixture setup failed after timeout');
    try {
      await close(final.value);
    } catch (error) {
      throw new AggregateError([timeout, error], 'Late fixture cleanup failed');
    }
    throw timeout;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function waitForOrAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: signal.reason });
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('Owned fixture setup deadline exceeded', { cause: signal.reason }));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

interface RedisFrame {
  bytes: number;
  arguments: string[];
}

function parseRedisFrame(buffer: Buffer): RedisFrame | undefined {
  if (buffer[0] !== 42) throw new Error('Unexpected Redis request framing');
  const firstLine = buffer.indexOf('\r\n');
  if (firstLine < 0) return undefined;
  const countText = buffer.toString('ascii', 1, firstLine);
  if (!/^\d+$/.test(countText) || Number(countText) > 1_000) throw new Error('Invalid Redis argument count');
  const args: string[] = [];
  let offset = firstLine + 2;
  for (let index = 0; index < Number(countText); index++) {
    if (offset >= buffer.length) return undefined;
    if (buffer[offset] !== 36) throw new Error('Unexpected Redis argument framing');
    const end = buffer.indexOf('\r\n', offset);
    if (end < 0) return undefined;
    const lengthText = buffer.toString('ascii', offset + 1, end);
    if (!/^\d+$/.test(lengthText) || Number(lengthText) > 2_000_000) throw new Error('Invalid Redis argument length');
    const start = end + 2;
    const stop = start + Number(lengthText);
    if (buffer.length < stop + 2) return undefined;
    if (buffer[stop] !== 13 || buffer[stop + 1] !== 10) throw new Error('Invalid Redis argument terminator');
    args.push(buffer.toString('utf8', start, stop));
    offset = stop + 2;
  }
  return { bytes: offset, arguments: args };
}

export interface OwnedRedisTransitionFault {
  readonly url: string;
  arm(sessionKey: string): void;
  counts(): { targetReads: number; rejectedTransitions: number };
  close(): Promise<void>;
}

/** Proxy only a verified owned Redis; reject exactly one transition for the selected session. */
export async function createOwnedRedisTransitionFault(
  service: OwnedTestRedis,
  signal: AbortSignal
): Promise<OwnedRedisTransitionFault> {
  await waitForOrAbort(verifyAuthRedis(service), signal);
  const target = new URL(service.url);
  if (
    target.protocol !== 'redis:' ||
    target.hostname !== '127.0.0.1' ||
    !target.port ||
    target.pathname !== '/15' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error('The Redis transition proxy requires an owned Redis database 15');
  }
  const sockets = new Set<Socket>();
  let key: string | undefined;
  let targetReads = 0;
  let rejectedTransitions = 0;
  const server = createServer((client) => {
    const upstream = createConnection({ host: '127.0.0.1', port: Number(target.port) });
    sockets.add(client);
    sockets.add(upstream);
    client.once('close', () => {
      sockets.delete(client);
      upstream.destroy();
    });
    upstream.once('close', () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    upstream.pipe(client);
    let pending = Buffer.alloc(0);
    client.on('data', (chunk: Buffer) => {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > 4_000_000) throw new Error('Redis request exceeds fixture limit');
        while (pending.length) {
          const frame = parseRedisFrame(pending);
          if (!frame) break;
          const request = pending.subarray(0, frame.bytes);
          pending = pending.subarray(frame.bytes);
          const command = frame.arguments[0]?.toUpperCase();
          if (key && command === 'GET' && frame.arguments[1] === key) targetReads++;
          if (
            key &&
            rejectedTransitions === 0 &&
            (command === 'EVAL' || command === 'EVALSHA') &&
            frame.arguments[3] === key
          ) {
            rejectedTransitions++;
            client.write('-ERR controlled authorization transition failure\r\n');
          } else {
            upstream.write(request);
          }
        }
      } catch {
        client.destroy();
        upstream.destroy();
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind the owned Redis proxy');
    if (signal.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: signal.reason });
    return {
      url: `redis://127.0.0.1:${address.port}/15`,
      arm(sessionKey) {
        if (key || !/^cli-auth(?:-v\d+)?:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionKey)) {
          throw new Error('A fresh CLI session key is required');
        }
        key = sessionKey;
      },
      counts: () => ({ targetReads, rejectedTransitions }),
      async close() {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    };
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
}
