/** Shared isolation for the built-registry browser and rendering tests. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createOwnedTestDatabase, type OwnedTestDatabase } from './isolated-test-database.js';

const exec = promisify(execFile);

export function runtimeArgs(args: string[]): string[] {
  return 'bun' in process.versions ? ['--no-env-file', ...args] : args;
}

export function replaceEnvironment(environment: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [key, value] of Object.entries(environment)) if (value !== undefined) process.env[key] = value;
}

function findExecutable(name: string, searchPath: string): string {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch {
      // Continue searching the caller's executable path.
    }
  }
  throw new Error(`${name} is required for isolated database setup`);
}

export async function withPrivateEnvironment<T>(operation: (sandbox: string) => Promise<T>): Promise<T> {
  const original = { ...process.env };
  const searchPath = original.PATH ?? '';
  const bun = findExecutable('bun', searchPath);
  const docker = findExecutable('docker', searchPath);
  const image = original.E2E_AUTH_TEST_POSTGRES_IMAGE;
  if (image && !['postgres:16', 'postgres:17-alpine'].includes(image)) {
    throw new Error('Unsupported test PostgreSQL image');
  }
  const dockerHost =
    original.DOCKER_HOST ||
    (process.platform === 'darwin'
      ? `unix://${path.join(original.HOME ?? os.homedir(), '.colima/default/docker.sock')}`
      : 'unix:///var/run/docker.sock');
  if (!/^unix:\/\/\/[^?#\r\n]+$/.test(dockerHost)) throw new Error('A local Docker socket is required');
  if (process.platform === 'darwin' && !/\/\.colima\/[^/]+\/docker\.sock$/.test(dockerHost)) {
    throw new Error('A Colima Docker socket is required on macOS');
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-owned-ui-env-'));
  try {
    const bin = path.join(sandbox, 'bin');
    fs.mkdirSync(bin);
    const quotedBun = `'${bun.replaceAll("'", "'\\''")}'`;
    fs.writeFileSync(
      path.join(bin, 'bun'),
      `#!/bin/sh\nexport DOTENV_CONFIG_PATH=/dev/null\nexec ${quotedBun} --no-env-file "$@"\n`,
      { mode: 0o700 }
    );
    fs.symlinkSync(docker, path.join(bin, 'docker'));
    replaceEnvironment({
      PATH: `${bin}${path.delimiter}${searchPath}`,
      HOME: sandbox,
      TMPDIR: sandbox,
      DOCKER_HOST: dockerHost,
      DOTENV_CONFIG_PATH: '/dev/null',
      E2E_AUTH_TEST_POSTGRES_IMAGE: image
    });
    return await operation(sandbox);
  } finally {
    replaceEnvironment(original);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

export async function verifyPrivateEnvironment(sandbox: string): Promise<void> {
  const allowed = new Set([
    'PATH',
    'HOME',
    'TMPDIR',
    'DOCKER_HOST',
    'DOTENV_CONFIG_PATH',
    'E2E_AUTH_TEST_POSTGRES_IMAGE'
  ]);
  assert.deepEqual(
    Object.keys(process.env).filter((key) => !allowed.has(key)),
    []
  );
  assert.deepEqual(
    Object.keys(process.env).filter((key) => key.startsWith('PG')),
    []
  );
  assert.equal(process.env.UNRELATED_TEST_SECRET, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  const probe = path.join(sandbox, 'dotenv-probe');
  fs.mkdirSync(probe);
  fs.writeFileSync(path.join(probe, '.env'), 'PGHOST=dotenv-host\nUNRELATED_TEST_SECRET=dotenv-secret\n');
  const bun = path.join(sandbox, 'bin', 'bun');
  const { stdout } = await exec(
    bun,
    [
      '-e',
      'console.log(JSON.stringify({host:process.env.PGHOST??null,secret:process.env.UNRELATED_TEST_SECRET??null}))'
    ],
    { cwd: probe, env: process.env, timeout: 10_000 }
  );
  assert.deepEqual(JSON.parse(stdout), { host: null, secret: null });
  const preload = path.join(probe, 'inspect.mjs');
  fs.writeFileSync(
    preload,
    `import { writeSync } from 'node:fs';\nprocess.on('exit', () => writeSync(1, '\\nTANK_ENV_PROBE=' + JSON.stringify({host:process.env.PGHOST??null,secret:process.env.UNRELATED_TEST_SECRET??null,path:process.env.DOTENV_CONFIG_PATH??null}) + '\\n'));\n`
  );
  const drizzle = path.resolve(__dirname, '../../apps/registry/node_modules/.bin/drizzle-kit');
  const result = await exec(bun, ['--preload', preload, drizzle, '--version'], {
    cwd: probe,
    env: process.env,
    timeout: 10_000
  });
  const match = /TANK_ENV_PROBE=(\{[^\n]+\})/.exec(result.stdout);
  assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]), { host: null, secret: null, path: '/dev/null' });
}

/** Retry only PostgreSQL's transient startup error; never infer ownership from error text. */
export async function createReadyDatabase(
  withSchema = false,
  sameCredentialsAs?: OwnedTestDatabase,
  create: typeof createOwnedTestDatabase = createOwnedTestDatabase
): Promise<OwnedTestDatabase> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(withSchema, sameCredentialsAs);
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Error) || !('code' in error) || error.code !== '57P03') throw error;
    }
  }
}

/** The opaque database capability owns its exact container and bridge. */
export async function closeOwnedDatabase(database: OwnedTestDatabase): Promise<void> {
  await database.close();
}
