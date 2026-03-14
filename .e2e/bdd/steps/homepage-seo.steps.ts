import { expect } from '@playwright/test';

import { Then, test, When } from './fixtures';

// ── Shared state for HTTP responses ──────────────────────────

When('I fetch {string}', async ({ bddState, e2eContext }, path: string) => {
  const url = `${e2eContext.registry}${path}`;
  const response = await fetch(url);
  bddState.lastResponse = response;
  bddState.lastResponseBody = { _text: await response.text() } as Record<string, unknown>;
});

When('I fetch the homepage HTML', async ({ bddState, e2eContext }) => {
  const response = await fetch(e2eContext.registry);
  bddState.lastResponse = response;
  bddState.lastResponseBody = { _text: await response.text() } as Record<string, unknown>;
});

// ── Response status ──────────────────────────────────────────

Then('the response status should be {int}', async ({ bddState }, status: number) => {
  expect(bddState.lastResponse).toBeDefined();
  expect(bddState.lastResponse?.status).toBe(status);
});

// ── Text body assertions ─────────────────────────────────────

Then('the response body should contain {string}', async ({ bddState }, text: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(text);
});

Then('the HTML should contain {string}', async ({ bddState }, text: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(text);
});

Then('the HTML should not contain {string}', async ({ bddState }, text: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).not.toContain(text);
});

// ── Meta tags ────────────────────────────────────────────────

Then('the HTML should contain meta property {string}', async ({ bddState }, property: string) => {
  const body = bddState.lastResponseBody?._text as string;
  const pattern = `property="${property}"`;
  expect(body).toContain(pattern);
});

Then('the HTML should contain a meta description', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('name="description"');
});

Then('the HTML should contain a canonical link to {string}', async ({ bddState }, url: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(`rel="canonical" href="${url}"`);
});

// ── JSON-LD structured data ─────────────────────────────────

Then('the HTML should contain JSON-LD structured data', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('application/ld+json');
});

Then('the JSON-LD should include a type {string}', async ({ bddState }, typeName: string) => {
  const body = bddState.lastResponseBody?._text as string;
  const inlineJsonLdMatch = body.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (inlineJsonLdMatch?.[1]) {
    const jsonLd = JSON.parse(inlineJsonLdMatch[1]);
    const types: string[] = [];
    if (Array.isArray(jsonLd['@graph'])) {
      for (const item of jsonLd['@graph']) {
        types.push(item['@type']);
      }
    } else if (jsonLd['@type']) {
      types.push(jsonLd['@type']);
    }
    expect(types).toContain(typeName);
    return;
  }

  // Next.js streaming can serialize JSON-LD into the flight payload instead of a literal script tag.
  expect(body).toMatch(new RegExp(`(?:"|\\\\")@type(?:"|\\\\")\\s*:\\s*(?:"|\\\\")${typeName}(?:"|\\\\")`));
});

// ── CTA assertions ──────────────────────────────────────────

Then('the primary CTA should link to {string}', async ({ bddState }, href: string) => {
  const body = bddState.lastResponseBody?._text as string;
  const pattern = `data-testid="home-primary-cta"`;
  expect(body).toContain(pattern);
  // Extract the anchor tag with the testid and verify href
  const ctaMatch = body.match(/data-testid="home-primary-cta"[^>]*href="([^"]*)"/);
  expect(ctaMatch).toBeTruthy();
  expect(ctaMatch?.[1]).toBe(href);
});

Then('the secondary CTA should link to {string}', async ({ bddState }, href: string) => {
  const body = bddState.lastResponseBody?._text as string;
  const pattern = `data-testid="home-secondary-cta"`;
  expect(body).toContain(pattern);
  const ctaMatch = body.match(/data-testid="home-secondary-cta"[^>]*href="([^"]*)"/);
  expect(ctaMatch).toBeTruthy();
  expect(ctaMatch?.[1]).toBe(href);
});

// ── GA4 analytics ───────────────────────────────────────────

Then('the HTML should include a Google Analytics script', async ({ bddState }) => {
  test(!process.env.NEXT_PUBLIC_GA_ID, 'GA4 is not configured for the current test environment');
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('googletagmanager.com/gtag/js');
});

Then('the GA4 tracking ID should be {string}', async ({ bddState }, trackingId: string) => {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  test(!gaId, 'GA4 is not configured for the current test environment');
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(`id=${gaId ?? trackingId}`);
});
