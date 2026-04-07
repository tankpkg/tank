import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ProxyServer, startProxy } from '../proxy/server.ts';
import { VaultStore } from '../tokenizer/vault.ts';

const REAL_STRIPE = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
const REAL_AWS = 'AKIAIOSFODNN7EXAMPLE';

function createEchoProvider() {
  const log: string[] = [];
  return {
    log,
    start: () =>
      new Promise<{ port: number; server: ReturnType<typeof createServer> }>((resolve) => {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
          let body = '';
          req.on('data', (c: Buffer) => {
            body += c.toString();
          });
          req.on('end', () => {
            log.push(body);
            const parsed = JSON.parse(body);
            const userMsg = parsed.messages?.[parsed.messages.length - 1]?.content ?? '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: `Here is the code:\nstripe.api_key = "${userMsg.match(/sk_live_\w+/)?.[0] ?? 'none'}"\nclient = boto3.client('lambda', aws_access_key_id='${userMsg.match(/AKIA\w+/)?.[0] ?? 'none'}')`
                    }
                  }
                ]
              })
            );
          });
        });
        server.listen(0, () => {
          const addr = server.address();
          resolve({ port: typeof addr === 'object' && addr ? addr.port : 0, server });
        });
      })
  };
}

describe('full E2E — credential vault lifecycle', () => {
  let provider: Awaited<ReturnType<ReturnType<typeof createEchoProvider>['start']>>;
  let providerLog: string[];
  let proxy: ProxyServer;
  let vault: VaultStore;

  beforeAll(async () => {
    const echo = createEchoProvider();
    providerLog = echo.log;
    provider = await echo.start();
    vault = new VaultStore();
    proxy = await startProxy(vault);
  });

  afterAll(async () => {
    await proxy.close();
    provider.server.close();
  });

  function sendChat(message: string) {
    return fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${provider.port}/v1/chat/completions`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: message }]
      })
    });
  }

  it('complete lifecycle: discover → redact → restore → verify isolation → session consistency', async () => {
    // Phase 1: vault starts empty
    expect(vault.size).toBe(0);

    // Phase 2: first request — credentials discovered from traffic
    const res1 = await sendChat(`Deploy with Stripe key ${REAL_STRIPE} and AWS key ${REAL_AWS}`);
    expect(res1.status).toBe(200);

    // Vault now has 2 mappings (discovered from traffic)
    expect(vault.size).toBe(2);

    // Phase 3: verify provider NEVER saw real credentials
    const providerBody1 = providerLog[providerLog.length - 1];
    expect(providerBody1).not.toContain(REAL_STRIPE);
    expect(providerBody1).not.toContain(REAL_AWS);

    // Provider saw fakes that preserve format
    const parsed1 = JSON.parse(providerBody1);
    const fwdMsg = parsed1.messages[0].content as string;
    const stripeMatch = fwdMsg.match(/sk_live_\w+/);
    const awsMatch = fwdMsg.match(/AKIA\w+/);
    expect(stripeMatch).not.toBeNull();
    expect(awsMatch).not.toBeNull();
    expect(stripeMatch![0]).not.toBe(REAL_STRIPE);
    expect(awsMatch![0]).not.toBe(REAL_AWS);
    expect(stripeMatch![0]).toHaveLength(REAL_STRIPE.length);
    expect(awsMatch![0]).toHaveLength(REAL_AWS.length);

    const stripeFake = stripeMatch![0]!;
    const awsFake = awsMatch![0]!;

    // Phase 4: response has fakes restored to real values
    const resBody1 = (await res1.json()) as { choices: Array<{ message: { content: string } }> };
    const responseContent = resBody1.choices[0]!.message.content;
    expect(responseContent).toContain(REAL_STRIPE);
    expect(responseContent).toContain(REAL_AWS);
    expect(responseContent).not.toContain(stripeFake);
    expect(responseContent).not.toContain(awsFake);

    // Phase 5: second request — same credentials reuse same fakes
    const res2 = await sendChat(`Use ${REAL_STRIPE} for the refund endpoint`);
    const providerBody2 = providerLog[providerLog.length - 1]!;
    expect(providerBody2).not.toContain(REAL_STRIPE);
    const parsed2 = JSON.parse(providerBody2);
    const fwdMsg2 = parsed2.messages[0].content as string;
    const stripeMatch2 = fwdMsg2.match(/sk_live_\w+/);
    expect(stripeMatch2![0]).toBe(stripeFake);
  });

  it('non-AI traffic passes through completely unmodified', async () => {
    const sqlBody = JSON.stringify({ query: 'SELECT * FROM users' });
    const beforeCount = providerLog.length;

    await fetch(`${proxy.url}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-URL': `http://localhost:${provider.port}/api/data`
      },
      body: sqlBody
    });

    expect(providerLog[beforeCount]).toBe(sqlBody);
  });

  it('vault is cleared on session end', () => {
    expect(vault.size).toBeGreaterThan(0);
    vault.clear();
    expect(vault.size).toBe(0);
    expect(vault.lookupReal(REAL_STRIPE)).toBeNull();
  });
});
