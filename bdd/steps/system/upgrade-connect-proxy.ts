/** Gate a real GitHub HTTPS download after staging exists, without intercepting TLS. */
import fs from 'node:fs';
import net from 'node:net';

export async function startUpgradePermissionProxy(installation: string) {
  const sockets = new Set<net.Socket>();
  let gated = false;
  let error: Error | undefined;

  function track(socket: net.Socket): void {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', (cause) => {
      error ??= cause;
    });
  }

  const server = net.createServer((client) => {
    track(client);
    let request = Buffer.alloc(0);
    client.on('data', function onData(chunk: Buffer) {
      request = Buffer.concat([request, chunk]);
      const end = request.indexOf('\r\n\r\n');
      if (end < 0 && request.length <= 16_384) return;
      client.pause();
      client.removeListener('data', onData);

      const line = request.subarray(0, end).toString().split('\r\n')[0];
      const match = /^CONNECT ([a-z0-9.-]+):443 HTTP\/1\.[01]$/i.exec(line);
      const host = match?.[1].toLowerCase();
      if (end < 0 || !host || (host !== 'github.com' && !host.endsWith('.githubusercontent.com'))) {
        error ??= new Error(`Unexpected proxy request: ${line}`);
        client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }

      try {
        if (!gated) {
          const staging = fs.readdirSync(installation).filter((name) => name.startsWith('.tank-upgrade-'));
          if (staging.length !== 1) throw new Error('Expected exactly one upgrade staging directory before download');
          fs.chmodSync(installation, 0o555);
          gated = true;
        }
      } catch (cause) {
        error ??= cause instanceof Error ? cause : new Error(String(cause));
        client.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        return;
      }

      const upstream = net.connect(443, host, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const remainder = request.subarray(end + 4);
        if (remainder.length) upstream.write(remainder);
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      });
      track(upstream);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    });
  });

  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate an upgrade proxy port');

  return {
    url: `http://127.0.0.1:${address.port}`,
    wasGated: () => gated,
    error: () => error,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
