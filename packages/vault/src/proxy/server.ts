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

export interface ProxyConfig {
  upstreams?: Record<string, string>;
}

const DEFAULT_UPSTREAMS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com'
};

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

function detectUpstream(req: import('node:http').IncomingMessage, upstreams: Record<string, string>): string | null {
  if (req.headers['x-api-key']) return upstreams.anthropic ?? DEFAULT_UPSTREAMS.anthropic!;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return upstreams.openai ?? DEFAULT_UPSTREAMS.openai!;
  return upstreams.anthropic ?? upstreams.openai ?? null;
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
  const responseHeaders = buildResponseHeaders(upstream.headers);

  res.writeHead(upstream.status, responseHeaders);
  res.end(finalResponse);
}

export async function startProxy(
  vault: VaultStore,
  preferredPort?: number,
  config?: ProxyConfig
): Promise<ProxyServer> {
  const upstreams = { ...DEFAULT_UPSTREAMS, ...(config?.upstreams ?? {}) };
  const envAnthropicUpstream = process.env.TANK_VAULT_UPSTREAM_ANTHROPIC;
  const envOpenaiUpstream = process.env.TANK_VAULT_UPSTREAM_OPENAI;
  if (envAnthropicUpstream) upstreams.anthropic = envAnthropicUpstream;
  if (envOpenaiUpstream) upstreams.openai = envOpenaiUpstream;

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      const explicitTarget = req.headers['x-target-url'];
      if (explicitTarget && !Array.isArray(explicitTarget)) {
        const body =
          req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? await readBody(req) : undefined;
        await forwardRequest(req.method!, explicitTarget, req.headers, body, vault, res);
        return;
      }

      const upstreamBase = detectUpstream(req, upstreams);
      if (upstreamBase) {
        const targetUrl = upstreamBase + (req.url ?? '/');
        const body =
          req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? await readBody(req) : undefined;
        await forwardRequest(req.method!, targetUrl, req.headers, body, vault, res);
        return;
      }

      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('No upstream configured');
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
