// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('Redis CLI session retry safety', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('redis');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('isolates new sessions from stale legacy reads, consumes and writes', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import Redis from 'ioredis';
      import { getKVStore } from './src/services/kv/index.ts';
      import * as sessions from './src/lib/auth/cli-store.ts';

      // The v0.16.4 read and consume paths use the legacy key without a marker check.
      async function legacyGetSession(code) {
        const raw = await getKVStore().get('cli-auth:' + code);
        return raw ? JSON.parse(raw) : null;
      }
      async function legacyConsumeSession(code, state) {
        const session = await legacyGetSession(code);
        if (!session || session.status !== 'authorized' || session.state !== state) return null;
        await getKVStore().del('cli-auth:' + code);
        return session;
      }

      async function main() {
        const admin = new Redis(process.env.REDIS_URL);
        const state = randomUUID();
        const codes = [];
        try {
          const code = await sessions.createSession(state);
          codes.push(code);
          const pending = await sessions.getSession(code);
          if (!pending) throw Error('New session was not created');
          const oldPendingRead = await legacyGetSession(code);
          const authorized = await sessions.authorizeSession(code, 'new-user');
          const oldAuthorizedRead = await legacyGetSession(code);
          const first = await sessions.consumeSession(code, state);

          // A delayed legacy authorizer can unconditionally write its stale snapshot.
          // Preserve the v2 marker to expose any accidental shared-namespace fallback.
          const stale = { ...pending, status: 'authorized', userId: 'legacy-user' };
          await admin.set('cli-auth:' + code, JSON.stringify(stale), 'PX', 300_000);
          const oldStaleRead = await legacyGetSession(code);
          const afterStale = await sessions.getSession(code);
          const repeated = await sessions.consumeSession(code, state);
          const reauthorized = await sessions.authorizeSession(code, 'other-user');

          const other = await sessions.createSession(state);
          codes.push(other);
          const otherAuthorized = await sessions.authorizeSession(other, 'new-user');
          const oldConsumed = await legacyConsumeSession(other, state);
          const newConsumed = await sessions.consumeSession(other, state);
          console.log(JSON.stringify({ oldPendingRead, authorized, oldAuthorizedRead, first,
            oldStaleRead, afterStale, repeated, reauthorized, otherAuthorized, oldConsumed, newConsumed }));
        } finally {
          for (const code of codes) {
            for (const prefix of ['cli-auth:', 'cli-auth-v2:']) {
              const key = prefix + code;
              const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
              await admin.del(key, ...receipts);
            }
          }
          await admin.quit();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      oldPendingRead: unknown;
      authorized: boolean;
      oldAuthorizedRead: unknown;
      first: { status: string; userId: string } | null;
      oldStaleRead: { status: string; userId: string } | null;
      afterStale: unknown;
      repeated: unknown;
      reauthorized: boolean;
      otherAuthorized: boolean;
      oldConsumed: unknown;
      newConsumed: { status: string; userId: string } | null;
    };
    expect(result.oldPendingRead).toBeNull();
    expect(result.authorized).toBe(true);
    expect(result.oldAuthorizedRead).toBeNull();
    expect(result.first).toMatchObject({ status: 'authorized', userId: 'new-user' });
    expect(result.oldStaleRead).toMatchObject({ status: 'authorized', userId: 'legacy-user' });
    expect(result.afterStale).toBeNull();
    expect(result.repeated).toBeNull();
    expect(result.reauthorized).toBe(false);
    expect(result.otherAuthorized).toBe(true);
    expect(result.oldConsumed).toBeNull();
    expect(result.newConsumed).toMatchObject({ status: 'authorized', userId: 'new-user' });
  }, 40_000);

  it('recovers a lost successful reply without allowing separate exchanges to succeed', async () => {
    const script = String.raw`
      import { createRequire } from 'node:module';
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';

      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const codes = [];
        const specialKey = 'review:{}:' + randomUUID();
        let specialReceipts = [];
        let target = null;
        let dropped = 0;
        const proxy = createServer((client) => {
          const upstream = createConnection({ host: original.hostname, port: Number(original.port || 6379) });
          let awaitingReply = false;
          client.on('data', (data) => {
            if (target && data.toString().toUpperCase().includes('\r\n' + target + '\r\n')) awaitingReply = true;
            upstream.write(data);
          });
          upstream.on('data', (data) => {
            if (awaitingReply && target && data.toString().startsWith(':1\r\n')) {
              dropped++;
              target = null;
              awaitingReply = false;
              client.destroy();
              upstream.destroy();
            } else client.write(data);
          });
          client.on('error', () => upstream.destroy());
          upstream.on('error', () => client.destroy());
          client.on('end', () => upstream.end());
          upstream.on('end', () => client.end());
        });
        await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
        const proxyAddress = proxy.address();
        if (!proxyAddress || typeof proxyAddress === 'string' || proxyAddress.address !== '127.0.0.1') throw Error('Proxy is not loopback');
        const proxied = new URL(original);
        proxied.hostname = '127.0.0.1';
        proxied.port = String(proxyAddress.port);
        process.env.REDIS_URL = proxied.toString();
        const sessions = await import('./src/lib/auth/cli-store.ts');
        const state = randomUUID();
        try {
          const first = await sessions.createSession(state);
          codes.push(first);
          target = 'EVAL';
          const authorized = await sessions.authorizeSession(first, 'review-user');
          const stored = await sessions.getSession(first);
          await sessions.consumeSession(first, state);

          const second = await sessions.createSession(state);
          codes.push(second);
          await sessions.authorizeSession(second, 'review-user');
          target = 'EVAL';
          const consumed = await sessions.consumeSession(second, state);
          const afterConsume = await sessions.getSession(second);

          const third = await sessions.createSession(state);
          codes.push(third);
          await sessions.authorizeSession(third, 'review-user');
          target = 'EVAL';
          const separate = await Promise.all(Array.from({ length: 32 }, () => sessions.consumeSession(third, state)));

          const fourth = await sessions.createSession(state);
          codes.push(fourth);
          const beforeTtl = await admin.pttl('cli-auth-v2:' + fourth);
          await sessions.authorizeSession(fourth, 'review-user');
          const afterTtl = await admin.pttl('cli-auth-v2:' + fourth);

          const oldPending = randomUUID();
          const oldAuthorized = randomUUID();
          codes.push(oldPending, oldAuthorized);
          await admin.set('cli-auth:' + oldPending, JSON.stringify({ state, status: 'pending', createdAt: Date.now() + 360_000 }), 'PX', 300_000);
          await admin.set('cli-auth:' + oldAuthorized, JSON.stringify({ state, status: 'authorized', userId: 'review-user', createdAt: Date.now() + 360_000 }), 'PX', 300_000);
          const legacyAccepted = await sessions.authorizeSession(oldPending, 'review-user');
          const legacyConsumed = !!(await sessions.consumeSession(oldAuthorized, state));

          const requireFromIoredis = createRequire(import.meta.resolve('ioredis'));
          const keySlot = requireFromIoredis('cluster-key-slot');
          const receipts = [];
          for (const code of codes) {
            const key = 'cli-auth-v2:' + code;
            for (const receipt of await admin.keys('{' + key + '}:tank-kv-op:*')) {
              receipts.push({ sameSlot: keySlot(key) === keySlot(receipt), ttl: await admin.pttl(receipt) });
            }
          }
          const previousReceipts = new Set(await admin.keys('*:tank-kv-op:*'));
          await admin.set(specialKey, 'pending', 'PX', 300_000);
          const { createRedisStore } = await import('./src/services/kv/redis.ts');
          const specialStore = createRedisStore(proxied.toString());
          const specialChanged = await specialStore.compareAndSet(specialKey, 'pending', 'authorized');
          specialReceipts = (await admin.keys('*:tank-kv-op:*')).filter((key) => !previousReceipts.has(key));
          console.log(JSON.stringify({ dropped, authorized, status: stored?.status, consumed: !!consumed,
            afterConsume: !!afterConsume, winners: separate.filter(Boolean).length, beforeTtl, afterTtl, receipts,
            legacyAccepted, legacyConsumed, specialChanged, specialSlots: specialReceipts.map((key) => keySlot(key) === keySlot(specialKey)) }));
        } finally {
          for (const code of codes) {
            const key = 'cli-auth-v2:' + code;
            const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
            await admin.del(key, 'cli-auth:' + code, ...receipts);
          }
          await admin.del(specialKey, ...specialReceipts);
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
      status: string;
      consumed: boolean;
      afterConsume: boolean;
      winners: number;
      beforeTtl: number;
      afterTtl: number;
      legacyAccepted: boolean;
      legacyConsumed: boolean;
      receipts: { sameSlot: boolean; ttl: number }[];
      specialChanged: boolean;
      specialSlots: boolean[];
    };
    expect(result.dropped).toBe(3);
    expect(result.authorized).toBe(true);
    expect(result.status).toBe('authorized');
    expect(result.consumed).toBe(true);
    expect(result.afterConsume).toBe(false);
    expect(result.winners).toBe(1);
    expect(result.legacyAccepted).toBe(false);
    expect(result.legacyConsumed).toBe(false);
    expect(result.afterTtl).toBeGreaterThan(0);
    expect(result.afterTtl).toBeLessThanOrEqual(result.beforeTtl);
    expect(result.receipts.length).toBeGreaterThanOrEqual(6);
    expect(result.receipts.every((receipt) => receipt.sameSlot && receipt.ttl > 0 && receipt.ttl <= 300_000)).toBe(
      true
    );
    expect(result.specialChanged).toBe(true);
    expect(result.specialSlots).toEqual([true]);
  }, 40_000);

  it('recovers known mismatches from retained receipts after their replies are lost', async () => {
    const script = String.raw`
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const key = 'review:known-mismatch:' + randomUUID();
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
            if (awaitingReply && target && data.toString().startsWith(':0\r\n')) {
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
        try {
          await admin.set(key, 'actual', 'PX', 60_000);
          const store = createRedisStore(proxied.toString());
          target = true;
          const mismatchSet = await store.compareAndSet(key, 'other', 'new');
          target = true;
          const mismatchDelete = await store.compareAndDelete(key, 'other');
          const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
          console.log(JSON.stringify({ dropped, mismatchSet, mismatchDelete, remaining: await admin.get(key),
            receipts: await admin.mget(...receipts), ttls: await Promise.all(receipts.map((receipt) => admin.pttl(receipt))) }));
        } finally {
          const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
          await admin.del(key, ...receipts);
          await admin.quit();
          proxy.close();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      dropped: number;
      mismatchSet: boolean;
      mismatchDelete: boolean;
      remaining: string;
      receipts: string[];
      ttls: number[];
    };
    expect(result.dropped).toBe(2);
    expect(result.mismatchSet).toBe(false);
    expect(result.mismatchDelete).toBe(false);
    expect(result.remaining).toBe('actual');
    expect(result.receipts).toEqual(['miss', 'miss']);
    expect(result.ttls.every((ttl) => ttl > 0 && ttl <= 300_000)).toBe(true);
  }, 40_000);

  it('reports indeterminate outcomes after replies and their receipts are lost', async () => {
    const script = String.raw`
      import { randomUUID } from 'node:crypto';
      import { createConnection, createServer } from 'node:net';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const original = new URL(process.env.REDIS_URL);
        const admin = new Redis(original.toString());
        const keys = [];
        let dropped = 0;
        let replayErrorsDropped = 0;
        let dropReplayError = false;
        let target = null;
        const proxy = createServer((client) => {
          const upstream = createConnection({ host: original.hostname, port: Number(original.port) });
          let awaitingReply = false;
          client.on('data', (data) => {
            if (target && data.toString().toUpperCase().includes('\r\nEVAL\r\n')) awaitingReply = true;
            upstream.write(data);
          });
          upstream.on('data', async (data) => {
            if (awaitingReply && target && data.toString().startsWith(':' + target.reply + '\r\n')) {
              const { key, removal, loseReplayError } = target;
              target = null;
              awaitingReply = false;
              dropped++;
              const receipts = await admin.keys('{' + key + '}:tank-kv-op:*');
              if (receipts.length !== 1) throw Error('Expected one successful operation receipt');
              if (removal === 'expiry') {
                // Accelerate the actual TTL boundary while Redis remains real.
                await admin.pexpire(receipts[0], 1);
                await new Promise((resolve) => setTimeout(resolve, 20));
              } else {
                // Simulate eviction by deleting exactly this operation's receipt.
                await admin.del(receipts[0]);
              }
              if (await admin.exists(receipts[0])) throw Error('Receipt was not removed');
              dropReplayError = loseReplayError;
              client.destroy();
              upstream.destroy();
            } else if (dropReplayError && data.toString().includes('KV operation outcome is indeterminate')) {
              dropReplayError = false;
              replayErrorsDropped++;
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
          const cases = [];
          for (const operation of ['set', 'delete', 'mismatch-set', 'mismatch-delete']) {
            for (const removal of ['expiry', 'eviction']) {
              const key = 'review:receipt-loss:' + randomUUID();
              keys.push(key);
              await admin.set(key, 'pending', 'PX', 60_000);
              target = { key, removal, reply: operation.startsWith('mismatch') ? 0 : 1,
                loseReplayError: operation === 'set' && removal === 'expiry' };
              let value = null;
              let error = null;
              try {
                value = operation.endsWith('set')
                  ? await store.compareAndSet(key, operation === 'set' ? 'pending' : 'other', 'authorized')
                  : await store.compareAndDelete(key, operation === 'delete' ? 'pending' : 'other');
              } catch (caught) { error = String(caught); }
              cases.push({ operation, removal, value, error, remaining: await admin.get(key),
                receiptsAfter: (await admin.keys('{' + key + '}:tank-kv-op:*')).length });
            }
          }
          const mismatchKey = 'review:known-mismatch:' + randomUUID();
          keys.push(mismatchKey);
          await admin.set(mismatchKey, 'actual', 'PX', 60_000);
          const mismatchSet = await store.compareAndSet(mismatchKey, 'other', 'authorized');
          const mismatchDelete = await store.compareAndDelete(mismatchKey, 'other');
          const mismatchRemaining = await admin.get(mismatchKey);
          console.log(JSON.stringify({ dropped, replayErrorsDropped, cases, mismatchSet, mismatchDelete, mismatchRemaining }));
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
      dropped: number;
      replayErrorsDropped: number;
      cases: {
        operation: string;
        removal: string;
        value: boolean | null;
        error: string | null;
        remaining: string | null;
        receiptsAfter: number;
      }[];
      mismatchSet: boolean;
      mismatchDelete: boolean;
      mismatchRemaining: string;
    };
    expect(result.dropped).toBe(8);
    expect(result.replayErrorsDropped).toBe(1);
    expect(result.cases).toHaveLength(8);
    for (const outcome of result.cases) {
      expect(outcome.value).toBeNull();
      expect(outcome.error).toMatch(/indeterminate/i);
      const remaining = outcome.operation === 'set' ? 'authorized' : outcome.operation === 'delete' ? null : 'pending';
      expect(outcome.remaining).toBe(remaining);
      expect(outcome.receiptsAfter).toBe(0);
    }
    expect(result.mismatchSet).toBe(false);
    expect(result.mismatchDelete).toBe(false);
    expect(result.mismatchRemaining).toBe('actual');
  }, 40_000);

  it('rejects an unauthorized Redis operation without changing the session', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const admin = new Redis(process.env.REDIS_URL);
        const id = randomUUID().replaceAll('-', '');
        const user = 'pr492_' + id;
        const readOnlyUser = user + '_read';
        const password = randomUUID();
        const key = 'review:' + id;
        const receiptPattern = '{' + key + '}:tank-kv-op:*';
        try {
          await admin.set(key, 'pending', 'PX', 60_000);
          await admin.acl('SETUSER', user, 'reset', 'on', '>' + password, '+@all', '%R~' + key, '%RW~' + receiptPattern);
          await admin.acl('SETUSER', readOnlyUser, 'reset', 'on', '>' + password, '+@all', '-set', '%RW~' + key, '%RW~' + receiptPattern);
          const readOnlyUrl = new URL(process.env.REDIS_URL);
          readOnlyUrl.username = readOnlyUser;
          readOnlyUrl.password = password;
          const mismatch = await createRedisStore(readOnlyUrl.toString()).compareAndSet(key, 'wrong', 'authorized');
          const restrictedUrl = new URL(process.env.REDIS_URL);
          restrictedUrl.username = user;
          restrictedUrl.password = password;
          const store = createRedisStore(restrictedUrl.toString());
          let failed = false;
          let errorMessage = '';
          try { await store.compareAndSet(key, 'pending', 'authorized'); } catch (error) {
            failed = true;
            errorMessage = String(error);
          }
          const receiptKeys = await admin.keys(receiptPattern);
          const receipts = receiptKeys.length ? await admin.mget(...receiptKeys) : [];
          console.log(JSON.stringify({ failed, errorMessage, mismatch, value: await admin.get(key), receipts }));
        } finally {
          const receipts = await admin.keys(receiptPattern);
          await admin.del(key, ...receipts);
          await admin.acl('DELUSER', user, readOnlyUser);
          await admin.quit();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      failed: boolean;
      errorMessage: string;
      mismatch: boolean;
      value: string;
      receipts: string[];
    };
    expect(result.failed).toBe(true);
    expect(result.errorMessage.toLowerCase()).toContain('noperm');
    expect(result.mismatch).toBe(false);
    expect(result.value).toBe('pending');
    expect(result.receipts).not.toContain('done');
  }, 40_000);

  it('replicates session mutations and receipts together', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import Redis from 'ioredis';
      import { createRedisStore } from './src/services/kv/redis.ts';
      async function main() {
        const primary = new Redis(process.env.REDIS_URL);
        const replica = new Redis(process.env.PR492_TEST_REPLICA);
        const store = createRedisStore(process.env.REDIS_URL);
        const id = randomUUID();
        const key = 'review:replication:' + id;
        const barrier = 'review:barrier:' + id;
        const pattern = '{' + key + '}:tank-kv-op:*';
        try {
          await store.set(key, 'pending', 60_000);
          const authorized = await store.compareAndSet(key, 'pending', 'authorized', Date.now() + 60_000);
          const mismatch = await store.compareAndSet(key, 'wrong', 'other');
          await primary.set(barrier, '1', 'PX', 60_000);
          const firstAck = await primary.wait(1, 10_000);
          const authorizationValue = await replica.get(key);
          const deleted = await store.compareAndDelete(key, 'authorized', Date.now() + 60_000);
          await primary.set(barrier, '2', 'PX', 60_000);
          const secondAck = await primary.wait(1, 10_000);
          const receiptKeys = await primary.keys(pattern);
          const receipts = receiptKeys.length ? await replica.mget(...receiptKeys) : [];
          console.log(JSON.stringify({ authorized, mismatch, deleted, firstAck, secondAck, authorizationValue,
            deletedValue: await replica.get(key), receipts }));
        } finally {
          const receipts = await primary.keys(pattern);
          await primary.del(key, barrier, ...receipts);
          await primary.quit();
          await replica.quit();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 40_000);
    const result = JSON.parse(stdout.trim()) as {
      authorized: boolean;
      mismatch: boolean;
      deleted: boolean;
      firstAck: number;
      secondAck: number;
      authorizationValue: string;
      deletedValue: string | null;
      receipts: string[];
    };
    expect(result.authorized).toBe(true);
    expect(result.mismatch).toBe(false);
    expect(result.deleted).toBe(true);
    expect(result.firstAck).toBeGreaterThanOrEqual(1);
    expect(result.secondAck).toBeGreaterThanOrEqual(1);
    expect(result.authorizationValue).toBe('authorized');
    expect(result.deletedValue).toBeNull();
    expect(result.receipts.sort()).toEqual(['done', 'done', 'miss']);
  }, 50_000);
});
