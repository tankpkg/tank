import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeUpstreamUrl, type ProxyServer, startProxy } from '../proxy/server.ts';
import { VaultStore } from '../tokenizer/vault.ts';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAS_API_KEY = !!ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.length > 10;

describe.skipIf(!HAS_API_KEY)('real API proxy — Anthropic', () => {
  let proxy: ProxyServer;
  let vault: VaultStore;
  let anthropicBase: string;

  beforeAll(async () => {
    vault = new VaultStore();
    proxy = await startProxy(vault);
    anthropicBase = proxy.url + encodeUpstreamUrl('https://api.anthropic.com/v1');
  });

  afterAll(async () => {
    await proxy.close();
  });

  it('forwards POST /messages to Anthropic and gets 200 response', async () => {
    const res = await fetch(`${anthropicBase}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'say hi' }]
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; content: Array<{ text: string }> };
    expect(body.type).toBe('message');
    expect(body.content[0]!.text.length).toBeGreaterThan(0);
  });

  it('detects credential in message and stores it in vault', async () => {
    const TEST_STRIPE = 'sk_live_TestRedactionKey1234567';
    const vaultBefore = vault.size;

    const res = await fetch(`${anthropicBase}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: `Process payment with ${TEST_STRIPE}`
          }
        ]
      })
    });

    expect(res.status).toBe(200);
    expect(vault.size).toBeGreaterThan(vaultBefore);

    const fake = vault.lookupReal(TEST_STRIPE);
    expect(fake).not.toBeNull();
    expect(fake).not.toBe(TEST_STRIPE);
    expect(fake!.startsWith('sk_live_')).toBe(true);
    expect(fake).toHaveLength(TEST_STRIPE.length);
  });

  it('does not strip the Anthropic API key from auth header (provider own key)', async () => {
    const res = await fetch(`${anthropicBase}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      })
    });

    expect(res.status).toBe(200);
  });
});
