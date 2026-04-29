import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { SdkLikeTransport } from './remote-upstream.ts';

export function createSdkStreamableTransport(url: URL, headers?: Record<string, string>): SdkLikeTransport {
  const opts: Record<string, unknown> = {};
  if (headers && Object.keys(headers).length > 0) {
    opts.requestInit = { headers };
  }
  const transport = new StreamableHTTPClientTransport(url, opts);
  return transport as unknown as SdkLikeTransport;
}

export function createSdkSseTransport(url: URL, headers?: Record<string, string>): SdkLikeTransport {
  const opts: Record<string, unknown> = {};
  if (headers && Object.keys(headers).length > 0) {
    opts.requestInit = { headers };
    opts.eventSourceInit = {
      fetch: (input: string | URL | Request, init?: RequestInit) => {
        const existing = (init?.headers as Record<string, string> | undefined) ?? {};
        const merged = { ...existing, ...headers };
        return fetch(input, { ...init, headers: merged });
      }
    };
  }
  const transport = new SSEClientTransport(url, opts);
  return transport as unknown as SdkLikeTransport;
}
