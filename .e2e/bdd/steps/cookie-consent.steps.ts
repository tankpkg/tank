import { expect } from '@playwright/test';

import { Then, test } from './fixtures';

function requireGaId(): string {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  test(!gaId, 'GA4 is not configured for the current test environment');
  return gaId ?? '';
}

// ── Consent Mode v2 assertions ──────────────────────────────

Then('the HTML should contain a gtag consent default script', async ({ bddState }) => {
  requireGaId();
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toMatch(/gtag\(['"]consent['"],['"]default['"]/);
});

Then('the consent default should set analytics_storage to {string}', async ({ bddState }, value: string) => {
  requireGaId();
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toMatch(new RegExp(`analytics_storage['"]?\\s*:\\s*['"]${value}['"]`));
});

// ── Cookie consent banner ───────────────────────────────────

Then('the HTML should contain the cookie consent component marker', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  // The CookieConsentManager component renders with a data-testid marker
  expect(body).toContain('data-testid="cookie-consent-manager"');
});

// ── PostHog ─────────────────────────────────────────────────

Then('the HTML should contain PostHog initialization script', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  // PostHog is initialized via instrumentation-client.ts which is bundled
  // into the client JS. We verify the marker meta tag is present.
  expect(body).toContain('data-analytics="posthog"');
});

// ── Footer cookie settings ──────────────────────────────────

Then('the footer should contain a cookie preferences button', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="cookie-preferences-btn"');
});
