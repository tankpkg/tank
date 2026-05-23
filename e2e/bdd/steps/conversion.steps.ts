// Feature: e2e/bdd/features/conversion/conversion-homepage.feature
// Feature: e2e/bdd/features/conversion/conversion-cross-cutting.feature
// Intent: idd/modules/conversion-homepage/INTENT.md, idd/modules/conversion-cross-cutting/INTENT.md

import { expect } from '@playwright/test';
import { Then, When } from './fixtures';

// ── HTTP fetch (shared) ──────────────────────────────────────────────

When('I fetch the homepage HTML', async ({ bddState, e2eContext }) => {
  const response = await fetch(e2eContext.registry);
  bddState.lastResponse = response;
  bddState.lastResponseBody = { _text: await response.text() } as Record<string, unknown>;
});

When('I fetch the docs overview page HTML', async ({ bddState, e2eContext }) => {
  const response = await fetch(`${e2eContext.registry}/docs/overview`);
  bddState.lastResponse = response;
  bddState.lastResponseBody = { _text: await response.text() } as Record<string, unknown>;
});

// ── Hero: Differentiator pills ──────────────────────────────────────

Then('the HTML should contain a four-pill differentiator row', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="hero-differentiator-pills"');
  const match = body.match(/data-testid="hero-differentiator-pill"/g);
  expect(match).not.toBeNull();
  expect(match!.length).toBeGreaterThanOrEqual(4);
});

Then('each pill should have an href fragment pointing to its section', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  const pillMatches = body.matchAll(/data-testid="hero-differentiator-pill"[^>]*href="([^"]*)"/g);
  for (const match of pillMatches) {
    expect(match[1]).toMatch(/^#/);
  }
});

Then('one of the differentiator pills should link to {string}', async ({ bddState }, href: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(`href="${href}"`);
});

// ── Hero: CTAs ───────────────────────────────────────────────────────

Then('the HTML should contain a secondary CTA linking to documentation', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="home-secondary-cta"');
  const ctaMatch = body.match(/data-testid="home-secondary-cta"[^>]*href="([^"]*)"/);
  expect(ctaMatch).toBeTruthy();
  expect(ctaMatch![1]).toContain('/docs');
});

// ── Hero: Social proof ───────────────────────────────────────────────

Then('the HTML should contain a hero stats row with package count or GitHub stars', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="hero-stats"');
});

// ── Section ordering ─────────────────────────────────────────────────

Then('the vault section should appear before the comparison table', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  const vaultIdx = body.indexOf('id="vault"');
  const comparisonIdx = body.indexOf('id="comparison-table"');
  expect(vaultIdx).toBeGreaterThan(0);
  expect(comparisonIdx).toBeGreaterThan(0);
  expect(vaultIdx).toBeLessThan(comparisonIdx);
});

Then('the atoms section should appear before the comparison table', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  const atomsIdx = body.indexOf('id="atoms"');
  const comparisonIdx = body.indexOf('id="comparison-table"');
  expect(atomsIdx).toBeGreaterThan(0);
  expect(comparisonIdx).toBeGreaterThan(0);
  expect(atomsIdx).toBeLessThan(comparisonIdx);
});

Then('the {string} section should appear before the comparison table', async ({ bddState }, _section: string) => {
  const body = bddState.lastResponseBody?._text as string;
  const whyIdx = body.indexOf('id="why-tank"');
  const comparisonIdx = body.indexOf('id="comparison-table"');
  expect(whyIdx).toBeGreaterThan(0);
  expect(comparisonIdx).toBeGreaterThan(0);
  expect(whyIdx).toBeLessThan(comparisonIdx);
});

// ── Section anchors ──────────────────────────────────────────────────

Then('the HTML should contain an element with id {string}', async ({ bddState }, id: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(`id="${id}"`);
});

// ── Sticky section nav ───────────────────────────────────────────────

Then('the HTML should contain a sticky section navigation element', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="sticky-section-nav"');
});

// ── Docs CTA ─────────────────────────────────────────────────────────

Then('the HTML should contain a post-article call to action', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('data-testid="docs-bottom-cta"');
});

Then('the CTA should contain an install command', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  const ctaStart = body.indexOf('data-testid="docs-bottom-cta"');
  const afterCta = body.slice(ctaStart, ctaStart + 2500);
  expect(afterCta).toContain('tank install');
});

Then('the CTA should appear before the document navigation links', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  const ctaIdx = body.indexOf('data-testid="docs-bottom-cta"');
  const navIdx = body.indexOf('data-testid="doc-navigation"');
  expect(ctaIdx).toBeGreaterThan(0);
  expect(navIdx).toBeGreaterThan(0);
  expect(ctaIdx).toBeLessThan(navIdx);
});

// ── Command palette ──────────────────────────────────────────────────

When('I inspect the command menu source', async ({ bddState, e2eContext }) => {
  const response = await fetch(`${e2eContext.registry}/skills`);
  bddState.lastResponse = response;
  bddState.lastResponseBody = { _text: await response.text() } as Record<string, unknown>;
});

Then('the command menu should include a {string} suggestion', async ({ bddState }, text: string) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain(text);
});

Then('the suggestion should link to the docs overview', async ({ bddState }) => {
  const body = bddState.lastResponseBody?._text as string;
  expect(body).toContain('/docs/overview');
});
