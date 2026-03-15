// Feature: bdd/features/browser/tanstack/login/login.feature
// Intent: idd/modules/login/INTENT.md

import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

When('I visit the login page', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
});

When('I visit the dashboard page without being authenticated', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Then('I see an email input field', async ({ page }) => {
  await expect(page.getByLabel('Email')).toBeVisible();
});

Then('I see a password input field', async ({ page }) => {
  await expect(page.getByLabel('Password')).toBeVisible();
});

Then('I see a GitHub sign-in option', async ({ page }) => {
  await expect(page.getByRole('button', { name: /sign in with github/i })).toBeVisible();
});

Then('I am redirected to the login page', async ({ page }) => {
  await expect(page).toHaveURL(/\/login/);
});
