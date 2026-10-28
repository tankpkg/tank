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
      let stalledStartups = 0;
      let healthyConnections = 0;
      let followUpStarted = false;
      let secondSettled = false;
      let released = false;
      const events = [];
      const held = [];
      let observeStalled;
      let observeHealthy;
      let observeResponse;
      const stalledAgain = new Promise((resolve) => { observeStalled = resolve; });
      const healthyAccepted = new Promise((resolve) => { observeHealthy = resolve; });
      const responseHeld = new Promise((resolve) => { observeResponse = resolve; });
      const stalled = createServer((socket) => {
        stalledConnections++; sockets.add(socket);
        if (followUpStarted) { events.push('stalled'); observeStalled(); }
        socket.once('data', () => { stalledStartups++; });
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {}); socket.resume();
      });
      await new Promise((resolve) => stalled.listen(0, '127.0.0.1', resolve));
      const { server, url: proxyUrl } = await startProxy(undefined, (state, data) => {
        if (released) return false;
        if (!held.length) { events.push('response-held'); observeResponse(); }
        held.push({ state, data });
        return true;
      });
      server.on('connection', () => {
        healthyConnections++;
        events.push(followUpStarted ? 'healthy' : 'healthy-before-follow-up');
        if (followUpStarted) observeHealthy();
      });
      const url = 'postgresql://' + target.username + ':' + target.password + '@127.0.0.1:' + stalled.address().port + ',127.0.0.1:' + proxyUrl.port + target.pathname;
      const store = createPostgresStore(url);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      try {
        const first = await store.set('review:rotation-failed', 'bad', 60_000).then(() => 'success', (error) => error.code);
        const firstConnections = { stalled: stalledConnections, healthy: healthyConnections };
        followUpStarted = true;
        const second = store.set('review:rotation-recovered', 'ok', 60_000).then(
          () => { secondSettled = true; events.push('settled'); return 'success'; },
          (error) => { secondSettled = true; events.push('settled'); return error.code; }
        );
        const next = await Promise.race([
          healthyAccepted.then(() => 'healthy'),
          stalledAgain.then(() => 'stalled'),
          second.then(() => 'settled')
        ]);
        if (next !== 'healthy') throw Error('Expected the healthy host first; observed ' + next);
        const response = await Promise.race([responseHeld.then(() => 'held'), second.then(() => 'settled')]);
        if (response !== 'held') throw Error('Follow-up settled before a real PostgreSQL response was held');
        const settledBeforeRelease = secondSettled;
        released = true;
        events.push('response-released');
        for (const { state, data } of held) state.client.write(data);
        const secondResult = await second;
        const rows = await admin.unsafe("SELECT key, value FROM kv_store WHERE key IN ('review:rotation-failed', 'review:rotation-recovered') ORDER BY key");
        console.log(JSON.stringify({ first, firstConnections, second: secondResult, stalledConnections, stalledStartups,
          healthyConnections, settledBeforeRelease, events, rows }));
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => stalled.close(resolve));
        await closeProxy(server);
        await admin.end({ timeout: 2 });
      }
    `;
    const { stdout } = await services.runNode(script, 16_000);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      first: string;
      firstConnections: { stalled: number; healthy: number };
      second: string;
      stalledConnections: number;
      stalledStartups: number;
      healthyConnections: number;
      settledBeforeRelease: boolean;
      events: string[];
      rows: { key: string; value: string }[];
    };
    expect(result.first).toBe('CONNECT_TIMEOUT');
    expect(result.firstConnections).toEqual({ stalled: 1, healthy: 0 });
    expect(result.second).toBe('success');
    // Rotation is a routing guarantee, not a two-second end-to-end SLA for
    // the Docker relay, PostgreSQL startup, transaction, and COMMIT.
    expect(result.stalledConnections).toBe(1);
    expect(result.stalledStartups).toBe(1);
    expect(result.healthyConnections).toBe(1);
    expect(result.settledBeforeRelease).toBe(false);
    expect(result.events).toEqual(['healthy', 'response-held', 'response-released', 'settled']);
    expect(result.rows).toEqual([{ key: 'review:rotation-recovered', value: 'ok' }]);
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

  const plaintextRuntimes =
    process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Node', 'Bun', 'Linux Node'] : ['Node', 'Bun'];
  it.each(
    plaintextRuntimes
  )('rejects TLS parameters emptied by WHATWG control-character normalization on %s', async (runtime) => {
    const certificateScript = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-url-normalization-tls-'));
      try {
        const key = join(directory, 'key.pem');
        const cert = join(directory, 'cert.pem');
        const config = join(directory, 'openssl.cnf');
        writeFileSync(config, '[req]\\ndistinguished_name=dn\\nx509_extensions=v3\\nprompt=no\\n[dn]\\nCN=localhost\\n[v3]\\nsubjectAltName=IP:127.0.0.1\\nbasicConstraints=critical,CA:TRUE\\n');
        execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config, '-keyout', key, '-out', cert], { stdio: 'ignore' });
        console.log(JSON.stringify({ key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') }));
      } finally { rmSync(directory, { recursive: true, force: true }); }
    `;
    const certificateOutput = await services.runBun(certificateScript, 15_000);
    const certificate = JSON.parse(certificateOutput.stdout.trim()) as { key: string; cert: string };
    const script = `
      import { createConnection, createServer } from 'node:net';
      import { createSecureContext, getCACertificates, setDefaultCACertificates, TLSSocket } from 'node:tls';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const certificate = ${JSON.stringify(certificate)};
      const context = createSecureContext(certificate);
      const originalRoots = getCACertificates('default');
      setDefaultCACertificates([...originalRoots, certificate.cert]);
      const sockets = new Set();
      let sslRequests = 0;
      let plaintextBytes = 0;
      let plaintextStartups = 0;
      let secureRequests = 0;
      let secureBytes = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        let request = Buffer.alloc(0);
        let inspecting = true;
        client.on('close', () => {
          if (inspecting) plaintextBytes += request.length;
          sockets.delete(client); upstream.destroy();
        });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        client.on('data', (data) => {
          if (inspecting) {
            request = Buffer.concat([request, data]);
            if (request.length >= 8) {
              const code = request.readUInt32BE(4);
              const isSslRequest = request.readUInt32BE(0) === 8 && code === 80877103;
              if (isSslRequest) sslRequests++;
              else if (code === 196608) plaintextStartups++;
              plaintextBytes += request.length - (isSslRequest ? 8 : 0);
              inspecting = false;
            }
          } else plaintextBytes += data.length;
          upstream.write(data);
        });
        upstream.pipe(client);
      });
      const secureProxy = createServer((raw) => {
        sockets.add(raw);
        raw.on('close', () => sockets.delete(raw));
        raw.on('error', () => {});
        let request = Buffer.alloc(0);
        const receiveRequest = (data) => {
          request = Buffer.concat([request, data]);
          if (request.length < 8) return;
          raw.removeListener('data', receiveRequest);
          if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) return raw.destroy();
          secureRequests++;
          raw.write('S');
          const tls = new TLSSocket(raw, { isServer: true, secureContext: context });
          sockets.add(tls);
          tls.on('close', () => sockets.delete(tls));
          tls.on('error', () => tls.destroy());
          let upstream;
          const pending = [];
          tls.on('data', (chunk) => { secureBytes += chunk.length; if (upstream) upstream.write(chunk); else pending.push(chunk); });
          tls.once('secure', () => {
            upstream = createConnection({ host: target.hostname, port: Number(target.port) });
            sockets.add(upstream);
            upstream.on('close', () => sockets.delete(upstream));
            upstream.on('error', () => tls.destroy());
            tls.on('close', () => upstream.destroy());
            for (const chunk of pending) upstream.write(chunk);
            upstream.pipe(tls);
          });
        };
        raw.on('data', receiveRequest);
      });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        await new Promise((resolve) => secureProxy.listen(0, '127.0.0.1', resolve));
        process.env.PGSSLMODE = 'require';
        delete process.env.PGSSL;
        const base = new URL(target);
        base.hostname = '127.0.0.1';
        base.port = String(proxy.address().port);
        const cases = [];
        for (const parameter of ['sslmode', 'ssl']) {
          for (const [name, code] of [['newline', 10], ['tab', 9], ['carriage-return', 13]]) {
            cases.push({ name: parameter + ':' + name, parameter, code });
          }
        }
        cases.push({ name: 'requiring-tls-control', parameter: 'sslmode', code: null });
        const results = [];
        for (const item of cases) {
          const value = item.code === null ? 'require' : String.fromCharCode(item.code);
          // Build the original connection string directly: URL serialization
          // would remove the control character before the store receives it.
          const rawUrl = base.toString() + '?' + item.parameter + '=' + value + '&application_name=review';
          const normalized = new URL(rawUrl).searchParams.get(item.parameter);
          const parser = postgres(rawUrl, { max: 0 });
          const key = 'review:url-normalization:' + ${JSON.stringify(runtime)} + ':' + item.name;
          const before = { sslRequests, plaintextBytes, plaintextStartups };
          const outcome = await Promise.resolve().then(() => createPostgresStore(rawUrl).set(key, 'must-not-write', 60_000))
            .then(() => ({ success: true }), (error) => ({ success: false, message: error.message }));
          await new Promise((resolve) => setTimeout(resolve, 50));
          const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [key]);
          results.push({ name: item.name, normalized, rawHasControl: item.code === null ? false : rawUrl.includes(value),
            parsedSsl: Boolean(parser.options.ssl), outcome, rows: rows.length,
            traffic: { sslRequests: sslRequests - before.sslRequests, plaintextBytes: plaintextBytes - before.plaintextBytes,
              plaintextStartups: plaintextStartups - before.plaintextStartups } });
        }
        const secureUrl = new URL(target);
        secureUrl.hostname = '127.0.0.1';
        secureUrl.port = String(secureProxy.address().port);
        const secureKey = 'review:url-normalization-secure-control:' + ${JSON.stringify(runtime)};
        const secure = await Promise.resolve().then(async () => {
          const store = createPostgresStore(secureUrl.toString() + '?sslmode=require&application_name=review');
          await store.set(secureKey, 'ok', 60_000);
          return { success: true, value: await store.get(secureKey) };
        }).catch((error) => ({ success: false, message: error.message }));
        const secureRows = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [secureKey]);
        console.log(JSON.stringify({ results, secure, secureValue: secureRows[0]?.value ?? null, secureRequests, secureBytes }));
      } finally {
        delete process.env.PGSSLMODE;
        setDefaultCACertificates(originalRoots);
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        if (secureProxy.listening) await new Promise((resolve) => secureProxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const output = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      results: {
        name: string;
        normalized: string | null;
        rawHasControl: boolean;
        parsedSsl: boolean;
        outcome: { success: boolean; message?: string };
        rows: number;
        traffic: { sslRequests: number; plaintextBytes: number; plaintextStartups: number };
      }[];
      secure: { success: boolean; value?: string; message?: string };
      secureValue: string | null;
      secureRequests: number;
      secureBytes: number;
    };
    const { results } = output;
    expect(results.map((result) => result.name)).toEqual([
      'sslmode:newline',
      'sslmode:tab',
      'sslmode:carriage-return',
      'ssl:newline',
      'ssl:tab',
      'ssl:carriage-return',
      'requiring-tls-control'
    ]);
    for (const result of results) {
      const control = result.name === 'requiring-tls-control';
      const label = `${runtime}: ${result.name}, ${JSON.stringify(result.outcome)}, traffic=${JSON.stringify(result.traffic)}`;
      expect(result.normalized, label).toBe(control ? 'require' : '');
      expect(result.rawHasControl, label).toBe(!control);
      expect(result.parsedSsl, label).toBe(control);
      expect(result.outcome.success, label).toBe(false);
      expect(result.outcome.message, label).toMatch(/empty|TLS|SSL/i);
      expect(result.rows, label).toBe(0);
      expect(result.traffic.plaintextBytes, label).toBe(0);
      expect(result.traffic.plaintextStartups, label).toBe(0);
      if (control) expect(result.traffic.sslRequests, label).toBe(1);
    }
    expect(output.secure).toEqual({ success: true, value: 'ok' });
    expect(output.secureValue).toBe('ok');
    expect(output.secureRequests).toBe(1);
    expect(output.secureBytes).toBeGreaterThan(0);
  }, 30_000);

  it.each(
    plaintextRuntimes
  )('honors the last duplicate sslrootcert without bypassing PGSSLMODE on %s', async (runtime) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let sslRequests = 0;
      let plaintextBytes = 0;
      let plaintextStartups = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        let request = Buffer.alloc(0);
        let inspecting = true;
        client.on('data', (data) => {
          if (inspecting) {
            request = Buffer.concat([request, data]);
            if (request.length >= 8) {
              const code = request.readUInt32BE(4);
              const isSslRequest = request.readUInt32BE(0) === 8 && code === 80877103;
              if (isSslRequest) sslRequests++;
              else if (code === 196608) plaintextStartups++;
              plaintextBytes += request.length - (isSslRequest ? 8 : 0);
              inspecting = false;
            }
          } else plaintextBytes += data.length;
          upstream.write(data);
        });
        upstream.pipe(client);
      });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const cases = [
          { name: 'required-last-not-system', mode: 'require', values: ['system', 'not-system'] },
          { name: 'disabled-last-system', mode: 'disable', values: ['not-system', 'system'] },
          { name: 'disabled-last-not-system', mode: 'disable', values: ['system', 'not-system'] }
        ];
        const results = [];
        for (const item of cases) {
          process.env.PGSSLMODE = item.mode;
          delete process.env.PGSSL;
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = String(proxy.address().port);
          for (const value of item.values) url.searchParams.append('sslrootcert', value);
          const parser = postgres(url.toString(), { max: 0 });
          const parsed = { ssl: parser.options.ssl, rootcert: parser.options.connection.sslrootcert };
          const key = 'review:duplicate-sslrootcert:' + ${JSON.stringify(runtime)} + ':' + item.name;
          const before = { sslRequests, plaintextBytes, plaintextStartups };
          const outcome = await Promise.resolve().then(() => createPostgresStore(url.toString()).set(key, 'must-not-write', 60_000))
            .then(() => ({ success: true }), (error) => ({ success: false, code: error.code, message: error.message }));
          await new Promise((resolve) => setTimeout(resolve, 50));
          const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [key]);
          results.push({ name: item.name, values: url.searchParams.getAll('sslrootcert'), parsed, outcome, rows: rows.length,
            traffic: { sslRequests: sslRequests - before.sslRequests, plaintextBytes: plaintextBytes - before.plaintextBytes,
              plaintextStartups: plaintextStartups - before.plaintextStartups } });
        }
        console.log(JSON.stringify(results));
      } finally {
        delete process.env.PGSSLMODE;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const results = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      name: string;
      values: string[];
      parsed: { ssl: string | false; rootcert: string };
      outcome: { success: boolean; message?: string };
      rows: number;
      traffic: { sslRequests: number; plaintextBytes: number; plaintextStartups: number };
    }[];
    expect(results.map((result) => result.name)).toEqual([
      'required-last-not-system',
      'disabled-last-system',
      'disabled-last-not-system'
    ]);
    const [required, reversed, disabled] = results;
    expect(required.values).toEqual(['system', 'not-system']);
    expect(required.parsed).toEqual({ ssl: false, rootcert: 'not-system' });
    expect(required.outcome.success).toBe(false);
    expect(required.outcome.message).toMatch(/TLS|SSL/i);
    expect(required.rows).toBe(0);
    expect(required.traffic).toEqual({ sslRequests: 1, plaintextBytes: 0, plaintextStartups: 0 });
    expect(reversed.values).toEqual(['not-system', 'system']);
    expect(reversed.parsed).toEqual({ ssl: 'verify-full', rootcert: 'system' });
    expect(reversed.outcome.success).toBe(false);
    expect(reversed.outcome.message).toMatch(/TLS|SSL/i);
    expect(reversed.rows).toBe(0);
    expect(reversed.traffic).toEqual({ sslRequests: 1, plaintextBytes: 0, plaintextStartups: 0 });
    expect(disabled.values).toEqual(['system', 'not-system']);
    expect(disabled.parsed).toEqual({ ssl: false, rootcert: 'not-system' });
    expect(disabled.traffic.sslRequests).toBe(0);
    expect(disabled.traffic.plaintextStartups).toBe(1);
    expect(disabled.traffic.plaintextBytes).toBeGreaterThan(0);
  }, 30_000);

  it.each(plaintextRuntimes)('does not treat a URL fragment as an SSL query parameter on %s', async (runtime) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let sslRequests = 0;
      let plaintextBytes = 0;
      let plaintextStartups = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        let request = Buffer.alloc(0);
        let inspecting = true;
        client.on('data', (data) => {
          if (inspecting) {
            request = Buffer.concat([request, data]);
            if (request.length >= 8) {
              const code = request.readUInt32BE(4);
              const isSslRequest = request.readUInt32BE(0) === 8 && code === 80877103;
              if (isSslRequest) sslRequests++;
              else if (code === 196608) plaintextStartups++;
              plaintextBytes += request.length - (isSslRequest ? 8 : 0);
              inspecting = false;
            }
          } else plaintextBytes += data.length;
          upstream.write(data);
        });
        upstream.pipe(client);
      });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        process.env.PGSSLMODE = 'require';
        delete process.env.PGSSL;
        const url = new URL(target);
        url.hostname = '127.0.0.1';
        url.port = String(proxy.address().port);
        url.hash = '?sslmode=disable';
        const fragmentUrl = url.toString();
        const fragmentKey = 'review:fragment-rejected:' + ${JSON.stringify(runtime)};
        const before = { sslRequests, plaintextBytes, plaintextStartups };
        const fragment = await Promise.resolve().then(() => createPostgresStore(fragmentUrl).set(fragmentKey, 'must-not-write', 60_000))
          .then(() => ({ success: true }), (error) => ({ success: false, message: error.message }));
        const fragmentRows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [fragmentKey]);
        const fragmentTraffic = { sslRequests: sslRequests - before.sslRequests, plaintextBytes: plaintextBytes - before.plaintextBytes,
          plaintextStartups: plaintextStartups - before.plaintextStartups };
        url.hash = '';
        url.searchParams.set('sslmode', 'disable');
        const controlKey = 'review:fragment-query-control:' + ${JSON.stringify(runtime)};
        const controlBefore = { sslRequests, plaintextBytes, plaintextStartups };
        const control = await Promise.resolve().then(async () => {
          const store = createPostgresStore(url.toString());
          await store.set(controlKey, 'ok', 60_000);
          return { success: true, value: await store.get(controlKey) };
        }).catch((error) => ({ success: false, message: error.message }));
        const controlRows = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [controlKey]);
        const controlTraffic = { sslRequests: sslRequests - controlBefore.sslRequests, plaintextBytes: plaintextBytes - controlBefore.plaintextBytes,
          plaintextStartups: plaintextStartups - controlBefore.plaintextStartups };
        console.log(JSON.stringify({ fragmentUrlHasHash: fragmentUrl.endsWith('#?sslmode=disable'), fragment, fragmentRows: fragmentRows.length,
          fragmentTraffic, control, controlValue: controlRows[0]?.value ?? null, controlTraffic }));
      } finally {
        delete process.env.PGSSLMODE;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      fragmentUrlHasHash: boolean;
      fragment: { success: boolean; message?: string };
      fragmentRows: number;
      fragmentTraffic: { sslRequests: number; plaintextBytes: number; plaintextStartups: number };
      control: { success: boolean; value?: string };
      controlValue: string | null;
      controlTraffic: { sslRequests: number; plaintextBytes: number; plaintextStartups: number };
    };
    expect(result.fragmentUrlHasHash).toBe(true);
    expect(result.fragment.success).toBe(false);
    expect(result.fragment.message).toMatch(/TLS|SSL/i);
    expect(result.fragmentRows).toBe(0);
    expect(result.fragmentTraffic).toEqual({ sslRequests: 1, plaintextBytes: 0, plaintextStartups: 0 });
    expect(result.control).toEqual({ success: true, value: 'ok' });
    expect(result.controlValue).toBe('ok');
    expect(result.controlTraffic.sslRequests).toBe(0);
    expect(result.controlTraffic.plaintextStartups).toBe(1);
    expect(result.controlTraffic.plaintextBytes).toBeGreaterThan(0);
  }, 30_000);

  it.each(plaintextRuntimes)('rejects configured TLS without sending a plaintext startup on %s', async (runtime) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let requests = 0;
      let plaintextBytes = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        let request = Buffer.alloc(0);
        let awaitingRequest = true;
        client.on('data', (data) => {
          if (awaitingRequest) {
            request = Buffer.concat([request, data]);
            if (request.length >= 8) {
              const isSslRequest = request.readUInt32BE(0) === 8 && request.readUInt32BE(4) === 80877103;
              if (isSslRequest) requests++;
              plaintextBytes += request.length - (isSslRequest ? 8 : 0);
              awaitingRequest = false;
            }
          } else {
            plaintextBytes += data.length;
          }
          upstream.write(data);
        });
        upstream.pipe(client);
      });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const results = [];
        const configurations = ['ssl', 'sslmode'].flatMap((parameter) =>
          ['require', 'allow', 'prefer', 'verify-ca', 'verify-full'].map((mode) => ({ parameter, mode })));
        configurations.push({ parameter: 'PGSSL', mode: 'prefer' });
        for (const mode of ['require', 'allow', 'prefer', 'verify-ca', 'verify-full']) {
          configurations.push({ parameter: 'PGSSLMODE', mode });
        }
        configurations.push({ parameter: 'ssl', mode: 'require', environment: 'disable' });
        configurations.push({ parameter: 'sslmode', mode: 'verify-full', environment: 'disable' });
        let serial = 0;
        for (const { parameter, mode, environment } of configurations) {
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = String(proxy.address().port);
          delete process.env.PGSSL;
          delete process.env.PGSSLMODE;
          if (parameter === 'PGSSL') process.env.PGSSL = mode;
          else if (parameter === 'PGSSLMODE') process.env.PGSSLMODE = mode;
          else {
            url.searchParams.set(parameter, mode);
            if (environment) process.env.PGSSLMODE = environment;
          }
          const key = 'review:ssl-plaintext-rejected:' + parameter + ':' + mode + ':' + serial++;
          const before = { requests, plaintextBytes };
          const outcome = await Promise.resolve().then(() => createPostgresStore(url.toString()).set(key, 'must-not-write', 60_000))
            .then(() => ({ success: true }), (error) => ({ success: false, message: error.message }));
          const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [key]);
          results.push({ parameter, mode, environment: environment ?? null, outcome, requests: requests - before.requests, plaintextBytes: plaintextBytes - before.plaintextBytes, rows: rows.length });
        }
        console.log(JSON.stringify(results));
      } finally {
        delete process.env.PGSSL;
        delete process.env.PGSSLMODE;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const results = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      parameter: string;
      mode: string;
      environment: string | null;
      outcome: { success: boolean; message?: string };
      requests: number;
      plaintextBytes: number;
      rows: number;
    }[];
    expect(results.map((result) => `${result.parameter}:${result.mode}:${result.environment ?? ''}`)).toEqual([
      'ssl:require:',
      'ssl:allow:',
      'ssl:prefer:',
      'ssl:verify-ca:',
      'ssl:verify-full:',
      'sslmode:require:',
      'sslmode:allow:',
      'sslmode:prefer:',
      'sslmode:verify-ca:',
      'sslmode:verify-full:',
      'PGSSL:prefer:',
      'PGSSLMODE:require:',
      'PGSSLMODE:allow:',
      'PGSSLMODE:prefer:',
      'PGSSLMODE:verify-ca:',
      'PGSSLMODE:verify-full:',
      'ssl:require:disable',
      'sslmode:verify-full:disable'
    ]);
    for (const result of results) {
      const label = `${result.parameter}=${result.mode}, PGSSLMODE=${result.environment ?? 'unset'}, plaintextBytes=${result.plaintextBytes}, rows=${result.rows}`;
      expect(result.outcome.success, label).toBe(false);
      expect(result.outcome.message, label).toMatch(/TLS|SSL/i);
      expect(result.requests, label).toBe(1);
      expect(result.plaintextBytes, label).toBe(0);
      expect(result.rows, label).toBe(0);
    }
  }, 30_000);

  it.each(plaintextRuntimes)('honors explicit TLS disable and URL precedence on %s', async (runtime) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let startups = 0;
      let sslRequests = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        let pending = Buffer.alloc(0);
        let inspected = false;
        client.on('data', (data) => {
          if (!inspected) {
            pending = Buffer.concat([pending, data]);
            if (pending.length >= 8) {
              if (pending.readUInt32BE(4) === 196608) startups++;
              if (pending.readUInt32BE(4) === 80877103) sslRequests++;
              inspected = true;
            }
          }
          upstream.write(data);
        });
        upstream.pipe(client);
      });
      try {
        const settings = await admin.unsafe('SHOW ssl');
        if (settings[0].ssl !== 'off') throw Error('expected the owned PostgreSQL server to reject TLS');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const results = [];
        for (const [parameter, mode] of [['ssl', 'require'], ['sslmode', 'verify-full'], ['PGSSLMODE', 'disable']]) {
          process.env.PGSSLMODE = mode;
          delete process.env.PGSSL;
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = String(proxy.address().port);
          if (parameter !== 'PGSSLMODE') url.searchParams.set(parameter, 'disable');
          const key = 'review:explicit-ssl-disable:' + ${JSON.stringify(runtime)} + ':' + parameter;
          const before = { startups, sslRequests };
          const outcome = await Promise.resolve().then(async () => {
            const store = createPostgresStore(url.toString());
            await store.set(key, 'ok', 60_000);
            return { success: true, value: await store.get(key) };
          }).catch((error) => ({ success: false, message: error.message }));
          const rows = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          results.push({ parameter, mode, outcome, value: rows[0]?.value ?? null,
            startups: startups - before.startups, sslRequests: sslRequests - before.sslRequests });
        }
        console.log(JSON.stringify(results));
      } finally {
        delete process.env.PGSSLMODE;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const results = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      parameter: string;
      mode: string;
      outcome: { success: boolean; value?: string; message?: string };
      value: string | null;
      startups: number;
      sslRequests: number;
    }[];
    expect(results.map((result) => [result.parameter, result.mode])).toEqual([
      ['ssl', 'require'],
      ['sslmode', 'verify-full'],
      ['PGSSLMODE', 'disable']
    ]);
    for (const result of results) {
      const label = `${result.parameter}, PGSSLMODE=${result.mode}: ${JSON.stringify(result.outcome)}`;
      expect(result.outcome).toEqual({ success: true, value: 'ok' });
      expect(result.value, label).toBe('ok');
      expect(result.startups, label).toBe(1);
      expect(result.sslRequests, label).toBe(0);
    }
  }, 30_000);

  it.each(
    plaintextRuntimes
  )('rejects direct negotiation without TLS before any PostgreSQL bytes on %s', async (runtime) => {
    const script = `
      import { createConnection, createServer } from 'node:net';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const sockets = new Set();
      let bytes = 0;
      const proxy = createServer((client) => {
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(client); sockets.add(upstream);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => { sockets.delete(client); upstream.destroy(); });
        upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
        client.on('data', (data) => { bytes += data.length; upstream.write(data); });
        upstream.pipe(client);
      });
      try {
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const cases = [
          { name: 'url-default', direct: 'url' },
          { name: 'url-ssl-disable', direct: 'url', disabled: 'ssl' },
          { name: 'url-sslmode-disable', direct: 'url', disabled: 'sslmode' },
          { name: 'url-env-disable', direct: 'url', pgsslmode: 'disable' },
          { name: 'env-default', direct: 'environment' },
          { name: 'env-mode-disable', direct: 'environment', pgsslmode: 'disable' },
          { name: 'env-sslmode-disable', direct: 'environment', disabled: 'sslmode', pgsslmode: 'require' }
        ];
        const results = [];
        for (const item of cases) {
          delete process.env.PGSSL;
          delete process.env.PGSSLMODE;
          delete process.env.PGSSLNEGOTIATION;
          if (item.pgsslmode) process.env.PGSSLMODE = item.pgsslmode;
          const url = new URL(target);
          url.hostname = '127.0.0.1';
          url.port = String(proxy.address().port);
          if (item.direct === 'url') url.searchParams.set('sslnegotiation', 'direct');
          else process.env.PGSSLNEGOTIATION = 'direct';
          if (item.disabled) url.searchParams.set(item.disabled, 'disable');
          const key = 'review:direct-without-tls:' + ${JSON.stringify(runtime)} + ':' + item.name;
          const before = bytes;
          const outcome = await Promise.resolve().then(() => createPostgresStore(url.toString()).set(key, 'must-not-write', 60_000))
            .then(() => ({ success: true }), (error) => ({ success: false, message: error.message }));
          await new Promise((resolve) => setTimeout(resolve, 50));
          const rows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [key]);
          results.push({ name: item.name, outcome, bytes: bytes - before, rows: rows.length });
        }
        console.log(JSON.stringify(results));
      } finally {
        delete process.env.PGSSL;
        delete process.env.PGSSLMODE;
        delete process.env.PGSSLNEGOTIATION;
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 15_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 15_000)
        : services.runNode(script, 15_000));
    const results = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      name: string;
      outcome: { success: boolean; message?: string };
      bytes: number;
      rows: number;
    }[];
    expect(results.map((result) => result.name)).toEqual([
      'url-default',
      'url-ssl-disable',
      'url-sslmode-disable',
      'url-env-disable',
      'env-default',
      'env-mode-disable',
      'env-sslmode-disable'
    ]);
    for (const result of results) {
      const label = `${result.name}: ${JSON.stringify(result.outcome)}, bytes=${result.bytes}, rows=${result.rows}`;
      expect(result.outcome.success, label).toBe(false);
      expect(result.outcome.message, label).toMatch(/direct|TLS|SSL/i);
      expect(result.bytes, label).toBe(0);
      expect(result.rows, label).toBe(0);
    }
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

  const certificateRuntimes =
    process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Node', 'Bun', 'Linux Node'] : ['Node', 'Bun'];
  it.each(
    certificateRuntimes
  )('rejects an untrusted server when TLS verification is disabled at process startup on %s', async (runtime) => {
    const certificateScript = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-inherited-tls-cert-'));
      try {
        const key = join(directory, 'key.pem');
        const cert = join(directory, 'cert.pem');
        const config = join(directory, 'openssl.cnf');
        writeFileSync(config, '[req]\\ndistinguished_name=dn\\nx509_extensions=v3\\nprompt=no\\n[dn]\\nCN=localhost\\n[v3]\\nsubjectAltName=IP:127.0.0.1\\nbasicConstraints=critical,CA:TRUE\\n');
        execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config, '-keyout', key, '-out', cert], { stdio: 'ignore' });
        console.log(JSON.stringify({ key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') }));
      } finally { rmSync(directory, { recursive: true, force: true }); }
    `;
    const certificateOutput = await services.runBun(certificateScript, 15_000);
    const certificate = JSON.parse(certificateOutput.stdout.trim()) as { key: string; cert: string };
    const controlChild = `
      import { createConnection } from 'node:net';
      import { connect } from 'node:tls';
      const raw = createConnection({ host: '127.0.0.1', port: Number(process.env.TEST_PORT) });
      await new Promise((resolve, reject) => { raw.once('connect', resolve); raw.once('error', reject); });
      const response = await new Promise((resolve, reject) => {
        raw.once('data', resolve); raw.once('error', reject);
        raw.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
      });
      if (response[0] !== 83) throw Error('expected SSL acceptance');
      const secure = connect({ socket: raw, host: '127.0.0.1' });
      await new Promise((resolve, reject) => { secure.once('secureConnect', resolve); secure.once('error', reject); });
      console.log(JSON.stringify({ inherited: process.env.NODE_TLS_REJECT_UNAUTHORIZED, accepted: true,
        authorized: secure.authorized, authorizationError: secure.authorizationError }));
      secure.destroy();
      process.exit(0);
    `;
    const storeChild = `
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const inherited = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      const store = createPostgresStore(process.env.TEST_URL);
      try {
        await store.set(process.env.TEST_KEY, 'ok', 60_000);
        console.log(JSON.stringify({ inherited, success: true, value: await store.get(process.env.TEST_KEY) }));
      } catch (error) {
        console.log(JSON.stringify({ inherited, success: false, code: error.code, message: error.message }));
      }
      process.exit(0);
    `;
    const script = `
      import { execFile } from 'node:child_process';
      import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
      import { createConnection, createServer } from 'node:net';
      import { join } from 'node:path';
      import { createSecureContext, TLSSocket } from 'node:tls';
      import { promisify } from 'node:util';
      import postgres from 'postgres';
      const target = new URL(process.env.DATABASE_URL);
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      const certificate = ${JSON.stringify(certificate)};
      const context = createSecureContext(certificate);
      const directory = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'pr492-inherited-tls-'));
      const certPath = join(directory, 'trusted.pem');
      writeFileSync(certPath, certificate.cert);
      const sockets = new Set();
      let requests = 0;
      let applicationBytes = 0;
      const proxy = createServer((raw) => {
        sockets.add(raw);
        raw.on('close', () => sockets.delete(raw));
        raw.on('error', () => {});
        let request = Buffer.alloc(0);
        const receiveRequest = (data) => {
          request = Buffer.concat([request, data]);
          if (request.length < 8) return;
          raw.removeListener('data', receiveRequest);
          if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) return raw.destroy();
          requests++;
          raw.write('S');
          const tls = new TLSSocket(raw, { isServer: true, secureContext: context });
          sockets.add(tls);
          tls.on('close', () => sockets.delete(tls));
          tls.on('error', () => tls.destroy());
          let upstream;
          const pending = [];
          tls.on('data', (data) => {
            applicationBytes += data.length;
            if (upstream) upstream.write(data); else pending.push(data);
          });
          tls.once('secure', () => {
            upstream = createConnection({ host: target.hostname, port: Number(target.port) });
            sockets.add(upstream);
            upstream.on('close', () => sockets.delete(upstream));
            upstream.on('error', () => tls.destroy());
            tls.on('close', () => upstream.destroy());
            for (const data of pending) upstream.write(data);
            upstream.pipe(tls);
          });
        };
        raw.on('data', receiveRequest);
      });
      const execute = promisify(execFile);
      async function child(source, extra) {
        const environment = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0', ...extra };
        if (!extra.NODE_EXTRA_CA_CERTS) delete environment.NODE_EXTRA_CA_CERTS;
        const args = process.versions.bun ? ['--no-env-file', '--no-install', '-e', source]
          : ['--no-warnings', '--input-type=module', '--eval', source];
        const output = await execute(process.execPath, args, { cwd: process.cwd(), env: environment, timeout: 10_000 });
        return JSON.parse(output.stdout.trim().split('\\n').at(-1));
      }
      try {
        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const url = new URL(target);
        url.hostname = '127.0.0.1';
        url.port = String(proxy.address().port);
        url.searchParams.set('sslmode', 'require');
        const control = await child(${JSON.stringify(controlChild)}, { TEST_PORT: String(proxy.address().port) });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const badKey = 'review:inherited-tls-rejected:' + ${JSON.stringify(runtime)};
        const beforeBad = { requests, applicationBytes };
        const rejected = await child(${JSON.stringify(storeChild)}, { TEST_URL: url.toString(), TEST_KEY: badKey });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const rejectedRows = await admin.unsafe('SELECT key FROM kv_store WHERE key = $1', [badKey]);
        const rejectedTraffic = { requests: requests - beforeBad.requests, applicationBytes: applicationBytes - beforeBad.applicationBytes };
        const goodKey = 'review:inherited-tls-trusted:' + ${JSON.stringify(runtime)};
        const beforeGood = { requests, applicationBytes };
        const trusted = await child(${JSON.stringify(storeChild)}, { TEST_URL: url.toString(), TEST_KEY: goodKey, NODE_EXTRA_CA_CERTS: certPath });
        const trustedRows = await admin.unsafe('SELECT value FROM kv_store WHERE key = $1', [goodKey]);
        const trustedTraffic = { requests: requests - beforeGood.requests, applicationBytes: applicationBytes - beforeGood.applicationBytes };
        console.log(JSON.stringify({ control, rejected, rejectedRows: rejectedRows.length, rejectedTraffic,
          trusted, trustedValue: trustedRows[0]?.value ?? null, trustedTraffic }));
      } finally {
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
        await admin.end({ timeout: 2 });
        rmSync(directory, { recursive: true, force: true });
      }
      process.exit(0);
    `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 30_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 30_000)
        : services.runNode(script, 30_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      control: { inherited: string; accepted: boolean; authorized: boolean; authorizationError?: string };
      rejected: { inherited: string; success: boolean; code?: string };
      rejectedRows: number;
      rejectedTraffic: { requests: number; applicationBytes: number };
      trusted: { inherited: string; success: boolean; value?: string };
      trustedValue: string | null;
      trustedTraffic: { requests: number; applicationBytes: number };
    };
    expect(result.control).toMatchObject({ inherited: '0', accepted: true, authorized: false });
    expect(result.control.authorizationError).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(result.rejected).toMatchObject({ inherited: '0', success: false, code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    expect(result.rejectedRows).toBe(0);
    expect(result.rejectedTraffic).toEqual({ requests: 1, applicationBytes: 0 });
    expect(result.trusted).toEqual({ inherited: '0', success: true, value: 'ok' });
    expect(result.trustedValue).toBe('ok');
    expect(result.trustedTraffic.requests).toBe(1);
    expect(result.trustedTraffic.applicationBytes).toBeGreaterThan(0);
  }, 60_000);

  it.each(
    certificateRuntimes
  )('requires a trusted matching certificate for PostgreSQL TLS modes on %s', async (runtime) => {
    const certificateScript = `
        import { execFileSync } from 'node:child_process';
        import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
        import { join } from 'node:path';
        const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-tls-matrix-'));
        try {
          const certificates = {};
          for (const [name, commonName, alternative] of [
            ['dns', 'localhost', 'DNS:localhost'],
            ['ip', 'valid-ip.example', 'IP:127.0.0.1'],
            ['wrong', 'wrong.example', 'DNS:wrong.example'],
            ['untrusted', 'untrusted.example', 'IP:127.0.0.1']
          ]) {
            const key = join(directory, name + '.key');
            const cert = join(directory, name + '.crt');
            const config = join(directory, name + '.cnf');
            writeFileSync(config, ['[req]', 'distinguished_name=dn', 'x509_extensions=v3', 'prompt=no', '[dn]',
              'CN=' + commonName, '[v3]', 'subjectAltName=' + alternative, 'basicConstraints=critical,CA:TRUE'].join('\\n'));
            execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
              '-config', config, '-keyout', key, '-out', cert], { stdio: 'ignore' });
            certificates[name] = { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') };
          }
          console.log(JSON.stringify(certificates));
        } finally { rmSync(directory, { recursive: true, force: true }); }
      `;
    const certificateOutput = await services.runBun(certificateScript, 15_000);
    const certificates = JSON.parse(certificateOutput.stdout.trim()) as Record<string, { key: string; cert: string }>;
    const script = `
        import { setDefaultResultOrder } from 'node:dns';
        import { createConnection, createServer } from 'node:net';
        import { createSecureContext, TLSSocket, getCACertificates, setDefaultCACertificates } from 'node:tls';
        import postgres from 'postgres';
        import { createPostgresStore } from './src/services/kv/postgres.ts';
        const certificates = ${JSON.stringify(certificates)};
        const target = new URL(process.env.DATABASE_URL);
        const originalRoots = getCACertificates('default');
        setDefaultCACertificates([...originalRoots, certificates.dns.cert, certificates.ip.cert, certificates.wrong.cert]);
        setDefaultResultOrder('ipv4first');
        const admin = postgres(target.toString(), { max: 1, prepare: false });
        const sockets = new Set();
        const listeners = [];
        const results = [];
        let serial = 0;
        function listener(certificate, direct, advertiseAlpn = true) {
          const state = { bytes: 0, alpn: '', handshakes: 0, connections: 0, keyEvents: 0 };
          const context = createSecureContext(certificate);
          const server = createServer((raw) => {
            state.connections++;
            sockets.add(raw);
            raw.on('close', () => sockets.delete(raw));
            raw.on('error', () => {});
            function secure() {
              const tls = new TLSSocket(raw, { isServer: true, secureContext: context,
                ...(advertiseAlpn ? { ALPNProtocols: ['postgresql'] } : {}) });
              sockets.add(tls);
              tls.on('close', () => sockets.delete(tls));
              tls.on('error', () => tls.destroy());
              // Node may close immediately on missing ALPN before the server's
              // secure event. Count TLS key-schedule events without retaining keys.
              tls.on('keylog', () => { state.keyEvents++; });
              let upstream;
              const pending = [];
              // Count decrypted bytes even if the peer closes before the
              // server's secure event, and forward them only to owned PostgreSQL.
              tls.on('data', (data) => {
                state.bytes += data.length;
                if (upstream) upstream.write(data); else pending.push(data);
              });
              tls.once('secure', () => {
                state.handshakes++;
                state.alpn = tls.alpnProtocol || '';
                upstream = createConnection({ host: target.hostname, port: Number(target.port) });
                sockets.add(upstream);
                upstream.on('close', () => sockets.delete(upstream));
                upstream.on('error', () => tls.destroy());
                tls.on('close', () => upstream.destroy());
                for (const data of pending) upstream.write(data);
                upstream.pipe(tls);
              });
            }
            if (direct) return secure();
            raw.once('data', (request) => {
              if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) return raw.destroy();
              raw.write('S');
              secure();
            });
          });
          return { server, state };
        }
        try {
          await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
          for (const direct of [false, true]) {
            for (const name of ['dns', 'ip', 'wrong', 'untrusted']) {
              const item = { ...listener(certificates[name], direct), name, direct };
              listeners.push(item);
              await new Promise((resolve) => item.server.listen(0, '127.0.0.1', resolve));
            }
          }
          const noAlpn = { ...listener(certificates.ip, true, false), name: 'no-alpn', direct: true };
          listeners.push(noAlpn);
          await new Promise((resolve) => noAlpn.server.listen(0, '127.0.0.1', resolve));
          async function exercise(mode, direct, scenario, parameter = 'sslmode', negotiation = 'url') {
            const definitions = {
              'matching-dns': { cert: 'dns', host: 'localhost', valid: true },
              'matching-ip': { cert: 'ip', host: '127.0.0.1', valid: true },
              'wrong-dns': { cert: 'wrong', host: 'localhost', valid: false },
              'wrong-ip': { cert: 'dns', host: '127.0.0.1', valid: false },
              'untrusted-ip': { cert: 'untrusted', host: '127.0.0.1', valid: false },
              'no-alpn-ip': { cert: 'no-alpn', host: '127.0.0.1', valid: false }
            };
            const definition = definitions[scenario];
            const item = listeners.find((candidate) => candidate.name === definition.cert && candidate.direct === direct);
            const url = new URL(target);
            url.hostname = definition.host;
            url.port = String(item.server.address().port);
            delete process.env.PGSSL;
            delete process.env.PGSSLMODE;
            delete process.env.PGSSLNEGOTIATION;
            if (parameter === 'PGSSL') process.env.PGSSL = mode;
            else if (parameter === 'PGSSLMODE') process.env.PGSSLMODE = mode;
            else url.searchParams.set(parameter, mode);
            if (direct && negotiation === 'environment') process.env.PGSSLNEGOTIATION = 'direct';
            else if (direct) url.searchParams.set('sslnegotiation', 'direct');
            const key = 'review:tls-matrix:' + ${JSON.stringify(runtime)} + ':' + serial++;
            const bytes = item.state.bytes;
            const handshakes = item.state.handshakes;
            const connections = item.state.connections;
            const keyEvents = item.state.keyEvents;
            item.state.alpn = '';
            const store = createPostgresStore(url.toString());
            const operation = store.set(key, 'ok', 60_000).then(async () => ({ success: true, value: await store.get(key) }),
              (error) => ({ success: false, code: error.code, message: error.message }));
            let timer;
            const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('TLS case timed out: ' + mode + ':' + scenario)), 4_000); });
            const outcome = await Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
            await new Promise((resolve) => setTimeout(resolve, scenario === 'no-alpn-ip' ? 50 : 10));
            results.push({ mode, direct, scenario, parameter, negotiation, valid: definition.valid, key, outcome,
              bytes: item.state.bytes - bytes, handshakes: item.state.handshakes - handshakes,
              connections: item.state.connections - connections, keyEvents: item.state.keyEvents - keyEvents, alpn: item.state.alpn });
          }
          for (const direct of [false, true]) {
            for (const mode of ['require', 'allow', 'prefer', 'verify-ca', 'verify-full']) {
              for (const scenario of ['matching-dns', 'matching-ip', 'wrong-dns', 'wrong-ip', 'untrusted-ip']) {
                await exercise(mode, direct, scenario);
              }
              await exercise(mode, direct, 'matching-ip', 'ssl');
              await exercise(mode, direct, 'untrusted-ip', 'ssl');
            }
          }
          await exercise('require', false, 'matching-ip', 'PGSSL');
          await exercise('require', false, 'untrusted-ip', 'PGSSL');
          await exercise('verify-full', false, 'wrong-ip', 'PGSSL');
          for (const mode of ['require', 'allow', 'prefer', 'verify-ca', 'verify-full']) {
            for (const scenario of ['matching-ip', 'wrong-ip', 'untrusted-ip']) {
              await exercise(mode, false, scenario, 'PGSSLMODE');
            }
            await exercise(mode, true, 'no-alpn-ip');
          }
          await exercise('verify-full', true, 'no-alpn-ip', 'PGSSLMODE', 'environment');
          await exercise('verify-full', true, 'matching-ip', 'PGSSLMODE', 'environment');
          // The socket must remain strict even if Node's global default is disabled.
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          await exercise('require', false, 'untrusted-ip');
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          const rows = await admin.unsafe('SELECT key, value FROM kv_store WHERE key LIKE $1',
            ['review:tls-matrix:' + ${JSON.stringify(runtime)} + ':%']);
          console.log(JSON.stringify({ results, rows }));
        } finally {
          delete process.env.PGSSL;
          delete process.env.PGSSLMODE;
          delete process.env.PGSSLNEGOTIATION;
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          setDefaultCACertificates(originalRoots);
          for (const socket of sockets) socket.destroy();
          for (const item of listeners) if (item.server.listening) await new Promise((resolve) => item.server.close(resolve));
          await admin.end({ timeout: 2 });
        }
        process.exit(0);
      `;
    const { stdout } = await (runtime === 'Bun'
      ? services.runBun(script, 80_000)
      : runtime === 'Linux Node'
        ? services.runLinuxNode(script, 80_000)
        : services.runNode(script, 80_000));
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      results: {
        mode: string;
        direct: boolean;
        scenario: string;
        parameter: string;
        negotiation: string;
        valid: boolean;
        key: string;
        outcome: { success: boolean; value?: string; code?: string; message?: string };
        bytes: number;
        handshakes: number;
        connections: number;
        keyEvents: number;
        alpn: string;
      }[];
      rows: { key: string; value: string }[];
    };
    expect(result.results).toHaveLength(96);
    const persisted = new Map(result.rows.map((row) => [row.key, row.value]));
    for (const entry of result.results) {
      const label = `${runtime}: ${entry.parameter}=${entry.mode}, ${entry.direct ? `direct (${entry.negotiation})` : 'standard'}, ${entry.scenario}: ${JSON.stringify(entry.outcome)}, bytes=${entry.bytes}, persisted=${persisted.has(entry.key)}`;
      expect(entry.outcome.success, label).toBe(entry.valid);
      if (entry.valid) {
        expect(entry.outcome.value, label).toBe('ok');
        expect(entry.bytes, label).toBeGreaterThan(0);
        expect(persisted.get(entry.key), label).toBe('ok');
        if (entry.direct) expect(entry.alpn, label).toBe('postgresql');
      } else {
        if (entry.scenario === 'no-alpn-ip') {
          expect(entry.outcome.message, label).toMatch(/ALPN|protocol/i);
          expect(entry.connections, label).toBe(1);
          expect(entry.handshakes + entry.keyEvents, label).toBeGreaterThan(0);
          expect(entry.alpn, label).toBe('');
        } else {
          expect(entry.outcome.code, label).toBe(
            entry.scenario === 'untrusted-ip' ? 'DEPTH_ZERO_SELF_SIGNED_CERT' : 'ERR_TLS_CERT_ALTNAME_INVALID'
          );
        }
        expect(entry.bytes, label).toBe(0);
        expect(persisted.has(entry.key), label).toBe(false);
      }
    }
    expect(persisted.size).toBe(result.results.filter((entry) => entry.valid).length);
  }, 120_000);

  const tlsRuntimes = process.env.PR492_LINUX_CONTAINER_TEST === '1' ? ['Node', 'Linux Node'] : ['Node'];
  it.each(
    tlsRuntimes
  )('does not send a late TLS command or crash %s when a held reply is released at timeout', async (runtime) => {
    const certificateScript = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const directory = mkdtempSync(join(process.env.TMPDIR, 'pr492-review-tls-'));
      try {
        const key = join(directory, 'key.pem');
        const cert = join(directory, 'cert.pem');
        const config = join(directory, 'openssl.cnf');
        writeFileSync(config, '[req]\\ndistinguished_name=dn\\nx509_extensions=v3\\nprompt=no\\n[dn]\\nCN=localhost\\n[v3]\\nsubjectAltName=IP:127.0.0.1,DNS:localhost\\nbasicConstraints=critical,CA:TRUE\\n');
        execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config, '-keyout', key, '-out', cert], { stdio: 'ignore' });
        console.log(JSON.stringify({ key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') }));
      } finally { rmSync(directory, { recursive: true, force: true }); }
    `;
    const certificateOutput = await services.runBun(certificateScript);
    const certificate = JSON.parse(certificateOutput.stdout.trim()) as { key: string; cert: string };
    const script = `
      import { createConnection, createServer } from 'node:net';
      import { createSecureContext, getCACertificates, setDefaultCACertificates, TLSSocket } from 'node:tls';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      const target = new URL(process.env.DATABASE_URL);
      const runtime = ${JSON.stringify(runtime === 'Linux Node' ? 'linux' : 'host')};
      const warmKey = 'review:tls-warm:' + runtime;
      const abortKey = 'review:tls-abort:' + runtime;
      const unrelatedKey = 'review:tls-unrelated:' + runtime;
      const applicationName = 'pr492-tls-abort-' + runtime;
      const context = createSecureContext(${JSON.stringify(certificate)});
      const originalRoots = getCACertificates('default');
      setDefaultCACertificates([...originalRoots, ${JSON.stringify(certificate.cert)}]);
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
        // The timeout fixture trusts its server; restore the original roots so
        // the independent verify-full checks still exercise an untrusted cert.
        setDefaultCACertificates(originalRoots);
        const strictUrl = new URL(url);
        strictUrl.searchParams.set('ssl', 'verify-full');
        const strict = createPostgresStore(strictUrl.toString());
        const strictOutcome = await strict.get(warmKey).then(() => 'success', (error) => error.code);
        const strictStarted = performance.now();
        const strictAgain = await strict.get(warmKey).then(() => 'success', (error) => error.code);
        const strictElapsed = performance.now() - strictStarted;
        console.log(JSON.stringify({ result, triggered, released, lateFrames, unrelated, connections: counts[0].n, rows: rows.length, strictOutcome, strictAgain, strictElapsed, handshakeCloses }));
      } finally {
        setDefaultCACertificates(originalRoots);
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
