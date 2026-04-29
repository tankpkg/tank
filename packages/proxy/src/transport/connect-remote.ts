import { deriveAuthEnvVarFromUrl } from './remote-transport.ts';
import { remoteUpstreamFromSdkTransport, type SdkLikeTransport } from './remote-upstream.ts';
import type { UpstreamTransport } from './upstream-transport.ts';

export interface TransportFactoryDeps {
  createStreamableTransport(url: URL, headers?: Record<string, string>): SdkLikeTransport;
  createSseTransport(url: URL, headers?: Record<string, string>): SdkLikeTransport;
  isReachable?(url: URL, headers: Record<string, string>): Promise<boolean>;
  createdUrlsView?(): string[];
}

export interface ConnectRemoteOptions {
  url: string;
  requiresAuth: boolean;
  env: Record<string, string | undefined>;
  deps: TransportFactoryDeps;
}

export type ConnectResult =
  | {
      ok: true;
      upstream: UpstreamTransport;
      transportKind: 'streamable' | 'sse';
    }
  | {
      ok: false;
      exitCode: number;
      message: string;
    };

export interface AuthHeadersInput {
  url: string;
  requiresAuth: boolean;
  env: Record<string, string | undefined>;
}

export type AuthHeadersResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; exitCode: 2; message: string };

export function validateAuthHeaders(input: AuthHeadersInput): AuthHeadersResult {
  if (!input.requiresAuth) return { ok: true, headers: {} };
  const varName = deriveAuthEnvVarFromUrl(input.url);
  const value = input.env[varName];
  if (value === undefined || value.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `tank proxy: required auth env var ${varName} not set`
    };
  }
  return { ok: true, headers: { Authorization: `Bearer ${value}` } };
}

function parseHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u;
}

async function tryConnect(sdk: SdkLikeTransport): Promise<boolean> {
  try {
    await sdk.start();
    return true;
  } catch {
    return false;
  }
}

async function isReachable(url: URL, headers: Record<string, string>, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'OPTIONS',
      headers,
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function connectRemote(options: ConnectRemoteOptions): Promise<ConnectResult> {
  const parsed = parseHttpUrl(options.url);
  if (!parsed) {
    const looksLikeScheme = options.url.startsWith('http://') || options.url.startsWith('https://');
    if (!looksLikeScheme && /^[a-z][a-z0-9+\-.]*:/i.test(options.url)) {
      return {
        ok: false,
        exitCode: 1,
        message: `tank proxy: remote URL must be http:// or https:// (got: ${options.url})`
      };
    }
    return {
      ok: false,
      exitCode: 1,
      message: `tank proxy: invalid remote URL: ${options.url}`
    };
  }

  const authResult = validateAuthHeaders({
    url: options.url,
    requiresAuth: options.requiresAuth,
    env: options.env
  });
  if (!authResult.ok) return { ok: false, exitCode: authResult.exitCode, message: authResult.message };

  const reachCheck = options.deps.isReachable ?? isReachable;
  if (!(await reachCheck(parsed, authResult.headers))) {
    return {
      ok: false,
      exitCode: 1,
      message: `tank proxy: remote ${options.url} unreachable (network error or host refused connection)`
    };
  }

  const streamable = options.deps.createStreamableTransport(parsed, authResult.headers);
  if (await tryConnect(streamable)) {
    return {
      ok: true,
      upstream: remoteUpstreamFromSdkTransport(streamable, true),
      transportKind: 'streamable'
    };
  }

  const sse = options.deps.createSseTransport(parsed, authResult.headers);
  if (await tryConnect(sse)) {
    return {
      ok: true,
      upstream: remoteUpstreamFromSdkTransport(sse, true),
      transportKind: 'sse'
    };
  }

  return {
    ok: false,
    exitCode: 1,
    message: `tank proxy: remote ${options.url} unreachable via StreamableHTTP and SSE fallback`
  };
}
