// @vitest-environment node
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

import { expect, it } from 'vitest';

async function stopChild(child: ChildProcessWithoutNullStreams, exit: Promise<void>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exit,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Test registry did not exit')), 7_000);
      })
    ]);
  } finally {
    clearTimeout(killTimer);
    if (deadline) clearTimeout(deadline);
  }
}

it('distinguishes invalid requests from a real session-store outage', async () => {
  const sockets = new Set<net.Socket>();
  let refusedConnections = 0;
  // PostgreSQL wire-protocol startup rejection (FATAL 57P03: cannot_connect_now).
  // Closing sockets before the handshake can make postgres.js retry indefinitely.
  const refusalFields = Buffer.from('SFATAL\0VFATAL\0C57P03\0Mthe database system is starting up\0\0');
  const refusalHeader = Buffer.alloc(5);
  refusalHeader.write('E');
  refusalHeader.writeInt32BE(refusalFields.length + 4, 1);
  const refusal = Buffer.concat([refusalHeader, refusalFields]);
  const failureEndpoint = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.once('data', () => {
      refusedConnections++;
      socket.end(refusal);
    });
  });
  let child: ChildProcessWithoutNullStreams | undefined;
  let exit: Promise<void> | undefined;
  const source = `
    import { OpenAPIHono } from '@hono/zod-openapi';
    import { cliAuthRoutes } from './src/api/routes/v1/cli-auth.ts';
    const app = new OpenAPIHono();
    app.route('/cli-auth', cliAuthRoutes);
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    console.log('TEST_PORT=' + server.port);
  `;
  try {
    await new Promise<void>((resolve, reject) => failureEndpoint.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = failureEndpoint.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind the owned failure endpoint');
    const server = spawn('bun', ['--no-env-file', '--no-install', '--config=/dev/null', '-e', source], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        DOTENV_CONFIG_PATH: '/dev/null',
        APP_URL: 'http://127.0.0.1:5555',
        DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${address.port}/isolated_test`,
        REDIS_URL: '',
        LOKI_URL: 'http://127.0.0.1:0',
        BETTER_AUTH_SECRET: 'local-test-only-not-a-production-secret'
      }
    });
    child = server;
    exit = new Promise<void>((resolve) => server.once('close', () => resolve()));
    let output = '';
    server.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const port = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Test registry did not start: ${output}`)), 20_000);
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/TEST_PORT=(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Test registry exited before startup: ${output}`));
      });
    });
    const post = async (input: string | Request, options: RequestInit = {}) => {
      try {
        return await fetch(input, { ...options, method: 'POST', signal: AbortSignal.timeout(15_000) });
      } catch (error) {
        const url = typeof input === 'string' ? input : input.url;
        const body = typeof options.body === 'string' ? options.body : '<empty or Request body>';
        throw new Error(`POST ${url} (${body}) failed; refused connections: ${refusedConnections}\n${output}`, {
          cause: error
        });
      }
    };
    const url = `http://127.0.0.1:${port}/cli-auth/start`;
    const request = (options: RequestInit = {}) => post(url, options);
    const jsonRequest = (body: string) => request({ headers: { 'Content-Type': 'application/json' }, body });

    const emptyResponse = await request();
    expect(emptyResponse.status, 'missing body and content type').toBe(400);
    expect(await emptyResponse.json()).toEqual({ error: 'Invalid request body' });
    expect((await request({ headers: { 'Content-Type': 'application/json' } })).status, 'missing JSON body').toBe(400);

    const noContentType = new Request(url, {
      method: 'POST',
      body: new Blob([JSON.stringify({ state: randomUUID() })])
    });
    expect(noContentType.headers.has('Content-Type')).toBe(false);
    const noContentTypeResponse = await post(noContentType);
    expect(noContentTypeResponse.status, 'missing content type').toBe(400);
    expect(await noContentTypeResponse.json()).toEqual({ error: 'Invalid request body' });

    const unsupportedResponse = await request({
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ state: randomUUID() })
    });
    expect(unsupportedResponse.status, 'unsupported content type').toBe(400);
    expect(await unsupportedResponse.json()).toEqual({ error: 'Invalid request body' });

    expect((await jsonRequest('{')).status, 'malformed JSON').toBe(400);
    expect((await jsonRequest('{}')).status, 'missing state').toBe(400);
    expect((await jsonRequest(JSON.stringify({ state: 'short' }))).status, 'invalid schema').toBe(400);

    expect(refusedConnections).toBe(0);
    const response = await jsonRequest(JSON.stringify({ state: randomUUID() }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to start authentication session. Please try again later.' });
    expect(refusedConnections).toBeGreaterThan(0);
    const startConnections = refusedConnections;

    const exchangeUrl = `http://127.0.0.1:${port}/cli-auth/exchange`;
    const exchange = (options: RequestInit = {}) => post(exchangeUrl, options);
    expect((await exchange()).status, 'exchange without a body').toBe(400);
    expect(
      (
        await exchange({
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ sessionCode: randomUUID(), state: randomUUID() })
        })
      ).status,
      'exchange with an unsupported content type'
    ).toBe(400);
    expect(refusedConnections).toBe(startConnections);
    const exchangeResponse = await exchange({
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: randomUUID(), state: randomUUID() })
    });
    expect(exchangeResponse.status).toBe(500);
    expect(await exchangeResponse.json()).toEqual({
      error: 'Unable to complete authentication session. Please start login again.'
    });
    expect(refusedConnections).toBeGreaterThan(startConnections);
    const exchangeConnections = refusedConnections;
    const authorizeUrl = `http://127.0.0.1:${port}/cli-auth/authorize`;
    const malformedAuthorization = await post(authorizeUrl, {
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    expect(malformedAuthorization.status).toBe(400);
    const unauthenticated = await post(authorizeUrl, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: randomUUID() })
    });
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: 'Authentication required' });
    expect(refusedConnections).toBe(exchangeConnections);
  } finally {
    try {
      if (child && exit) await stopChild(child, exit);
    } finally {
      for (const socket of sockets) socket.destroy();
      if (failureEndpoint.listening) {
        await new Promise<void>((resolve, reject) =>
          failureEndpoint.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  }
}, 90_000);

it('bounds a source HTTP start request when PostgreSQL repeatedly closes before the handshake', async () => {
  const sockets = new Set<net.Socket>();
  let connections = 0;
  const failureEndpoint = net.createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.resume();
    socket.end();
  });
  let child: ChildProcessWithoutNullStreams | undefined;
  let exit: Promise<void> | undefined;
  let output = '';
  const source = `
    import { OpenAPIHono } from '@hono/zod-openapi';
    import { cliAuthRoutes } from './src/api/routes/v1/cli-auth.ts';
    const app = new OpenAPIHono();
    app.route('/cli-auth', cliAuthRoutes);
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    console.log('TEST_PORT=' + server.port);
  `;
  try {
    await new Promise<void>((resolve, reject) => failureEndpoint.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = failureEndpoint.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind the owned failure endpoint');
    const server = spawn('bun', ['--no-env-file', '--no-install', '--config=/dev/null', '-e', source], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'test',
        DOTENV_CONFIG_PATH: '/dev/null',
        APP_URL: 'http://127.0.0.1:5555',
        DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${address.port}/isolated_test`,
        REDIS_URL: '',
        LOKI_URL: 'http://127.0.0.1:0',
        BETTER_AUTH_SECRET: 'local-test-only-not-a-production-secret'
      }
    });
    child = server;
    exit = new Promise<void>((resolve) => server.once('close', () => resolve()));
    server.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const port = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Test registry did not start: ${output}`)), 20_000);
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/TEST_PORT=(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Test registry exited before startup: ${output}`));
      });
    });

    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${port}/cli-auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: randomUUID() }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error(`CLI auth start failed after ${connections} connections\n${output}`, { cause: error });
    }
    const elapsed = performance.now() - started;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to start authentication session. Please try again later.' });
    expect(elapsed).toBeLessThan(10_000);
    expect(connections).toBeGreaterThan(0);
    expect(connections).toBeLessThanOrEqual(32);
    const atResponse = connections;

    // The child remains alive for six retry intervals. With every pre-handshake
    // socket closed, any late write would first require another connection.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(
      server.exitCode === null && server.signalCode === null,
      'registry must remain alive during observation'
    ).toBe(true);
    expect(connections, 'no retries after the HTTP response').toBe(atResponse);
    expect(sockets.size, 'no PostgreSQL sockets remain open').toBe(0);
    expect(output).not.toContain('Session created successfully');
    process.stdout.write(
      `Immediate-close HTTP regression: ${Math.round(elapsed)} ms, ${atResponse} connections, no late retries\n`
    );
  } finally {
    try {
      if (child && exit) {
        await stopChild(child, exit);
        expect(child.exitCode !== null || child.signalCode !== null, 'registry child was reaped').toBe(true);
      }
    } finally {
      for (const socket of sockets) socket.destroy();
      if (failureEndpoint.listening) {
        await new Promise<void>((resolve, reject) =>
          failureEndpoint.close((error) => (error ? reject(error) : resolve()))
        );
      }
      expect(sockets.size, 'all owned sockets closed during cleanup').toBe(0);
      expect(failureEndpoint.listening, 'failure endpoint closed during cleanup').toBe(false);
    }
  }
}, 45_000);
