import { createServer } from 'node:http';
import { CREDENTIAL_PATTERNS } from '../detector/patterns.ts';
import { scan } from '../detector/scanner.ts';
import { generateFake } from '../tokenizer/generator.ts';
import type { VaultStore } from '../tokenizer/vault.ts';
import { isAiGenerationRequest } from './interceptor.ts';

export interface ProxyServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function redactBody(vault: VaultStore, body: string): string {
  const matches = scan(body);
  if (matches.length === 0) {
    return body;
  }

  const reals = new Map<string, string>();

  for (const match of matches) {
    const pattern = CREDENTIAL_PATTERNS.find((candidate) => candidate.id === match.patternId);
    if (!pattern) {
      continue;
    }
    const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`;
    const regex = new RegExp(pattern.regex.source, flags);
    let result: RegExpExecArray | null = regex.exec(body);
    while (result) {
      const real = result[0] ?? '';
      if (real.length > 0 && !reals.has(real)) {
        reals.set(real, pattern.id);
      }
      result = regex.exec(body);
    }
  }

  for (const [real, patternId] of reals.entries()) {
    let fake = vault.lookupReal(real);
    if (!fake) {
      fake = generateFake(real, patternId);
      let attempts = 0;
      while ((vault.lookupFake(fake) ?? real) !== real && attempts < 10) {
        fake = generateFake(real, patternId);
        attempts += 1;
      }
      vault.store(real, fake, patternId);
    }
  }

  return vault.redact(body);
}

export async function startProxy(vault: VaultStore, preferredPort?: number): Promise<ProxyServer> {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      if (req.method !== 'POST' || req.url !== '/proxy') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const targetUrl = req.headers['x-target-url'];
      if (!targetUrl || Array.isArray(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing X-Target-URL');
        return;
      }

      const body = await readBody(req);
      const targetPath = new URL(targetUrl).pathname;
      const aiRequest = isAiGenerationRequest(req.method, targetPath, body);
      const outgoingBody = aiRequest ? redactBody(vault, body) : body;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) {
          continue;
        }
        const lower = key.toLowerCase();
        if (lower === 'host' || lower === 'content-length' || lower === 'x-target-url') {
          continue;
        }
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: outgoingBody
      });

      const responseText = await upstream.text();
      const finalResponse = aiRequest ? vault.restore(responseText) : responseText;

      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of upstream.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === 'content-length' || lower === 'content-encoding') {
          continue;
        }
        responseHeaders[key] = value;
      }

      res.writeHead(upstream.status, responseHeaders);
      res.end(finalResponse);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      const cause = err instanceof Error && 'cause' in err ? String((err as { cause: unknown }).cause) : '';
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Vault proxy error: ${msg}\ncause: ${cause}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort ?? 0, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      })
  };
}
