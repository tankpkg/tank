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

const UPSTREAM_PREFIX = '/_/';

const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'x-target-url',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'accept-encoding',
  'proxy-authorization',
  'proxy-connection',
  'upgrade'
]);

const SKIP_RESPONSE_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive'
]);

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

function buildForwardHeaders(incomingHeaders: import('node:http').IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (!value || SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

function buildResponseHeaders(upstreamHeaders: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of upstreamHeaders.entries()) {
    if (SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function redactBody(vault: VaultStore, body: string): string {
  const matches = scan(body);
  if (matches.length === 0) return body;

  const reals = new Map<string, string>();
  for (const match of matches) {
    const pattern = CREDENTIAL_PATTERNS.find((c) => c.id === match.patternId);
    if (!pattern) continue;
    const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`;
    const regex = new RegExp(pattern.regex.source, flags);
    let result: RegExpExecArray | null = regex.exec(body);
    while (result) {
      const real = result[0] ?? '';
      if (real.length > 0 && !reals.has(real)) reals.set(real, pattern.id);
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

function resolveTargetUrl(req: import('node:http').IncomingMessage): string | null {
  const explicitTarget = req.headers['x-target-url'];
  if (explicitTarget && !Array.isArray(explicitTarget)) return explicitTarget;

  const url = req.url ?? '/';
  if (url.startsWith(UPSTREAM_PREFIX)) {
    const withoutPrefix = url.slice(UPSTREAM_PREFIX.length);
    const slashIdx = withoutPrefix.indexOf('/');
    const encodedBase = slashIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, slashIdx);
    const remainingPath = slashIdx === -1 ? '' : withoutPrefix.slice(slashIdx);
    const decodedBase = Buffer.from(encodedBase, 'base64url').toString('utf-8');
    return decodedBase + remainingPath;
  }

  return null;
}

export function encodeUpstreamUrl(originalBaseUrl: string): string {
  return UPSTREAM_PREFIX + Buffer.from(originalBaseUrl, 'utf-8').toString('base64url');
}

async function forwardRequest(
  method: string,
  targetUrl: string,
  incomingHeaders: import('node:http').IncomingHttpHeaders,
  body: string | undefined,
  vault: VaultStore,
  res: import('node:http').ServerResponse
): Promise<void> {
  const targetPath = new URL(targetUrl).pathname;
  const aiRequest = body ? isAiGenerationRequest(method, targetPath, body) : false;
  const outgoingBody = aiRequest && body ? redactBody(vault, body) : body;
  const headers = buildForwardHeaders(incomingHeaders);

  const fetchOpts: RequestInit = { method, headers };
  if (outgoingBody && method !== 'GET' && method !== 'HEAD') {
    fetchOpts.body = outgoingBody;
  }

  const upstream = await fetch(targetUrl, fetchOpts);
  const responseText = await upstream.text();
  const finalResponse = aiRequest ? vault.restore(responseText) : responseText;

  res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));
  res.end(finalResponse);
}

export async function startProxy(vault: VaultStore, preferredPort?: number): Promise<ProxyServer> {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      const targetUrl = resolveTargetUrl(req);
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No target URL — use x-target-url header or /_/<base64url>/path');
        return;
      }

      const body =
        req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? await readBody(req) : undefined;

      const method = req.method ?? 'GET';
      await forwardRequest(method, targetUrl, req.headers, body, vault, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end(`Vault proxy error: ${msg}`);
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
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
