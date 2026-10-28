import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, realpath, rm, rmdir, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir, userInfo } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const registryDir = fileURLToPath(new URL('../../../../', import.meta.url));
const ownerLabel = 'dev.tank.pr492.owner';
const watchdogSeconds = 600;
const forbiddenEnvironment = [
  'PR492_TEST_POSTGRES_URL',
  'PR492_TEST_REDIS_URL',
  'PR492_TEST_REDIS_REPLICA_URL',
  'PR492_TEST_REPLICA',
  'DATABASE_URL',
  'POSTGRES_URL',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'SOCKS_PROXY',
  'socks_proxy',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'CONTAINER_HOST',
  'NODE_OPTIONS',
  'BUN_OPTIONS',
  'LD_PRELOAD',
  'DYLD_INSERT_LIBRARIES'
] as const;

export function assertSafeTestEnvironment(environment: NodeJS.ProcessEnv): void {
  const forbidden = forbiddenEnvironment.filter((name) => environment[name]);
  if (forbidden.length)
    throw new Error(`External test targets or proxy/runtime overrides are forbidden: ${forbidden.join(', ')}`);
}

export function assertPinnedEndpoint(value: string, protocol: 'postgresql:' | 'redis:', port: number): void {
  const url = new URL(value);
  if (
    url.protocol !== protocol ||
    url.hostname !== '127.0.0.1' ||
    url.port !== String(port) ||
    !url.password ||
    (protocol === 'postgresql:' && (url.username !== 'review' || url.pathname !== '/review')) ||
    (protocol === 'redis:' && (url.username !== '' || (url.pathname !== '' && url.pathname !== '/'))) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Endpoint is not the pinned owned loopback listener');
  }
}

interface NetworkInfo {
  Id: string;
  Name: string;
  Driver: string;
  Internal: boolean;
  Labels: Record<string, string> | null;
}

interface ContainerInfo {
  Id: string;
  Name: string;
  State: { Running: boolean; Status: string; ExitCode: number };
  Config: { Labels: Record<string, string> | null };
  HostConfig: { Privileged: boolean; NetworkMode: string };
  NetworkSettings: {
    Networks: Record<string, { NetworkID: string }>;
    Ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
  };
}

interface OwnedContext {
  token: string;
  network: string;
  names: string[];
  directory: string;
  config: string;
  lease: string;
  docker: string;
  socket: string;
  bun: string;
  environment: NodeJS.ProcessEnv;
}

export interface OwnedServices {
  readonly ownedDirectory: string;
  runBun(script: string, timeout?: number): Promise<{ stdout: string; stderr: string }>;
  runNode(script: string, timeout?: number): Promise<{ stdout: string; stderr: string }>;
  runLinuxNode(script: string, timeout?: number): Promise<{ stdout: string; stderr: string }>;
  close(): Promise<void>;
}

async function executable(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Try the next fixed local installation path.
    }
  }
  throw new Error(`Required local executable not found: ${candidates.map((path) => basename(path)).join(', ')}`);
}

async function accountHome(): Promise<string> {
  if (process.platform !== 'darwin') return userInfo().homedir;
  const { stdout } = await exec('/usr/bin/id', ['-P'], { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
  const fields = stdout.trim().split(':');
  const home = fields.at(-2);
  if (fields.length < 10 || Number(fields[2]) !== process.getuid?.() || !home?.startsWith('/')) {
    throw new Error('Could not identify the local account home');
  }
  return realpath(home);
}

async function localBun(): Promise<string> {
  const home = await accountHome();
  return executable([
    ...(basename(process.execPath) === 'bun' ? [process.execPath] : []),
    join(home, '.bun/bin/bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
    '/usr/bin/bun'
  ]);
}

async function localNode(): Promise<string> {
  const paths = (process.env.PATH ?? '').split(':').filter((entry) => entry.startsWith('/'));
  const node = await executable(paths.map((entry) => join(entry, 'node')));
  const { stdout } = await exec(node, ['--version'], { env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
  const major = Number(/^v(\d+)/.exec(stdout)?.[1]);
  if (!Number.isInteger(major) || major < 24) throw new Error('Node 24 or later is required for the owned test');
  return node;
}

async function localDockerSocket(): Promise<string> {
  const socket =
    process.platform === 'darwin' ? join(await accountHome(), '.colima/default/docker.sock') : '/var/run/docker.sock';
  if (!(await stat(socket)).isSocket()) throw new Error('The pinned local Docker socket is not a Unix socket');
  return socket;
}

function dockerArgs(context: OwnedContext, args: string[]): string[] {
  return ['--config', context.config, '--host', `unix://${context.socket}`, ...args];
}

async function docker(context: OwnedContext, args: string[], timeout = 30_000): Promise<string> {
  const result = await exec(context.docker, dockerArgs(context, args), {
    cwd: context.directory,
    env: context.environment,
    timeout,
    maxBuffer: 1024 * 1024
  });
  return result.stdout.trim();
}

async function inspect<T>(context: OwnedContext, kind: 'container' | 'network', name: string): Promise<T | null> {
  try {
    const raw = await docker(context, [kind, 'inspect', name]);
    const items = JSON.parse(raw) as T[];
    if (items.length !== 1) throw new Error(`Unexpected Docker ${kind} inspection result`);
    return items[0];
  } catch (error) {
    const message = String(error);
    if (/no such (container|network|object)|not found/i.test(message)) return null;
    throw error;
  }
}

function verifyNetwork(context: OwnedContext, network: NetworkInfo): void {
  if (
    !/^[a-f0-9]{64}$/.test(network.Id) ||
    network.Name !== context.network ||
    network.Labels?.[ownerLabel] !== context.token ||
    network.Driver !== 'bridge' ||
    !network.Internal
  ) {
    throw new Error('Docker network ownership or isolation verification failed');
  }
}

function verifyContainer(context: OwnedContext, container: ContainerInfo, name: string, networkId: string): void {
  const networks = Object.values(container.NetworkSettings.Networks);
  const published = Object.values(container.NetworkSettings.Ports).some((bindings) => bindings?.length);
  if (
    !/^[a-f0-9]{64}$/.test(container.Id) ||
    container.Name !== `/${name}` ||
    container.Config.Labels?.[ownerLabel] !== context.token ||
    container.HostConfig.Privileged ||
    published ||
    networks.length !== 1 ||
    networks[0].NetworkID !== networkId
  ) {
    throw new Error('Docker container ownership or network verification failed');
  }
}

interface OwnedRelay {
  port: number;
  close(): Promise<void>;
}

async function startRelay(context: OwnedContext, containerId: string, port: 5432 | 6379): Promise<OwnedRelay> {
  const sockets = new Set<Socket>();
  const children = new Set<ChildProcess>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const child = spawn(
      context.docker,
      dockerArgs(context, ['exec', '-i', containerId, 'nc', '127.0.0.1', String(port)]),
      {
        cwd: context.directory,
        env: context.environment,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    children.add(child);
    child.stderr?.resume();
    child.once('error', () => {
      children.delete(child);
      socket.destroy();
    });
    child.once('exit', () => {
      children.delete(child);
      socket.destroy();
    });
    if (!child.stdin || !child.stdout) {
      child.kill('SIGTERM');
      socket.destroy();
      return;
    }
    socket.once('error', () => child.kill('SIGTERM'));
    socket.once('close', () => {
      sockets.delete(socket);
      child.kill('SIGTERM');
    });
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    server.close();
    throw new Error('Owned relay is not pinned to loopback');
  }
  return {
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy();
      const active = [...children];
      const exits = active.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve();
            child.once('close', () => resolve());
          })
      );
      for (const child of active) child.kill('SIGTERM');
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      const timer = setTimeout(() => {
        for (const child of active) {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
      }, 5_000);
      await Promise.all(exits);
      clearTimeout(timer);
    }
  };
}

async function removeOwned(context: OwnedContext): Promise<void> {
  const network = await inspect<NetworkInfo>(context, 'network', context.network);
  if (network) verifyNetwork(context, network);
  for (const name of [...context.names].reverse()) {
    const container = await inspect<ContainerInfo>(context, 'container', name);
    if (!container) continue;
    if (!network) throw new Error('Owned network disappeared before its container');
    verifyContainer(context, container, name, network.Id);
    await docker(context, ['rm', '-f', container.Id]);
    if (await inspect<ContainerInfo>(context, 'container', container.Id))
      throw new Error('Owned container was not removed');
  }
  if (network) {
    await docker(context, ['network', 'rm', network.Id]);
    if (await inspect<NetworkInfo>(context, 'network', network.Id)) throw new Error('Owned network was not removed');
  }
}

// A detached guard retries exact-name, label-verified cleanup if the test worker
// dies. Each container also has an internal hard lifetime in case the guard dies.
async function startReaper(context: OwnedContext): Promise<ChildProcess> {
  const settings = JSON.stringify({
    parent: process.pid,
    deadline: Date.now() + watchdogSeconds * 1000,
    docker: context.docker,
    config: context.config,
    lease: context.lease,
    socket: context.socket,
    token: context.token,
    label: ownerLabel,
    network: context.network,
    names: context.names,
    directory: context.directory
  });
  const script = `
    const { execFileSync } = require('node:child_process');
    const { rmdirSync, statSync, unlinkSync } = require('node:fs');
    const s = ${settings};
    const command = (args) => execFileSync(s.docker, ['--config', s.config, '--host', 'unix://' + s.socket, ...args], {encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe']});
    function alive() {
      try { process.kill(s.parent, 0); } catch (error) { if (error.code === 'ESRCH') return false; }
      try { return Date.now() - statSync(s.lease).mtimeMs < 60000; } catch (error) { return error.code !== 'ENOENT'; }
    }
    function inspect(kind, name) {
      try { return JSON.parse(command([kind, 'inspect', name]))[0]; }
      catch (error) {
        if (/no such (container|network|object)|not found/i.test(String(error.stderr))) return null;
        throw error;
      }
    }
    function cleanup() {
      const n = inspect('network', s.network);
      if (n && (n.Name !== s.network || n.Labels?.[s.label] !== s.token || !n.Internal || n.Driver !== 'bridge' || !/^[a-f0-9]{64}$/.test(n.Id))) throw Error('network ownership mismatch');
      for (const name of [...s.names].reverse()) {
        const c = inspect('container', name);
        if (!c) continue;
        if (!n || c.Name !== '/' + name || c.Config.Labels?.[s.label] !== s.token || !/^[a-f0-9]{64}$/.test(c.Id) || Object.values(c.NetworkSettings.Networks).length !== 1 || Object.values(c.NetworkSettings.Networks)[0].NetworkID !== n.Id) throw Error('container ownership mismatch');
        command(['rm', '-f', c.Id]);
      }
      if (n) command(['network', 'rm', n.Id]);
      return !inspect('network', s.network) && s.names.every((name) => !inspect('container', name));
    }
    let passes = 0;
    let emptyPasses = 0;
    const timer = setInterval(() => {
      if (alive() && Date.now() < s.deadline) return;
      try { emptyPasses = cleanup() ? emptyPasses + 1 : 0; }
      catch (error) { emptyPasses = 0; process.stderr.write('reaper cleanup: ' + String(error) + '\\n'); }
      if (emptyPasses >= 5) {
        clearInterval(timer);
        try { unlinkSync(s.lease); rmdirSync(s.config); rmdirSync(s.directory); }
        catch (error) { process.stderr.write('reaper directory cleanup: ' + String(error) + '\\n'); process.exit(1); }
        process.exit(0);
      }
      if (++passes >= 30) { clearInterval(timer); process.exit(1); }
    }, 1000);
    process.stdout.write('ready\\n');
  `;
  const child = spawn(context.bun, ['--no-env-file', '--no-install', '-e', script], {
    cwd: context.directory,
    env: context.environment,
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned-resource reaper did not start')), 10_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Owned-resource reaper exited early'));
      });
      child.stdout?.once('data', (data: Buffer) => {
        clearTimeout(timer);
        if (data.toString().trim() !== 'ready') return reject(new Error('Invalid owned-resource reaper handshake'));
        child.stdout?.destroy();
        child.unref();
        resolve();
      });
    });
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
  return child;
}

async function waitFor(context: OwnedContext, containerId: string, command: string[], expected: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const output = await docker(context, ['exec', containerId, ...command], 10_000);
      if (output.includes(expected)) return;
      lastError = new Error(`Unexpected readiness output: ${output}`);
    } catch (error) {
      lastError = error;
    }
    const container = await inspect<ContainerInfo>(context, 'container', containerId);
    if (!container || !container.State.Running) {
      throw new Error(
        `Owned service exited before readiness: ${container?.State.Status ?? 'removed'} (${String(lastError)})`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Owned service did not become ready: ${String(lastError)}`);
}

export async function startOwnedServices(
  kind: 'postgres' | 'redis',
  additionalEnvironment: NodeJS.ProcessEnv = {}
): Promise<OwnedServices> {
  // Both checks happen before filesystem setup, Docker, or any socket connection.
  assertSafeTestEnvironment(process.env);
  assertSafeTestEnvironment(additionalEnvironment);
  if (process.env.PR492_ISOLATED_CONFIG !== '1' || process.env.BUN_CONFIG_NO_DOTENV !== '1') {
    throw new Error('Run these tests using the dedicated dotenv-free Vitest configuration');
  }
  const dockerExecutable = await executable(['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker']);
  const socket = await localDockerSocket();
  const bun = await localBun();
  const directory = await mkdtemp(join(tmpdir(), 'tank-pr492-owned-'));
  const config = join(directory, 'docker-config');
  try {
    await mkdir(config, { mode: 0o700 });
  } catch (error) {
    await rmdir(directory);
    throw error;
  }
  const token = randomBytes(24).toString('hex');
  const context: OwnedContext = {
    token,
    network: `pr492-net-${token}`,
    names: [`pr492-pg-${token}`, `pr492-redis-${token}`, `pr492-replica-${token}`, `pr492-node-${token}`],
    directory,
    config,
    lease: join(directory, 'lease'),
    docker: dockerExecutable,
    socket,
    bun,
    environment: {
      HOME: directory,
      TMPDIR: directory,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
      BUN_CONFIG_NO_DOTENV: '1',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      DO_NOT_TRACK: '1'
    }
  };
  let reaper: ChildProcess | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatError: unknown;
  let network: NetworkInfo | null = null;
  const relays: OwnedRelay[] = [];
  try {
    await writeFile(context.lease, token, { mode: 0o600, flag: 'wx' });
    reaper = await startReaper(context);
    heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(context.lease, now, now).catch((error) => {
        heartbeatError = error;
      });
    }, 5_000);
    heartbeat.unref();
    const networkId = await docker(context, [
      'network',
      'create',
      '--driver',
      'bridge',
      '--internal',
      '--label',
      `${ownerLabel}=${token}`,
      context.network
    ]);
    network = await inspect<NetworkInfo>(context, 'network', networkId);
    if (!network) throw new Error('Owned Docker network was not created');
    verifyNetwork(context, network);
    const tag = kind === 'postgres' ? 'postgres:17-alpine' : 'redis:7-alpine';
    const image = await docker(context, ['image', 'inspect', '--format', '{{.Id}}', tag]);
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Expected a locally pinned image ID');
    const password = randomBytes(24).toString('hex');
    const name = kind === 'postgres' ? context.names[0] : context.names[1];
    const common = [
      'run',
      '--detach',
      '--rm',
      '--pull=never',
      '--name',
      name,
      '--label',
      `${ownerLabel}=${token}`,
      '--network',
      network.Id,
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      '384m',
      '--entrypoint',
      '/bin/sh'
    ];
    const watchdog = `(sleep ${watchdogSeconds}; kill -TERM 1) & exec "$@"`;
    const args =
      kind === 'postgres'
        ? [
            ...common,
            '--tmpfs',
            '/var/lib/postgresql/data:rw,nosuid,size=128m',
            '-e',
            'POSTGRES_USER=review',
            '-e',
            `POSTGRES_PASSWORD=${password}`,
            '-e',
            'POSTGRES_DB=review',
            image,
            '-c',
            watchdog,
            'sh',
            'docker-entrypoint.sh',
            'postgres'
          ]
        : [
            ...common,
            '--network-alias',
            'pr492-primary',
            '--tmpfs',
            '/data:rw,nosuid,size=32m',
            image,
            '-c',
            watchdog,
            'sh',
            'redis-server',
            '--bind',
            '0.0.0.0',
            '--protected-mode',
            'no',
            '--save',
            '',
            '--appendonly',
            'no',
            '--requirepass',
            password
          ];
    const id = await docker(context, args);
    const container = await inspect<ContainerInfo>(context, 'container', id);
    if (!container) throw new Error('Owned Docker container was not created');
    verifyContainer(context, container, name, network.Id);
    let hostPort: number;
    let databaseUrl = '';
    let redisUrl = '';
    let replicaUrl = '';
    let replicaPort = 0;
    if (kind === 'postgres') {
      // The image briefly starts a socket-only bootstrap server before the real TCP server.
      await waitFor(
        context,
        id,
        ['pg_isready', '-h', '127.0.0.1', '-U', 'review', '-d', 'review'],
        'accepting connections'
      );
      const ready = await inspect<ContainerInfo>(context, 'container', id);
      if (!ready) throw new Error('Owned PostgreSQL disappeared after readiness');
      verifyContainer(context, ready, name, network.Id);
      const relay = await startRelay(context, id, 5432);
      relays.push(relay);
      hostPort = relay.port;
      databaseUrl = `postgresql://review:${password}@127.0.0.1:${hostPort}/review`;
      assertPinnedEndpoint(databaseUrl, 'postgresql:', hostPort);
    } else {
      await waitFor(context, id, ['redis-cli', '--no-auth-warning', '-a', password, 'PING'], 'PONG');
      const ready = await inspect<ContainerInfo>(context, 'container', id);
      if (!ready) throw new Error('Owned Redis disappeared after readiness');
      verifyContainer(context, ready, name, network.Id);
      const relay = await startRelay(context, id, 6379);
      relays.push(relay);
      hostPort = relay.port;
      redisUrl = `redis://:${password}@127.0.0.1:${hostPort}`;
      assertPinnedEndpoint(redisUrl, 'redis:', hostPort);
      const replicaName = context.names[2];
      const replicaId = await docker(context, [
        'run',
        '--detach',
        '--rm',
        '--pull=never',
        '--name',
        replicaName,
        '--label',
        `${ownerLabel}=${token}`,
        '--network',
        network.Id,
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        '128',
        '--memory',
        '384m',
        '--tmpfs',
        '/data:rw,nosuid,size=32m',
        '--entrypoint',
        '/bin/sh',
        image,
        '-c',
        watchdog,
        'sh',
        'redis-server',
        '--bind',
        '0.0.0.0',
        '--protected-mode',
        'no',
        '--save',
        '',
        '--appendonly',
        'no',
        '--requirepass',
        password,
        '--masterauth',
        password,
        '--replicaof',
        'pr492-primary',
        '6379'
      ]);
      const replica = await inspect<ContainerInfo>(context, 'container', replicaId);
      if (!replica) throw new Error('Owned Redis replica was not created');
      verifyContainer(context, replica, replicaName, network.Id);
      await waitFor(
        context,
        replicaId,
        ['redis-cli', '--no-auth-warning', '-a', password, 'INFO', 'replication'],
        'master_link_status:up'
      );
      const readyReplica = await inspect<ContainerInfo>(context, 'container', replicaId);
      if (!readyReplica) throw new Error('Owned Redis replica disappeared after readiness');
      verifyContainer(context, readyReplica, replicaName, network.Id);
      const replicaRelay = await startRelay(context, replicaId, 6379);
      relays.push(replicaRelay);
      replicaPort = replicaRelay.port;
      replicaUrl = `redis://:${password}@127.0.0.1:${replicaPort}`;
      assertPinnedEndpoint(replicaUrl, 'redis:', replicaPort);
    }
    return {
      ownedDirectory: context.directory,
      async runBun(script, timeout = 60_000) {
        if (heartbeatError) throw new Error(`Owned-service lease failed: ${String(heartbeatError)}`);
        if (databaseUrl) assertPinnedEndpoint(databaseUrl, 'postgresql:', hostPort);
        if (redisUrl) assertPinnedEndpoint(redisUrl, 'redis:', hostPort);
        if (replicaUrl) assertPinnedEndpoint(replicaUrl, 'redis:', replicaPort);
        const result = await exec(context.bun, ['--no-env-file', '--no-install', '-e', script], {
          cwd: registryDir,
          env: {
            ...context.environment,
            NODE_ENV: 'test',
            DATABASE_URL: databaseUrl,
            REDIS_URL: redisUrl,
            PR492_TEST_REPLICA: replicaUrl
          },
          timeout,
          maxBuffer: 1024 * 1024
        });
        return { stdout: result.stdout, stderr: result.stderr };
      },
      async runNode(script, timeout = 60_000) {
        if (heartbeatError) throw new Error(`Owned-service lease failed: ${String(heartbeatError)}`);
        if (databaseUrl) assertPinnedEndpoint(databaseUrl, 'postgresql:', hostPort);
        if (redisUrl) assertPinnedEndpoint(redisUrl, 'redis:', hostPort);
        if (replicaUrl) assertPinnedEndpoint(replicaUrl, 'redis:', replicaPort);
        const node = await localNode();
        const result = await exec(node, ['--no-warnings', '--input-type=module', '--eval', script], {
          cwd: registryDir,
          env: {
            ...context.environment,
            NODE_ENV: 'test',
            DATABASE_URL: databaseUrl,
            REDIS_URL: redisUrl,
            PR492_TEST_REPLICA: replicaUrl
          },
          timeout,
          maxBuffer: 1024 * 1024
        });
        return { stdout: result.stdout, stderr: result.stderr };
      },
      async runLinuxNode(script, timeout = 60_000) {
        if (kind !== 'postgres' || !databaseUrl || !network) throw new Error('Owned PostgreSQL is required');
        if (heartbeatError) throw new Error(`Owned-service lease failed: ${String(heartbeatError)}`);
        assertPinnedEndpoint(databaseUrl, 'postgresql:', hostPort);
        const image = await docker(context, ['image', 'inspect', '--format', '{{.Id}}', 'node:24.20.0-bookworm-slim']);
        if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Expected a locally pinned Node image');
        const root = await realpath(join(registryDir, '../..'));
        const name = context.names[3];
        const existing = await inspect<ContainerInfo>(context, 'container', name);
        const id =
          existing?.Id ??
          (await docker(context, [
            'run',
            '--detach',
            '--rm',
            '--pull=never',
            '--name',
            name,
            '--label',
            `${ownerLabel}=${token}`,
            '--network',
            network.Id,
            '--security-opt',
            'no-new-privileges',
            '--cap-drop',
            'ALL',
            '--pids-limit',
            '128',
            '--memory',
            '384m',
            '--read-only',
            '--tmpfs',
            '/tmp:rw,nosuid,size=32m',
            '--mount',
            `type=bind,src=${root},dst=/work,readonly`,
            '--workdir',
            '/work/apps/registry',
            '--entrypoint',
            '/bin/sh',
            image,
            '-c',
            `sleep ${watchdogSeconds}`
          ]));
        const container = await inspect<ContainerInfo>(context, 'container', id);
        if (!container) throw new Error('Owned Linux Node container was not created');
        verifyContainer(context, container, name, network.Id);
        const target = new URL(databaseUrl);
        target.hostname = context.names[0];
        target.port = '5432';
        const stdout = await docker(
          context,
          [
            'exec',
            '-e',
            `DATABASE_URL=${target.toString()}`,
            id,
            '/usr/local/bin/node',
            '--no-warnings',
            '--input-type=module',
            '--eval',
            script
          ],
          timeout
        );
        return { stdout, stderr: '' };
      },
      async close() {
        if (heartbeat) clearInterval(heartbeat);
        for (const relay of relays) await relay.close();
        await removeOwned(context);
        reaper?.kill('SIGTERM');
        await unlink(context.lease);
        await rmdir(context.config);
        await rmdir(context.directory);
      }
    };
  } catch (error) {
    if (heartbeat) clearInterval(heartbeat);
    try {
      for (const relay of relays) await relay.close();
      await removeOwned(context);
      reaper?.kill('SIGTERM');
      try {
        await unlink(context.lease);
      } catch (leaseError) {
        if ((leaseError as NodeJS.ErrnoException).code !== 'ENOENT') throw leaseError;
      }
      await rmdir(context.config);
      await rmdir(context.directory);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Owned service startup and cleanup both failed');
    }
    throw error;
  }
}

/** Exercise the real detached reaper by killing an isolated fixture owner. */
export async function verifyAbruptOwnerCleanup(): Promise<void> {
  assertSafeTestEnvironment(process.env);
  if (process.env.PR492_ISOLATED_CONFIG !== '1' || process.env.BUN_CONFIG_NO_DOTENV !== '1') {
    throw new Error('Run this probe using the dedicated dotenv-free Vitest configuration');
  }
  const bun = await localBun();
  const home = await mkdtemp(join(tmpdir(), 'tank-pr492-probe-'));
  const moduleUrl = new URL('./pr492-owned-services.ts', import.meta.url).href;
  const script = `
    import { startOwnedServices } from ${JSON.stringify(moduleUrl)};
    const services = await startOwnedServices('postgres');
    process.stdout.write(JSON.stringify({directory: services.ownedDirectory}) + '\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(bun, ['--no-env-file', '--no-install', '-e', script], {
    cwd: registryDir,
    env: {
      HOME: home,
      TMPDIR: tmpdir(),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
      NODE_ENV: 'test',
      PR492_ISOLATED_CONFIG: '1',
      BUN_CONFIG_NO_DOTENV: '1',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      DO_NOT_TRACK: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr?.on('data', (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-4_000);
  });
  try {
    const line = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Crash-cleanup fixture did not start')), 120_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', () => {
        clearTimeout(timer);
        reject(new Error(`Crash-cleanup fixture exited early: ${stderr}`));
      });
      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        const newline = output.indexOf('\n');
        if (newline < 0) return;
        clearTimeout(timer);
        resolve(output.slice(0, newline));
      });
    });
    const result = JSON.parse(line) as { directory: string };
    const directory = await realpath(result.directory);
    if (dirname(directory) !== (await realpath(tmpdir())) || !basename(directory).startsWith('tank-pr492-owned-')) {
      throw new Error('Crash-cleanup fixture did not report an owned temporary directory');
    }
    const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.kill('SIGKILL');
    await exited;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        await stat(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Owned-resource reaper did not verify cleanup after owner termination');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rmdir(home);
  }
}

/** Verify a real child process rejects a forbidden environment before starting Docker. */
export async function verifyRejectedEnvironment(name: string, value: string): Promise<void> {
  if (!forbiddenEnvironment.some((entry) => entry === name) || !value) throw new Error('Invalid rejection probe');
  const bun = await localBun();
  const home = await mkdtemp(join(tmpdir(), 'tank-pr492-rejection-'));
  const moduleUrl = new URL('./pr492-owned-services.ts', import.meta.url).href;
  const script = `
    import { startOwnedServices } from ${JSON.stringify(moduleUrl)};
    try { await startOwnedServices('postgres'); process.exit(2); }
    catch (error) { if (!String(error).includes('forbidden')) { console.error(error); process.exit(3); } }
  `;
  try {
    await exec(bun, ['--no-env-file', '--no-install', '-e', script], {
      cwd: registryDir,
      env: {
        HOME: home,
        TMPDIR: tmpdir(),
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
        NODE_ENV: 'test',
        PR492_ISOLATED_CONFIG: '1',
        BUN_CONFIG_NO_DOTENV: '1',
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
        DO_NOT_TRACK: '1',
        [name]: value
      },
      timeout: 30_000
    });
  } finally {
    await rmdir(home);
  }
}

/** A private canary proves child Bun does not load dotenv files. */
export async function verifyNoDotenv(): Promise<void> {
  const bun = await localBun();
  const directory = await mkdtemp(join(tmpdir(), 'tank-pr492-dotenv-'));
  const file = join(directory, '.env');
  try {
    await writeFile(file, 'PR492_DOTENV_CANARY=must-not-load\n', { mode: 0o600, flag: 'wx' });
    const { stdout } = await exec(
      bun,
      ['--no-env-file', '--no-install', '-e', "process.stdout.write(process.env.PR492_DOTENV_CANARY ?? 'absent')"],
      {
        cwd: directory,
        env: {
          HOME: directory,
          TMPDIR: directory,
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
          BUN_CONFIG_NO_DOTENV: '1',
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          DO_NOT_TRACK: '1'
        },
        timeout: 30_000
      }
    );
    if (stdout !== 'absent') throw new Error('Bun loaded a dotenv canary');
  } finally {
    await rm(file, { force: true });
    await rmdir(directory);
  }
}
