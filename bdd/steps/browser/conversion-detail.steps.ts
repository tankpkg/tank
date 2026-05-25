// Feature: bdd/features/browser/tanstack/skill-detail/conversion-detail.feature
// Intent: idd/modules/conversion-skill-detail/INTENT.md

import { encodeSkillName } from '@internals/helpers';
import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

// ── Desktop install command ──────────────────────────────────────────

When('I visit the skill detail page on desktop', async ({ page, bddState }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

Then('I see a copyable install command in the page header', async ({ page }) => {
  const desktopInstall = page.getByTestId('desktop-install-snippet');
  await expect(desktopInstall).toBeVisible();
  await expect(desktopInstall.locator('code')).toContainText('tank install');
});

When('I click the copy button next to the install command', async ({ page }) => {
  const desktopInstall = page.getByTestId('desktop-install-snippet');
  const copyBtn = desktopInstall.getByRole('button');
  await copyBtn.click();
});

Then('the command is copied to clipboard', async ({ page }) => {
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('tank install');
});

// ── Default security tab ─────────────────────────────────────────────

When('I visit the skill detail page for a scanned skill', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

When('I visit the skill detail page for an unscanned skill', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

Then('the readme tab is active by default', async ({ page }) => {
  const readmeTab = page.getByTestId('tab-readme');
  await expect(readmeTab).toHaveAttribute('data-state', 'active');
});

When('I click {string} in the trust summary', async ({ page }, _label: string) => {
  const trustCard = page.getByTestId('trust-summary-card');
  await trustCard.getByRole('button', { name: /view details/i }).click();
});

Then('the security tab is active', async ({ page }) => {
  const securityTab = page.getByTestId('tab-security');
  await expect(securityTab).toHaveAttribute('data-state', 'active');
});

Then('there is visible spacing between the trust summary and the tabs', async ({ page }) => {
  const trustCard = page.getByTestId('trust-summary-card');
  const trustBox = await trustCard.boundingBox();
  const readmeTab = page.getByTestId('tab-readme');
  const tabBox = await readmeTab.boundingBox();
  if (!trustBox || !tabBox) throw new Error('expected bounding boxes to exist');
  // At least 16px of vertical gap between bottom of trust card and top of tabs
  const gap = tabBox.y - (trustBox.y + trustBox.height);
  expect(gap).toBeGreaterThanOrEqual(16);
});

// ── Trust summary card ───────────────────────────────────────────────

Then('I see a trust summary card above the content tabs', async ({ page }) => {
  const trustCard = page.getByTestId('trust-summary-card');
  await expect(trustCard).toBeVisible();
});

Then('the trust summary shows the scan verdict', async ({ page }) => {
  const trustCard = page.getByTestId('trust-summary-card');
  await expect(trustCard).toBeVisible();
  const text = await trustCard.textContent();
  expect(text).toMatch(/verdict|pass|flagged|unsafe|scan/i);
});

Then('the trust summary card is not shown', async ({ page }) => {
  await expect(page.getByTestId('trust-summary-card')).not.toBeVisible();
});
