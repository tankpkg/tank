import { encodeSkillName } from '@internals/helpers';
import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

When('I visit the skill detail page on a mobile viewport', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.setViewportSize(MOBILE);
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

When('I visit the skill detail page on a desktop viewport', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.setViewportSize(DESKTOP);
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

Then('the mobile action bar should be visible', async ({ page }) => {
  await expect(page.getByTestId('mobile-action-bar')).toBeVisible();
});

Then('the mobile action bar should be hidden', async ({ page }) => {
  await expect(page.getByTestId('mobile-action-bar')).toBeHidden();
});

Then('the mobile action bar should contain a star button', async ({ page }) => {
  const bar = page.getByTestId('mobile-action-bar');
  await expect(bar.getByRole('button', { name: /star|\d+/i }).first()).toBeVisible();
});

Then('the mobile action bar should contain an install command', async ({ page }) => {
  const bar = page.getByTestId('mobile-action-bar');
  await expect(bar.locator('code')).toContainText('tank install');
});

Then('the desktop sidebar should be visible', async ({ page }) => {
  await expect(page.getByTestId('desktop-sidebar')).toBeVisible();
});

Then('the desktop sidebar should be hidden', async ({ page }) => {
  await expect(page.getByTestId('desktop-sidebar')).toBeHidden();
});

Then('the readme content should be visible', async ({ page }) => {
  await expect(page.getByTestId('readme-root')).toBeVisible();
});

When('I click the {string} tab', async ({ page }, tabName: string) => {
  await page.getByRole('tab', { name: tabName }).click();
});

Then('the file tree toggle button should be visible', async ({ page }) => {
  await expect(page.getByTestId('file-tree-toggle')).toBeVisible();
});

Then('the desktop file tree panel should be hidden', async ({ page }) => {
  await expect(page.getByTestId('desktop-file-tree')).toBeHidden();
});

Then('the file editor area should be visible', async ({ page }) => {
  await expect(page.getByTestId('file-editor-area')).toBeVisible();
});

When('I click the file tree toggle button', async ({ page }) => {
  await page.getByTestId('file-tree-toggle').click();
});

Then('the mobile file tree panel should be visible', async ({ page }) => {
  await expect(page.getByTestId('mobile-file-tree')).toBeVisible();
});

Then('the mobile file tree panel should be hidden', async ({ page }) => {
  await expect(page.getByTestId('mobile-file-tree')).not.toBeVisible();
});

When('I click a file in the mobile tree panel', async ({ page }) => {
  const tree = page.getByTestId('mobile-file-tree');
  await tree.locator('button').first().click();
});

Then('the versions table should be inside a scrollable container', async ({ page }) => {
  const container = page.getByTestId('versions-scroll-container');
  await expect(container).toBeVisible();
  const overflow = await container.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflow).toBe('auto');
});

Given('the skill has more than 6 trigger phrases', async () => {
  // Handled by the published skill fixture — skills created via createSkillFixture
  // have a description with enough trigger phrases. If the seeded skill doesn't have
  // enough triggers, this step is a documentation marker and the scenario will
  // still validate the collapse behavior based on the actual trigger count.
});

Then('I should see at most 6 trigger badges', async ({ page }) => {
  const badges = page.getByTestId('trigger-badge');
  const count = await badges.count();
  expect(count).toBeLessThanOrEqual(6);
});

Then('I should see a show-more button with the remaining count', async ({ page }) => {
  await expect(page.getByTestId('triggers-show-more')).toBeVisible();
});

When('I click the show-more button', async ({ page }) => {
  await page.getByTestId('triggers-show-more').click();
});

Then('all trigger badges should be visible', async ({ page }) => {
  const badges = page.getByTestId('trigger-badge');
  const count = await badges.count();
  expect(count).toBeGreaterThan(6);
});

Then('I should see a show-less button', async ({ page }) => {
  await expect(page.getByTestId('triggers-show-less')).toBeVisible();
});

Then('the skill title should be visible', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

Then('the page should not have horizontal overflow', async ({ page }) => {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
});
