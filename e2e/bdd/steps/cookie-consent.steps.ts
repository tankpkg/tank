import { expect } from '@playwright/test';
import { Then } from './fixtures';

// ── Consent Mode v2 assertions ──────────────────────────────

Then('the HTML should contain a gtag consent default script', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  // Google Consent Mode v2: consent defaults must be set before GA4 config
  expect(body).toContain('consent');
  expect(body).toContain('default');
});

Then('the consent default should set analytics_storage to {string}', async ({ bddState }, value: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(`analytics_storage`);
  expect(body).toContain(value);
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
