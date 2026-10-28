// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('Redis prefix slots and rate-counter expiry', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('redis');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('handles stringNumbers replies for real CLI sessions, mismatches, and counters', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import Redis from 'ioredis';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const configured = new URL(original);
        configured.searchParams.set('stringNumbers', 'true');
        process.env.REDIS_URL = configured.toString();
        const { createRedisStore } = await import('./src/services/kv/redis.ts');
        const sessions = await import('./src/lib/auth/cli-store.ts');
        const store = createRedisStore(configured.toString());
        const state = randomUUID();
        const key = 'review:string-numbers:' + randomUUID();
        const counter = key + ':counter';
        const negative = key + ':negative';
        const boundary = key + ':boundary';
        let code;
        const observe = async (operation) => {
          try { return { value: await operation(), error: null }; }
          catch (error) { return { value: null, error: String(error) }; }
        };
        try {
          code = await sessions.createSession(state);
          const authorized = await observe(() => sessions.authorizeSession(code, 'review-user'));
          const wrongState = await observe(() => sessions.consumeSession(code, 'incorrect-state'));
          const consumed = await observe(async () => !!(await sessions.consumeSession(code, state)));
          const repeated = await observe(async () => !!(await sessions.consumeSession(code, state)));
          await store.set(key, 'pending', 60_000);
          const mismatchSet = await observe(() => store.compareAndSet(key, 'wrong', 'authorized'));
          const matchedSet = await observe(() => store.compareAndSet(key, 'pending', 'authorized'));
          const mismatchDelete = await observe(() => store.compareAndDelete(key, 'wrong'));
          const matchedDelete = await observe(() => store.compareAndDelete(key, 'authorized'));
          const first = await observe(() => store.incr(counter, 60_000));
          const second = await observe(() => store.incr(counter, 60_000));
          await admin.set(negative, '-2', 'PX', 60_000);
          const negativeFirst = await observe(() => store.incr(negative, 60_000));
          const negativeSecond = await observe(() => store.incr(negative, 60_000));
          await admin.set(boundary, '9007199254740990', 'PX', 60_000);
          const lastSafe = await observe(() => store.incr(boundary, 60_000));
          const beyondSafe = await observe(() => store.incr(boundary, 60_000));
          console.log(JSON.stringify({ authorized, wrongState, consumed, repeated, mismatchSet, matchedSet,
            mismatchDelete, matchedDelete, first, second, negativeFirst, negativeSecond, lastSafe, beyondSafe,
            boundaryValue: await admin.get(boundary),
            counterValue: await admin.get(counter), counterTtl: await admin.pttl(counter) }));
        } finally {
          for (const item of [key, 'cli-auth-v2:' + code]) {
            const receipts = await admin.keys('{' + item + '}:tank-kv-op:*');
            await admin.del(item, ...receipts);
          }
          await admin.del(counter, negative, boundary);
          await admin.quit();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      authorized: { value: boolean; error: string | null };
      wrongState: { value: null; error: string | null };
      consumed: { value: boolean; error: string | null };
      repeated: { value: boolean; error: string | null };
      mismatchSet: { value: boolean; error: string | null };
      matchedSet: { value: boolean; error: string | null };
      mismatchDelete: { value: boolean; error: string | null };
      matchedDelete: { value: boolean; error: string | null };
      first: { value: number; error: string | null };
      second: { value: number; error: string | null };
      negativeFirst: { value: number; error: string | null };
      negativeSecond: { value: number; error: string | null };
      lastSafe: { value: number; error: string | null };
      beyondSafe: { value: number | null; error: string | null };
      boundaryValue: string;
      counterValue: string;
      counterTtl: number;
    };
    expect(result.authorized).toEqual({ value: true, error: null });
    expect(result.wrongState).toEqual({ value: null, error: null });
    expect(result.consumed).toEqual({ value: true, error: null });
    expect(result.repeated).toEqual({ value: false, error: null });
    expect(result.mismatchSet).toEqual({ value: false, error: null });
    expect(result.matchedSet).toEqual({ value: true, error: null });
    expect(result.mismatchDelete).toEqual({ value: false, error: null });
    expect(result.matchedDelete).toEqual({ value: true, error: null });
    expect(result.first).toEqual({ value: 1, error: null });
    expect(result.second).toEqual({ value: 2, error: null });
    expect(result.negativeFirst).toEqual({ value: -1, error: null });
    expect(result.negativeSecond).toEqual({ value: 0, error: null });
    expect(result.lastSafe).toEqual({ value: Number.MAX_SAFE_INTEGER, error: null });
    expect(result.beyondSafe.value).toBeNull();
    expect(result.beyondSafe.error).toMatch(/Unexpected Redis increment result/);
    expect(result.boundaryValue).toBe('9007199254740992');
    expect(result.counterValue).toBe('2');
    expect(result.counterTtl).toBeGreaterThan(0);
  }, 50_000);

  it('handles stringNumbers when successful Redis replies are lost and resent', async () => {
    const script = String.raw`
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        let target = false;
        let dropped = 0;
        const proxy = createServer((client) => {
          const upstream = createConnection({ host: original.hostname, port: Number(original.port) });
          let awaitingReply = false;
          client.on('data', (data) => {
            if (target && data.toString().toUpperCase().includes('\r\nEVAL\r\n')) awaitingReply = true;
            upstream.write(data);
          });
          upstream.on('data', (data) => {
            if (awaitingReply && target && data.toString().startsWith(':1\r\n')) {
              target = false;
              dropped++;
              client.destroy();
              upstream.destroy();
            } else client.write(data);
          });
          client.on('error', () => upstream.destroy());
          upstream.on('error', () => client.destroy());
        });
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const address = proxy.address();
        if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw Error('Proxy is not loopback');
        const proxied = new URL(original);
        proxied.port = String(address.port);
        proxied.searchParams.set('stringNumbers', 'true');
        process.env.REDIS_URL = proxied.toString();
        const { createRedisStore } = await import('./src/services/kv/redis.ts');
        const sessions = await import('./src/lib/auth/cli-store.ts');
        const store = createRedisStore(proxied.toString());
        const state = randomUUID();
        const counter = 'review:string-retry:' + randomUUID();
        let code;
        try {
          code = await sessions.createSession(state);
          target = true;
          const authorized = await sessions.authorizeSession(code, 'review-user');
          target = true;
          const consumed = !!(await sessions.consumeSession(code, state));
          const repeated = !!(await sessions.consumeSession(code, state));
          target = true;
          const count = await store.incr(counter, 60_000);
          console.log(JSON.stringify({ dropped, authorized, consumed, repeated, count,
            counterValue: await admin.get(counter), counterTtl: await admin.pttl(counter) }));
        } finally {
          const session = 'cli-auth-v2:' + code;
          const receipts = await admin.keys('{' + session + '}:tank-kv-op:*');
          await admin.del(session, counter, ...receipts);
          await admin.quit();
          proxy.close();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      dropped: number;
      authorized: boolean;
      consumed: boolean;
      repeated: boolean;
      count: number;
      counterValue: string;
      counterTtl: number;
    };
    expect(result.dropped).toBe(3);
    expect(result.authorized).toBe(true);
    expect(result.consumed).toBe(true);
    expect(result.repeated).toBe(false);
    expect(result.count).toBe(2);
    expect(result.counterValue).toBe('2');
    expect(result.counterTtl).toBeGreaterThan(0);
  }, 50_000);

  it('rejects malformed or unsafe integer replies rather than treating them as success', async () => {
    const script = String.raw`
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const keys = [];
        let replacement = null;
        let replaced = 0;
        const proxy = createServer((client) => {
          const upstream = createConnection({ host: original.hostname, port: Number(original.port) });
          let awaitingReply = false;
          client.on('data', (data) => {
            if (replacement !== null && data.toString().toUpperCase().includes('\r\nEVAL\r\n')) awaitingReply = true;
            upstream.write(data);
          });
          upstream.on('data', (data) => {
            if (awaitingReply && replacement !== null && data.toString().startsWith(':1\r\n')) {
              const invalid = replacement;
              replacement = null;
              awaitingReply = false;
              replaced++;
              client.write('+' + invalid + '\r\n');
            } else client.write(data);
          });
          client.on('error', () => upstream.destroy());
          upstream.on('error', () => client.destroy());
        });
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const address = proxy.address();
        if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw Error('Proxy is not loopback');
        const proxied = new URL(original);
        proxied.port = String(address.port);
        proxied.searchParams.set('stringNumbers', 'true');
        const store = createRedisStore(proxied.toString());
        const outcomes = [];
        try {
          for (const operation of ['compare', 'increment']) {
            const invalidValues = ['01', '1.0', '+1', '1e0', '-0', ' 1', 'NaN', 'Infinity', '9007199254740992'];
            if (operation === 'compare') invalidValues.push('2', '-1');
            for (const invalid of invalidValues) {
              const key = 'review:invalid-reply:' + randomUUID();
              keys.push(key);
              if (operation === 'compare') await admin.set(key, 'pending', 'PX', 60_000);
              replacement = invalid;
              let value = null;
              let error = null;
              try {
                value = operation === 'compare'
                  ? await store.compareAndSet(key, 'pending', 'authorized')
                  : await store.incr(key, 60_000);
              } catch (caught) { error = String(caught); }
              outcomes.push({ operation, invalid, value, error, stored: await admin.get(key), ttl: await admin.pttl(key) });
            }
          }
          console.log(JSON.stringify({ replaced, outcomes }));
        } finally {
          for (const key of keys) {
            const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
            await admin.del(key, ...receipts);
          }
          await admin.quit();
          proxy.close();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      replaced: number;
      outcomes: {
        operation: string;
        invalid: string;
        value: number | boolean | null;
        error: string | null;
        stored: string;
        ttl: number;
      }[];
    };
    expect(result.replaced).toBe(20);
    expect(result.outcomes).toHaveLength(20);
    for (const outcome of result.outcomes) {
      expect(outcome.value, `${outcome.operation}: ${outcome.invalid}`).toBeNull();
      expect(outcome.error, `${outcome.operation}: ${outcome.invalid}`).toMatch(/Unexpected Redis/);
      expect(outcome.stored).toBe(outcome.operation === 'compare' ? 'authorized' : '1');
      expect(outcome.ttl).toBeGreaterThan(0);
    }
  }, 50_000);

  it('puts the actual prefixed session and receipt keys in the same Redis Cluster slot', async () => {
    const script = String.raw`
      import { execFile, spawn } from 'node:child_process';
      import { randomUUID } from 'node:crypto';
      import { existsSync } from 'node:fs';
      import { readFile, stat } from 'node:fs/promises';
      import { createRequire } from 'node:module';
      import { join } from 'node:path';
      import { promisify } from 'node:util';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const exec = promisify(execFile);
        const token = (await readFile(join(process.env.HOME, 'lease'), 'utf8')).trim();
        if (!/^[a-f0-9]{48}$/.test(token)) throw Error('Invalid owned fixture lease');
        let socket = '/var/run/docker.sock';
        if (process.platform === 'darwin') {
          const { stdout } = await exec('/usr/bin/id', ['-P'], { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
          const fields = stdout.trim().split(':');
          const home = fields.at(-2);
          if (fields.length < 10 || Number(fields[2]) !== process.getuid() || !home?.startsWith('/')) throw Error('Invalid account home');
          socket = join(home, '.colima/default/docker.sock');
        }
        if (!(await stat(socket)).isSocket()) throw Error('Docker socket is not local');
        const binary = ['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker'].find(existsSync);
        if (!binary) throw Error('Local Docker binary missing');
        const dockerPrefix = ['--config', join(process.env.HOME, 'docker-config'), '--host', 'unix://' + socket];
        const docker = async (args) => (await exec(binary, [...dockerPrefix, ...args], {
          cwd: process.env.HOME, env: process.env, timeout: 30_000, maxBuffer: 1024 * 1024
        })).stdout.trim();
        const container = JSON.parse(await docker(['container', 'inspect', 'pr492-redis-' + token]))[0];
        const network = JSON.parse(await docker(['network', 'inspect', 'pr492-net-' + token]))[0];
        const networks = Object.values(container.NetworkSettings.Networks);
        if (!/^[a-f0-9]{64}$/.test(container.Id) || container.Name !== '/pr492-redis-' + token ||
            container.Config.Labels?.['dev.tank.pr492.owner'] !== token || container.HostConfig.Privileged ||
            Object.values(container.NetworkSettings.Ports).some((bindings) => bindings?.length) ||
            networks.length !== 1 || networks[0].NetworkID !== network.Id || network.Name !== 'pr492-net-' + token ||
            network.Labels?.['dev.tank.pr492.owner'] !== token || !network.Internal || network.Driver !== 'bridge') {
          throw Error('Redis cluster-oracle fixture ownership verification failed');
        }
        const oracleSocket = '/data/pr492-slot-oracle-' + token + '.sock';
        const oracleNodes = '/data/pr492-slot-oracle-' + token + '.nodes';
        const oracle = spawn(binary, [...dockerPrefix, 'exec', '-i', container.Id, 'redis-server',
          '--port', '0', '--bind', '127.0.0.1', '--unixsocket', oracleSocket, '--unixsocketperm', '700',
          '--cluster-enabled', 'yes', '--cluster-config-file', oracleNodes, '--save', '', '--appendonly', 'no'], {
          cwd: process.env.HOME, env: process.env, stdio: ['ignore', 'pipe', 'pipe']
        });
        let oracleLog = '';
        let oracleReady = false;
        const ready = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Cluster oracle startup timed out: ' + oracleLog)), 30_000);
          const onData = (data) => {
            oracleLog = (oracleLog + data.toString()).slice(-8_000);
            if (!oracleReady && oracleLog.includes('Ready to accept connections')) {
              oracleReady = true;
              clearTimeout(timer);
              resolve();
            }
          };
          oracle.stdout.on('data', onData);
          oracle.stderr.on('data', onData);
          oracle.once('error', (error) => { clearTimeout(timer); reject(error); });
          oracle.once('exit', (code) => {
            if (!oracleReady) { clearTimeout(timer); reject(Error('Cluster oracle exited: ' + code + ' ' + oracleLog)); }
          });
        });
        const oracleSlot = async (key) => {
          const output = await docker(['exec', container.Id, 'redis-cli', '--raw', '-s', oracleSocket, 'CLUSTER', 'KEYSLOT', key]);
          if (!/^(?:0|[1-9][0-9]*)$/.test(output) || Number(output) >= 16384) throw Error('Invalid Redis CLUSTER KEYSLOT response: ' + output);
          return Number(output);
        };
        const url = new URL(process.env.REDIS_URL);
        const admin = new Redis(url.toString());
        const monitorClient = new Redis(url.toString());
        const monitor = await monitorClient.monitor();
        const events = [];
        const id = randomUUID();
        const cases = [
          { prefix: '', key: '' },
          { prefix: '', key: 'raw:' + id },
          { prefix: 'tenant:', key: 'plain:' + id },
          { prefix: '{tenant}:', key: 'plain:' + id },
          { prefix: 'tenant:{}:', key: 'plain:' + id },
          { prefix: 'tenant:{', key: 'inside}:' + id },
          { prefix: 'tenant:{', key: '' },
          { prefix: 'tenant:{', key: '}empty:' + id },
          { prefix: 'tenant:{part', key: 'ial}:' + id },
          { prefix: 'tenant:{part', key: 'unclosed:' + id },
          { prefix: '{{tag}}:', key: 'plain:' + id },
          { prefix: 'tenant:🔒:', key: '{session}:' + id },
          { prefix: '', key: '{}tail{later}' + id },
          { prefix: 'tenant:{}:', key: '{later}:' + id },
          { prefix: 'tenant:{', key: '}after{later}:' + id }
        ];
        let barrierResolve;
        const barrier = new Promise((resolve) => { barrierResolve = resolve; });
        monitor.on('monitor', (_time, args) => {
          if (args[0].toLowerCase() === 'eval') events.push(args);
          if (args[0].toLowerCase() === 'ping' && args[1] === id) barrierResolve();
        });
        try {
          await ready;
          for (const entry of cases) {
            const prefixed = new URL(url);
            if (entry.prefix) prefixed.searchParams.set('keyPrefix', entry.prefix);
            const store = createRedisStore(prefixed.toString());
            await store.set(entry.key, 'pending', 60_000);
            if (!(await store.compareAndSet(entry.key, 'pending', 'authorized'))) throw Error('CAS failed');
            if (!(await store.compareAndDelete(entry.key, 'authorized'))) throw Error('consume failed');
            if ((await store.incr(entry.key + ':counter', 60_000)) !== 1) throw Error('counter failed');
          }
          await admin.ping(id);
          await Promise.race([barrier, new Promise((_, reject) => setTimeout(() => reject(Error('MONITOR barrier timed out')), 10_000))]);
          const keySlot = createRequire(import.meta.resolve('ioredis'))('cluster-key-slot');
          const decode = (value) => Buffer.from(value.replace(/\\x([0-9a-f]{2})/gi,
            (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), 'latin1').toString('utf8');
          const results = [];
          for (const { prefix, key } of cases) {
            const physical = prefix + key;
            const matches = events.filter((args) => decode(args[3]) === physical);
            const physicalSlot = await oracleSlot(physical);
            const receipts = [];
            for (const args of matches) {
              const receipt = decode(args[4]);
              receipts.push({ prefixed: receipt.startsWith(prefix), equalSlot: physicalSlot === await oracleSlot(receipt),
                libraryEqualSlot: keySlot(physical) === keySlot(receipt) });
            }
            results.push({ prefix, key, count: matches.length, counterTtl: await admin.pttl(physical + ':counter'),
              libraryDisagrees: physicalSlot !== keySlot(physical), receipts });
          }
          console.log(JSON.stringify(results));
        } finally {
          const decode = (value) => Buffer.from(value.replace(/\\x([0-9a-f]{2})/gi,
            (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), 'latin1').toString('utf8');
          for (const event of events.filter((args) => args[2] === '2')) await admin.del(decode(event[3]), decode(event[4]));
          for (const { prefix, key } of cases) await admin.del(prefix + key + ':counter');
          monitor.disconnect();
          await monitorClient.quit();
          await admin.quit();
          if (oracleReady) await docker(['exec', container.Id, 'redis-cli', '-s', oracleSocket, 'SHUTDOWN', 'NOSAVE']);
          if (oracle.exitCode === null && oracle.signalCode === null) oracle.kill('SIGTERM');
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 60_000);
    const results = JSON.parse(stdout.trim()) as {
      prefix: string;
      key: string;
      count: number;
      counterTtl: number;
      libraryDisagrees: boolean;
      receipts: { prefixed: boolean; equalSlot: boolean; libraryEqualSlot: boolean }[];
    }[];
    expect(results).toHaveLength(15);
    for (const result of results) {
      expect(result.count, `${result.prefix}|${result.key}`).toBe(2);
      expect(result.counterTtl, `${result.prefix}|${result.key}`).toBeGreaterThan(0);
      expect(
        result.receipts.every((receipt) => receipt.prefixed && receipt.equalSlot),
        `${result.prefix}|${result.key}`
      ).toBe(true);
    }
    expect(results.slice(0, 12).every((result) => result.receipts.every((receipt) => receipt.libraryEqualSlot))).toBe(
      true
    );
    expect(results.some((result) => result.libraryDisagrees)).toBe(true);
  }, 75_000);

  it('retains the original expiry when an increment succeeds but its reply is lost', async () => {
    const script = String.raw`
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const key = 'review:counter-drop:' + randomUUID();
        let dropped = 0;
        let beforeTtl = -999;
        const proxy = createServer((client) => {
          const upstream = createConnection({ host: original.hostname, port: Number(original.port) });
          let awaitingReply = false;
          client.on('data', (data) => {
            const text = data.toString().toUpperCase();
            if (dropped === 0 && (text.includes('\r\nINCR\r\n') || text.includes('\r\nEVAL\r\n'))) awaitingReply = true;
            upstream.write(data);
          });
          upstream.on('data', async (data) => {
            if (awaitingReply && dropped === 0 && data.toString().startsWith(':1\r\n')) {
              dropped++;
              beforeTtl = await admin.pttl(key);
              await new Promise((resolve) => setTimeout(resolve, 150));
              client.destroy();
              upstream.destroy();
            } else client.write(data);
          });
          client.on('error', () => upstream.destroy());
          upstream.on('error', () => client.destroy());
        });
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const address = proxy.address();
        if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw Error('Proxy is not loopback');
        const proxied = new URL(original);
        proxied.port = String(address.port);
        try {
          const store = createRedisStore(proxied.toString());
          const count = await store.incr(key, 5_000);
          console.log(JSON.stringify({ dropped, count, stored: await admin.get(key), beforeTtl, afterTtl: await admin.pttl(key) }));
        } finally {
          await admin.del(key);
          await admin.quit();
          proxy.close();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      dropped: number;
      count: number;
      stored: string;
      beforeTtl: number;
      afterTtl: number;
    };
    expect(result.dropped).toBe(1);
    expect(result.count).toBe(2);
    expect(result.stored).toBe('2');
    expect(result.beforeTtl).toBeGreaterThan(0);
    expect(result.afterTtl).toBeGreaterThan(0);
    expect(result.afterTtl).toBeLessThan(result.beforeTtl);
  }, 50_000);

  it('repairs persistent counters, preserves active windows, and never creates a permanent key on failure', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const admin = new Redis(process.env.REDIS_URL);
        const id = randomUUID().replaceAll('-', '');
        const user = 'pr492counter_' + id;
        const password = randomUUID();
        const keys = ['review:legacy:' + id, 'review:window:' + id, 'review:failure:' + id, 'review:invalid:' + id, 'review:parallel:' + id];
        try {
          const store = createRedisStore(process.env.REDIS_URL);
          await admin.set(keys[0], '17');
          const repaired = await store.incr(keys[0], 5_000);
          const repairedTtl = await admin.pttl(keys[0]);
          await admin.set(keys[1], '7', 'PX', 5_000);
          const windowBefore = await admin.pttl(keys[1]);
          const next = await store.incr(keys[1], 60_000);
          const windowAfter = await admin.pttl(keys[1]);
          await admin.set(keys[2], '17');
          await admin.acl('SETUSER', user, 'reset', 'on', '>' + password, '+@all', '-incr', '~' + keys[2]);
          const restricted = new URL(process.env.REDIS_URL);
          restricted.username = user;
          restricted.password = password;
          let failed = false;
          try { await createRedisStore(restricted.toString()).incr(keys[2], 5_000); } catch { failed = true; }
          let invalidFailed = false;
          try { await store.incr(keys[3], 0); } catch { invalidFailed = true; }
          const parallel = (await Promise.all(Array.from({ length: 32 }, () => store.incr(keys[4], 5_000)))).sort((a, b) => a - b);
          console.log(JSON.stringify({ repaired, repairedTtl, next, windowBefore, windowAfter, failed,
            failedValue: await admin.get(keys[2]), failedTtl: await admin.pttl(keys[2]), invalidFailed,
            invalidValue: await admin.get(keys[3]), parallel, parallelTtl: await admin.pttl(keys[4]) }));
        } finally {
          await admin.del(...keys);
          await admin.acl('DELUSER', user);
          await admin.quit();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      repaired: number;
      repairedTtl: number;
      next: number;
      windowBefore: number;
      windowAfter: number;
      failed: boolean;
      failedValue: string | null;
      failedTtl: number;
      invalidFailed: boolean;
      invalidValue: string | null;
      parallel: number[];
      parallelTtl: number;
    };
    expect(result.repaired).toBe(18);
    expect(result.repairedTtl).toBeGreaterThan(0);
    expect(result.next).toBe(8);
    expect(result.windowAfter).toBeGreaterThan(0);
    expect(result.windowAfter).toBeLessThanOrEqual(result.windowBefore);
    expect(result.failed).toBe(true);
    expect(result.failedValue).toBe('17');
    expect(result.failedTtl).toBeGreaterThan(0);
    expect(result.invalidFailed).toBe(true);
    expect(result.invalidValue).toBeNull();
    expect(result.parallel).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
    expect(result.parallelTtl).toBeGreaterThan(0);
  }, 50_000);
});
