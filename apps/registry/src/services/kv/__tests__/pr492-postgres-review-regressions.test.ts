// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

// Forward the actual PostgreSQL protocol; inspect complete frontend frames only
// to synchronize the fault with Parse/COMMIT, never fabricate driver replies.
const wireProxy = `
  import { createConnection, createServer, Socket } from 'node:net';
  import postgres from 'postgres';
  import { createPostgresStore } from './src/services/kv/postgres.ts';
  const target = new URL(process.env.DATABASE_URL);
  const sockets = new Set();
  async function startProxy(onFrame = () => {}, onReply = () => false) {
    const server = createServer((client) => {
      const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
      const state = { client, upstream, startup: true, pending: Buffer.alloc(0) };
      sockets.add(client); sockets.add(upstream);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.on('close', () => { sockets.delete(client); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      client.on('data', (data) => {
        state.pending = Buffer.concat([state.pending, data]);
        while (true) {
          if (state.startup) {
            if (state.pending.length < 4) break;
            const size = state.pending.readUInt32BE(0);
            if (state.pending.length < size) break;
            state.pending = state.pending.subarray(size);
            state.startup = false;
            continue;
          }
          if (state.pending.length < 5) break;
          const size = state.pending.readUInt32BE(1) + 1;
          if (size < 5 || size > 16_000_000) throw Error('invalid frontend frame');
          if (state.pending.length < size) break;
          const frame = state.pending.subarray(0, size);
          state.pending = state.pending.subarray(size);
          onFrame(state, frame);
        }
        upstream.write(data);
      });
      upstream.on('data', (data) => { if (!onReply(state, data)) client.write(data); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = new URL(target);
    url.hostname = '127.0.0.1';
    url.port = String(server.address().port);
    return { server, url };
  }
  async function closeProxy(server) {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
  function commitFrame(frame) {
    return (frame[0] === 80 || frame[0] === 81) && /\\bcommit\\b/i.test(frame.toString('utf8'));
  }
  function outcome(error) {
    return { code: error.code, outcome: error.outcome };
  }
`;

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('PostgreSQL review regressions', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('retries all refused hosts and succeeds when one recovers within the operation deadline', async () => {
    const script = `
      ${wireProxy}
      const reserved = [createServer(), createServer()];
      for (const server of reserved) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const ports = reserved.map((server) => server.address().port);
      for (const server of reserved) await new Promise((resolve) => server.close(resolve));
      const originalConnect = Socket.prototype.connect;
      let attempts = 0;
      Socket.prototype.connect = function(...args) {
        // All sockets in this child belong to the two candidate hosts or the owned relay.
        attempts++;
        return originalConnect.apply(this, args);
      };
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        client.pipe(upstream).pipe(client);
      });
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + ports[0] + ',127.0.0.1:' + ports[1] + target.pathname;
      const store = createPostgresStore(url);
      try {
        const started = performance.now();
        const writing = store.set('review:refused-retry', 'ok', 60_000).then(() => 'success', (error) => error.code);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        await new Promise((resolve) => proxy.listen(ports[1], '127.0.0.1', resolve));
        const result = await writing;
        const elapsed = performance.now() - started;
        console.log(JSON.stringify({ result, elapsed, attempts }));
      } finally {
        Socket.prototype.connect = originalConnect;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
      }
    `;
    const { stdout } = await services.runNode(script, 12_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      result: string;
      elapsed: number;
      attempts: number;
    };
    expect(result.result).toBe('success');
    expect(result.elapsed).toBeLessThan(4_000);
    expect(result.attempts).toBeGreaterThanOrEqual(3);
    expect(result.attempts).toBeLessThanOrEqual(20);
  }, 30_000);

  it('stops bounded retries after all PostgreSQL hosts continue refusing connections', async () => {
    const script = `
      ${wireProxy}
      const reserved = [createServer(), createServer()];
      for (const server of reserved) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const ports = reserved.map((server) => server.address().port);
      for (const server of reserved) await new Promise((resolve) => server.close(resolve));
      const originalConnect = Socket.prototype.connect;
      let attempts = 0;
      Socket.prototype.connect = function(...args) { attempts++; return originalConnect.apply(this, args); };
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + ports[0] + ',127.0.0.1:' + ports[1] + target.pathname;
      const store = createPostgresStore(url);
      try {
        const started = performance.now();
        const result = await store.set('review:all-refused', 'bad', 60_000).then(() => 'success', (error) => error.code);
        const elapsed = performance.now() - started;
        const atFailure = attempts;
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(JSON.stringify({ result, elapsed, atFailure, afterFailure: attempts }));
      } finally { Socket.prototype.connect = originalConnect; }
    `;
    const { stdout } = await services.runNode(script, 12_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      result: string;
      elapsed: number;
      atFailure: number;
      afterFailure: number;
    };
    expect(result.result).toBe('POSTGRES_DEADLINE_EXCEEDED');
    expect(result.elapsed).toBeLessThan(9_000);
    expect(result.atFailure).toBeGreaterThan(2);
    expect(result.atFailure).toBeLessThanOrEqual(32);
    expect(result.afterFailure).toBe(result.atFailure);
  }, 30_000);

  it('can use the KV store when optional PostgreSQL type-metadata replies are withheld', async () => {
    const script = `
      ${wireProxy}
      let metadataRequested = false;
      const { server, url } = await startProxy((state, frame) => {
        if (frame[0] === 80 && frame.toString('utf8').includes('pg_catalog.pg_type')) {
          state.holdMetadata = true;
          metadataRequested = true;
        }
      }, (state) => Boolean(state.holdMetadata));
      const store = createPostgresStore(url.toString());
      try {
        await store.set('review:no-type-metadata', 'ok', 60_000);
        console.log(JSON.stringify({ value: await store.get('review:no-type-metadata'), metadataRequested }));
      } finally { await closeProxy(server); }
    `;
    const { stdout } = await services.runNode(script, 12_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({ value: 'ok', metadataRequested: false });
  }, 30_000);

  it('does not crash when a target-session-attributes probe stalls during initialization', async () => {
    const script = `
      ${wireProxy}
      let probing = false;
      const { server, url } = await startProxy((state, frame) => {
        if ((frame[0] === 80 || frame[0] === 81) && frame.toString('utf8').includes('transaction_read_only')) {
          state.holdProbe = true;
          probing = true;
        }
      }, (state, data) => {
        if (state.holdProbe) return true;
        state.serverPending = Buffer.concat([state.serverPending ?? Buffer.alloc(0), data]);
        const forwarded = [];
        while (state.serverPending.length >= 5) {
          const length = state.serverPending.readUInt32BE(1) + 1;
          if (state.serverPending.length < length) break;
          const frame = state.serverPending.subarray(0, length);
          state.serverPending = state.serverPending.subarray(length);
          const text = frame.toString('utf8');
          if (frame[0] !== 83 || (!text.includes('in_hot_standby') && !text.includes('default_transaction_read_only'))) {
            forwarded.push(frame);
          }
        }
        if (forwarded.length) state.client.write(Buffer.concat(forwarded));
        return true;
      });
      url.searchParams.set('target_session_attrs', 'read-write');
      const store = createPostgresStore(url.toString());
      try {
        const result = await store.set('review:target-state-stalled', 'bad', 60_000)
          .then(() => ({ success: true }), outcome);
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(JSON.stringify({ result, probing }));
      } finally { await closeProxy(server); }
    `;
    const { stdout } = await services.runNode(script, 12_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({
      result: { code: 'POSTGRES_DEADLINE_EXCEEDED' },
      probing: true
    });
  }, 30_000);

  it('enforces target-session policy before writes and falls back to a primary when no standby exists', async () => {
    const script = `
      ${wireProxy}
      let firstBegins = 0;
      let secondBegins = 0;
      const first = await startProxy((_state, frame) => {
        if (frame[0] === 81 && /\\bbegin\\b/i.test(frame.toString('utf8'))) firstBegins++;
      });
      const second = await startProxy((_state, frame) => {
        if (frame[0] === 81 && /\\bbegin\\b/i.test(frame.toString('utf8'))) secondBegins++;
      });
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      try {
        const status = await admin.unsafe('SELECT pg_is_in_recovery() AS standby');
        if (status[0].standby) throw Error('expected the owned PostgreSQL primary');
        const valid = new URL(first.url);
        valid.searchParams.set('target_session_attrs', 'primary');
        await createPostgresStore(valid.toString()).set('review:target-primary', 'ok', 60_000);
        const invalid = new URL(first.url);
        invalid.searchParams.set('target_session_attrs', 'standby');
        const rejected = await createPostgresStore(invalid.toString()).set('review:target-standby', 'bad', 60_000)
          .then(() => 'success', (error) => error.code);
        firstBegins = 0;
        const preferredUrl = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + first.url.port + ',127.0.0.1:' + second.url.port + target.pathname + '?target_session_attrs=prefer-standby';
        await createPostgresStore(preferredUrl).set('review:target-prefer', 'ok', 60_000);
        const rows = await admin.unsafe("SELECT key, value FROM kv_store WHERE key IN ('review:target-primary', 'review:target-standby', 'review:target-prefer') ORDER BY key");
        console.log(JSON.stringify({ rejected, firstBegins, secondBegins, rows }));
      } finally {
        await closeProxy(first.server);
        await closeProxy(second.server);
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await services.runNode(script, 16_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      rejected: string;
      firstBegins: number;
      secondBegins: number;
      rows: { key: string; value: string }[];
    };
    expect(result.rejected).toBe('POSTGRES_DEADLINE_EXCEEDED');
    expect(result.firstBegins).toBeGreaterThanOrEqual(1);
    expect(result.secondBegins).toBeGreaterThanOrEqual(1);
    expect(result.rows).toEqual([
      { key: 'review:target-prefer', value: 'ok' },
      { key: 'review:target-primary', value: 'ok' }
    ]);
  }, 30_000);

  it('recovers after a real connection closes during target-session verification', async () => {
    const script = `
      ${wireProxy}
      let armed = true;
      let cut = false;
      const { server, url } = await startProxy((state, frame) => {
        if (armed && frame[0] === 80 && frame.toString('utf8').includes('transaction_read_only')) {
          armed = false; state.cutProbe = true;
        }
      }, (state) => {
        if (!state.cutProbe) return false;
        cut = true; state.client.destroy(); state.upstream.destroy(); return true;
      });
      url.searchParams.set('target_session_attrs', 'read-write');
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const store = createPostgresStore(url.toString());
      try {
        const first = await store.set('review:target-cut', 'bad', 60_000).then(() => 'success', (error) => error.code);
        await store.set('review:target-recovered', 'ok', 60_000);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const rows = await admin.unsafe("SELECT key, value FROM kv_store WHERE key IN ('review:target-cut', 'review:target-recovered')");
        console.log(JSON.stringify({ first, cut, rows }));
      } finally {
        await closeProxy(server);
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await services.runNode(script, 12_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      first: string;
      cut: boolean;
      rows: { key: string; value: string }[];
    };
    expect(['CONNECTION_CLOSED', 'ECONNRESET', 'CONNECTION_DESTROYED']).toContain(result.first);
    expect(result.cut).toBe(true);
    expect(result.rows).toEqual([{ key: 'review:target-recovered', value: 'ok' }]);
  }, 30_000);

  it('rotates to the second host on a follow-up request after a stalled handshake', async () => {
    const script = `
      ${wireProxy}
      let stalledConnections = 0;
      const stalled = createServer((socket) => {
        stalledConnections++; sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {}); socket.resume();
      });
      await new Promise((resolve) => stalled.listen(0, '127.0.0.1', resolve));
      const { server, url: proxyUrl } = await startProxy();
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + stalled.address().port + ',127.0.0.1:' + proxyUrl.port + target.pathname;
      const store = createPostgresStore(url);
      try {
        const first = await store.set('review:rotation-failed', 'bad', 60_000).then(() => 'success', (error) => error.code);
        const started = performance.now();
        const second = await store.set('review:rotation-recovered', 'ok', 60_000).then(() => 'success', (error) => error.code);
        const elapsed = performance.now() - started;
        console.log(JSON.stringify({ first, second, elapsed, stalledConnections }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => stalled.close(resolve));
        await closeProxy(server);
      }
    `;
    const { stdout } = await services.runNode(script, 16_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      first: string;
      second: string;
      elapsed: number;
      stalledConnections: number;
    };
    expect(result.first).toBe('CONNECT_TIMEOUT');
    expect(result.second).toBe('success');
    expect(result.elapsed).toBeLessThan(2_000);
    expect(result.stalledConnections).toBe(1);
  }, 30_000);

  it.each([
    'blocked event loop',
    'wall clock jump'
  ] as const)('rejects a late acknowledged COMMIT after a %s and reports its known outcome', async (mode) => {
    const script = `
        ${wireProxy}
        let armed = false;
        let committing = false;
        let delayed = false;
        const { server, url } = await startProxy((_state, frame) => { if (armed && commitFrame(frame)) committing = true; });
        const originalEmit = Socket.prototype.emit;
        const originalNow = Date.now;
        Socket.prototype.emit = function(type, ...args) {
          if (type === 'data' && this.remotePort === Number(url.port) && committing && !delayed) {
            delayed = true;
            if (${JSON.stringify(mode)} === 'blocked event loop') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 7_400);
            else Date.now = () => originalNow() + 8_000;
          }
          return originalEmit.call(this, type, ...args);
        };
        const admin = postgres(target.toString(), { max: 1, prepare: false });
        const store = createPostgresStore(url.toString());
        const key = ${JSON.stringify(`review:ack-${mode.replaceAll(' ', '-')}`)};
        try {
          await store.set('review:ack-warm', 'warm', 60_000);
          armed = true;
          const started = performance.now();
          const result = await store.set(key, 'committed', 60_000).then(() => ({ success: true }), outcome);
          const elapsed = performance.now() - started;
          Date.now = originalNow;
          const rows = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          console.log(JSON.stringify({ result, elapsed, delayed, value: rows[0]?.value }));
        } finally {
          Date.now = originalNow;
          Socket.prototype.emit = originalEmit;
          await closeProxy(server);
          await admin.end({ timeout: 2 });
        }
      `;
    const { stdout } = await services.runNode(script, 15_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      result: { success?: boolean; code?: string; outcome?: string };
      elapsed: number;
      delayed: boolean;
      value: string;
    };
    expect(result.delayed).toBe(true);
    expect(result.result).toEqual({ code: 'POSTGRES_DEADLINE_EXCEEDED', outcome: 'committed' });
    if (mode === 'blocked event loop') expect(result.elapsed).toBeGreaterThan(7_000);
    expect(result.value).toBe('committed');
  }, 30_000);

  it('reports an unknown outcome for a lost COMMIT reply and safely runs the next queued write', async () => {
    const script = `
      ${wireProxy}
      let armed = false;
      let dropped = false;
      let observed;
      const replyDropped = new Promise((resolve) => { observed = resolve; });
      const { server, url } = await startProxy((state, frame) => {
        if (armed && !dropped && commitFrame(frame)) state.dropCommit = true;
      }, (state) => {
        if (!state.dropCommit) return false;
        if (!dropped) { dropped = true; observed(); }
        return true;
      });
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const store = createPostgresStore(url.toString());
      try {
        await store.set('review:lost-commit-warm', 'warm', 60_000);
        armed = true;
        const first = store.set('review:lost-commit-first', 'committed', 60_000).then(() => ({ success: true }), outcome);
        await replyDropped;
        let rows = [];
        for (let attempt = 0; attempt < 20 && !rows.length; attempt++) {
          rows = await admin.unsafe("SELECT value FROM kv_store WHERE key = 'review:lost-commit-first'");
          if (!rows.length) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!rows.length) throw Error('commit did not reach owned PostgreSQL');
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        let secondSettled = false;
        const second = store.set('review:lost-commit-first', 'queued', 60_000)
          .then(() => { secondSettled = true; return 'success'; }, (error) => { secondSettled = true; return error.code; });
        await new Promise((resolve) => setTimeout(resolve, 300));
        const early = secondSettled;
        const firstResult = await first;
        const secondResult = await second;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const final = await admin.unsafe("SELECT key, value FROM kv_store WHERE key = 'review:lost-commit-first'");
        console.log(JSON.stringify({ firstResult, secondResult, early, firstObserved: rows[0].value, rows: final }));
      } finally {
        await closeProxy(server);
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await services.runNode(script, 15_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      firstResult: { success?: boolean; code?: string; outcome?: string };
      secondResult: string;
      early: boolean;
      firstObserved: string;
      rows: { key: string; value: string }[];
    };
    expect(result.firstResult).toEqual({ code: 'POSTGRES_DEADLINE_EXCEEDED', outcome: 'unknown' });
    expect(result.early).toBe(false);
    expect(result.secondResult).toBe('success');
    expect(result.firstObserved).toBe('committed');
    expect(result.rows).toEqual([{ key: 'review:lost-commit-first', value: 'queued' }]);
  }, 30_000);

  const commitRuntimes =
    process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Bun', 'Node', 'Linux Node'] : ['Bun', 'Node'];
  const commitCases = commitRuntimes.flatMap((runtime) =>
    (['set', 'counter'] as const).map((operation) => ({ runtime, operation }))
  );
  it.each(
    commitCases
  )('reports an unknown outcome when a $operation COMMIT reply is lost to a connection close on $runtime', async ({
    operation,
    runtime
  }) => {
    const script = `
        ${wireProxy}
        const operation = ${JSON.stringify(operation)};
        const runtime = ${JSON.stringify(runtime)};
        const key = 'review:closed-commit-' + operation + ':' + runtime;
        let armed = false;
        let cut = false;
        let commits = 0;
        const { server, url } = await startProxy((state, frame) => {
          if (armed && !cut && commitFrame(frame)) { state.cutCommit = true; commits++; }
        }, (state) => {
          if (!state.cutCommit) return false;
          cut = true; state.client.destroy(); state.upstream.destroy(); return true;
        });
        const admin = postgres(target.toString(), { max: 1, prepare: false });
        const store = createPostgresStore(url.toString());
        try {
          await store.set('review:closed-commit-warm-' + operation + ':' + runtime, 'warm', 60_000);
          armed = true;
          const first = await (operation === 'set' ? store.set(key, 'committed', 60_000) : store.incr(key, 60_000))
            .then(() => ({ success: true }), outcome);
          const before = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          const second = operation === 'set' ? await store.set(key, 'recovered', 60_000) : await store.incr(key, 60_000);
          await new Promise((resolve) => setTimeout(resolve, 300));
          const after = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          console.log(JSON.stringify({ first, cut, commits, before: before[0]?.value, second, after: after[0]?.value }));
        } finally {
          await closeProxy(server);
          await admin.end({ timeout: 2 });
        }
      `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 12_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 12_000)
        : services.runNode(script, 12_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      first: { code?: string; outcome?: string; success?: boolean };
      cut: boolean;
      commits: number;
      before: string;
      second?: number;
      after: string;
    };
    expect(['CONNECTION_CLOSED', 'ECONNRESET', 'CONNECTION_DESTROYED']).toContain(result.first.code);
    expect(result.first.outcome).toBe('unknown');
    expect(result.cut).toBe(true);
    expect(result.commits).toBe(1);
    expect(result.before).toBe(operation === 'set' ? 'committed' : '1');
    if (operation === 'counter') expect(result.second).toBe(2);
    expect(result.after).toBe(operation === 'set' ? 'recovered' : '2');
  }, 30_000);

  it.each(
    commitRuntimes
  )('does not label a pre-COMMIT transport close or a PostgreSQL rejection as an unknown COMMIT on %s', async (runtime) => {
    const script = `
      ${wireProxy}
      const runtime = ${JSON.stringify(runtime)};
      const warmKey = 'review:precommit-warm:' + runtime;
      const closeKey = 'review:precommit-close:' + runtime;
      const rejectionKey = 'review:sql-rejection:' + runtime;
      const recoveredKey = 'review:precommit-recovered:' + runtime;
      let armed = false;
      let executed = false;
      let cut = false;
      let commits = 0;
      const { server, url } = await startProxy((state, frame) => {
        if (!armed || cut) return;
        if (frame[0] === 80 && frame.toString('utf8').includes('INSERT INTO kv_store')) state.writing = true;
        if (state.writing && frame[0] === 69) { executed = true; state.cutWrite = true; }
        if (commitFrame(frame)) commits++;
      }, (state) => {
        if (!state.cutWrite) return false;
        cut = true; state.client.destroy(); state.upstream.destroy(); return true;
      });
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const store = createPostgresStore(url.toString());
      try {
        await store.set(warmKey, 'warm', 60_000);
        armed = true;
        const first = await store.set(closeKey, 'bad', 60_000)
          .then(() => ({ success: true }), outcome);
        const rejected = await store.set(rejectionKey, null, 60_000)
          .then(() => ({ success: true }), outcome);
        await store.set(recoveredKey, 'ok', 60_000);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const rows = await admin.unsafe('SELECT key, value FROM kv_store WHERE key IN ($1, $2, $3)', [closeKey, rejectionKey, recoveredKey]);
        console.log(JSON.stringify({ first, rejected, executed, cut, commits, rows }));
      } finally {
        await closeProxy(server);
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 12_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 12_000)
        : services.runNode(script, 12_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      first: { code?: string; outcome?: string; success?: boolean };
      rejected: { code?: string; outcome?: string; success?: boolean };
      executed: boolean;
      cut: boolean;
      commits: number;
      rows: { key: string; value: string }[];
    };
    expect(['CONNECTION_CLOSED', 'ECONNRESET', 'CONNECTION_DESTROYED']).toContain(result.first.code);
    expect(result.first.outcome).toBeUndefined();
    expect(result.rejected).toEqual({ code: '23502' });
    expect(result.executed).toBe(true);
    expect(result.cut).toBe(true);
    expect(result.commits).toBe(0);
    expect(result.rows).toEqual([{ key: `review:precommit-recovered:${runtime}`, value: 'ok' }]);
  }, 30_000);

  it.each(
    commitRuntimes
  )('does not expose query secrets through JSON or Pino error serialization on %s', async (runtime) => {
    const script = `
        ${wireProxy}
        import { randomUUID } from 'node:crypto';
        import pino from 'pino';
        const key = 'fake-key-' + randomUUID();
        const value = 'fake-value-' + randomUUID();
        const deferredKey = 'fake-deferred-key-' + randomUUID();
        const deferredValue = 'fake-deferred-value-' + randomUUID();
        const committedKey = 'fake-committed-key-' + randomUUID();
        const committedValue = 'fake-committed-value-' + randomUUID();
        const warmKey = 'review:redaction-warm-' + randomUUID();
        function inspect(error, secretKey, secretValue) {
          const json = JSON.stringify(error);
          const pinoJson = JSON.stringify(pino.stdSerializers.err(error));
          const nested = new AggregateError([error], 'owned aggregate', { cause: error });
          const nestedJson = JSON.stringify(nested);
          const nestedPino = JSON.stringify(pino.stdSerializers.err(nested));
          return {
            code: error.code,
            outcome: error.outcome ?? null,
            jsonKey: json.includes(secretKey), jsonValue: json.includes(secretValue),
            pinoKey: pinoJson.includes(secretKey), pinoValue: pinoJson.includes(secretValue),
            nestedKey: nestedJson.includes(secretKey) || nestedPino.includes(secretKey),
            nestedValue: nestedJson.includes(secretValue) || nestedPino.includes(secretValue),
            queryEnumerable: Object.prototype.propertyIsEnumerable.call(error, 'query'),
            parametersEnumerable: Object.prototype.propertyIsEnumerable.call(error, 'parameters'),
            argsEnumerable: Object.prototype.propertyIsEnumerable.call(error, 'args'),
            typesEnumerable: Object.prototype.propertyIsEnumerable.call(error, 'types')
          };
        }
        async function rejected(promise) {
          return promise.then(() => { throw Error('expected PostgreSQL failure'); }, (error) => error);
        }
        const direct = postgres(target.toString(), { max: 1, prepare: false, debug: false, fetch_types: false, onnotice: () => {} });
        const store = createPostgresStore(target.toString());
        process.env.PGDEBUG = 'true';
        const configuredUrl = new URL(target);
        configuredUrl.searchParams.set('debug', 'true');
        const configuredStore = createPostgresStore(configuredUrl.toString());
        let server;
        let armed = false;
        let cut = false;
        let output;
        try {
          await store.set(warmKey, 'warm', 60_000);
          await direct.unsafe("CREATE FUNCTION pr492_redaction_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned rejection' USING ERRCODE = 'P0001'; END $$");
          await direct.unsafe('CREATE TRIGGER pr492_redaction_immediate BEFORE INSERT ON kv_store FOR EACH ROW EXECUTE FUNCTION pr492_redaction_reject()');
          const insert = "INSERT INTO kv_store (key, value, expires_at) VALUES ($1, $2, clock_timestamp() + interval '1 minute')";
          const nativeImmediate = inspect(await rejected(direct.unsafe(insert, [key, value])), key, value);
          const storeImmediate = inspect(await rejected(store.set(key, value, 60_000)), key, value);
          const configuredImmediate = inspect(await rejected(configuredStore.set(key, value, 60_000)), key, value);
          await direct.unsafe('DROP TRIGGER pr492_redaction_immediate ON kv_store');
          await direct.unsafe('CREATE CONSTRAINT TRIGGER pr492_redaction_deferred AFTER INSERT ON kv_store DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pr492_redaction_reject()');
          const nativeDeferred = inspect(await rejected(direct.begin((tx) => tx.unsafe(insert, [deferredKey, deferredValue]))), deferredKey, deferredValue);
          const storeDeferred = inspect(await rejected(store.set(deferredKey, deferredValue, 60_000)), deferredKey, deferredValue);
          await direct.unsafe('DROP TRIGGER pr492_redaction_deferred ON kv_store');
          const proxy = await startProxy((state, frame) => {
            if (armed && !cut && commitFrame(frame)) state.cutCommit = true;
          }, (state) => {
            if (!state.cutCommit) return false;
            cut = true; state.client.destroy(); state.upstream.destroy(); return true;
          });
          server = proxy.server;
          const proxied = createPostgresStore(proxy.url.toString());
          await proxied.set(warmKey + '-proxy', 'warm', 60_000);
          armed = true;
          const transport = inspect(await rejected(proxied.set(committedKey, committedValue, 60_000)), committedKey, committedValue);
          const rows = await direct.unsafe('SELECT value FROM kv_store WHERE key = $1', [committedKey]);
          await proxied.set(warmKey + '-recovered', 'ok', 60_000);
          output = { nativeImmediate, storeImmediate, configuredImmediate, nativeDeferred, storeDeferred, transport, cut, committed: rows[0]?.value === committedValue };
        } finally {
          if (server) await closeProxy(server);
          await direct.unsafe('DROP TRIGGER IF EXISTS pr492_redaction_immediate ON kv_store');
          await direct.unsafe('DROP TRIGGER IF EXISTS pr492_redaction_deferred ON kv_store');
          await direct.unsafe('DROP FUNCTION IF EXISTS pr492_redaction_reject()');
          await direct.end({ timeout: 2 });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        console.log(JSON.stringify(output));
        process.exit(0);
      `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    type Serialization = {
      code: string;
      outcome: string | null;
      jsonKey: boolean;
      jsonValue: boolean;
      pinoKey: boolean;
      pinoValue: boolean;
      nestedKey: boolean;
      nestedValue: boolean;
      queryEnumerable: boolean;
      parametersEnumerable: boolean;
      argsEnumerable: boolean;
      typesEnumerable: boolean;
    };
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      nativeImmediate: Serialization;
      storeImmediate: Serialization;
      configuredImmediate: Serialization;
      nativeDeferred: Serialization;
      storeDeferred: Serialization;
      transport: Serialization;
      cut: boolean;
      committed: boolean;
    };
    const safe = {
      outcome: null,
      jsonKey: false,
      jsonValue: false,
      pinoKey: false,
      pinoValue: false,
      nestedKey: false,
      nestedValue: false,
      queryEnumerable: false,
      parametersEnumerable: false,
      argsEnumerable: false,
      typesEnumerable: false
    };
    expect(result.nativeImmediate).toEqual({ ...safe, code: 'P0001' });
    expect(result.storeImmediate).toEqual(result.nativeImmediate);
    expect(result.configuredImmediate).toEqual(result.nativeImmediate);
    expect(result.nativeDeferred).toEqual({ ...safe, code: 'P0001' });
    expect(result.storeDeferred).toEqual(result.nativeDeferred);
    expect(['CONNECTION_CLOSED', 'ECONNRESET', 'CONNECTION_DESTROYED']).toContain(result.transport.code);
    expect(result.transport).toMatchObject({ ...safe, outcome: 'unknown' });
    expect(result.cut).toBe(true);
    expect(result.committed).toBe(true);
  }, 30_000);

  it.each(
    commitRuntimes
  )('does not expose query secrets when an in-flight write reaches its deadline on %s', async (runtime) => {
    const script = `
        ${wireProxy}
        import { randomUUID } from 'node:crypto';
        import pino from 'pino';
        const key = 'fake-timeout-key-' + randomUUID();
        const value = 'fake-timeout-value-' + randomUUID();
        const warmKey = 'review:timeout-redaction-warm-' + randomUUID();
        let armed = false;
        let executing = false;
        const { server, url } = await startProxy((state, frame) => {
          if (armed && frame[0] === 80 && frame.toString('utf8').includes('INSERT INTO kv_store')) state.writing = true;
          if (state.writing && frame[0] === 69) { executing = true; state.holdWrite = true; }
        }, (state) => Boolean(state.holdWrite));
        url.searchParams.set('debug', 'true');
        process.env.PGDEBUG = 'true';
        const store = createPostgresStore(url.toString());
        const admin = postgres(target.toString(), { max: 1, prepare: false, debug: false, onnotice: () => {} });
        let output;
        try {
          await store.set(warmKey, 'warm', 60_000);
          armed = true;
          const error = await store.set(key, value, 60_000).then(() => null, (failure) => failure);
          if (!error) throw Error('expected a deadline failure');
          const json = JSON.stringify(error);
          const pinoJson = JSON.stringify(pino.stdSerializers.err(error));
          const nested = new AggregateError([error], 'owned timeout aggregate', { cause: error });
          const nestedJson = JSON.stringify(nested);
          const nestedPino = JSON.stringify(pino.stdSerializers.err(nested));
          armed = false;
          const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [key]);
          await store.set(warmKey + '-recovered', 'ok', 60_000);
          output = {
            code: error.code, outcome: error.outcome ?? null, executing, rows: rows.length,
            jsonKey: json.includes(key), jsonValue: json.includes(value),
            pinoKey: pinoJson.includes(key), pinoValue: pinoJson.includes(value),
            nestedKey: nestedJson.includes(key) || nestedPino.includes(key),
            nestedValue: nestedJson.includes(value) || nestedPino.includes(value),
            recovered: await store.get(warmKey + '-recovered')
          };
        } finally {
          await closeProxy(server);
          await admin.end({ timeout: 2 });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        console.log(JSON.stringify(output));
        process.exit(0);
      `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({
      code: 'POSTGRES_DEADLINE_EXCEEDED',
      outcome: null,
      executing: true,
      rows: 0,
      jsonKey: false,
      jsonValue: false,
      pinoKey: false,
      pinoValue: false,
      nestedKey: false,
      nestedValue: false,
      recovered: 'ok'
    });
  }, 30_000);

  it('preserves ssl=prefer fallback when the owned PostgreSQL server does not support TLS', async () => {
    const script = `
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        target.searchParams.set('ssl', 'prefer');
        const store = createPostgresStore(target.toString());
        await store.set('review:ssl-prefer', 'ok', 60_000);
        console.log(JSON.stringify({ value: await store.get('review:ssl-prefer') }));
      } finally { await admin.end({ timeout: 2 }); }
      process.exit(0);
    `;
    const { stdout } = await services.runNode(script, 12_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({ value: 'ok' });
  }, 30_000);

  it('verifies trusted PostgreSQL TLS in standard and direct negotiation modes', async () => {
    const script = `
      import { execFile, execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
      import { createConnection, createServer } from 'node:net';
      import { join } from 'node:path';
      import { createSecureContext, TLSSocket } from 'node:tls';
      import { promisify } from 'node:util';
      const target = new URL(process.env.DATABASE_URL);
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-verified-tls-'));
      const key = join(directory, 'key.pem');
      const cert = join(directory, 'cert.pem');
      const config = join(directory, 'openssl.cnf');
      writeFileSync(config, '[req]\\ndistinguished_name=dn\\nx509_extensions=v3\\nprompt=no\\n[dn]\\nCN=localhost\\n[v3]\\nsubjectAltName=IP:127.0.0.1,DNS:localhost\\nbasicConstraints=critical,CA:TRUE\\n');
      execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config, '-keyout', key, '-out', cert], { stdio: 'ignore' });
      const context = createSecureContext({ key: readFileSync(key), cert: readFileSync(cert) });
      const sockets = new Set();
      let directAlpn = '';
      function forward(raw, direct) {
        const secure = new TLSSocket(raw, { isServer: true, secureContext: context, ALPNProtocols: ['postgresql'] });
        secure.on('error', () => secure.destroy());
        secure.once('secure', () => {
          if (direct) directAlpn = secure.alpnProtocol;
          const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
          sockets.add(upstream);
          upstream.on('close', () => sockets.delete(upstream));
          upstream.on('error', () => secure.destroy());
          secure.on('close', () => upstream.destroy());
          secure.pipe(upstream).pipe(secure);
        });
      }
      const proxy = createServer((raw) => {
        sockets.add(raw);
        raw.on('close', () => sockets.delete(raw));
        raw.on('error', () => {});
        raw.once('data', (request) => {
          if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) return raw.destroy();
          raw.write('S');
          forward(raw, false);
        });
      });
      const direct = createServer((raw) => {
        sockets.add(raw);
        raw.on('close', () => sockets.delete(raw));
        raw.on('error', () => {});
        forward(raw, true);
      });
      try {
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        await new Promise((resolve) => direct.listen(0, '127.0.0.1', resolve));
        const child = "import { createPostgresStore } from './src/services/kv/postgres.ts'; const store = createPostgresStore(process.env.TEST_URL); await store.set('review:verified-tls', 'ok', 60000); console.log(JSON.stringify({value: await store.get('review:verified-tls')})); process.exit(0);";
        const values = [];
        for (const [listener, mode] of [[proxy, 'standard'], [direct, 'direct']]) {
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = String(listener.address().port);
          url.searchParams.set('ssl', 'verify-full');
          if (mode === 'direct') url.searchParams.set('sslnegotiation', 'direct');
          const output = await promisify(execFile)(process.execPath, ['--no-warnings', '--input-type=module', '--eval', child], {
            cwd: process.cwd(), env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, TEST_URL: url.toString() }, timeout: 10_000
          });
          values.push(JSON.parse(output.stdout.trim().split('\\n').at(-1)).value);
        }
        console.log(JSON.stringify({ values, directAlpn }));
      } finally {
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        if (direct.listening) await new Promise((resolve) => direct.close(resolve));
        rmSync(directory, { recursive: true, force: true });
      }
    `;
    const { stdout } = await services.runNode(script, 15_000);
    expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({
      values: ['ok', 'ok'],
      directAlpn: 'postgresql'
    });
  }, 30_000);

  const tlsRuntimes = process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Node', 'Linux Node'] : ['Node'];
  it.each(
    tlsRuntimes
  )('does not send a late TLS command or crash %s when a held reply is released at timeout', async (runtime) => {
    const certificateScript = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
      import { join } from 'node:path';
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-review-tls-'));
      try {
        const key = join(directory, 'key.pem');
        const cert = join(directory, 'cert.pem');
        execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
        console.log(JSON.stringify({ key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') }));
      } finally { rmSync(directory, { recursive: true, force: true }); }
    `;
    const certificateOutput = await services.runBun(certificateScript);
    const certificate = JSON.parse(certificateOutput.stdout.trim()) as { key: string; cert: string };
    const script = `
      import { createConnection, createServer } from 'node:net';
      import { createSecureContext, TLSSocket } from 'node:tls';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const runtime = ${JSON.stringify(runtime === 'Linux Node' ? 'linux' : 'host')};
      const warmKey = 'review:tls-warm:' + runtime;
      const abortKey = 'review:tls-abort:' + runtime;
      const unrelatedKey = 'review:tls-unrelated:' + runtime;
      const applicationName = 'pr492-tls-abort-' + runtime;
      const context = createSecureContext(${JSON.stringify(certificate)});
      const sockets = new Set();
      let armed = false;
      let acceptingTls = false;
      let handshakeCloses = 0;
      let triggered = false;
      let released = false;
      let lateFrames = 0;
      let releaseHeld = () => {};
      let observed;
      const responseHeld = new Promise((resolve) => { observed = resolve; });
      const proxy = createServer((raw) => {
        sockets.add(raw);
        raw.on('close', () => sockets.delete(raw));
        raw.on('error', () => {});
        raw.once('data', (request) => {
          if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) return raw.destroy();
          if (!acceptingTls) {
            handshakeCloses++;
            if (handshakeCloses === 3) acceptingTls = true;
            raw.end();
            return;
          }
          raw.write('S');
          const secure = new TLSSocket(raw, { isServer: true, secureContext: context });
          sockets.add(secure);
          secure.on('error', () => secure.destroy());
          secure.on('close', () => sockets.delete(secure));
          secure.once('secure', () => {
            const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
            sockets.add(upstream);
            upstream.on('close', () => { sockets.delete(upstream); secure.destroy(); });
            upstream.on('error', () => secure.destroy());
            secure.on('close', () => upstream.destroy());
            let startup = true;
            let pending = Buffer.alloc(0);
            let hold = false;
            const held = [];
            secure.on('data', (data) => {
              pending = Buffer.concat([pending, data]);
              while (true) {
                if (startup) {
                  if (pending.length < 4) break;
                  const length = pending.readUInt32BE(0);
                  if (pending.length < length) break;
                  pending = pending.subarray(length); startup = false; continue;
                }
                if (pending.length < 5) break;
                const length = pending.readUInt32BE(1) + 1;
                if (length < 5 || length > 16_000_000) throw Error('invalid frontend frame');
                if (pending.length < length) break;
                const frame = pending.subarray(0, length);
                pending = pending.subarray(length);
                if (armed && !triggered && frame[0] === 80 && frame.toString('utf8').includes('INSERT INTO kv_store')) {
                  triggered = true;
                  hold = true;
                  releaseHeld = () => { released = true; hold = false; for (const chunk of held) secure.write(chunk); };
                } else if (hold === false && released && (frame[0] === 66 || frame[0] === 69)) {
                  lateFrames++;
                }
              }
              upstream.write(data);
            });
            upstream.on('data', (data) => {
              if (!hold) return secure.write(data);
              held.push(data);
              observed();
            });
          });
        });
      });
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const url = new URL(target);
      url.hostname = '127.0.0.1';
      url.port = String(proxy.address().port);
      url.searchParams.set('ssl', 'require');
      url.searchParams.set('application_name', applicationName);
      const store = createPostgresStore(url.toString());
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const originalAbort = AbortController.prototype.abort;
      AbortController.prototype.abort = function(...args) {
        if (triggered && !released) releaseHeld();
        return originalAbort.apply(this, args);
      };
      try {
        await store.set(warmKey, 'warm', 60_000);
        armed = true;
        const blocked = store.set(abortKey, 'bad', 60_000).then(() => ({ success: true }), (error) => ({ code: error.code }));
        await responseHeld;
        const unrelated = await store.incr(unrelatedKey, 60_000);
        const counts = await admin.unsafe('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [applicationName]);
        const result = await blocked;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [abortKey]);
        const strictUrl = new URL(url);
        strictUrl.searchParams.set('ssl', 'verify-full');
        const strict = createPostgresStore(strictUrl.toString());
        const strictOutcome = await strict.get(warmKey).then(() => 'success', (error) => error.code);
        const strictStarted = performance.now();
        const strictAgain = await strict.get(warmKey).then(() => 'success', (error) => error.code);
        const strictElapsed = performance.now() - strictStarted;
        console.log(JSON.stringify({ result, triggered, released, lateFrames, unrelated, connections: counts[0].n, rows: rows.length, strictOutcome, strictAgain, strictElapsed, handshakeCloses }));
      } finally {
        AbortController.prototype.abort = originalAbort;
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await (runtime === 'Linux Node'
      ? services.runLinuxNode(script, 20_000)
      : services.runNode(script, 20_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      result: { code?: string; success?: boolean };
      triggered: boolean;
      released: boolean;
      lateFrames: number;
      unrelated: number;
      connections: number;
      rows: number;
      strictOutcome: string;
      strictAgain: string;
      strictElapsed: number;
      handshakeCloses: number;
    };
    expect(result.result).toMatchObject({ code: 'POSTGRES_DEADLINE_EXCEEDED' });
    expect(result.triggered).toBe(true);
    expect(result.released).toBe(true);
    expect(result.lateFrames).toBe(0);
    expect(result.unrelated).toBe(1);
    expect(result.connections).toBeLessThanOrEqual(3);
    expect(result.rows).toBe(0);
    expect(result.strictOutcome).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(result.strictAgain).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(result.strictElapsed).toBeLessThan(2_000);
    expect(result.handshakeCloses).toBeGreaterThan(1);
    expect(result.handshakeCloses).toBeLessThan(10);
  }, 40_000);
});
