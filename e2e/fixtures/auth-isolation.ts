import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Redis from 'ioredis';
import postgres from 'postgres';
import {
  assertOwnedTestDatabase,
  assertOwnedTestDatabaseAlive,
  createOwnedTestBridge,
  type OwnedTestBridge,
  type OwnedTestDatabase,
  rememberTestContainer,
  runTestDocker,
  stopOwnedTestContainer,
  testDockerEnvironment,
  validateTestDatabaseUrl,
  verifyOwnedTestContainer,
  verifyTestDatabase,
  withoutAmbientPostgres
} from '../helpers/isolated-test-database';

const ownedRedis = new WeakSet<OwnedTestRedis>();
const redisDockerEnv = new WeakMap<OwnedTestRedis, NodeJS.ProcessEnv>();
const ownedSql = new WeakMap<postgres.Sql, OwnedTestDatabase>();

export interface OwnedTestRedis {
  readonly url: string;
  readonly containerId: string;
  dbZeroSize(): Promise<number>;
  close(): Promise<void>;
}

export function isolatedAuthDatabaseUrl(): string {
  const value = process.env.E2E_AUTH_DATABASE_URL;
  if (!value) throw new Error('E2E_AUTH_DATABASE_URL is required');
  validateTestDatabaseUrl(value);
  return value;
}

export async function withVerifiedAuthDatabase<T>(
  sql: postgres.Sql,
  database: OwnedTestDatabase,
  operation: () => Promise<T>
): Promise<T> {
  assertOwnedTestDatabase(database);
  if (ownedSql.get(sql) !== database) throw new Error('SQL connection is not bound to the owned test database');
  await assertOwnedTestDatabaseAlive(database);
  await verifyTestDatabase(sql, validateTestDatabaseUrl(database.url));
  return operation();
}

export async function openVerifiedAuthDatabase(database: OwnedTestDatabase, max = 1): Promise<postgres.Sql> {
  assertOwnedTestDatabase(database);
  await assertOwnedTestDatabaseAlive(database);
  const expectedDatabase = validateTestDatabaseUrl(database.url);
  const sql = withoutAmbientPostgres(() => postgres(database.url, { max, connect_timeout: 3 }));
  try {
    await verifyTestDatabase(sql, expectedDatabase);
    ownedSql.set(sql, database);
    return sql;
  } catch (error) {
    await sql.end({ timeout: 3 });
    throw error;
  }
}

/** Identify waiters from this fixture that are blocked by this exact row-lock holder. */
export async function blockedWriterPids(
  sql: postgres.Sql,
  applicationName: string,
  blockerPid: number
): Promise<number[]> {
  const rows = await sql<{ pid: number }[]>`
    SELECT pid FROM pg_stat_activity
    WHERE datname = current_database() AND application_name = ${applicationName}
      AND wait_event_type = 'Lock' AND ${blockerPid} = ANY(pg_blocking_pids(pid))
  `;
  return rows.map((row) => row.pid);
}

export function isolatedAuthRedisUrl(): string {
  const value = process.env.E2E_AUTH_REDIS_URL;
  if (!value) throw new Error('E2E_AUTH_REDIS_URL is required');
  return validateAuthRedisUrl(value);
}

function validateAuthRedisUrl(value: string): string {
  // ioredis uses Node's legacy URL parser, so require the literal path rather
  // than accepting a path normalized by the WHATWG URL parser.
  const match = /^redis:\/\/(localhost|127\.0\.0\.1|\[::1\]):([0-9]{1,5})\/15$/i.exec(value);
  const port = Number(match?.[2]);
  if (!match || match[0] !== value || port < 1 || port > 65_535) {
    throw new Error('The auth tests require an unauthenticated local Redis URL with an explicit port and /15');
  }
  return value;
}

/** The container owns the port throughout the fixture lifetime; a preflight alone is not ownership. */
export async function verifyAuthRedis(service: OwnedTestRedis): Promise<void> {
  if (!ownedRedis.has(service)) throw new Error('A live, owned test Redis container is required');
  const env = redisDockerEnv.get(service);
  if (!env) throw new Error('Redis Docker target is not owned');
  const state = await runTestDocker(['inspect', '--format', '{{.State.Running}}', service.containerId], 5_000, env);
  if (state !== 'true') throw new Error('Owned test Redis container is not running');
  const redis = new Redis(validateAuthRedisUrl(service.url), {
    lazyConnect: true,
    connectTimeout: 3_000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null
  });
  let connectionError: Error | undefined;
  redis.on('error', (error) => {
    connectionError ??= error;
  });
  try {
    await redis.connect();
    await redis.select(15);
    const info = await redis.client('INFO');
    if (connectionError) throw connectionError;
    if (!/(?:^|\s)db=15(?:\s|$)/.test(info)) throw new Error('Redis did not select isolated database 15');
  } finally {
    redis.disconnect();
  }
}

export async function createOwnedTestRedis(databases = 16, denySelect = false): Promise<OwnedTestRedis> {
  const nonce = randomUUID().replaceAll('-', '');
  const name = `tank-auth-redis-${nonce}`;
  const env = testDockerEnvironment();
  rememberTestContainer(name, '', env);
  let containerId = '';
  let bridge: OwnedTestBridge | undefined;
  try {
    const args = [
      'create',
      '--rm',
      '--pull=never',
      '--network=none',
      '--name',
      name,
      '--label',
      `tank.auth.owner=${nonce}`,
      'redis:7-alpine',
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
      '--databases',
      String(databases)
    ];
    if (denySelect) args.push('--user', 'default', 'on', 'nopass', '~*', '&*', '+@all', '-select');
    const created = await runTestDocker(args, 60_000, env);
    if (!/^[a-f0-9]{64}$/.test(created)) throw new Error('Docker did not return an owned container ID');
    containerId = created;
    rememberTestContainer(name, containerId, env);
    await verifyOwnedTestContainer(containerId, nonce, env);
    await runTestDocker(['start', containerId], 60_000, env);
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        const pong = await runTestDocker(['exec', containerId, 'redis-cli', 'PING'], 3_000, env);
        if (pong !== 'PONG') throw new Error('Owned Redis is not ready');
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await delay(100);
      }
    }
    bridge = await createOwnedTestBridge(containerId, nonce, 6379, env);
    const ownedBridge = bridge;
    let containerRemoved = false;
    const service: OwnedTestRedis = {
      url: validateAuthRedisUrl(`redis://127.0.0.1:${bridge.port}/15`),
      containerId,
      async dbZeroSize() {
        if (!ownedRedis.has(service)) throw new Error('Redis container is no longer owned');
        const result = await runTestDocker(['exec', containerId, 'redis-cli', 'DBSIZE'], 5_000, env);
        const size = Number(result);
        if (!Number.isInteger(size) || size < 0) throw new Error('Could not inspect owned Redis database 0');
        return size;
      },
      async close() {
        if (!ownedRedis.has(service)) return;
        if (!containerRemoved) {
          await stopOwnedTestContainer(containerId, name, nonce);
          containerRemoved = true;
        }
        await ownedBridge.close();
        ownedRedis.delete(service);
      }
    };
    ownedRedis.add(service);
    redisDockerEnv.set(service, env);
    return Object.freeze(service);
  } catch (error) {
    try {
      await stopOwnedTestContainer(containerId, name, nonce);
    } finally {
      if (bridge) await bridge.close();
    }
    throw error;
  }
}
