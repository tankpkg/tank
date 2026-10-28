import { type ChildProcess, execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createConnection, createServer, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import postgres from 'postgres';

const exec = promisify(execFile);
const ownedDatabases = new WeakSet<OwnedTestDatabase>();
const dockerEnvironments = new WeakSet<NodeJS.ProcessEnv>();
const dockerTargets = new Map<string, NodeJS.ProcessEnv>();
const emptyDockerConfig = path.join(os.tmpdir(), `tank-test-docker-config-${randomUUID()}`);

export interface OwnedTestDatabase {
  readonly url: string;
  readonly containerId: string;
  close(): Promise<void>;
}

/** Reject connection-string overrides before opening an isolated test database. */
export function validateTestDatabaseUrl(connectionString: string): string {
  const match =
    /^(?:postgres|postgresql):\/\/([a-zA-Z0-9._~-]+):([a-zA-Z0-9._~-]+)@(localhost|127\.0\.0\.1):([0-9]{1,5})\/([a-zA-Z0-9_.-]+_test)$/i.exec(
      connectionString
    );
  const port = Number(match?.[4]);
  if (!match || match[0] !== connectionString || port < 1 || port > 65_535) {
    throw new Error('An isolated local test database URL with explicit credentials and no overrides is required');
  }
  return match[5];
}

/** Construct a client while postgres.js cannot read ambient PG connection options. */
export function withoutAmbientPostgres<T>(operation: () => T, applicationName?: string): T {
  const previous = Object.entries(process.env).filter(([name]) => /^PG[A-Z_]/.test(name));
  for (const [name] of previous) delete process.env[name];
  if (applicationName) process.env.PGAPPNAME = applicationName;
  try {
    return operation();
  } finally {
    for (const name of Object.keys(process.env)) {
      if (/^PG[A-Z_]/.test(name)) delete process.env[name];
    }
    for (const [name, value] of previous) process.env[name] = value;
  }
}

export function isolatedBunArguments(args: string[]): string[] {
  return ['--no-env-file', '--no-install', `--config=${os.devNull}`, ...args];
}

export function isolatedSchemaEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: os.tmpdir(),
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DOTENV_CONFIG_PATH: os.devNull
  };
}

function macAccountHome(): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Cannot determine the current account UID');
  const result = execFileSync('/usr/bin/dscacheutil', ['-q', 'user', '-a', 'uid', String(uid)], {
    env: { PATH: '/usr/bin:/bin' },
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 64_000
  });
  const uids = [...result.matchAll(/^uid:\s*(\d+)\s*$/gm)];
  const homes = [...result.matchAll(/^dir:\s*(.+)$/gm)];
  const home = homes[0]?.[1].trim();
  if (uids.length !== 1 || Number(uids[0][1]) !== uid || homes.length !== 1 || !home || !path.isAbsolute(home)) {
    throw new Error('Cannot determine the current account home directory');
  }
  return home;
}

/** The socket path cannot attest its daemon; operators must trust the daemon behind it. */
export function testDockerEnvironment(): NodeJS.ProcessEnv {
  const socket =
    process.platform === 'darwin'
      ? path.join(macAccountHome(), '.colima/default/docker.sock')
      : process.platform === 'linux'
        ? '/var/run/docker.sock'
        : undefined;
  if (!socket) throw new Error('Test Docker requires a trusted default Docker socket on macOS or Linux');
  let resolved: string;
  try {
    resolved = path.join(fs.realpathSync(path.dirname(socket)), path.basename(socket));
    if (!fs.lstatSync(resolved).isSocket()) throw new Error('not a socket');
  } catch {
    throw new Error(`Trusted default Docker socket is unavailable or not a Unix socket: ${socket}`);
  }
  const configured = process.env.DOCKER_HOST;
  if (configured !== undefined) {
    if (!configured.startsWith('unix:///') || /[%?#\\\r\n]/.test(configured)) {
      throw new Error('Test Docker requires a local Unix socket matching the trusted default Docker socket');
    }
    const configuredSocket = path.normalize(configured.slice('unix://'.length));
    if (configuredSocket !== path.normalize(socket) && configuredSocket !== resolved) {
      throw new Error(
        'Test Docker requires the trusted default Docker socket; the path differs or is not a Unix socket'
      );
    }
  }
  const env = Object.freeze({
    PATH: process.env.PATH,
    DOCKER_HOST: `unix://${resolved}`,
    DOCKER_CONFIG: emptyDockerConfig
  });
  dockerEnvironments.add(env);
  return env;
}

export async function runTestDocker(
  args: string[],
  timeout = 5_000,
  env: NodeJS.ProcessEnv = testDockerEnvironment()
): Promise<string> {
  if (!dockerEnvironments.has(env)) throw new Error('Unverified test Docker environment');
  const result = await exec('docker', args, { env, timeout });
  return (args[0] === 'logs' ? `${result.stdout}\n${result.stderr}` : result.stdout).trim();
}

const inspectionFaultBrand = Symbol('owned Docker inspection fault');

export interface OwnedDockerInspectionFault {
  readonly [inspectionFaultBrand]: true;
}

interface InspectionFaultState {
  armed: boolean;
  rejected: number;
}

const inspectionFaults = new WeakMap<OwnedDockerInspectionFault, InspectionFaultState>();

function inspectionFaultState(fault: OwnedDockerInspectionFault): InspectionFaultState {
  const state = inspectionFaults.get(fault);
  if (!state) throw new Error('A live owned Docker inspection fault is required');
  return state;
}

export function rejectNextOwnedDockerInspection(fault: OwnedDockerInspectionFault): void {
  const state = inspectionFaultState(fault);
  if (state.armed) throw new Error('The owned Docker inspection fault is already armed');
  state.armed = true;
}

export function rejectedOwnedDockerInspections(fault: OwnedDockerInspectionFault): number {
  return inspectionFaultState(fault).rejected;
}

async function createOwnedInspectionProxy(trusted: NodeJS.ProcessEnv) {
  const host = trusted.DOCKER_HOST;
  if (!dockerEnvironments.has(trusted) || !host?.startsWith('unix:///')) {
    throw new Error('A trusted Docker environment is required');
  }
  const apiVersion = await runTestDocker(['version', '--format', '{{.Server.APIVersion}}'], 5_000, trusted);
  if (!/^\d+\.\d+$/.test(apiVersion)) throw new Error('Unexpected Docker API version');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'td-'));
  const socketPath = path.join(sandbox, 'docker.sock');
  const sockets = new Set<Socket>();
  const state: InspectionFaultState = { armed: false, rejected: 0 };
  const fault: OwnedDockerInspectionFault = Object.freeze({ [inspectionFaultBrand]: true as const });
  const server = createServer((client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    let upstream: Socket | undefined;
    let buffer = Buffer.alloc(0);
    client.on('error', () => upstream?.destroy());
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 64_000) return client.destroy();
      if (buffer.indexOf('\r\n\r\n') < 0) return;
      client.removeListener('data', onData);
      client.pause();
      const request = buffer.toString('utf8', 0, buffer.indexOf('\r\n'));
      if (state.armed && /^(?:HEAD|GET)\s+\/_ping(?:\?[^ ]*)?\s+HTTP\//.test(request)) {
        const body = request.startsWith('GET ') ? 'OK' : '';
        client.end(
          `HTTP/1.1 200 OK\r\nApi-Version: ${apiVersion}\r\nOstype: linux\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`
        );
        return;
      }
      if (state.armed && /^GET\s+\S*\/containers\/[^/]+\/json(?:\?[^ ]*)?\s+HTTP\//.test(request)) {
        state.armed = false;
        state.rejected++;
        client.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        return;
      }
      const target = createConnection(host.slice('unix://'.length));
      upstream = target;
      sockets.add(target);
      target.once('close', () => sockets.delete(target));
      target.on('error', () => client.destroy());
      target.write(buffer);
      client.pipe(target).pipe(client);
      client.resume();
    };
    client.on('data', onData);
  });
  try {
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(socketPath, resolve));
  } catch (error) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    throw error;
  }
  const env = Object.freeze({ ...trusted, DOCKER_HOST: `unix://${socketPath}` });
  dockerEnvironments.add(env);
  inspectionFaults.set(fault, state);
  return {
    env,
    fault,
    async close() {
      inspectionFaults.delete(fault);
      dockerEnvironments.delete(env);
      try {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
    }
  };
}

/** A private fault proxy can only reach the already trusted daemon and owns its database. */
export async function withOwnedDockerInspectionFault<T>(
  operation: (database: OwnedTestDatabase, fault: OwnedDockerInspectionFault) => Promise<T>
): Promise<T> {
  const trusted = testDockerEnvironment();
  const proxy = await createOwnedInspectionProxy(trusted);
  try {
    const database = await createOwnedTestDatabaseInEnvironment(false, undefined, proxy.env);
    try {
      return await operation(database, proxy.fault);
    } finally {
      // Cleanup uses the pinned trusted daemon even if the test left its fault armed.
      if (dockerTargets.get(database.containerId) === proxy.env) dockerTargets.set(database.containerId, trusted);
      await database.close();
    }
  } finally {
    await proxy.close();
  }
}

/** Remember the daemon selected before creation, including for interrupted creation. */
export function rememberTestContainer(name: string, id: string, env: NodeJS.ProcessEnv): void {
  if (!dockerEnvironments.has(env)) throw new Error('Unverified test Docker environment');
  dockerTargets.set(name, env);
  if (id) dockerTargets.set(id, env);
}

export async function verifyOwnedTestContainer(id: string, nonce: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid owned test container ID');
  const result = await runTestDocker(
    ['inspect', '--format', '{{.Id}} {{index .Config.Labels "tank.auth.owner"}} {{.HostConfig.NetworkMode}}', id],
    5_000,
    env
  );
  if (result !== `${id} ${nonce} none`) throw new Error('Test container ownership or network isolation mismatch');
}

/** Remove only the exact container with this run's unpredictable ownership label. */
export async function stopOwnedTestContainer(containerId: string, name: string, nonce: string): Promise<void> {
  const env = dockerTargets.get(containerId) ?? dockerTargets.get(name);
  if (!env) throw new Error('No owned Docker target for test container');
  let removed = false;
  try {
    const result = await runTestDocker(
      [
        'inspect',
        '--format',
        '{{.Id}} {{index .Config.Labels "tank.auth.owner"}} {{.HostConfig.NetworkMode}}',
        containerId || name
      ],
      5_000,
      env
    );
    const [id, owner, network] = result.split(' ');
    if (owner !== nonce || network !== 'none' || !/^[a-f0-9]{64}$/.test(id) || (containerId && id !== containerId)) {
      throw new Error('Container ownership mismatch');
    }
    await runTestDocker(['rm', '-f', '-v', id], 30_000, env);
    removed = true;
  } catch (error) {
    if (!(error instanceof Error) || !/No such (object|container)/i.test(error.message)) throw error;
    removed = true;
  } finally {
    if (removed) {
      dockerTargets.delete(name);
      if (containerId) dockerTargets.delete(containerId);
    }
  }
}

export interface OwnedTestBridge {
  readonly port: number;
  close(): Promise<void>;
}

/** Reserve the port until close and forward only to the exact network-disabled container. */
export async function createOwnedTestBridge(
  containerId: string,
  nonce: string,
  targetPort: number,
  env: NodeJS.ProcessEnv
): Promise<OwnedTestBridge> {
  await verifyOwnedTestContainer(containerId, nonce, env);
  const sockets = new Set<Socket>();
  const children = new Set<ChildProcess>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const child = spawn('docker', ['exec', '-i', containerId, 'nc', '127.0.0.1', String(targetPort)], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    children.add(child);
    child.stderr.resume();
    child.once('error', () => socket.destroy());
    child.once('close', () => {
      children.delete(child);
      socket.destroy();
    });
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
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind owned test bridge');
  return {
    port: address.port,
    async close() {
      const exits = [...children].map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve();
            child.once('close', () => resolve());
          })
      );
      for (const socket of sockets) socket.destroy();
      for (const child of children) child.kill('SIGTERM');
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all(exits),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              for (const child of children) child.kill('SIGKILL');
              reject(new Error('Owned Docker bridge processes did not exit'));
            }, 5_000);
          })
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  };
}

/** Check only the database name; this alone does not establish server ownership. */
export async function verifyTestDatabase(sql: postgres.Sql, expectedDatabase: string): Promise<void> {
  const timeout = setTimeout(() => {
    void sql.end({ timeout: 0 }).catch(() => undefined);
  }, 10_000);
  try {
    const rows = await sql<{ database: string }[]>`SELECT current_database() AS database`;
    if (rows[0]?.database !== expectedDatabase) {
      throw new Error(`Connected database does not match the isolated test database ${expectedDatabase}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function assertOwnedTestDatabase(database: OwnedTestDatabase, url = database.url): void {
  if (!ownedDatabases.has(database) || url !== database.url) {
    throw new Error('A live, owned test PostgreSQL container is required');
  }
  validateTestDatabaseUrl(url);
}

export async function assertOwnedTestDatabaseAlive(database: OwnedTestDatabase): Promise<void> {
  assertOwnedTestDatabase(database);
  const env = dockerTargets.get(database.containerId);
  if (
    !env ||
    (await runTestDocker(['inspect', '--format', '{{.State.Running}}', database.containerId], 5_000, env)) !== 'true'
  ) {
    throw new Error('Owned test PostgreSQL container is not running');
  }
}

/** Create a private database with per-run credentials; never write to a supplied URL. */
export async function createOwnedTestDatabase(
  withSchema = false,
  sameCredentialsAs?: OwnedTestDatabase
): Promise<OwnedTestDatabase> {
  return createOwnedTestDatabaseInEnvironment(withSchema, sameCredentialsAs, testDockerEnvironment());
}

async function createOwnedTestDatabaseInEnvironment(
  withSchema: boolean,
  sameCredentialsAs: OwnedTestDatabase | undefined,
  env: NodeJS.ProcessEnv
): Promise<OwnedTestDatabase> {
  if (!dockerEnvironments.has(env)) throw new Error('Unverified test Docker environment');
  const nonce = randomUUID().replaceAll('-', '');
  const name = `tank-auth-pg-${nonce}`;
  if (sameCredentialsAs) assertOwnedTestDatabase(sameCredentialsAs);
  const template = sameCredentialsAs ? new URL(sameCredentialsAs.url) : undefined;
  const databaseName = template?.pathname.slice(1) ?? `auth_${nonce}_test`;
  const password = template?.password ?? randomUUID().replaceAll('-', '');
  const image = process.env.E2E_AUTH_TEST_POSTGRES_IMAGE ?? 'postgres:17-alpine';
  if (image !== 'postgres:17-alpine') throw new Error('Test PostgreSQL requires the cached postgres:17-alpine image');
  rememberTestContainer(name, '', env);
  let containerId = '';
  let bridge: OwnedTestBridge | undefined;
  try {
    const created = await runTestDocker(
      [
        'create',
        '--rm',
        '--pull=never',
        '--network=none',
        '--name',
        name,
        '--label',
        `tank.auth.owner=${nonce}`,
        '-e',
        'POSTGRES_USER=tank_fixture',
        '-e',
        `POSTGRES_PASSWORD=${password}`,
        '-e',
        `POSTGRES_DB=${databaseName}`,
        image
      ],
      60_000,
      env
    );
    if (!/^[a-f0-9]{64}$/.test(created)) throw new Error('Docker did not return an owned container ID');
    containerId = created;
    rememberTestContainer(name, containerId, env);
    await verifyOwnedTestContainer(containerId, nonce, env);
    await runTestDocker(['start', containerId], 60_000, env);
    bridge = await createOwnedTestBridge(containerId, nonce, 5432, env);
    const url = `postgresql://tank_fixture:${password}@127.0.0.1:${bridge.port}/${databaseName}`;
    validateTestDatabaseUrl(url);
    const deadline = Date.now() + 120_000;
    let lastError: unknown;
    while (true) {
      const sql = withoutAmbientPostgres(() => postgres(url, { max: 1, connect_timeout: 3 }));
      const timeout = setTimeout(() => {
        void sql.end({ timeout: 0 }).catch(() => undefined);
      }, 5_000);
      try {
        await verifyTestDatabase(sql, databaseName);
        const rows = await sql<{ username: string }[]>`SELECT current_user AS username`;
        if (rows[0]?.username !== 'tank_fixture') throw new Error('Unexpected PostgreSQL user');
        break;
      } catch (error) {
        lastError = error;
        if (Date.now() >= deadline) {
          const logs = await runTestDocker(['logs', '--tail', '30', containerId], 5_000, env).catch(
            () => 'unavailable'
          );
          throw new Error(`Owned PostgreSQL did not become ready: ${String(lastError)}; logs: ${logs}`);
        }
      } finally {
        clearTimeout(timeout);
        await sql.end({ timeout: 3 });
      }
      await delay(250);
    }
    if (withSchema) {
      const root = fileURLToPath(new URL('../../', import.meta.url));
      const childEnv = isolatedSchemaEnvironment(url);
      await exec('bun', isolatedBunArguments(['scripts/ensure-pg-trgm.mjs']), {
        cwd: root,
        env: childEnv,
        timeout: 120_000
      });
      await exec('bun', isolatedBunArguments(['node_modules/.bin/drizzle-kit', 'push', '--force']), {
        cwd: path.join(root, 'apps/registry'),
        env: childEnv,
        timeout: 120_000
      });
    }
    const ownedBridge = bridge;
    let containerRemoved = false;
    const database: OwnedTestDatabase = {
      url,
      containerId,
      async close() {
        if (!ownedDatabases.has(database)) return;
        if (!containerRemoved) {
          await stopOwnedTestContainer(containerId, name, nonce);
          containerRemoved = true;
        }
        await ownedBridge.close();
        ownedDatabases.delete(database);
      }
    };
    ownedDatabases.add(database);
    return Object.freeze(database);
  } catch (error) {
    try {
      await stopOwnedTestContainer(containerId, name, nonce);
    } finally {
      if (bridge) await bridge.close();
    }
    throw error;
  }
}
