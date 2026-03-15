import { expect, test } from '@playwright/test';

const baseURL = process.env.E2E_REGISTRY_URL ?? 'http://127.0.0.1:3000';

test.describe('homepage responsive header', () => {
  test('shows desktop header controls on large screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('desktop-nav')).toBeVisible();
    await expect(page.getByTestId('search-trigger')).toBeVisible();
    await expect(page.getByTestId('mobile-menu-toggle')).toBeHidden();
  });

  test('shows burger menu instead of desktop controls on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('mobile-menu-toggle')).toBeVisible();
    await expect(page.getByTestId('desktop-nav')).toBeHidden();
    await expect(page.getByTestId('search-trigger')).toBeHidden();
  });
});
