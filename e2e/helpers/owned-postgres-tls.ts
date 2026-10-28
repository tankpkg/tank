/** A TLS relay to an owned test database, never to an externally supplied target. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createConnection, createServer, type Socket } from 'node:net';
import path from 'node:path';
import { createSecureContext, TLSSocket } from 'node:tls';

import {
  assertOwnedTestDatabaseAlive,
  type OwnedTestDatabase,
  validateTestDatabaseUrl
} from './isolated-test-database.js';

export async function createOwnedPostgresTls(database: OwnedTestDatabase, sandbox: string, wrongHost = false) {
  await assertOwnedTestDatabaseAlive(database);
  validateTestDatabaseUrl(database.url);
  const target = new URL(database.url);
  const keyPath = path.join(sandbox, 'postgres-tls.key');
  const certPath = path.join(sandbox, 'postgres-tls.crt');
  const caKeyPath = path.join(sandbox, 'postgres-ca.key');
  const caPath = path.join(sandbox, 'postgres-ca.crt');
  const requestPath = path.join(sandbox, 'postgres-tls.csr');
  const extensionsPath = path.join(sandbox, 'postgres-tls.ext');
  execFileSync(
    '/usr/bin/openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=owned-postgres-test-ca',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-keyout',
      caKeyPath,
      '-out',
      caPath
    ],
    { stdio: 'ignore', timeout: 15_000 }
  );
  execFileSync(
    '/usr/bin/openssl',
    [
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=owned-postgres-test',
      '-keyout',
      keyPath,
      '-out',
      requestPath
    ],
    { stdio: 'ignore', timeout: 15_000 }
  );
  fs.writeFileSync(
    extensionsPath,
    `basicConstraints=critical,CA:FALSE\nsubjectAltName=${wrongHost ? 'DNS:wrong.example' : 'IP:127.0.0.1,DNS:host.docker.internal'}\nextendedKeyUsage=serverAuth\n`
  );
  execFileSync(
    '/usr/bin/openssl',
    [
      'x509',
      '-req',
      '-in',
      requestPath,
      '-CA',
      caPath,
      '-CAkey',
      caKeyPath,
      '-set_serial',
      '1',
      '-days',
      '1',
      '-extfile',
      extensionsPath,
      '-out',
      certPath
    ],
    { stdio: 'ignore', timeout: 15_000 }
  );
  const certificate = fs.readFileSync(caPath, 'utf8');
  const context = createSecureContext({
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8')
  });
  const sockets = new Set<Socket>();
  const counts = { attempted: 0, encrypted: 0, plaintext: 0, decryptedBytes: 0 };
  const server = createServer((raw) => {
    sockets.add(raw);
    raw.on('close', () => sockets.delete(raw));
    raw.on('error', () => raw.destroy());
    let request = Buffer.alloc(0);
    const receive = (chunk: Buffer) => {
      request = Buffer.concat([request, chunk]);
      if (request.length < 8) return;
      raw.removeListener('data', receive);
      if (request.length !== 8 || request.readUInt32BE(0) !== 8 || request.readUInt32BE(4) !== 80877103) {
        counts.plaintext++;
        raw.destroy();
        return;
      }
      counts.attempted++;
      raw.write('S');
      const tls = new TLSSocket(raw, { isServer: true, secureContext: context });
      sockets.add(tls);
      tls.on('close', () => sockets.delete(tls));
      tls.on('error', () => tls.destroy());
      tls.on('data', (chunk: Buffer) => {
        counts.decryptedBytes += chunk.length;
      });
      tls.once('secure', () => {
        counts.encrypted++;
        const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.on('error', () => tls.destroy());
        tls.on('close', () => upstream.destroy());
        tls.pipe(upstream).pipe(tls);
      });
    };
    raw.on('data', receive);
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate the TLS relay');
  const url = new URL(database.url);
  url.hostname = '127.0.0.1';
  url.port = String(address.port);
  return {
    url: url.toString(),
    certificate,
    counts,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
