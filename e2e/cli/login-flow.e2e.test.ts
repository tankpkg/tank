/** Real CLI, registry, browser-authorization API and PostgreSQL; see login intent C6, C7 and C11. */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';
import { expect, it } from 'vitest';

const enabled = process.env.E2E_FULL_LOGIN === '1';

async function stopProcess(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 2_000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function withinDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('Full login test exceeded its deadline'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function startRegistry(databaseUrl: string) {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${address.port}`;
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: path.resolve(__dirname, '../../apps/registry'),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      TANK_MODE: 'cloud',
      DATABASE_URL: databaseUrl,
      REDIS_URL: '',
      APP_URL: base,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: 'local-full-login-test-secret-123456789',
      SUPABASE_URL: 'https://fake.supabase.co',
      HOST: '127.0.0.1',
      PORT: String(address.port)
    }
  });
  const exited = new Promise<void>((resolve) => server.once('close', () => resolve()));
  let output = '';
  server.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  try {
    const deadline = Date.now() + 20_000;
    let ready = false;
    while (!ready && Date.now() < deadline && server.exitCode === null) {
      ready = await new Promise<boolean>((resolve) => {
        const socket = net.connect(address.port, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });
      if (!ready) await delay(100);
    }
    if (!ready) throw new Error(`Isolated registry did not start: ${output}`);
    return { base, server, exited };
  } catch (error) {
    await stopProcess(server, exited);
    throw error;
  }
}

function waitForAuthUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`CLI did not print an auth URL: ${output}`)), 20_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/https?:\/\/[^\s]+\/cli-login\?session=[\w-]+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timeout);
      reject(new Error(`CLI exited before printing an auth URL (${code}): ${output}`));
    });
  });
}

async function verifyFullLogin(): Promise<void> {
  const databaseUrl = process.env.E2E_LOGIN_DATABASE_URL;
  if (!databaseUrl) throw new Error('E2E_LOGIN_DATABASE_URL is required');
  const database = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    database.searchParams.has('host') ||
    database.searchParams.has('hostaddr')
  ) {
    throw new Error('Full login test requires a local, explicitly named test database');
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-login-e2e-'));
  const binDir = path.join(home, 'empty-bin');
  const configDir = path.join(home, '.tank');
  const email = `cli-login-${randomUUID()}@example.test`;
  fs.mkdirSync(binDir);
  fs.mkdirSync(configDir);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 3, connection: { statement_timeout: 3000 } });
  const deadline = AbortSignal.timeout(45_000);
  let child: ChildProcessWithoutNullStreams | undefined;
  let exit: Promise<number | null> | undefined;
  let registryProcess: Awaited<ReturnType<typeof startRegistry>> | undefined;
  let sessionCode: string | null = null;
  let probeCode: string | null = null;
  let databaseVerified = false;

  try {
    registryProcess = await startRegistry(databaseUrl);
    const registry = registryProcess.base;
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry, telemetry: false }));
    const state = randomUUID();
    const probe = await fetch(`${registry}/api/v1/cli-auth/start`, {
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    expect(probe.status).toBe(200);
    probeCode = (await probe.json()).sessionCode;
    const rows = await sql`SELECT value FROM kv_store WHERE key = ${`cli-auth:${probeCode}`}`;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].value).state).toBe(state);
    databaseVerified = true;

    const signup = await fetch(`${registry}/api/auth/sign-up/email`, {
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: { 'Content-Type': 'application/json', Origin: registry },
      body: JSON.stringify({ name: 'CLI Test', email, password: 'local-test-password-123' })
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(cookie).not.toBe('');

    // Disable desktop launchers without replacing the CLI's real open() implementation.
    child = spawn(process.execPath, [path.resolve(__dirname, '../../packages/cli/dist/bin/tank.js'), 'login'], {
      env: {
        HOME: home,
        TMPDIR: home,
        PATH: binDir,
        DISPLAY: '',
        WAYLAND_DISPLAY: '',
        BROWSER: '/dev/null',
        NO_COLOR: '1',
        TANK_REGISTRY_URL: registry,
        TANK_NO_UPDATE_CHECK: '1',
        TANK_TELEMETRY: '0',
        TANK_TELEMETRY_HOST: registry,
        TANK_LOKI_URL: registry
      }
    });
    exit = new Promise<number | null>((resolve) => child?.once('close', resolve));
    const authUrl = await withinDeadline(waitForAuthUrl(child), deadline);
    sessionCode = new URL(authUrl).searchParams.get('session');
    if (!sessionCode) throw new Error('CLI auth URL did not include a session code');
    expect(new URL(authUrl).origin).toBe(registry);

    const authorizationPage = await fetch(authUrl, {
      headers: { Cookie: cookie },
      redirect: 'error',
      signal: deadline
    });
    expect(authorizationPage.status).toBe(200);
    const html = await authorizationPage.text();
    expect(html).toContain('The Tank CLI is requesting access to your account.');
    expect(html).toContain(sessionCode.slice(0, 8));

    const authorization = await fetch(`${registry}/api/v1/cli-auth/authorize`, {
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: { 'Content-Type': 'application/json', Origin: registry, Cookie: cookie },
      body: JSON.stringify({ sessionCode })
    });
    expect(authorization.status).toBe(200);
    expect(await withinDeadline(exit, deadline)).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(config.user.email).toBe(email);
    expect(config.token).toMatch(/^tank_/);
    const identity = await fetch(`${registry}/api/v1/auth/whoami`, {
      redirect: 'error',
      signal: deadline,
      headers: { Authorization: `Bearer ${config.token}` }
    });
    expect(identity.status).toBe(200);
  } finally {
    if (child && exit) await stopProcess(child, exit);
    if (registryProcess) {
      await stopProcess(registryProcess.server, registryProcess.exited);
    }
    if (databaseVerified) {
      const rows = await sql`SELECT id FROM "user" WHERE email = ${email}`;
      for (const row of rows) {
        await sql`DELETE FROM apikey WHERE user_id = ${row.id} OR reference_id = ${row.id}`;
        await sql`DELETE FROM "user" WHERE id = ${row.id} AND email = ${email}`;
      }
      if (probeCode) await sql`DELETE FROM kv_store WHERE key = ${`cli-auth:${probeCode}`}`;
      if (sessionCode) await sql`DELETE FROM kv_store WHERE key = ${`cli-auth:${sessionCode}`}`;
    }
    await sql.end({ timeout: 3 });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

it.skipIf(!enabled || process.platform === 'win32')(
  'logs in with a real CLI and verifies the issued token',
  verifyFullLogin,
  90_000
);
