import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

When('I open the homepage on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

When('I open the homepage on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

Then('the desktop navigation should be visible', async ({ page }) => {
  await expect(page.getByTestId('desktop-nav')).toBeVisible();
});

Then('the desktop navigation should be hidden', async ({ page }) => {
  await expect(page.getByTestId('desktop-nav')).toBeHidden();
});

Then('the mobile menu toggle should be visible', async ({ page }) => {
  await expect(page.getByTestId('mobile-menu-toggle')).toBeVisible();
});

Then('the mobile menu toggle should be hidden', async ({ page }) => {
  await expect(page.getByTestId('mobile-menu-toggle')).toBeHidden();
});

Then('the search trigger should be visible', async ({ page }) => {
  await expect(page.getByTestId('search-trigger')).toBeVisible();
});

Then('the search trigger should be hidden', async ({ page }) => {
  await expect(page.getByTestId('search-trigger')).toBeHidden();
});
