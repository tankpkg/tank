/** Real PostgreSQL rate-window regression; see login intent C13 and E14. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createPostgresStore } from '../../../apps/registry/src/services/kv/postgres.js';
import { createOwnedTestRedis, verifyAuthRedis } from '../../../e2e/fixtures/auth-isolation.js';
import {
  assertOwnedTestDatabaseAlive,
  createOwnedTestDatabase,
  isolatedBunArguments,
  isolatedSchemaEnvironment,
  type OwnedDockerInspectionFault,
  type OwnedTestDatabase,
  rejectedOwnedDockerInspections,
  rejectNextOwnedDockerInspection,
  runTestDocker,
  testDockerEnvironment,
  validateTestDatabaseUrl,
  verifyTestDatabase,
  withOwnedDockerInspectionFault,
  withoutAmbientPostgres
} from '../../../e2e/helpers/isolated-test-database.js';

const databaseUrl = process.env.E2E_LOGIN_DATABASE_URL;
const exec = promisify(execFile);
let ownedDatabase: OwnedTestDatabase;
beforeAll(async () => {
  if (!databaseUrl) return;
  validateTestDatabaseUrl(databaseUrl);
  ownedDatabase = await createOwnedTestDatabase();
}, 360_000);
afterAll(async () => {
  if (ownedDatabase) await ownedDatabase.close();
}, 40_000);

it.each([
  'postgresql://tank:tank@localhost:5432/tank_test?database=production',
  'postgresql://tank:tank@localhost:5432/tank_test?%64atabase=production',
  'postgresql://tank:tank@localhost:5432/tank_test?database=%70roduction',
  'postgresql://tank:tank@localhost:5432/tank_test?options=-csearch_path%3Dpublic',
  'postgresql://tank:tank@localhost:5432/tank_test?',
  'postgresql://tank:tank@localhost:5432/tank_test#fragment',
  'postgresql://tank:tank@example.com:5432/tank_test',
  'postgresql://tank:tank@localhost:5432/production',
  'postgresql://tank:tank@localhost:5432/tank%5Ftest',
  'postgresql://user@remote.invalid%2C127.0.0.1@localhost:5432/safe_test',
  'postgresql://tank@localhost:5432/tank_test',
  'postgresql://tank:@localhost:5432/tank_test',
  'postgresql://tank:tank@127%2E0%2E0%2E1:5432/tank_test',
  'postgresql://tank:tank@localhost,127.0.0.1:5432/tank_test',
  'postgresql://tank:tank@[::1]:5432/tank_test',
  'not a database URL'
])('rejects unsafe test database URL %s', (url) => {
  expect(() => validateTestDatabaseUrl(url)).toThrow(/isolated local test database/i);
});

it('exposes the postgres.js authority and ambient-password parser discrepancy without connecting', async () => {
  const [sql, explicit] = withoutAmbientPostgres(() => {
    process.env.PGPASSWORD = 'local-parser-sentinel';
    return [
      postgres('postgresql://user@remote.invalid%2C127.0.0.1@localhost:5432/safe_test'),
      postgres('postgresql://test:explicit-password@127.0.0.1:5432/safe_test')
    ] as const;
  });
  try {
    expect(sql.options.host[0]).toBe('remote.invalid');
    expect(sql.options.pass).toBe('local-parser-sentinel');
    expect(explicit.options.host).toEqual(['127.0.0.1']);
    expect(explicit.options.pass).toBe('explicit-password');
  } finally {
    await sql.end({ timeout: 3 });
    await explicit.end({ timeout: 3 });
  }
});

it.each([
  ['postgresql://tank:tank@localhost:5432/tank_test', 'tank_test'],
  ['postgres://tank:tank@127.0.0.1:5432/tank-ci_test', 'tank-ci_test']
])('accepts isolated test database URL %s', (url, database) => {
  expect(validateTestDatabaseUrl(url)).toBe(database);
});

it.skipIf(!databaseUrl)('uses the OS account Docker socket rather than the HOME environment', () => {
  const expected = testDockerEnvironment().DOCKER_HOST;
  const originalHome = process.env.HOME;
  const originalHost = process.env.DOCKER_HOST;
  const originalUser = process.env.USER;
  const originalLogname = process.env.LOGNAME;
  try {
    process.env.HOME = path.join(os.tmpdir(), `untrusted-home-${randomUUID()}`);
    process.env.USER = 'synthetic-other-account';
    process.env.LOGNAME = 'synthetic-other-account';
    delete process.env.DOCKER_HOST;
    expect(testDockerEnvironment().DOCKER_HOST).toBe(expected);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalHost;
    if (originalUser === undefined) delete process.env.USER;
    else process.env.USER = originalUser;
    if (originalLogname === undefined) delete process.env.LOGNAME;
    else process.env.LOGNAME = originalLogname;
  }
});

async function verifyForwardedDockerSocketRejected(): Promise<void> {
  const dockerHost = testDockerEnvironment().DOCKER_HOST;
  if (!dockerHost?.startsWith('unix:///')) throw new Error('A local Docker socket is required');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'td-'));
  const proxyPath = path.join(sandbox, '.colima/default/docker.sock');
  const sockets = new Set<net.Socket>();
  let connections = 0;
  const proxy = net.createServer((client) => {
    connections++;
    const upstream = net.connect(dockerHost.slice('unix://'.length));
    sockets.add(client);
    sockets.add(upstream);
    client.once('close', () => sockets.delete(client));
    upstream.once('close', () => sockets.delete(upstream));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
  const originalHost = process.env.DOCKER_HOST;
  const originalHome = process.env.HOME;
  try {
    fs.mkdirSync(path.dirname(proxyPath), { recursive: true });
    await new Promise<void>((resolve, reject) => proxy.once('error', reject).listen(proxyPath, resolve));
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.request(
        { socketPath: proxyPath, path: '/_ping', method: 'GET', agent: false },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        }
      );
      request.once('error', reject);
      request.setTimeout(5_000, () => request.destroy(new Error('Docker forwarding probe timed out')));
      request.end();
    });
    expect(status).toBe(200);
    const before = connections;
    process.env.HOME = sandbox;
    process.env.DOCKER_HOST = `unix://${proxyPath}`;
    expect(() => testDockerEnvironment()).toThrow(/trusted.*Docker.*socket/i);
    await expect(createOwnedTestDatabase()).rejects.toThrow(/trusted.*Docker.*socket/i);
    await expect(createOwnedTestRedis()).rejects.toThrow(/trusted.*Docker.*socket/i);
    let faultCallbackCalled = false;
    await expect(
      withOwnedDockerInspectionFault(async () => {
        faultCallbackCalled = true;
      })
    ).rejects.toThrow(/trusted.*Docker.*socket/i);
    expect(faultCallbackCalled).toBe(false);
    await expect(
      runTestDocker(['version'], 5_000, { PATH: process.env.PATH, DOCKER_HOST: process.env.DOCKER_HOST })
    ).rejects.toThrow(/unverified test Docker environment/i);
    expect(connections).toBe(before);
  } finally {
    if (originalHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalHost;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise<void>((resolve) => proxy.close(() => resolve()));
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

it.skipIf(!databaseUrl)(
  'rejects a real forwarding Docker socket before fixture connections',
  verifyForwardedDockerSocketRejected,
  30_000
);

async function verifyTrustedRedis(): Promise<void> {
  const redis = await createOwnedTestRedis();
  try {
    await verifyAuthRedis(redis);
    expect(await redis.dbZeroSize()).toBe(0);
  } finally {
    await redis.close();
  }
}

it.skipIf(!databaseUrl)('creates an owned Redis service on the trusted default daemon', verifyTrustedRedis, 180_000);

it.skipIf(!databaseUrl)('verifies the actual connected database before writing fixtures', async () => {
  if (!databaseUrl) throw new Error('E2E_LOGIN_DATABASE_URL is required');
  const expectedDatabase = validateTestDatabaseUrl(ownedDatabase.url);
  const sql = withoutAmbientPostgres(() =>
    postgres(ownedDatabase.url, { max: 1, connect_timeout: 3, connection: { statement_timeout: 3000 } })
  );
  try {
    await expect(verifyTestDatabase(sql, expectedDatabase)).resolves.toBeUndefined();
    await expect(verifyTestDatabase(sql, `${expectedDatabase}_different_test`)).rejects.toThrow(/does not match/i);
  } finally {
    await sql.end({ timeout: 3 });
  }
});

async function verifySyntheticHostileDotenv(): Promise<void> {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-schema-env-regression-'));
  const previousDotenv = process.env.DOTENV_CONFIG_PATH;
  const previousSecret = process.env.UNRELATED_TEST_SECRET;
  let database: OwnedTestDatabase | undefined;
  let sql: postgres.Sql | undefined;
  try {
    fs.writeFileSync(
      path.join(sandbox, '.env'),
      'PGSSL=require\nPGTARGETSESSIONATTRS=read-only\nUNRELATED_TEST_SECRET=synthetic-secret\n'
    );
    process.env.DOTENV_CONFIG_PATH = path.join(sandbox, '.env');
    process.env.UNRELATED_TEST_SECRET = 'hostile-parent-secret';
    const preload = path.join(sandbox, 'probe.mjs');
    fs.writeFileSync(
      preload,
      `import { writeSync } from 'node:fs';\nprocess.on('exit', () => writeSync(1, '\\nTANK_SCHEMA_ENV=' + JSON.stringify({ssl:process.env.PGSSL??null,target:process.env.PGTARGETSESSIONATTRS??null,secret:process.env.UNRELATED_TEST_SECRET??null,path:process.env.DOTENV_CONFIG_PATH??null}) + '\\n'));\n`
    );
    const registryModules = path.resolve(__dirname, '../../../apps/registry/node_modules');
    fs.symlinkSync(registryModules, path.join(sandbox, 'node_modules'), 'dir');
    const table = `dotenv_probe_${randomUUID().replaceAll('-', '')}`;
    fs.writeFileSync(
      path.join(sandbox, 'schema.ts'),
      `import { pgTable, integer } from 'drizzle-orm/pg-core';\nexport const probe = pgTable('${table}', { id: integer('id').primaryKey() });\n`
    );
    fs.writeFileSync(
      path.join(sandbox, 'drizzle.config.ts'),
      `export default { dialect: 'postgresql', schema: './schema.ts', out: './migrations', dbCredentials: { url: process.env.DATABASE_URL } };\n`
    );
    const owned = await createOwnedTestDatabase();
    database = owned;
    const connection = withoutAmbientPostgres(() => postgres(owned.url, { max: 1, connect_timeout: 3 }));
    sql = connection;
    await assertOwnedTestDatabaseAlive(owned);
    await verifyTestDatabase(connection, validateTestDatabaseUrl(owned.url));
    const drizzle = path.join(registryModules, '.bin/drizzle-kit');
    const { stdout } = await exec('bun', isolatedBunArguments(['--preload', preload, drizzle, 'push', '--force']), {
      cwd: sandbox,
      env: isolatedSchemaEnvironment(owned.url),
      timeout: 120_000
    });
    const match = /TANK_SCHEMA_ENV=(\{[^\n]+\})/.exec(stdout);
    expect(match).not.toBeNull();
    if (!match) throw new Error('Drizzle did not report its environment');
    expect(JSON.parse(match[1])).toEqual({ ssl: null, target: null, secret: null, path: os.devNull });
    const rows = await connection<{ name: string | null }[]>`SELECT to_regclass(${`public.${table}`})::text AS name`;
    expect(rows[0]?.name).toBe(table);
  } finally {
    try {
      if (sql) await sql.end({ timeout: 3 });
    } finally {
      try {
        if (database) await database.close();
      } finally {
        try {
          fs.rmSync(sandbox, { recursive: true, force: true });
        } finally {
          if (previousDotenv === undefined) delete process.env.DOTENV_CONFIG_PATH;
          else process.env.DOTENV_CONFIG_PATH = previousDotenv;
          if (previousSecret === undefined) delete process.env.UNRELATED_TEST_SECRET;
          else process.env.UNRELATED_TEST_SECRET = previousSecret;
        }
      }
    }
  }
}

it.skipIf(!databaseUrl)(
  'does not load a synthetic hostile dotenv file during schema setup',
  verifySyntheticHostileDotenv,
  480_000
);

async function verifyStoreWithoutAmbientOverrides(database: OwnedTestDatabase, key: string): Promise<void> {
  const previousSsl = process.env.PGSSL;
  const previousTarget = process.env.PGTARGETSESSIONATTRS;
  let store: ReturnType<typeof createPostgresStore> | undefined;
  let ownershipVerified = false;
  try {
    process.env.PGSSL = 'require';
    process.env.PGTARGETSESSIONATTRS = 'read-only';
    await assertOwnedTestDatabaseAlive(database);
    ownershipVerified = true;
    store = withoutAmbientPostgres(() => createPostgresStore(database.url));
    expect(await store.incr(key, 60_000)).toBe(1);
  } finally {
    try {
      if (store && ownershipVerified) {
        await assertOwnedTestDatabaseAlive(database);
        await store.del(key);
      }
    } finally {
      if (previousSsl === undefined) delete process.env.PGSSL;
      else process.env.PGSSL = previousSsl;
      if (previousTarget === undefined) delete process.env.PGTARGETSESSIONATTRS;
      else process.env.PGTARGETSESSIONATTRS = previousTarget;
    }
  }
}

it.skipIf(!databaseUrl)('uses the real owned store without ambient PostgreSQL overrides', async () => {
  await verifyStoreWithoutAmbientOverrides(ownedDatabase, `tank-test:ambient:${randomUUID()}`);
});

async function verifyNoDeleteForUnownedDatabase(): Promise<void> {
  const key = `tank-test:ownership:${randomUUID()}`;
  const store = withoutAmbientPostgres(() => createPostgresStore(ownedDatabase.url));
  const sql = withoutAmbientPostgres(() => postgres(ownedDatabase.url, { max: 1, connect_timeout: 3 }));
  let inserted = false;
  try {
    await assertOwnedTestDatabaseAlive(ownedDatabase);
    await verifyTestDatabase(sql, validateTestDatabaseUrl(ownedDatabase.url));
    expect(await store.incr(key, 60_000)).toBe(1);
    inserted = true;
    const forged = { ...ownedDatabase };
    await expect(verifyStoreWithoutAmbientOverrides(forged, key)).rejects.toThrow(/owned test PostgreSQL/i);
    const rows = await sql`SELECT key FROM kv_store WHERE key = ${key}`;
    expect(rows).toHaveLength(1);
  } finally {
    try {
      if (inserted) {
        await assertOwnedTestDatabaseAlive(ownedDatabase);
        await store.del(key);
      }
    } finally {
      await sql.end({ timeout: 3 });
    }
  }
}

it.skipIf(!databaseUrl)(
  'does not delete a fixture after ownership verification fails',
  verifyNoDeleteForUnownedDatabase,
  30_000
);

it.skipIf(!databaseUrl)(
  'does not delete a fixture after a transient Docker ownership-check failure',
  async () => {
    const key = `tank-test:transient-ownership:${randomUUID()}`;
    let expiredFault: OwnedDockerInspectionFault | undefined;
    await withOwnedDockerInspectionFault(async (database, fault) => {
      expiredFault = fault;
      expect(() => rejectNextOwnedDockerInspection({ ...fault })).toThrow(/live owned Docker inspection fault/i);
      const sql = withoutAmbientPostgres(() => postgres(database.url, { max: 1, connect_timeout: 3 }));
      const store = withoutAmbientPostgres(() => createPostgresStore(database.url));
      let inserted = false;
      try {
        await assertOwnedTestDatabaseAlive(database);
        await verifyTestDatabase(sql, validateTestDatabaseUrl(database.url));
        expect(await store.incr(key, 60_000)).toBe(1);
        inserted = true;
        rejectNextOwnedDockerInspection(fault);
        await expect(verifyStoreWithoutAmbientOverrides(database, key)).rejects.toThrow(/docker inspect/i);
        expect(rejectedOwnedDockerInspections(fault)).toBe(1);
        await verifyTestDatabase(sql, validateTestDatabaseUrl(database.url));
        const rows = await sql`SELECT key FROM kv_store WHERE key = ${key}`;
        expect(rows).toHaveLength(1);
      } finally {
        try {
          if (inserted) {
            await assertOwnedTestDatabaseAlive(database);
            await verifyTestDatabase(sql, validateTestDatabaseUrl(database.url));
            await store.del(key);
          }
        } finally {
          await sql.end({ timeout: 3 });
        }
      }
    });
    const closedFault = expiredFault;
    if (!closedFault) throw new Error('The owned fault capability was not created');
    expect(() => rejectNextOwnedDockerInspection(closedFault)).toThrow(/live owned Docker inspection fault/i);
  },
  360_000
);

async function verifyFaultCleanupOnFailure(): Promise<void> {
  let containerId: string | undefined;
  let fault: OwnedDockerInspectionFault | undefined;
  await expect(
    withOwnedDockerInspectionFault(async (database, capability) => {
      containerId = database.containerId;
      fault = capability;
      throw new Error('intentional fault-test failure');
    })
  ).rejects.toThrow('intentional fault-test failure');
  const closedFault = fault;
  if (!containerId || !closedFault) throw new Error('The owned fault service did not start');
  await expect(runTestDocker(['inspect', containerId])).rejects.toThrow(/No such (object|container)/i);
  expect(() => rejectNextOwnedDockerInspection(closedFault)).toThrow(/live owned Docker inspection fault/i);
}

it.skipIf(!databaseUrl)(
  'cleans up the owned fault service when its callback fails',
  verifyFaultCleanupOnFailure,
  360_000
);

it.skipIf(!databaseUrl)('restarts an expired PostgreSQL rate-limit window at one', async () => {
  if (!databaseUrl) throw new Error('E2E_LOGIN_DATABASE_URL is required');
  const expectedDatabase = validateTestDatabaseUrl(ownedDatabase.url);

  const sql = withoutAmbientPostgres(() => postgres(ownedDatabase.url, { max: 1 }));
  let store: ReturnType<typeof createPostgresStore> | undefined;
  const key = `tank-test:email-rate:${randomUUID()}`;
  try {
    await assertOwnedTestDatabaseAlive(ownedDatabase);
    await verifyTestDatabase(sql, expectedDatabase);
    store = withoutAmbientPostgres(() => createPostgresStore(ownedDatabase.url));
    const secondStore = withoutAmbientPostgres(() => createPostgresStore(ownedDatabase.url));
    expect(await store.incr(key, 60_000)).toBe(1);
    expect(await store.incr(key, 60_000)).toBe(2);
    await sql`UPDATE kv_store SET expires_at = NOW() - INTERVAL '1 second' WHERE key = ${key}`;
    const concurrent = await Promise.all([store.incr(key, 60_000), secondStore.incr(key, 60_000)]);
    expect(concurrent.sort()).toEqual([1, 2]);
    await sql`UPDATE kv_store SET expires_at = NOW() - INTERVAL '1 second' WHERE key = ${key}`;
    expect(await store.incr(key, 60_000)).toBe(1);
    expect(await store.incr(key, 60_000)).toBe(2);
  } finally {
    try {
      if (store) {
        await assertOwnedTestDatabaseAlive(ownedDatabase);
        await store.del(key);
      }
    } finally {
      await sql.end();
    }
  }
});
