// @vitest-environment node
/** Real-store regressions for the five-minute login deadline and PostgreSQL rate windows. */
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.TANK_AUTH_DEADLINE_RACE_TEST === '1';
const registryDir = path.resolve(import.meta.dirname, '../../../..');
const runFile = promisify(execFile);
const sessionTtl = 300_000;
const sessionPrefix = 'cli-auth-v2:';
const legacySessionPrefix = 'cli-auth:';
const postgresStartupBudget = 120_000;
const postgresProbeTimeout = 6_000;
const postgresExpiryWaitTimeout = 15_000;
const workerTimeout = 25_000;
const testTimeout = 45_000;

class UnsafePostgresIdentity extends Error {}

class PostgresProbeTimeout extends Error {
  readonly code = 'PROBE_TIMEOUT';
}

function postgresErrorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (typeof code !== 'string') return 'UNKNOWN';
  if (/^[A-Z0-9]{5}$/.test(code)) return code;
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'CONNECTION_CLOSED',
    'CONNECTION_DESTROYED',
    'CONNECT_TIMEOUT',
    'PROBE_TIMEOUT'
  ].includes(code)
    ? code
    : 'UNKNOWN';
}

function startupProbeHold(): number {
  const value = process.env.TANK_AUTH_DEADLINE_STARTUP_HOLD_MS;
  if (value === undefined) return 0;
  if (!/^\d{1,5}$/.test(value) || Number(value) < 500 || Number(value) > 60_000) {
    throw new Error('TANK_AUTH_DEADLINE_STARTUP_HOLD_MS must be an integer from 500 to 60000');
  }
  return Number(value);
}

const worker = `
  import { authorizeSession, consumeSession, createSession, getSession } from './src/lib/auth/cli-store.ts';
  import { getKVStore } from './src/services/kv/index.ts';
  import { createPostgresStore } from './src/services/kv/postgres.ts';
  const sessionPrefix = '${sessionPrefix}';
  const legacySessionPrefix = '${legacySessionPrefix}';
  const { TEST_ACTION: action, TEST_CODE: code, TEST_STATE: state, TEST_KEY: key } = process.env;
  let result;
  if (action === 'get') {
    result = await getSession(code);
  } else if (action === 'authorize') {
    result = await authorizeSession(code, 'review-user', { name: 'Review User', email: 'review@example.test' });
  } else if (action === 'authorize-many') {
    const results = await Promise.all(Array.from({ length: 16 }, () => authorizeSession(code, 'review-user')));
    result = results.filter(Boolean).length;
  } else if (action === 'consume') {
    result = await consumeSession(code, state);
  } else if (action === 'consume-many') {
    const results = await Promise.all(Array.from({ length: 16 }, () => consumeSession(code, state)));
    result = results.filter(Boolean);
  } else if (action === 'memory') {
    const store = getKVStore();
    const issuedCode = await createSession(state);
    const issued = await getSession(issuedCode);
    const inNewNamespace = Boolean(await store.get(sessionPrefix + issuedCode));
    const inOldNamespace = Boolean(await store.get(legacySessionPrefix + issuedCode));
    const skewedCode = crypto.randomUUID();
    const skewedSession = { state, status: 'authorized', userId: 'review-user', createdAt: Date.now() - 300_001, expiryClock: 'store' };
    await store.set(sessionPrefix + skewedCode, JSON.stringify(skewedSession), 10_000);
    const skewed = await consumeSession(skewedCode, state);
    const expiredCode = crypto.randomUUID();
    const expiredSession = { state, status: 'authorized', userId: 'review-user', createdAt: Date.now(), expiryClock: 'store' };
    await store.set(sessionPrefix + expiredCode, JSON.stringify(expiredSession), 100);
    const beforeExpiry = await getSession(expiredCode);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const expired = await consumeSession(expiredCode, state);
    const authorizations = await Promise.all(Array.from({ length: 16 }, () => authorizeSession(issuedCode, 'review-user')));
    const mismatch = await consumeSession(issuedCode, 'wrong-state');
    const exchanges = await Promise.all(Array.from({ length: 16 }, () => consumeSession(issuedCode, state)));
    result = { issued, inNewNamespace, inOldNamespace, skewed, beforeExpiry, expired, authorizations: authorizations.filter(Boolean).length, mismatch, exchanges: exchanges.filter(Boolean).length };
  } else if (action === 'legacy-memory') {
    const store = getKVStore();
    const controlCode = crypto.randomUUID();
    const pending = { state, status: 'pending', createdAt: Date.now() + 900_000 };
    await store.set(sessionPrefix + controlCode, JSON.stringify({ ...pending, expiryClock: 'store' }), 10_000);
    const control = await authorizeSession(controlCode, 'review-user');
    const pendingRaw = JSON.stringify(pending);
    await store.set(sessionPrefix + code, pendingRaw, 10_000);
    const pendingRead = await getSession(code);
    const authorization = await authorizeSession(code, 'review-user');
    const pendingUnchanged = (await store.get(sessionPrefix + code)) === pendingRaw;
    const authorizedRaw = JSON.stringify({ ...pending, status: 'authorized', userId: 'review-user' });
    await store.set(sessionPrefix + code, authorizedRaw, 10_000);
    const authorizedRead = await getSession(code);
    const consumption = await consumeSession(code, state);
    const authorizedUnchanged = (await store.get(sessionPrefix + code)) === authorizedRaw;
    const oldCode = crypto.randomUUID();
    const oldRaw = JSON.stringify({ ...pending, status: 'authorized', userId: 'old-user', expiryClock: 'store' });
    await store.set(legacySessionPrefix + oldCode, oldRaw, 10_000);
    const oldRead = await getSession(oldCode);
    const oldConsumption = await consumeSession(oldCode, state);
    const oldUnchanged = (await store.get(legacySessionPrefix + oldCode)) === oldRaw;
    result = { control, pendingRead, authorization, pendingUnchanged, authorizedRead, consumption, authorizedUnchanged, oldRead, oldConsumption, oldUnchanged };
  } else if (action === 'rate') {
    result = await createPostgresStore(process.env.DATABASE_URL).incr(key, Number(process.env.TEST_TTL));
  } else if (action === 'rate-many') {
    const stores = Array.from({ length: 4 }, () => createPostgresStore(process.env.DATABASE_URL));
    result = await Promise.all(Array.from({ length: 32 }, (_, i) => stores[i % stores.length].incr(key, 60_000)));
  } else {
    throw new Error('Unknown regression worker action');
  }
  process.stdout.write('REGRESSION_RESULT=' + JSON.stringify(result) + '\\n');
  process.exit(0);
`;

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Hostnames and current_database() cannot identify a server behind a local proxy.
// Only the URLs constructed for our own container bridges may reach a client.
function rejectExternalEndpoints(env: NodeJS.ProcessEnv): void {
  if (env.TANK_AUTH_DEADLINE_POSTGRES_URL || env.TANK_AUTH_DEADLINE_REDIS_URL) {
    throw new Error('External test database URLs are forbidden; this suite creates its own isolated services');
  }
}

function assertOwnedUrl(value: string, expected: string): void {
  if (value !== expected || !/^\w+:\/\/[^@%/?#]+@127\.0\.0\.1:\d+\/[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error('Database URL is not the exact test-owned bridge endpoint');
  }
}

function workerEnvironment(
  inherited: NodeJS.ProcessEnv,
  action: string,
  databaseUrl: string,
  redisUrl: string,
  values: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: inherited.PATH || '/usr/bin:/bin',
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    TEST_ACTION: action
  };
  for (const name of ['TEST_CODE', 'TEST_STATE', 'TEST_KEY', 'TEST_TTL', 'PGAPPNAME']) {
    if (values[name] !== undefined) env[name] = values[name];
  }
  return env;
}

interface OwnedContainer {
  id: string;
  owner: string;
}

async function pinnedDockerHost(): Promise<string> {
  if (process.platform === 'linux') return 'unix:///var/run/docker.sock';
  if (process.platform !== 'darwin') throw new Error('Owned Docker fixtures require macOS or Linux');
  // Bun's os.userInfo().homedir also follows HOME; query the account database instead.
  const { stdout } = await runFile('/usr/bin/id', ['-P'], { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
  const fields = stdout.trim().split(':');
  const uid = process.getuid?.();
  const home = fields[8];
  if (
    fields.length !== 10 ||
    uid === undefined ||
    process.geteuid?.() !== uid ||
    !/^\d+$/.test(fields[2]) ||
    Number(fields[2]) !== uid ||
    !home ||
    !path.isAbsolute(home) ||
    /[\0\r\n]/.test(home)
  ) {
    throw new Error('Could not identify the actual local account home');
  }
  const canonicalHome = await realpath(home);
  if (/[?#%\0\r\n]/.test(canonicalHome))
    throw new Error('Local account home cannot be represented as a Docker socket URL');
  return `unix://${path.join(canonicalHome, '.colima/default/docker.sock')}`;
}

async function dockerEnvironment(inherited: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const host = await pinnedDockerHost();
  const override = inherited.TANK_AUTH_DEADLINE_DOCKER_HOST;
  if (override !== undefined && override !== host) {
    throw new Error('TANK_AUTH_DEADLINE_DOCKER_HOST must exactly match the pinned Docker socket');
  }
  // A socket path cannot attest its daemon: a forwarded or malicious daemon at
  // the pinned path is outside these ownership and network-isolation checks.
  return {
    PATH: inherited.PATH || '/usr/bin:/bin',
    DOCKER_HOST: host,
    // Prevent the Docker CLI from loading the user's registry credentials.
    DOCKER_CONFIG: path.join(os.tmpdir(), `tank-deadline-no-config-${randomUUID()}`)
  };
}

async function docker(env: NodeJS.ProcessEnv, ...args: string[]): Promise<string> {
  const { stdout } = await runFile('docker', args, { env, timeout: 30_000 });
  return stdout.trim();
}

async function verifyOwnedContainer(env: NodeJS.ProcessEnv, container: OwnedContainer): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(container.id)) throw new Error('Invalid owned container ID');
  const output = await docker(env, 'inspect', container.id);
  const [details] = JSON.parse(output);
  if (
    details?.Id !== container.id ||
    details.Config?.Labels?.['tank.deadline.owner'] !== container.owner ||
    details.HostConfig?.NetworkMode !== 'none'
  ) {
    throw new Error('Refusing to use or remove a container without the exact test ownership and network isolation');
  }
}

async function removeOwnedContainer(env: NodeJS.ProcessEnv, container: OwnedContainer): Promise<void> {
  await verifyOwnedContainer(env, container);
  await docker(env, 'rm', '-f', '-v', container.id);
}

async function createOwnedContainer(
  env: NodeJS.ProcessEnv,
  owner: string,
  args: string[],
  track: (container: OwnedContainer) => void
): Promise<OwnedContainer> {
  const name = `tank-deadline-${owner}-${randomBytes(8).toString('hex')}`;
  let id: string;
  try {
    id = await docker(
      env,
      'create',
      '--pull=never',
      '--network=none',
      '--name',
      name,
      '--label',
      `tank.deadline.owner=${owner}`,
      ...args
    );
  } catch (error) {
    // If create succeeded but the CLI lost its response, retain only the
    // exact named, ownership-verified container for fail-closed cleanup.
    try {
      const [details] = JSON.parse(await docker(env, 'inspect', name));
      const recovered = { id: details.Id as string, owner };
      await verifyOwnedContainer(env, recovered);
      track(recovered);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], `Container creation failed; check exact name ${name}`);
    }
    throw error;
  }
  const container = { id, owner };
  track(container);
  await verifyOwnedContainer(env, container);
  await docker(env, 'start', id);
  return container;
}

interface Bridge {
  port: number;
  close(): Promise<void>;
}

async function ownedBridge(env: NodeJS.ProcessEnv, container: OwnedContainer, targetPort: number): Promise<Bridge> {
  await verifyOwnedContainer(env, container);
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    // Each connection goes directly into this exact, network-disabled container;
    // no user-provided local port, DNS name, or downstream proxy is trusted.
    const child = spawn('docker', ['exec', '-i', container.id, 'nc', '127.0.0.1', String(targetPort)], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stderr.resume();
    child.once('error', () => socket.destroy());
    child.once('close', () => socket.destroy());
    socket.once('close', () => {
      sockets.delete(socket);
      child.stdin.destroy();
      child.kill('SIGTERM');
    });
    socket.on('error', () => child.kill('SIGTERM'));
    child.stdin.on('error', () => socket.destroy());
    child.stdout.on('error', () => socket.destroy());
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind the owned loopback bridge');
  return {
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function forwardedDockerSocket() {
  // Unix-domain socket paths have a short platform-dependent length limit.
  const preferred = os.tmpdir();
  const base =
    Buffer.byteLength(path.join(preferred, 'd-XXXXXX/.colima/default/docker.sock')) < 104 ? preferred : '/tmp';
  const home = await mkdtemp(path.join(base, 'd-'));
  const socketPath = path.join(home, '.colima/default/docker.sock');
  const sockets = new Set<Socket>();
  let forwarded = 0;
  let upstream = 0;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  const target = createServer((socket) => {
    track(socket);
    upstream += 1;
    socket.on('error', () => socket.destroy());
    socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  const proxy = createServer((socket) => {
    track(socket);
    forwarded += 1;
    const address = target.address();
    if (!address || typeof address === 'string') return socket.destroy();
    const peer = createConnection({ host: '127.0.0.1', port: address.port });
    track(peer);
    socket.on('error', () => peer.destroy());
    peer.on('error', () => socket.destroy());
    socket.once('close', () => peer.destroy());
    socket.pipe(peer).pipe(socket);
  });
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    await closeServer(proxy);
    await closeServer(target);
    await rm(home, { recursive: true, force: true });
  };
  try {
    await mkdir(path.dirname(socketPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      target.once('error', reject);
      target.listen(0, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(socketPath, resolve);
    });
    return { home, socketPath, counts: () => ({ forwarded, upstream }), close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function probeForwarder(socketPath: string): Promise<void> {
  const client = createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    client.once('error', reject);
    client.once('data', (data) => {
      client.destroy();
      if (data.toString().startsWith('HTTP/1.1 503')) resolve();
      else reject(new Error('Forwarded socket did not reach the local target'));
    });
  });
}

async function runEnabledFixture(overrides: NodeJS.ProcessEnv) {
  const env = { ...workerEnvironment(process.env, 'memory', '', ''), TANK_AUTH_DEADLINE_RACE_TEST: '1', ...overrides };
  try {
    const { stdout, stderr } = await runFile(
      'bun',
      [
        '--no-env-file',
        '--no-install',
        `--config=${os.devNull}`,
        'run',
        'test',
        'src/lib/auth/__tests__/cli-store-deadline-race.test.ts',
        '-t',
        'allows enough time for enabled real-store tests'
      ],
      { cwd: registryDir, env, timeout: 180_000 }
    );
    return { code: 0, output: `${stdout}\n${stderr}` };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { code: failure.code, output: `${failure.stdout}\n${failure.stderr}` };
  }
}

describe('deadline test isolation guards', () => {
  it('reports transient PostgreSQL SQLSTATEs without leaking error text', () => {
    expect(postgresErrorCode({ code: '57P03', message: 'secret connection details' })).toBe('57P03');
    expect(postgresErrorCode({ code: 'secret connection details' })).toBe('UNKNOWN');
    expect(postgresErrorCode({ code: 'SENSITIVEVALUE' })).toBe('UNKNOWN');
  });

  it('rejects the multi-@ URL that postgres.js interprets as a remote multi-host endpoint', async () => {
    const bypass = 'postgresql://user@remote.invalid%2C127.0.0.1@localhost:5432/safe_test';
    expect(new URL(bypass).hostname).toBe('localhost');
    const parsed = postgres(bypass);
    expect(parsed.options.host[0]).toBe('remote.invalid');
    await parsed.end();
    expect(() => assertOwnedUrl(bypass, bypass)).toThrow();
    expect(() => rejectExternalEndpoints({ TANK_AUTH_DEADLINE_POSTGRES_URL: bypass })).toThrow();
  });

  it('never forwards ambient credentials or arbitrary child environment overrides', () => {
    const env = workerEnvironment(
      { PATH: '/usr/bin:/bin', PGPASSWORD: 'ambient-secret', AWS_SECRET_ACCESS_KEY: 'ambient-secret' },
      'memory',
      '',
      '',
      { TEST_CODE: 'code', PGPASSWORD: 'injected-secret', BUN_OPTIONS: '--preload=unsafe' }
    );
    expect(env).toEqual({
      PATH: '/usr/bin:/bin',
      NODE_ENV: 'test',
      DATABASE_URL: '',
      REDIS_URL: '',
      TEST_ACTION: 'memory',
      TEST_CODE: 'code'
    });
  });

  it('allows only the exact pinned Docker socket spelling', async () => {
    const host = await pinnedDockerHost();
    if (process.platform === 'linux') {
      expect(host).toBe('unix:///var/run/docker.sock');
    } else {
      const { stdout } = await runFile('/usr/bin/id', ['-P'], { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
      const accountHome = await realpath(stdout.trim().split(':')[8]);
      expect(host).toBe(`unix://${path.join(accountHome, '.colima/default/docker.sock')}`);
    }
    const inherited = { PATH: '/usr/bin:/bin', HOME: '/forged-home', DOCKER_HOST: 'tcp://127.0.0.1:1' };
    const normal = await dockerEnvironment(inherited);
    expect(normal.DOCKER_HOST).toBe(host);
    expect(normal.HOME).toBeUndefined();
    expect((await dockerEnvironment({ ...inherited, TANK_AUTH_DEADLINE_DOCKER_HOST: host })).DOCKER_HOST).toBe(host);
    const alias = `${host.slice(0, host.lastIndexOf('/'))}/./docker.sock`;
    for (const override of [
      '',
      alias,
      `${host}/`,
      `${host}?forwarded=1`,
      'unix:///run/docker.sock',
      'unix:///tmp/forwarded.sock'
    ]) {
      await expect(dockerEnvironment({ ...inherited, TANK_AUTH_DEADLINE_DOCKER_HOST: override })).rejects.toThrow(
        'TANK_AUTH_DEADLINE_DOCKER_HOST must exactly match the pinned Docker socket'
      );
    }
  });

  it('rejects a forwarded Docker socket override before any connection', async () => {
    const forwarder = await forwardedDockerSocket();
    try {
      await probeForwarder(forwarder.socketPath);
      const before = forwarder.counts();
      expect(before).toEqual({ forwarded: 1, upstream: 1 });
      const result = await runEnabledFixture({ TANK_AUTH_DEADLINE_DOCKER_HOST: `unix://${forwarder.socketPath}` });
      expect(forwarder.counts()).toEqual(before);
      expect(result.code).toBe(1);
      expect(result.output).toContain('TANK_AUTH_DEADLINE_DOCKER_HOST must exactly match the pinned Docker socket');
    } finally {
      await forwarder.close();
    }
  }, 30_000);

  it.skipIf(!enabled)(
    'ignores a forged HOME containing a forwarded Docker socket',
    async () => {
      const forwarder = await forwardedDockerSocket();
      try {
        await probeForwarder(forwarder.socketPath);
        const before = forwarder.counts();
        expect(before).toEqual({ forwarded: 1, upstream: 1 });
        const result = await runEnabledFixture({ HOME: forwarder.home });
        expect(forwarder.counts()).toEqual(before);
        expect(result.code, result.output).toBe(0);
        const explicit = await runEnabledFixture({
          HOME: forwarder.home,
          TANK_AUTH_DEADLINE_DOCKER_HOST: await pinnedDockerHost()
        });
        expect(forwarder.counts()).toEqual(before);
        expect(explicit.code, explicit.output).toBe(0);
      } finally {
        await forwarder.close();
      }
    },
    210_000
  );

  it('does not let a loopback proxy URL trigger even an initial connection', async () => {
    let connections = 0;
    const proxy = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = proxy.address();
      if (!address || typeof address === 'string') throw new Error('Could not create proxy counterexample');
      const url = `postgresql://user:password@127.0.0.1:${address.port}/safe_test`;
      expect(() => rejectExternalEndpoints({ TANK_AUTH_DEADLINE_POSTGRES_URL: url })).toThrow();
      expect(() => assertOwnedUrl(url, 'postgresql://owned:secret@127.0.0.1:1/owned_test')).toThrow();
      const env = workerEnvironment(process.env, 'memory', '', '');
      env.TANK_AUTH_DEADLINE_RACE_TEST = '1';
      env.TANK_AUTH_DEADLINE_POSTGRES_URL = url;
      let failure: { stdout?: string; stderr?: string; code?: number } | undefined;
      try {
        await runFile(
          'bun',
          [
            '--no-env-file',
            '--no-install',
            `--config=${os.devNull}`,
            'run',
            'test',
            'src/lib/auth/__tests__/cli-store-deadline-race.test.ts',
            '-t',
            'preserves single-use store-clock memory sessions'
          ],
          { cwd: registryDir, env, timeout: 15_000 }
        );
      } catch (error) {
        failure = error as { stdout?: string; stderr?: string; code?: number };
      }
      expect(failure?.code).toBe(1);
      expect(`${failure?.stdout}\n${failure?.stderr}`).toContain('External test database URLs are forbidden');
      expect(connections).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve())));
    }
  }, 20_000);

  it('starts an actual Bun child without ambient credentials or dotenv loading', async () => {
    const env = workerEnvironment(
      { PATH: process.env.PATH, PGPASSWORD: 'should-not-leak', TANK_TOKEN: 'should-not-leak' },
      'memory',
      '',
      '',
      { BUN_OPTIONS: '--preload=unsafe', TEST_CODE: 'safe' }
    );
    const { stdout } = await runFile(
      'bun',
      [
        '--no-env-file',
        '--no-install',
        `--config=${os.devNull}`,
        '-e',
        'process.stdout.write(JSON.stringify(process.env))'
      ],
      { cwd: registryDir, env, timeout: 5000 }
    );
    const actual = JSON.parse(stdout);
    expect(actual.PGPASSWORD).toBeUndefined();
    expect(actual.TANK_TOKEN).toBeUndefined();
    expect(actual.BUN_OPTIONS).toBeUndefined();
    expect(actual.TEST_CODE).toBe('safe');
  });
});

describe.skipIf(!enabled)('real login-deadline and rate-window regressions', { timeout: testTimeout }, () => {
  let pgUrl: string;
  let redisUrl: string;
  let pool: postgres.Sql;
  let sql: postgres.ReservedSql;
  let redis: Redis;
  let dockerEnv: NodeJS.ProcessEnv;
  let pgDatabase: string;
  let pgUser: string;
  let pgPassword: string;
  let adminPid: number;
  let pgContainer: OwnedContainer;
  let createPgPool: () => postgres.Sql;
  const containers: OwnedContainer[] = [];
  const bridges: Bridge[] = [];

  beforeAll(async () => {
    rejectExternalEndpoints(process.env);
    dockerEnv = await dockerEnvironment();
    const owner = randomBytes(16).toString('hex');
    pgUser = `deadline_${owner}`;
    pgDatabase = `deadline_${owner}_test`;
    pgPassword = randomBytes(32).toString('hex');
    const redisPassword = randomBytes(32).toString('hex');
    pgContainer = await createOwnedContainer(
      dockerEnv,
      owner,
      [
        '-e',
        `POSTGRES_USER=${pgUser}`,
        '-e',
        `POSTGRES_PASSWORD=${pgPassword}`,
        '-e',
        `POSTGRES_DB=${pgDatabase}`,
        'postgres:17-alpine'
      ],
      (container) => containers.push(container)
    );
    const redisContainer = await createOwnedContainer(
      dockerEnv,
      owner,
      ['redis:7-alpine', 'redis-server', '--requirepass', redisPassword],
      (container) => containers.push(container)
    );
    const pgBridge = await ownedBridge(dockerEnv, pgContainer, 5432);
    bridges.push(pgBridge);
    const redisBridge = await ownedBridge(dockerEnv, redisContainer, 6379);
    bridges.push(redisBridge);
    pgUrl = `postgresql://${pgUser}:${pgPassword}@127.0.0.1:${pgBridge.port}/${pgDatabase}`;
    redisUrl = `redis://:${redisPassword}@127.0.0.1:${redisBridge.port}/15`;
    assertOwnedUrl(pgUrl, `postgresql://${pgUser}:${pgPassword}@127.0.0.1:${pgBridge.port}/${pgDatabase}`);
    assertOwnedUrl(redisUrl, `redis://:${redisPassword}@127.0.0.1:${redisBridge.port}/15`);
    // Pass all credential and network fields explicitly; postgres.js otherwise reads PG* from process.env.
    createPgPool = () =>
      postgres({
        host: '127.0.0.1',
        port: pgBridge.port,
        user: pgUser,
        password: pgPassword,
        database: pgDatabase,
        ssl: false,
        target_session_attrs: 'read-write',
        max: 5,
        connect_timeout: 3,
        connection: { application_name: 'deadline-regression-admin' }
      });
    // An opt-in hold exercises the real startup path beyond the former 30s
    // limit without pointing any connection at an external service.
    const holdMs = startupProbeHold();
    const started = performance.now();
    let resume: Promise<string> | undefined;
    if (holdMs) {
      await verifyOwnedContainer(dockerEnv, pgContainer);
      await docker(dockerEnv, 'pause', pgContainer.id);
      resume = delay(holdMs).then(() => docker(dockerEnv, 'unpause', pgContainer.id));
      // The readiness probe may still be running when the unpause fails.
      void resume.catch(() => undefined);
    }
    let ready: Awaited<ReturnType<typeof waitForPostgres>>;
    try {
      ready = await waitForPostgres(createPgPool);
    } finally {
      if (resume) await resume;
    }
    pool = ready.pool;
    sql = ready.connection;
    adminPid = ready.pid;
    if (holdMs) {
      if (holdMs > postgresProbeTimeout) expect(ready.attempts).toBeGreaterThan(1);
      expect(performance.now() - started).toBeGreaterThanOrEqual(holdMs);
      process.stdout.write(
        `PostgreSQL authenticated readiness after ${Math.round(performance.now() - started)}ms ` +
          `(${ready.attempts} attempts, lastCode=${ready.lastCode})\n`
      );
    }
    redis = new Redis({
      host: '127.0.0.1',
      port: redisBridge.port,
      password: redisPassword,
      db: 15,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000
    });
    const directRedisInfo = await docker(
      dockerEnv,
      'exec',
      '-e',
      `REDISCLI_AUTH=${redisPassword}`,
      redisContainer.id,
      'redis-cli',
      'INFO',
      'server'
    );
    const redisInfo = await redis.info('server');
    const runId = (info: string) => /^run_id:(\S+)/m.exec(info)?.[1];
    if (!runId(directRedisInfo) || runId(directRedisInfo) !== runId(redisInfo))
      throw new Error('Redis writer is not the owned service');
    await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`;
    // Unlike a separate preflight connection, this trigger checks the actual
    // session performing every fixture or application write, including DELETE.
    await sql.unsafe(`
      CREATE FUNCTION deadline_assert_writer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_database() <> '${pgDatabase}' OR current_user <> '${pgUser}'
          OR host(inet_server_addr()) <> '127.0.0.1' OR host(inet_client_addr()) <> '127.0.0.1' THEN
          RAISE EXCEPTION 'test-owned PostgreSQL writer identity mismatch';
        END IF;
        RETURN NULL;
      END $$
    `);
    await sql`CREATE TRIGGER deadline_assert_writer BEFORE INSERT OR UPDATE OR DELETE ON kv_store
      FOR EACH STATEMENT EXECUTE FUNCTION deadline_assert_writer()`;
  }, 480_000);

  afterAll(async () => {
    let failure: unknown;
    const attempt = async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        failure ??= error;
      }
    };
    if (redis) redis.disconnect();
    if (sql) sql.release();
    if (pool) await attempt(() => pool.end({ timeout: 3 }));
    for (const bridge of bridges.reverse()) await attempt(() => bridge.close());
    for (const container of containers.reverse()) await attempt(() => removeOwnedContainer(dockerEnv, container));
    if (failure) throw failure;
  }, 180_000);

  async function verifyPgConnection(
    query: (...args: Parameters<typeof sql>) => ReturnType<typeof sql>
  ): Promise<number> {
    const [identity] = (await query`
      SELECT current_database() AS database, current_user AS username, pg_backend_pid() AS pid,
        host(inet_server_addr()) AS server, host(inet_client_addr()) AS client
    `) as readonly { database: string; username: string; pid: number; server: string; client: string }[];
    if (
      identity.database !== pgDatabase ||
      identity.username !== pgUser ||
      identity.server !== '127.0.0.1' ||
      identity.client !== '127.0.0.1'
    ) {
      throw new UnsafePostgresIdentity('PostgreSQL connection is not the owned test database and user');
    }
    return identity.pid;
  }

  async function postgresStatus(): Promise<string> {
    try {
      const { stdout } = await runFile('docker', ['inspect', '--format', '{{json .State}}', pgContainer.id], {
        env: dockerEnv,
        timeout: 5000
      });
      const state = JSON.parse(stdout);
      const status = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(state.Status)
        ? state.Status
        : 'unknown';
      const exitCode = Number.isInteger(state.ExitCode) ? state.ExitCode : 'unknown';
      return `container status=${status}, exitCode=${exitCode}, oomKilled=${state.OOMKilled === true}`;
    } catch {
      return 'container status=unavailable';
    }
  }

  async function waitForPostgres(
    createPool: () => postgres.Sql,
    budgetMs = postgresStartupBudget,
    attemptMs = postgresProbeTimeout
  ): Promise<{
    pool: postgres.Sql;
    connection: postgres.ReservedSql;
    pid: number;
    attempts: number;
    lastCode: string;
  }> {
    const deadline = performance.now() + budgetMs;
    let attempts = 0;
    let lastCode = 'NOT_ATTEMPTED';
    while (performance.now() < deadline) {
      attempts += 1;
      const attemptPool = createPool();
      let connection: postgres.ReservedSql | undefined;
      let released = false;
      let expired = false;
      const release = () => {
        if (connection && !released) {
          connection.release();
          released = true;
        }
      };
      const probe = (async () => {
        connection = await attemptPool.reserve();
        try {
          if (expired) throw new PostgresProbeTimeout();
          const pid = await verifyPgConnection(connection);
          if (expired || performance.now() >= deadline) throw new PostgresProbeTimeout();
          return { pool: attemptPool, connection, pid, attempts, lastCode };
        } catch (error) {
          release();
          throw error;
        }
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          probe,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new PostgresProbeTimeout()),
              Math.min(attemptMs, deadline - performance.now())
            );
          })
        ]);
      } catch (error) {
        expired = true;
        release();
        try {
          await attemptPool.end({ timeout: 0 });
        } catch {
          throw new Error('Could not close the PostgreSQL readiness probe');
        }
        if (error instanceof UnsafePostgresIdentity) throw error;
        lastCode = postgresErrorCode(error);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const remaining = deadline - performance.now();
      if (remaining > 0) await delay(Math.min(500, remaining));
    }
    throw new Error(
      `PostgreSQL did not accept an authenticated identity query within ${budgetMs}ms ` +
        `(attempts=${attempts}, lastCode=${lastCode}, ${await postgresStatus()})`
    );
  }

  function runWorker(action: string, backend: 'memory' | 'postgres' | 'redis', values: Record<string, string> = {}) {
    return runFile('bun', ['--no-env-file', '--no-install', `--config=${os.devNull}`, '-e', worker], {
      cwd: registryDir,
      timeout: workerTimeout,
      env: workerEnvironment(
        process.env,
        action,
        backend === 'postgres' ? pgUrl : '',
        backend === 'redis' ? redisUrl : '',
        values
      )
    }).then(({ stdout }) => {
      const line = stdout.split('\n').find((entry) => entry.startsWith('REGRESSION_RESULT='));
      if (!line) throw new Error(`Regression worker did not return a result: ${stdout}`);
      return JSON.parse(line.slice('REGRESSION_RESULT='.length));
    });
  }

  async function seed(
    backend: 'postgres' | 'redis',
    code: string,
    { value, ttlMs = 10_000, prefix = sessionPrefix }: { value: string; ttlMs?: number; prefix?: string }
  ): Promise<string> {
    const key = `${prefix}${code}`;
    if (backend === 'postgres') {
      await sql`INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, ${value}, clock_timestamp() + ${ttlMs}::double precision * interval '1 millisecond')`;
    } else {
      await redis.set(key, value, 'PX', ttlMs);
    }
    return key;
  }

  async function stored(backend: 'postgres' | 'redis', key: string): Promise<string | null> {
    if (backend === 'redis') return redis.get(key);
    const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
    return rows[0]?.value ?? null;
  }

  async function pgExpiry(key: string): Promise<string> {
    const rows = await sql`SELECT expires_at::text AS expires_at FROM kv_store WHERE key = ${key}`;
    return rows[0].expires_at;
  }

  async function waitForPgLock(applicationName: string, blockerPid: number, timeout = 2000): Promise<string> {
    return vi.waitFor(
      async () => {
        const rows = await sql`SELECT pid, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${applicationName} AND datname = ${pgDatabase}
            AND usename = ${pgUser} AND wait_event_type = 'Lock'`;
        expect(rows).toHaveLength(1);
        expect(rows[0].pid).not.toBe(blockerPid);
        expect(rows[0].blockers).toContain(blockerPid);
        return rows[0].query as string;
      },
      { interval: 20, timeout }
    );
  }

  function expectAtomicQuery(query: string, action: 'authorize' | 'consume'): void {
    expect(query).toMatch(action === 'authorize' ? /\bUPDATE kv_store\b/i : /\bDELETE FROM kv_store\b/i);
  }

  async function waitForPgExpiryWhileBlocked({
    key,
    applicationName,
    blockerPid,
    action
  }: {
    key: string;
    applicationName: string;
    blockerPid: number;
    action: 'authorize' | 'consume';
  }): Promise<void> {
    await vi.waitFor(
      async () => {
        // Observe the database deadline and the blocked atomic query together.
        const rows = await sql`SELECT kv.expires_at <= clock_timestamp() AS expired, activity.pid, activity.query,
          pg_blocking_pids(activity.pid) AS blockers FROM kv_store AS kv JOIN pg_stat_activity AS activity
          ON activity.application_name = ${applicationName} WHERE kv.key = ${key}
          AND activity.datname = ${pgDatabase} AND activity.usename = ${pgUser} AND activity.wait_event_type = 'Lock'`;
        expect(rows).toHaveLength(1);
        expect(rows[0].pid).not.toBe(blockerPid);
        expect(rows[0].blockers).toContain(blockerPid);
        expectAtomicQuery(rows[0].query, action);
        expect(rows[0].expired).toBe(true);
      },
      { interval: 100, timeout: postgresExpiryWaitTimeout }
    );
  }

  async function expectStoreClockSuccess({
    backend,
    key,
    action,
    state,
    result
  }: {
    backend: 'postgres' | 'redis';
    key: string;
    action: 'authorize' | 'consume';
    state: string;
    result: unknown;
  }): Promise<void> {
    const expected = { state, status: 'authorized', userId: 'review-user', expiryClock: 'store' };
    if (action === 'authorize') {
      expect(result).toBe(true);
      expect(JSON.parse((await stored(backend, key)) ?? 'null')).toMatchObject(expected);
    } else {
      expect(result).toMatchObject(expected);
      expect(await stored(backend, key)).toBeNull();
    }
  }

  it('allows enough time for enabled real-store tests', ({ task }) => {
    expect(task.timeout).toBe(testTimeout);
  });

  it('preserves single-use store-clock memory sessions and expires them by store TTL', async () => {
    const state = `state-${randomUUID()}`;
    const result = await runWorker('memory', 'memory', { TEST_STATE: state });
    expect(result.issued).toMatchObject({ state, status: 'pending', expiryClock: 'store' });
    expect(result.inNewNamespace).toBe(true);
    expect(result.inOldNamespace).toBe(false);
    expect(result.skewed).toMatchObject({ state, status: 'authorized', userId: 'review-user', expiryClock: 'store' });
    expect(result.beforeExpiry).toMatchObject({ state, status: 'authorized', expiryClock: 'store' });
    expect(result).toMatchObject({ expired: null, authorizations: 1, mismatch: null, exchanges: 1 });
  });

  it('rejects markerless memory sessions and ignores the old namespace', async () => {
    const result = await runWorker('legacy-memory', 'memory', { TEST_CODE: randomUUID(), TEST_STATE: 'legacy-state' });
    expect(result).toEqual({
      control: true,
      pendingRead: null,
      authorization: false,
      pendingUnchanged: true,
      authorizedRead: null,
      consumption: null,
      authorizedUnchanged: true,
      oldRead: null,
      oldConsumption: null,
      oldUnchanged: true
    });
  });

  it('refuses cleanup when the container ownership token does not match', async () => {
    await expect(removeOwnedContainer(dockerEnv, { ...pgContainer, owner: randomUUID() })).rejects.toThrow(/refusing/i);
    expect(await verifyPgConnection(sql)).toBe(adminPid);
  });

  it('fails with bounded, non-secret diagnostics when PostgreSQL is unavailable', async () => {
    await verifyOwnedContainer(dockerEnv, pgContainer);
    await docker(dockerEnv, 'pause', pgContainer.id);
    let failure: Error | undefined;
    let unexpected: Awaited<ReturnType<typeof waitForPostgres>> | undefined;
    const started = performance.now();
    let elapsed = 0;
    try {
      unexpected = await waitForPostgres(createPgPool, 1500, 500);
    } catch (error) {
      failure = error instanceof Error ? error : new Error('Unexpected non-error');
    } finally {
      elapsed = performance.now() - started;
      try {
        if (unexpected) {
          unexpected.connection.release();
          await unexpected.pool.end({ timeout: 3 });
        }
      } finally {
        await docker(dockerEnv, 'unpause', pgContainer.id);
      }
    }
    expect(unexpected).toBeUndefined();
    expect(failure?.message).toContain('within 1500ms');
    expect(failure?.message).toContain('attempts=');
    expect(failure?.message).toContain('lastCode=');
    expect(failure?.message).toMatch(/container status=(paused|running)/);
    expect(failure?.message).not.toContain(pgPassword);
    expect(failure?.message).not.toContain(pgUrl);
    expect(elapsed).toBeLessThan(20_000);
  }, 30_000);

  it('rejects a write on a different actual PostgreSQL session identity', async () => {
    const otherRole = `deadline_other_${randomBytes(16).toString('hex')}`;
    const key = `deadline-wrong-writer:${randomUUID()}`;
    await sql.unsafe(`CREATE ROLE ${otherRole}`);
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON kv_store TO ${otherRole}`);
    const attempt = pool.begin(async (tx) => {
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      await verifyPgConnection(query);
      await tx.unsafe(`SET LOCAL ROLE ${otherRole}`);
      await query`INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, 'forbidden', clock_timestamp())`;
    });
    await expect(attempt).rejects.toThrow(/writer identity mismatch/);
    const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
    expect(rows).toHaveLength(0);
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('preserves valid store-clock %s sessions without extending their TTL', async (backend) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const raw = JSON.stringify({ state, status: 'pending', createdAt: Date.now(), expiryClock: 'store' });
    const key = await seed(backend, code, { value: raw });
    const before = backend === 'postgres' ? await pgExpiry(key) : await redis.pttl(key);
    expect(await runWorker('authorize', backend, { TEST_CODE: code, TEST_STATE: state })).toBe(true);
    const after = backend === 'postgres' ? await pgExpiry(key) : await redis.pttl(key);
    if (backend === 'postgres') expect(after).toBe(before);
    else expect(Number(after)).toBeLessThanOrEqual(Number(before));
    expect(await runWorker('consume', backend, { TEST_CODE: code, TEST_STATE: 'wrong-state' })).toBeNull();
    const results = await runWorker('consume-many', backend, { TEST_CODE: code, TEST_STATE: state });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      state,
      status: 'authorized',
      userId: 'review-user',
      userEmail: 'review@example.test',
      expiryClock: 'store'
    });
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('authorizes a store-clock %s session at most once under concurrency', async (backend) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    await seed(backend, code, {
      value: JSON.stringify({ state, status: 'pending', createdAt: Date.now(), expiryClock: 'store' })
    });
    expect(await runWorker('authorize-many', backend, { TEST_CODE: code, TEST_STATE: state })).toBe(1);
    expect(await runWorker('consume-many', backend, { TEST_CODE: code, TEST_STATE: state })).toHaveLength(1);
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('uses the %s store TTL despite a stale application timestamp', async (backend) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const raw = JSON.stringify({
      state,
      status: 'authorized',
      userId: 'review-user',
      createdAt: Date.now() - sessionTtl - 1,
      expiryClock: 'store'
    });
    const key = await seed(backend, code, { value: raw });
    expect(await runWorker('consume', backend, { TEST_CODE: code, TEST_STATE: state })).toMatchObject({
      state,
      status: 'authorized',
      userId: 'review-user',
      expiryClock: 'store'
    });
    expect(await stored(backend, key)).toBeNull();
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('consumes an already authorized store-clock %s session exactly once', async (backend) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const raw = JSON.stringify(
      {
        state,
        status: 'authorized',
        userId: 'review-user',
        userEmail: 'review@example.test',
        createdAt: Date.now(),
        expiryClock: 'store'
      },
      null,
      2
    );
    const key = await seed(backend, code, { value: raw });
    expect(await runWorker('consume', backend, { TEST_CODE: code, TEST_STATE: 'wrong-state' })).toBeNull();
    expect(await stored(backend, key)).toBe(raw);
    const results = await runWorker('consume-many', backend, { TEST_CODE: code, TEST_STATE: state });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      state,
      status: 'authorized',
      userId: 'review-user',
      userEmail: 'review@example.test',
      expiryClock: 'store'
    });
  });

  it.each(['postgres', 'redis'] as const)('rejects markerless %s sessions with live store TTLs', async (backend) => {
    const state = `state-${randomUUID()}`;
    const controlCode = randomUUID();
    await seed(backend, controlCode, {
      value: JSON.stringify({ state, status: 'pending', createdAt: Date.now(), expiryClock: 'store' })
    });
    expect(await runWorker('authorize', backend, { TEST_CODE: controlCode, TEST_STATE: state })).toBe(true);
    for (const [action, createdAt] of [
      ['authorize', Date.now()],
      ['consume', Date.now()],
      ['authorize', Date.now() + sessionTtl * 3],
      ['consume', Date.now() + sessionTtl * 3],
      ['authorize', null],
      ['consume', null]
    ] as const) {
      const code = randomUUID();
      const raw = JSON.stringify({ state, status: action === 'authorize' ? 'pending' : 'authorized', createdAt });
      const key = await seed(backend, code, { value: raw });
      expect(await runWorker('get', backend, { TEST_CODE: code, TEST_STATE: state })).toBeNull();
      expect(await runWorker(action, backend, { TEST_CODE: code, TEST_STATE: state })).toBe(
        action === 'authorize' ? false : null
      );
      expect(await stored(backend, key)).toBe(raw);
    }
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('ignores %s sessions in the old namespace, even if marked', async (backend) => {
    const state = `state-${randomUUID()}`;
    for (const action of ['authorize', 'consume'] as const) {
      const code = randomUUID();
      const raw = JSON.stringify({
        state,
        status: action === 'authorize' ? 'pending' : 'authorized',
        userId: 'old-user',
        createdAt: Date.now(),
        expiryClock: 'store'
      });
      const key = await seed(backend, code, { value: raw, prefix: legacySessionPrefix });
      expect(await runWorker('get', backend, { TEST_CODE: code, TEST_STATE: state })).toBeNull();
      expect(await runWorker(action, backend, { TEST_CODE: code, TEST_STATE: state })).toBe(
        action === 'authorize' ? false : null
      );
      expect(await stored(backend, key)).toBe(raw);
    }
  });

  it.each([
    'postgres',
    'redis'
  ] as const)('keeps the old %s namespace untouched when both namespaces contain a code', async (backend) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const oldRaw = JSON.stringify({ state, status: 'authorized', userId: 'old-user', createdAt: Date.now() });
    const oldKey = await seed(backend, code, { value: oldRaw, prefix: legacySessionPrefix });
    const newRaw = JSON.stringify({ state, status: 'pending', createdAt: Date.now(), expiryClock: 'store' });
    const newKey = await seed(backend, code, { value: newRaw });
    expect(await runWorker('authorize', backend, { TEST_CODE: code, TEST_STATE: state })).toBe(true);
    expect(await stored(backend, oldKey)).toBe(oldRaw);
    expect(await runWorker('consume', backend, { TEST_CODE: code, TEST_STATE: state })).toMatchObject({
      state,
      status: 'authorized',
      userId: 'review-user',
      expiryClock: 'store'
    });
    expect(await stored(backend, newKey)).toBeNull();
    expect(await stored(backend, oldKey)).toBe(oldRaw);
  });

  it.each([
    'authorize',
    'consume'
  ] as const)('allows %s after a skewed application deadline while PostgreSQL TTL remains live', async (action) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const createdAt = Date.now() - sessionTtl + 3000;
    const raw = JSON.stringify({
      state,
      status: action === 'authorize' ? 'pending' : 'authorized',
      userId: 'review-user',
      createdAt,
      expiryClock: 'store'
    });
    const key = await seed('postgres', code, { value: raw });
    const locked = deferred();
    const release = deferred();
    let blockerPid = 0;
    const holding = pool.begin(async (tx) => {
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      blockerPid = await verifyPgConnection(query);
      await query`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const applicationName = `deadline-${randomUUID()}`;
    const attempt = runWorker(action, 'postgres', { TEST_CODE: code, TEST_STATE: state, PGAPPNAME: applicationName });
    try {
      expectAtomicQuery(await waitForPgLock(applicationName, blockerPid), action);
      expect(Date.now()).toBeLessThan(createdAt + sessionTtl);
      await delay(Math.max(0, createdAt + sessionTtl - Date.now()) + 100);
      const [row] = await sql`SELECT expires_at > clock_timestamp() AS live FROM kv_store WHERE key = ${key}`;
      expect(row.live).toBe(true);
    } finally {
      release.resolve();
      await holding;
    }
    await expectStoreClockSuccess({ backend: 'postgres', key, action, state, result: await attempt });
  });

  it.each([
    'authorize',
    'consume'
  ] as const)('allows %s after a skewed application deadline while Redis TTL remains live', async (action) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const createdAt = Date.now() - sessionTtl + 3000;
    const raw = JSON.stringify({
      state,
      status: action === 'authorize' ? 'pending' : 'authorized',
      userId: 'review-user',
      createdAt,
      expiryClock: 'store'
    });
    const key = await seed('redis', code, { value: raw });
    const monitor = await redis.monitor();
    const seen = new Promise<number>((resolve) => {
      monitor.on('monitor', (_time, args: string[]) => {
        if (args[0]?.toLowerCase() === 'get' && args[1] === key) resolve(Date.now());
      });
    });
    const atomic = new Promise<number>((resolve) => {
      monitor.on('monitor', (_time, args: string[]) => {
        if (args[0]?.toLowerCase() === 'eval' && args[3] === key) resolve(Date.now());
      });
    });
    try {
      await redis.call('CLIENT', 'PAUSE', 4500, 'WRITE');
      const attempt = runWorker(action, 'redis', { TEST_CODE: code, TEST_STATE: state });
      const getTime = await Promise.race([
        seen,
        delay(2000).then(() => {
          throw new Error('Redis GET was not observed');
        })
      ]);
      expect(getTime).toBeLessThan(createdAt + sessionTtl);
      const result = await attempt;
      const atomicTime = await Promise.race([
        atomic,
        delay(2000).then(() => {
          throw new Error('Redis atomic EVAL was not observed');
        })
      ]);
      expect(atomicTime).toBeGreaterThanOrEqual(createdAt + sessionTtl);
      await expectStoreClockSuccess({ backend: 'redis', key, action, state, result });
    } finally {
      monitor.disconnect();
      await redis.call('CLIENT', 'UNPAUSE');
    }
  });

  it.each([
    'authorize',
    'consume'
  ] as const)('rejects %s when PostgreSQL storage expires during the lock wait', async (action) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const raw = JSON.stringify({
      state,
      status: action === 'authorize' ? 'pending' : 'authorized',
      userId: 'review-user',
      createdAt: Date.now(),
      expiryClock: 'store'
    });
    const key = await seed('postgres', code, { value: raw, ttlMs: 5000 });
    const expiry = await pgExpiry(key);
    const locked = deferred();
    const release = deferred();
    let blockerPid = 0;
    const holding = pool.begin(async (tx) => {
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      blockerPid = await verifyPgConnection(query);
      await query`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const applicationName = `deadline-ttl-${randomUUID()}`;
    const attempt = runWorker(action, 'postgres', { TEST_CODE: code, TEST_STATE: state, PGAPPNAME: applicationName });
    try {
      expectAtomicQuery(await waitForPgLock(applicationName, blockerPid), action);
      const [before] = await sql`SELECT expires_at > clock_timestamp() AS live FROM kv_store WHERE key = ${key}`;
      expect(before.live).toBe(true);
      await waitForPgExpiryWhileBlocked({ key, applicationName, blockerPid, action });
    } finally {
      release.resolve();
      await holding;
    }
    expect(await attempt).toBe(action === 'authorize' ? false : null);
    const rows = await sql`SELECT value, expires_at::text AS expiry, expires_at <= clock_timestamp() AS expired
      FROM kv_store WHERE key = ${key}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: raw, expiry, expired: true });
  });

  it.each([
    'authorize',
    'consume'
  ] as const)('rejects %s when Redis storage expires during a write pause', async (action) => {
    const code = randomUUID();
    const state = `state-${randomUUID()}`;
    const raw = JSON.stringify({
      state,
      status: action === 'authorize' ? 'pending' : 'authorized',
      userId: 'review-user',
      createdAt: Date.now(),
      expiryClock: 'store'
    });
    const key = await seed('redis', code, { value: raw, ttlMs: 5000 });
    const monitor = await redis.monitor();
    const seen = new Promise<void>((resolve) => {
      monitor.on('monitor', (_time, args: string[]) => {
        if (args[0]?.toLowerCase() === 'get' && args[1] === key) resolve();
      });
    });
    const atomic = new Promise<void>((resolve) => {
      monitor.on('monitor', (_time, args: string[]) => {
        if (args[0]?.toLowerCase() === 'eval' && args[3] === key) resolve();
      });
    });
    try {
      await redis.call('CLIENT', 'PAUSE', 6500, 'WRITE');
      const attempt = runWorker(action, 'redis', { TEST_CODE: code, TEST_STATE: state });
      await Promise.race([
        seen,
        delay(2000).then(() => {
          throw new Error('Redis GET was not observed');
        })
      ]);
      expect(await redis.pttl(key)).toBeGreaterThan(0);
      expect(await attempt).toBe(action === 'authorize' ? false : null);
      await Promise.race([
        atomic,
        delay(2000).then(() => {
          throw new Error('Redis atomic EVAL was not observed');
        })
      ]);
      expect(await stored('redis', key)).toBeNull();
    } finally {
      monitor.disconnect();
      await redis.call('CLIENT', 'UNPAUSE');
    }
  });

  it('starts a PostgreSQL rate window after a conflicting first insert rolls back', async () => {
    const key = `deadline-rate:${randomUUID()}`;
    const locked = deferred();
    const release = deferred();
    let blockerPid = 0;
    const holding = pool
      .begin(async (tx) => {
        const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
        blockerPid = await verifyPgConnection(query);
        await query`INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, '1', clock_timestamp() + make_interval(secs => 10))`;
        locked.resolve();
        await release.promise;
        throw new Error('intentional test rollback');
      })
      .catch((error: Error) => {
        if (error.message !== 'intentional test rollback') throw error;
      });
    await locked.promise;
    const applicationName = `deadline-rate-${randomUUID()}`;
    const first = runWorker('rate', 'postgres', { TEST_KEY: key, TEST_TTL: '2000', PGAPPNAME: applicationName });
    try {
      await waitForPgLock(applicationName, blockerPid);
      await delay(2300);
    } finally {
      release.resolve();
      await holding;
    }
    expect(await first).toBe(1);
    expect(await runWorker('rate', 'postgres', { TEST_KEY: key, TEST_TTL: '2000' })).toBe(2);
  });

  it('starts a PostgreSQL rate window after waiting on an expired existing counter', async () => {
    const key = `deadline-rate:${randomUUID()}`;
    await sql`INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, '9', clock_timestamp() - make_interval(secs => 1))`;
    const locked = deferred();
    const release = deferred();
    let blockerPid = 0;
    const holding = pool.begin(async (tx) => {
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      blockerPid = await verifyPgConnection(query);
      await query`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const applicationName = `deadline-rate-${randomUUID()}`;
    const first = runWorker('rate', 'postgres', { TEST_KEY: key, TEST_TTL: '2000', PGAPPNAME: applicationName });
    try {
      await waitForPgLock(applicationName, blockerPid);
      await delay(2300);
    } finally {
      release.resolve();
      await holding;
    }
    expect(await first).toBe(1);
    expect(await runWorker('rate', 'postgres', { TEST_KEY: key, TEST_TTL: '2000' })).toBe(2);
  });

  it('does not lose concurrent PostgreSQL increments or extend their fixed window', async () => {
    const key = `deadline-rate:${randomUUID()}`;
    const values = await runWorker('rate-many', 'postgres', { TEST_KEY: key });
    expect(values.sort((a: number, b: number) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    const expiry = await pgExpiry(key);
    expect(await runWorker('rate', 'postgres', { TEST_KEY: key, TEST_TTL: '60000' })).toBe(33);
    expect(await pgExpiry(key)).toBe(expiry);
  });

  it('does not block PostgreSQL rate windows for an unrelated key', async () => {
    const blockedKey = `deadline-rate:${randomUUID()}`;
    const freeKey = `deadline-rate:${randomUUID()}`;
    await sql`INSERT INTO kv_store (key, value, expires_at) VALUES (${blockedKey}, '1', clock_timestamp() + make_interval(secs => 60))`;
    const locked = deferred();
    const release = deferred();
    let blockerPid = 0;
    const holding = pool.begin(async (tx) => {
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      blockerPid = await verifyPgConnection(query);
      await query`SELECT key FROM kv_store WHERE key = ${blockedKey} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const applicationName = `deadline-rate-${randomUUID()}`;
    const blocked = runWorker('rate', 'postgres', {
      TEST_KEY: blockedKey,
      TEST_TTL: '60000',
      PGAPPNAME: applicationName
    });
    try {
      await waitForPgLock(applicationName, blockerPid);
      await expect(waitForPgLock(`unrelated-${randomUUID()}`, blockerPid, 200)).rejects.toThrow();
      await expect(waitForPgLock(applicationName, adminPid, 200)).rejects.toThrow();
      expect(await runWorker('rate', 'postgres', { TEST_KEY: freeKey, TEST_TTL: '60000' })).toBe(1);
    } finally {
      release.resolve();
      await holding;
    }
    expect(await blocked).toBe(2);
  });
});
