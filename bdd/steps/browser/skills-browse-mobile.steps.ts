import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

When('I open the skills browse page on a mobile viewport', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

When('I open the skills browse page on a desktop viewport', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

When('I open the skills browse page on a mobile viewport with score=high', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/skills?score=high');
  await page.waitForLoadState('networkidle');
});

Then('the mobile filter bar should be visible', async ({ page }) => {
  await expect(page.getByTestId('mobile-filter-bar')).toBeVisible();
});

Then('the mobile filter bar should be hidden', async ({ page }) => {
  await expect(page.getByTestId('mobile-filter-bar')).toBeHidden();
});

Then('the desktop filter sidebar should be visible', async ({ page }) => {
  await expect(page.getByTestId('desktop-filter-sidebar')).toBeVisible();
});

Then('the desktop filter sidebar should be hidden', async ({ page }) => {
  await expect(page.getByTestId('desktop-filter-sidebar')).toBeHidden();
});

Then('the skills grid should be visible', async ({ page }) => {
  await expect(page.getByTestId('skills-grid').or(page.getByTestId('skills-count'))).toBeVisible();
});

Then('the mobile filter bar should contain a {string} filter', async ({ page }, filterName: string) => {
  const bar = page.getByTestId('mobile-filter-bar');
  await expect(bar.getByTestId(`mobile-filter-${filterName.toLowerCase()}`)).toBeVisible();
});

When('I select {string} from the {string} mobile filter', async ({ page }, value: string, filterName: string) => {
  const trigger = page.getByTestId(`mobile-filter-${filterName.toLowerCase()}`);
  await trigger.click();
  await page.getByRole('option', { name: value }).click();
});

Then('the URL should contain {string}', async ({ page }, param: string) => {
  expect(page.url()).toContain(param);
});

Then('the {string} mobile filter should show {string}', async ({ page }, filterName: string, value: string) => {
  const trigger = page.getByTestId(`mobile-filter-${filterName.toLowerCase()}`);
  await expect(trigger).toContainText(value);
});

Then('the mobile filter bar should have horizontal scroll', async ({ page }) => {
  const bar = page.getByTestId('mobile-filter-bar');
  const overflow = await bar.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflow).toBe('auto');
});

Then('the page should not have horizontal overflow', async ({ page }) => {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
});
