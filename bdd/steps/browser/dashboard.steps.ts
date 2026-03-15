// Feature: bdd/features/browser/tanstack/dashboard/dashboard.feature
// Intent: idd/modules/dashboard/INTENT.md

import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

Given('I am logged in', async ({ page, e2eContext }) => {
  const sessionId = `e2e-session-${e2eContext.runId}`;
  const sessionToken = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await e2eContext.sql`
    INSERT INTO "session" (id, token, expires_at, created_at, updated_at, user_id)
    VALUES (${sessionId}, ${sessionToken}, ${expiresAt}, ${now}, ${now}, ${e2eContext.user.id})
  `;

  const baseUrl = e2eContext.registry.replace(/\/$/, '');
  const domain = new URL(baseUrl).hostname;

  await page.context().addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionToken,
      domain,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(expiresAt.getTime() / 1000)
    }
  ]);
});

When('I visit the dashboard page', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

When('I create a new API token', async ({ page }) => {
  const tokenName = `bdd-test-${Date.now()}`;
  await page.getByLabel('Name').fill(tokenName);
  await page.getByRole('button', { name: /create token/i }).click();
  await page.waitForLoadState('networkidle');
});

Then('I see a list of my API tokens', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /active tokens/i })).toBeVisible();
});

Then('I see the new token value displayed once', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /token created/i })).toBeVisible();
  await expect(page.getByText(/copy this key now/i)).toBeVisible();
});
