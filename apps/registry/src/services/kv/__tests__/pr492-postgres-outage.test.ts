// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('PostgreSQL connection deadlines', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  const runtimes = process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Bun', 'Node', 'Linux Node'] : ['Bun', 'Node'];
  const cases = runtimes.flatMap((runtime) =>
    (['immediate', 'after startup'] as const).map((mode) => ({ runtime, mode }))
  );
  it.each(cases)('bounds $mode handshake closes on $runtime and never runs the failed write after recovery', async ({
    runtime,
    mode
  }) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      let accepting = false;
      let connections = 0;
      const sockets = new Set();
      const proxy = createServer((client) => {
        connections++;
        sockets.add(client);
        client.on('close', () => sockets.delete(client));
        client.on('error', () => {});
        if (!accepting) {
          if (${JSON.stringify(mode)} === 'immediate') { client.resume(); client.end(); }
          else client.once('data', () => client.end());
          return;
        }
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy());
        client.pipe(upstream).pipe(client);
      });
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const address = proxy.address();
      const url = new URL(target);
      url.hostname = '127.0.0.1';
      url.port = String(address.port);
      const store = createPostgresStore(url.toString());
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      try {
        const started = performance.now();
        const [failure, counterFailure, queuedFailure] = await Promise.all([
          store.set('review:failed-handshake', 'must-not-write', 60_000).then(
            () => ({ success: true }),
            (error) => ({ name: error.name, code: error.code, message: error.message })
          ),
          store.incr('review:failed-counter', 60_000).then(
            () => ({ success: true }),
            (error) => ({ name: error.name, code: error.code })
          ),
          store.set('review:queued-handshake', 'must-not-write', 60_000).then(
            () => ({ success: true }),
            (error) => ({ name: error.name, code: error.code })
          )
        ]);
        const elapsed = performance.now() - started;
        const atFailure = connections;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const afterFailure = connections;
        const socketsAfterFailure = sockets.size;
        accepting = true;
        await store.set('review:recovered', 'ok', 60_000);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rows = await admin.unsafe("SELECT key FROM kv_store WHERE key IN ('review:failed-handshake', 'review:failed-counter', 'review:queued-handshake')");
        const recovered = await store.get('review:recovered');
        const secretInError = failure.message?.includes(target.password) ?? false;
        console.log(JSON.stringify({ failure, counterFailure, queuedFailure, elapsed, atFailure, afterFailure, socketsAfterFailure, lateWrites: rows.length, recovered, secretInError }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Node'
        ? services.runNode(script, 15_000)
        : services.runLinuxNode(script, 15_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      failure: { name?: string; code?: string; message?: string; success?: boolean };
      counterFailure: { name?: string; code?: string; success?: boolean };
      queuedFailure: { name?: string; code?: string; success?: boolean };
      elapsed: number;
      atFailure: number;
      afterFailure: number;
      socketsAfterFailure: number;
      lateWrites: number;
      recovered: string;
      secretInError: boolean;
    };
    if (mode === 'after startup') {
      expect(result.failure).toMatchObject({
        name: 'PostgresDeadlineExceededError',
        code: 'POSTGRES_DEADLINE_EXCEEDED'
      });
      expect(result.counterFailure).toMatchObject({
        name: 'CounterDeadlineExceededError',
        code: 'COUNTER_DEADLINE_EXCEEDED'
      });
      expect(result.queuedFailure).toMatchObject({
        name: 'PostgresDeadlineExceededError',
        code: 'POSTGRES_DEADLINE_EXCEEDED'
      });
    } else {
      const connectionErrors = ['ECONNRESET', 'EPIPE', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'];
      expect([...connectionErrors, 'POSTGRES_DEADLINE_EXCEEDED']).toContain(result.failure.code);
      expect([...connectionErrors, 'COUNTER_DEADLINE_EXCEEDED']).toContain(result.counterFailure.code);
      expect([...connectionErrors, 'POSTGRES_DEADLINE_EXCEEDED']).toContain(result.queuedFailure.code);
    }
    expect(result.failure.message).not.toContain('review:failed-handshake');
    expect(result.secretInError).toBe(false);
    expect(result.elapsed).toBeLessThan(9_000);
    expect(result.atFailure).toBeGreaterThan(0);
    expect(result.atFailure).toBeLessThanOrEqual(32);
    expect(result.afterFailure).toBe(result.atFailure);
    expect(result.socketsAfterFailure).toBe(0);
    expect(result.lateWrites).toBe(0);
    expect(result.recovered).toBe('ok');
  }, 30_000);

  it('rolls back a blocked auth write and safely drains a queued write', async () => {
    const script = `
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const admin = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
      const store = createPostgresStore(process.env.DATABASE_URL);
      let release = () => {};
      let holder;
      try {
        await store.set('review:auth-locked', 'original', 60_000);
        let locked;
        const ready = new Promise((resolve) => { locked = resolve; });
        const released = new Promise((resolve) => { release = resolve; });
        holder = admin.begin(async (tx) => {
          await tx.unsafe("SELECT key FROM kv_store WHERE key = 'review:auth-locked' FOR UPDATE");
          locked();
          await released;
        });
        await ready;
        const started = performance.now();
        const outcomes = await Promise.all([
          store.set('review:auth-locked', 'bad', 60_000),
          store.set('review:auth-queued', 'bad', 60_000)
        ].map((promise) => promise.then(() => 'success', (error) => error.code)));
        const elapsed = performance.now() - started;
        release();
        await holder;
        await new Promise((resolve) => setTimeout(resolve, 750));
        const rows = await admin.unsafe("SELECT key, value FROM kv_store WHERE key IN ('review:auth-locked', 'review:auth-queued') ORDER BY key");
        await store.set('review:auth-recovered', 'ok', 60_000);
        console.log(JSON.stringify({ outcomes, elapsed, rows, recovered: await store.get('review:auth-recovered') }));
      } finally {
        release();
        if (holder) await holder;
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await services.runBun(script, 15_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      outcomes: string[];
      elapsed: number;
      rows: { key: string; value: string }[];
      recovered: string;
    };
    expect(result.outcomes[0]).toBe('POSTGRES_DEADLINE_EXCEEDED');
    expect(['success', 'POSTGRES_DEADLINE_EXCEEDED']).toContain(result.outcomes[1]);
    expect(result.elapsed).toBeLessThan(9_000);
    const expected = [{ key: 'review:auth-locked', value: 'original' }];
    if (result.outcomes[1] === 'success') expected.push({ key: 'review:auth-queued', value: 'bad' });
    expect(result.rows).toEqual(expected);
    expect(result.recovered).toBe('ok');
  }, 30_000);

  it('recovers after a refused connection without poisoning the store', async () => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const sockets = new Set();
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: '127.0.0.1', port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => sockets.delete(upstream));
        client.pipe(upstream).pipe(client);
      });
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const port = proxy.address().port;
      await new Promise((resolve) => proxy.close(resolve));
      const url = new URL(target);
      url.port = String(port);
      const store = createPostgresStore(url.toString());
      const originalSsl = process.env.PGSSL;
      const originalTarget = process.env.PGTARGETSESSIONATTRS;
      process.env.PGSSL = 'require';
      process.env.PGTARGETSESSIONATTRS = 'read-only';
      try {
        const failure = await store.set('review:refused', 'bad', 60_000).then(() => 'success', (error) => error.code);
        await new Promise((resolve) => proxy.listen(port, '127.0.0.1', resolve));
        await store.set('review:refused-recovered', 'ok', 60_000);
        const recovered = await store.get('review:refused-recovered');
        const absent = await store.get('review:refused');
        console.log(JSON.stringify({ failure, recovered, absent }));
      } finally {
        if (originalSsl === undefined) delete process.env.PGSSL; else process.env.PGSSL = originalSsl;
        if (originalTarget === undefined) delete process.env.PGTARGETSESSIONATTRS; else process.env.PGTARGETSESSIONATTRS = originalTarget;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
      }
    `;
    const { stdout } = await services.runBun(script, 15_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      failure: string;
      recovered: string;
      absent: string | null;
    };
    expect(result.failure).toBe('ECONNREFUSED');
    expect(result.recovered).toBe('ok');
    expect(result.absent).toBeNull();
  }, 30_000);

  it('falls back to a second PostgreSQL host when the first refuses connections', async () => {
    const script = `
      import { createServer } from 'node:net';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const reserved = createServer();
      await new Promise((resolve) => reserved.listen(0, '127.0.0.1', resolve));
      const unavailable = reserved.address().port;
      await new Promise((resolve) => reserved.close(resolve));
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + unavailable + ',127.0.0.1:' + target.port + target.pathname;
      const store = createPostgresStore(url);
      await store.set('review:multihost', 'ok', 60_000);
      console.log(JSON.stringify({ value: await store.get('review:multihost') }));
      process.exit(0);
    `;
    const { stdout } = await services.runBun(script, 15_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({ value: 'ok' });
  }, 30_000);

  it('recovers after a PostgreSQL host accepts TCP but never handshakes', async () => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const sockets = new Set();
      let accepting = false;
      const stalled = createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        if (!accepting) { socket.resume(); return; }
        const upstream = createConnection({ host: '127.0.0.1', port: Number(target.port) });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.on('error', () => socket.destroy());
        socket.on('close', () => upstream.destroy());
        socket.pipe(upstream).pipe(socket);
      });
      await new Promise((resolve) => stalled.listen(0, '127.0.0.1', resolve));
      const first = stalled.address().port;
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + first + ',127.0.0.1:' + target.port + target.pathname;
      const store = createPostgresStore(url);
      try {
        const failure = await store.set('review:stalled-first-host', 'bad', 60_000)
          .then(() => 'success', (error) => error.code);
        accepting = true;
        await store.set('review:stalled-recovered', 'ok', 60_000);
        console.log(JSON.stringify({ failure, absent: await store.get('review:stalled-first-host'), value: await store.get('review:stalled-recovered') }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => stalled.close(resolve));
      }
      process.exit(0);
    `;
    const { stdout } = await services.runBun(script, 15_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({
      failure: 'CONNECT_TIMEOUT',
      absent: null,
      value: 'ok'
    });
  }, 30_000);

  it('retains PostgreSQL TLS negotiation through the owned socket', async () => {
    const script = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
      import { createConnection, createServer } from 'node:net';
      import { join } from 'node:path';
      import { createSecureContext, TLSSocket } from 'node:tls';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-tls-'));
      const key = join(directory, 'key.pem');
      const cert = join(directory, 'cert.pem');
      execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
      const context = createSecureContext({ key: readFileSync(key), cert: readFileSync(cert) });
      const target = new URL(process.env.DATABASE_URL);
      const sockets = new Set();
      const proxy = createServer((client) => {
        sockets.add(client);
        client.on('close', () => sockets.delete(client));
        client.on('error', () => {});
        client.once('data', (request) => {
          if (request.length !== 8 || request.readInt32BE(4) !== 80877103) return client.destroy();
          client.write('S');
          const secure = new TLSSocket(client, { isServer: true, secureContext: context });
          secure.on('error', () => secure.destroy());
          secure.once('secure', () => {
            const upstream = createConnection({ host: '127.0.0.1', port: Number(target.port) });
            sockets.add(upstream);
            upstream.on('close', () => sockets.delete(upstream));
            upstream.on('error', () => secure.destroy());
            secure.on('close', () => upstream.destroy());
            secure.pipe(upstream).pipe(secure);
          });
        });
      });
      try {
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const url = new URL(target);
        url.port = String(proxy.address().port);
        url.searchParams.set('ssl', 'require');
        const store = createPostgresStore(url.toString());
        await store.set('review:tls', 'ok', 60_000);
        console.log(JSON.stringify({ value: await store.get('review:tls') }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => proxy.close(resolve));
        rmSync(directory, { recursive: true, force: true });
      }
      process.exit(0);
    `;
    const { stdout } = await services.runBun(script, 15_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({ value: 'ok' });
  }, 30_000);

  it('retries transient handshake closes and bounds both counter acquisition slots', async () => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let accepting = false;
      let connections = 0;
      const proxy = createServer((client) => {
        connections++;
        sockets.add(client);
        client.on('close', () => sockets.delete(client));
        client.on('error', () => {});
        if (!accepting) { client.once('data', () => client.end()); return; }
        const upstream = createConnection({ host: '127.0.0.1', port: Number(target.port) });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy());
        client.pipe(upstream).pipe(client);
      });
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const url = new URL(target);
      url.port = String(proxy.address().port);
      const store = createPostgresStore(url.toString());
      try {
        const recoveryTimer = setTimeout(() => { accepting = true; }, 750);
        await store.set('review:retry-before-deadline', 'ok', 60_000);
        clearTimeout(recoveryTimer);
        const retryAttempts = connections;
        accepting = false;
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const attemptsBeforeOutage = connections;
        const started = performance.now();
        const outcomes = await Promise.all(['review:counter-outage-a', 'review:counter-outage-b'].map((key) =>
          store.incr(key, 60_000).then(() => 'success', (error) => error.code)));
        const elapsed = performance.now() - started;
        const atFailure = connections;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const afterFailure = connections;
        accepting = true;
        const recovered = await store.incr('review:counter-recovered', 60_000);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rows = await admin.unsafe("SELECT key FROM kv_store WHERE key IN ('review:counter-outage-a', 'review:counter-outage-b')");
        console.log(JSON.stringify({ retryAttempts, outcomes, elapsed, attempts: atFailure - attemptsBeforeOutage, atFailure, afterFailure, recovered, lateWrites: rows.length }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await services.runBun(script, 20_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      retryAttempts: number;
      outcomes: string[];
      elapsed: number;
      attempts: number;
      atFailure: number;
      afterFailure: number;
      recovered: number;
      lateWrites: number;
    };
    expect(result.retryAttempts).toBeGreaterThan(1);
    expect(result.retryAttempts).toBeLessThan(10);
    expect(result.outcomes).toEqual(['COUNTER_DEADLINE_EXCEEDED', 'COUNTER_DEADLINE_EXCEEDED']);
    expect(result.elapsed).toBeLessThan(7_000);
    expect(result.attempts).toBeGreaterThan(0);
    expect(result.attempts).toBeLessThanOrEqual(60);
    expect(result.afterFailure).toBe(result.atFailure);
    expect(result.recovered).toBe(1);
    expect(result.lateWrites).toBe(0);
  }, 30_000);
});
