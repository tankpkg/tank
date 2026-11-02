// @vitest-environment node
// Real PostgreSQL behind a TLS-terminating relay; no database responses are mocked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('configured PostgreSQL CA', () => {
  let services: OwnedServices;

  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);

  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('verifies both the registry database and login store before sending PostgreSQL credentials', async () => {
    const script = `
      import { execFileSync } from 'node:child_process';
      import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
      import { createConnection, createServer } from 'node:net';
      import { join } from 'node:path';
      import { createSecureContext, TLSSocket } from 'node:tls';
      import { setDefaultResultOrder } from 'node:dns';
      import postgres from 'postgres';
      import { postgresTlsOptions } from './src/lib/db/tls.ts';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      setDefaultResultOrder('ipv4first');
      const directory = mkdtempSync(join(process.env.TMPDIR, 'tank-staging-tls-'));
      const target = new URL(process.env.DATABASE_URL);
      const sockets = new Set();
      const servers = [];
      const admin = postgres(target.toString(), { max: 1, prepare: false });
      let registry;
      const results = [];
      try {
        const certificates = {};
        for (const [name, dns, alternative] of [
          ['trusted', 'localhost', 'DNS:localhost'], ['untrusted', 'localhost', 'DNS:localhost'],
          ['wrong', 'wrong.example', 'DNS:wrong.example'], ['ip', 'owned-test', 'IP:127.0.0.1']
        ]) {
          const key = join(directory, name + '.key');
          const cert = join(directory, name + '.crt');
          const caKey = join(directory, name + '-ca.key');
          const caCert = join(directory, name + '-ca.crt');
          const request = join(directory, name + '.csr');
          const extensions = join(directory, name + '.ext');
          execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
            '-subj', '/CN=owned-test-root-' + name, '-addext', 'basicConstraints=critical,CA:TRUE',
            '-keyout', caKey, '-out', caCert], { stdio: 'ignore' });
          execFileSync('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=' + dns,
            '-keyout', key, '-out', request], { stdio: 'ignore' });
          writeFileSync(extensions, 'basicConstraints=critical,CA:FALSE\\nsubjectAltName=' + alternative +
            '\\nextendedKeyUsage=serverAuth\\n');
          execFileSync('/usr/bin/openssl', ['x509', '-req', '-in', request, '-CA', caCert, '-CAkey', caKey,
            '-set_serial', '1', '-days', '1', '-extfile', extensions, '-out', cert], { stdio: 'ignore' });
          certificates[name] = { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8'), ca: readFileSync(caCert, 'utf8') };
        }
        const intermediateKey = join(directory, 'intermediate.key');
        const intermediateRequest = join(directory, 'intermediate.csr');
        const intermediateCert = join(directory, 'intermediate.crt');
        const intermediateExtensions = join(directory, 'intermediate.ext');
        execFileSync('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=owned-intermediate',
          '-keyout', intermediateKey, '-out', intermediateRequest], { stdio: 'ignore' });
        writeFileSync(intermediateExtensions, 'basicConstraints=critical,CA:TRUE,pathlen:0\\nkeyUsage=critical,keyCertSign,cRLSign\\n');
        execFileSync('/usr/bin/openssl', ['x509', '-req', '-in', intermediateRequest, '-CA', join(directory, 'trusted-ca.crt'),
          '-CAkey', join(directory, 'trusted-ca.key'), '-set_serial', '2', '-days', '1', '-extfile', intermediateExtensions,
          '-out', intermediateCert], { stdio: 'ignore' });
        const chainKey = join(directory, 'chain.key');
        const chainRequest = join(directory, 'chain.csr');
        const chainCert = join(directory, 'chain.crt');
        execFileSync('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost',
          '-keyout', chainKey, '-out', chainRequest], { stdio: 'ignore' });
        execFileSync('/usr/bin/openssl', ['x509', '-req', '-in', chainRequest, '-CA', intermediateCert, '-CAkey', intermediateKey,
          '-set_serial', '3', '-days', '1', '-extfile', join(directory, 'trusted.ext'), '-out', chainCert], { stdio: 'ignore' });
        const intermediate = readFileSync(intermediateCert, 'utf8');
        certificates.chain = { key: readFileSync(chainKey, 'utf8'), cert: readFileSync(chainCert, 'utf8') + intermediate,
          ca: certificates.trusted.ca, intermediate };
        const ecKey = join(directory, 'explicit-ec.key');
        const ecCert = join(directory, 'explicit-ec.crt');
        execFileSync('/usr/bin/openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-param_enc', 'explicit',
          '-out', ecKey], { stdio: 'ignore' });
        execFileSync('/usr/bin/openssl', ['req', '-new', '-x509', '-key', ecKey, '-days', '1',
          '-subj', '/CN=owned-explicit-ec-root', '-addext', 'basicConstraints=critical,CA:TRUE',
          '-out', ecCert], { stdio: 'ignore' });
        const ecRoot = readFileSync(ecCert, 'utf8');
        for (const name of ['trusted', 'untrusted', 'wrong', 'ip', 'chain']) {
          const state = { plaintext: 0, decrypted: 0, connections: 0 };
          const context = createSecureContext(certificates[name]);
          const server = createServer((raw) => {
            state.connections++;
            sockets.add(raw);
            raw.on('close', () => sockets.delete(raw));
            raw.on('error', () => {});
            let first = Buffer.alloc(0);
            const receive = (chunk) => {
              first = Buffer.concat([first, chunk]);
              if (first.length < 8) return;
              raw.removeListener('data', receive);
              if (first.length !== 8 || first.readUInt32BE(0) !== 8 || first.readUInt32BE(4) !== 80877103) {
                state.plaintext += first.length;
                const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
                sockets.add(upstream);
                upstream.on('close', () => sockets.delete(upstream));
                upstream.on('error', () => raw.destroy());
                raw.on('close', () => upstream.destroy());
                upstream.write(first);
                raw.pipe(upstream).pipe(raw);
                return;
              }
              raw.write('S');
              const tls = new TLSSocket(raw, { isServer: true, secureContext: context });
              sockets.add(tls);
              tls.on('close', () => sockets.delete(tls));
              tls.on('error', () => tls.destroy());
              let upstream;
              const pending = [];
              tls.on('data', (data) => {
                state.decrypted += data.length;
                if (upstream) upstream.write(data); else pending.push(data);
              });
              tls.once('secure', () => {
                upstream = createConnection({ host: target.hostname, port: Number(target.port) });
                sockets.add(upstream);
                upstream.on('close', () => sockets.delete(upstream));
                upstream.on('error', () => tls.destroy());
                tls.on('close', () => upstream.destroy());
                for (const data of pending) upstream.write(data);
                upstream.pipe(tls);
              });
            };
            raw.on('data', receive);
          });
          await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
          servers.push({ name, server, state });
        }

        await admin.unsafe('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
        if (globalThis.Bun) registry = await import('./src/lib/db/index.ts');
        for (const scenario of ['trusted', 'annotated', 'chain', 'intermediate-only', 'ec-first', 'ec-last', 'explicit-disable', 'ip', 'untrusted', 'wrong', 'invalid', 'empty', 'direct', 'direct-env']) {
          const serverName = scenario === 'intermediate-only' ? 'chain' :
            ['annotated', 'ec-first', 'ec-last', 'explicit-disable', 'invalid', 'empty', 'direct', 'direct-env'].includes(scenario) ? 'trusted' : scenario;
          const item = servers.find((entry) => entry.name === serverName);
          const url = new URL(target);
          url.hostname = scenario === 'ip' ? '127.0.0.1' : 'localhost';
          url.port = String(item.server.address().port);
          if (scenario === 'explicit-disable') url.searchParams.set('sslmode', 'disable');
          if (scenario === 'direct') url.searchParams.set('sslnegotiation', 'direct');
          if (scenario === 'direct-env') process.env.PGSSLNEGOTIATION = 'direct';
          else delete process.env.PGSSLNEGOTIATION;
          process.env.DATABASE_SSL_CA = scenario === 'invalid' ? 'not a certificate' : scenario === 'empty' ? '' :
            scenario === 'intermediate-only' ? certificates.chain.intermediate : scenario === 'chain' ? certificates.chain.ca :
            scenario === 'ec-first' ? ecRoot + certificates.trusted.ca : scenario === 'ec-last' ? certificates.trusted.ca + ecRoot :
            (scenario === 'annotated' ? '# CA bundle\\n' : '') + certificates[scenario === 'wrong' || scenario === 'ip' ? scenario : 'trusted'].ca;
          process.env.DATABASE_URL = url.toString();
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          if (registry) registry.reinitializeDb(url.toString());
          const key = 'staging-ca-test:' + scenario;
          const attempt = (action) => Promise.resolve().then(action).then(() => ({ ok: true }), (error) => ({ ok: false, code: error.code }));
          const before = { ...item.state };
          const db = await attempt(async () => {
            if (registry) return registry.sql.unsafe('SELECT 1');
            const ssl = postgresTlsOptions(url.toString());
            const client = postgres(url.toString(), { max: 1, prepare: false, ...(ssl ? { ssl } : {}) });
            try { return await client.unsafe('SELECT 1'); } finally { await client.end({ timeout: 1 }); }
          });
          const kv = await attempt(() => createPostgresStore(url.toString()).set(key, 'ok', 60_000));
          if (registry) await attempt(() => registry.sql.end({ timeout: 1 }));
          results.push({ scenario, db, kv, plaintext: item.state.plaintext - before.plaintext,
            decrypted: item.state.decrypted - before.decrypted, connections: item.state.connections - before.connections });
        }
        const rows = await admin\`SELECT key FROM kv_store WHERE key LIKE 'staging-ca-test:%' ORDER BY key\`;
        console.log(JSON.stringify({ results, keys: rows.map((row) => row.key) }));
      } finally {
        delete process.env.DATABASE_SSL_CA;
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        delete process.env.PGSSLNEGOTIATION;
        for (const socket of sockets) socket.destroy();
        for (const item of servers) await new Promise((resolve) => item.server.close(resolve));
        await admin.end({ timeout: 2 });
        rmSync(directory, { recursive: true, force: true });
      }
      process.exit(0);
    `;
    for (const runtime of ['Bun', 'Node'] as const) {
      const { stdout } = await (runtime === 'Bun' ? services.runBun(script, 60_000) : services.runNode(script, 60_000));
      const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
        results: {
          scenario: string;
          db: { ok: boolean };
          kv: { ok: boolean };
          plaintext: number;
          decrypted: number;
          connections: number;
        }[];
        keys: string[];
      };
      expect(result.results).toHaveLength(14);
      for (const entry of result.results) {
        const valid = ['trusted', 'annotated', 'chain', 'ec-first', 'ec-last', 'explicit-disable', 'ip'].includes(
          entry.scenario
        );
        expect(entry.db.ok, `${runtime} ${entry.scenario}: registry database`).toBe(valid);
        expect(entry.kv.ok, `${runtime} ${entry.scenario}: login store`).toBe(valid);
        expect(entry.plaintext, `${runtime} ${entry.scenario}: plaintext bytes`).toBe(0);
        if (entry.scenario === 'intermediate-only') expect(entry.connections).toBe(0);
        if (valid) expect(entry.decrypted).toBeGreaterThan(0);
        else expect(entry.decrypted).toBe(0);
      }
      expect(result.keys).toEqual([
        'staging-ca-test:annotated',
        'staging-ca-test:chain',
        'staging-ca-test:ec-first',
        'staging-ca-test:ec-last',
        'staging-ca-test:explicit-disable',
        'staging-ca-test:ip',
        'staging-ca-test:trusted'
      ]);
    }
  }, 150_000);
});
