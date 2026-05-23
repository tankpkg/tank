// Feature: bdd/features/browser/tanstack/skills/conversion-skills.feature
// Intent: idd/modules/conversion-skills-list/INTENT.md

import { encodeSkillName } from '@internals/helpers';
import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

// ── Value proposition banner ──────────────────────────────────────────

When('I visit the skills page with a clean localStorage', async ({ page }) => {
  await page.goto('/skills');
  await page.evaluate(() => localStorage.removeItem('tank-value-banner-dismissed'));
  await page.reload();
  await page.waitForLoadState('networkidle');
});

When('I revisit the skills page', async ({ page }) => {
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

Then('I see a banner explaining Tank\'s security value', async ({ page }) => {
  const banner = page.getByTestId('value-banner');
  await expect(banner).toBeVisible();
});

Then('the banner contains a link to learn more', async ({ page }) => {
  const banner = page.getByTestId('value-banner');
  const link = banner.locator('a');
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('/docs');
});

When('I dismiss the value proposition banner', async ({ page }) => {
  const dismissBtn = page.getByTestId('value-banner-dismiss');
  await dismissBtn.click();
});

Then('the banner is no longer visible', async ({ page }) => {
  await expect(page.getByTestId('value-banner')).not.toBeVisible();
});

Then('the banner is not shown', async ({ page }) => {
  await expect(page.getByTestId('value-banner')).not.toBeVisible();
});

// ── Getting started sidebar ──────────────────────────────────────────

When('I visit the skills page on desktop', async ({ page }) => {
  // Desktop: set viewport wide enough for sidebar to render
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

When('I visit the skills page on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

Then('I see a getting-started card in the sidebar', async ({ page }) => {
  const card = page.getByTestId('getting-started-card');
  await expect(card).toBeVisible();
});

Then('the card shows CLI install instructions', async ({ page }) => {
  const card = page.getByTestId('getting-started-card');
  await expect(card.locator('code')).toContainText('tank');
});

Then('the getting-started card is not visible', async ({ page }) => {
  await expect(page.getByTestId('getting-started-card')).not.toBeVisible();
});

// ── Skill card install snippets ──────────────────────────────────────

Then('each published skill card shows a copyable install command', async ({ page, bddState }) => {
  const cards = page.getByTestId('skill-card');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  const firstCard = cards.first();
  await expect(firstCard.getByTestId('skill-card-install-snippet')).toBeVisible();
});

Then('the install command starts with {string}', async ({ page }, prefix: string) => {
  const cards = page.getByTestId('skill-card');
  const firstSnippet = cards.first().getByTestId('skill-card-install-snippet');
  await expect(firstSnippet.locator('code')).toContainText(prefix);
});

When('I click the copy button on a skill card', async ({ page }) => {
  const cards = page.getByTestId('skill-card');
  const snippet = cards.first().getByTestId('skill-card-install-snippet');
  const copyBtn = snippet.getByRole('button');
  await copyBtn.click();
});

Then('the install command is copied', async ({ page }) => {
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('tank install');
});

Then('I remain on the skills page', async ({ page }) => {
  expect(page.url()).toContain('/skills');
});
