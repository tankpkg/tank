import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAiGenerationRequest } from '../proxy/interceptor.ts';
import { type ProxyServer, startProxy } from '../proxy/server.ts';
import { VaultStore } from '../tokenizer/vault.ts';

const REAL_STRIPE_KEY = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
const REAL_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

function startMockProvider(): Promise<{
  server: Server;
  port: number;
  requests: Array<{ body: string; headers: Record<string, string | undefined> }>;
}> {
  return new Promise((resolve) => {
    const requests: Array<{ body: string; headers: Record<string, string | undefined> }> = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        requests.push({ body, headers: req.headers as Record<string, string | undefined> });
        const responseBody = JSON.stringify({
          choices: [{ message: { content: `Use key ${body.includes('stripe') ? 'STRIPE_PLACEHOLDER' : 'some code'}` } }]
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseBody);
      });
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port, requests });
    });
  });
}

describe('isAiGenerationRequest()', () => {
  it('detects OpenAI-style chat completions', () => {
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(isAiGenerationRequest('POST', '/v1/chat/completions', body)).toBe(true);
  });

  it('detects Anthropic-style messages API', () => {
    const body = JSON.stringify({
      model: 'claude-opus-4-6',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(isAiGenerationRequest('POST', '/v1/messages', body)).toBe(true);
  });

  it('detects request with messages array in body regardless of path', () => {
    const body = JSON.stringify({
      model: 'llama-3',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(isAiGenerationRequest('POST', '/api/generate', body)).toBe(true);
  });

  it('rejects GET requests', () => {
    expect(isAiGenerationRequest('GET', '/v1/chat/completions', '')).toBe(false);
  });

  it('rejects POST without messages array', () => {
    const body = JSON.stringify({ query: 'SELECT * FROM users' });
    expect(isAiGenerationRequest('POST', '/api/data', body)).toBe(false);
  });

  it('rejects non-JSON bodies', () => {
    expect(isAiGenerationRequest('POST', '/v1/chat/completions', 'plain text')).toBe(false);
  });

  it('rejects empty body', () => {
    expect(isAiGenerationRequest('POST', '/v1/chat/completions', '')).toBe(false);
  });
});

describe('proxy server — real HTTP', () => {
  let mockProvider: Awaited<ReturnType<typeof startMockProvider>>;
  let proxy: ProxyServer;
  let vault: VaultStore;

  beforeAll(async () => {
    mockProvider = await startMockProvider();
    vault = new VaultStore();
    proxy = await startProxy(vault);
  });

  afterAll(async () => {
    await proxy.close();
    mockProvider.server.close();
  });

  it('proxy starts and is reachable', async () => {
    const res = await fetch(`${proxy.url}/health`);
    expect(res.status).toBe(200);
  });

  it('redacts credentials in outgoing AI request body', async () => {
    const message = `Call Stripe with ${REAL_STRIPE_KEY}`;
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }]
    });

    const res = await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${mockProvider.port}/v1/chat/completions`
      },
      body
    });

    expect(res.status).toBe(200);
    const lastReq = mockProvider.requests[mockProvider.requests.length - 1] ?? { body: '', headers: {} };
    expect(lastReq.body).not.toContain(REAL_STRIPE_KEY);

    const forwarded = JSON.parse(lastReq.body);
    const fwdContent = forwarded.messages[0].content as string;
    expect(fwdContent).toContain('sk_live_');
    expect(fwdContent).not.toContain(REAL_STRIPE_KEY);
  });

  it('redacts multiple credentials in one request', async () => {
    const message = `Use ${REAL_STRIPE_KEY} and ${REAL_AWS_KEY}`;
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }]
    });

    await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${mockProvider.port}/v1/chat/completions`
      },
      body
    });

    const lastReq = mockProvider.requests[mockProvider.requests.length - 1] ?? { body: '', headers: {} };
    expect(lastReq.body).not.toContain(REAL_STRIPE_KEY);
    expect(lastReq.body).not.toContain(REAL_AWS_KEY);
  });

  it('passes through non-AI requests unmodified', async () => {
    const body = JSON.stringify({ query: 'SELECT 1' });

    await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${mockProvider.port}/api/data`
      },
      body
    });

    const lastReq = mockProvider.requests[mockProvider.requests.length - 1] ?? { body: '', headers: {} };
    expect(lastReq.body).toBe(body);
  });

  it('restores fake credentials in response', async () => {
    vault.store(REAL_STRIPE_KEY, 'sk_live_FAKEFORTEST00000000000', 'stripe_secret');

    // biome-ignore lint/correctness/noUnusedVariables: kept for clarity
    const _providerPort = mockProvider.port;
    const responseServer = createServer((req, res) => {
      let reqBody = '';
      req.on('data', (c: Buffer) => {
        reqBody += c.toString();
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [
              { message: { content: `curl -H "Bearer sk_live_FAKEFORTEST00000000000" https://api.stripe.com` } }
            ]
          })
        );
      });
    });

    await new Promise<void>((resolve) => responseServer.listen(0, resolve));
    const respAddr = responseServer.address();
    const respPort = typeof respAddr === 'object' && respAddr ? respAddr.port : 0;

    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'help me with stripe' }]
    });

    const res = await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${respPort}/v1/chat/completions`
      },
      body
    });

    const resBody = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(resBody.choices[0]?.message.content).toContain(REAL_STRIPE_KEY);
    expect(resBody.choices[0]?.message.content).not.toContain('sk_live_FAKEFORTEST00000000000');

    responseServer.close();
  });

  it('message without credentials passes through unmodified', async () => {
    const message = 'What is the weather in San Francisco?';
    const body = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }]
    });

    await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${mockProvider.port}/v1/chat/completions`
      },
      body
    });

    const lastReq = mockProvider.requests[mockProvider.requests.length - 1] ?? { body: '', headers: {} };
    const forwarded = JSON.parse(lastReq.body);
    expect(forwarded.messages[0].content).toBe(message);
  });

  it('same credential uses same fake across requests (session consistency)', async () => {
    const newVault = new VaultStore();
    const proxy2 = await startProxy(newVault);

    const makeRequest = async () => {
      const body = JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: `Key: ${REAL_STRIPE_KEY}` }]
      });
      await fetch(`${proxy2.url}/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Target-URL': `http://localhost:${mockProvider.port}/v1/chat/completions`
        },
        body
      });
    };

    const beforeCount = mockProvider.requests.length;
    await makeRequest();
    await makeRequest();
    const req1 = mockProvider.requests[beforeCount] ?? { body: '', headers: {} };
    const req2 = mockProvider.requests[beforeCount + 1] ?? { body: '', headers: {} };

    const msg1 = JSON.parse(req1.body).messages[0].content as string;
    const msg2 = JSON.parse(req2.body).messages[0].content as string;
    const fake1 = msg1.replace('Key: ', '');
    const fake2 = msg2.replace('Key: ', '');
    expect(fake1).toBe(fake2);

    await proxy2.close();
  });
});
