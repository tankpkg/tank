// Feature: bdd/features/browser/tanstack/skill-detail/skill-detail.feature
// Intent: idd/modules/web-registry/INTENT.md

import { encodeSkillName } from '@internals/helpers';
import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

Given('a public skill has been published', async ({ publishedPublicSkill, bddState }) => {
  bddState.skillName = publishedPublicSkill.name;
});

When('I visit the skill detail page', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  await page.goto(`/skills/${encodeSkillName(bddState.skillName)}`);
  await page.waitForLoadState('networkidle');
});

Then('I see the skill name', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText(bddState.skillName);
});

Then('I see the skill description', async ({ page }) => {
  const root = page.getByTestId('skill-detail-root');
  await expect(root).toBeVisible();
  const description = root.locator('p').first();
  await expect(description).not.toBeEmpty();
});

Then('I see the audit score badge', async ({ page }) => {
  const sidebar = page.locator('aside');
  await expect(sidebar.getByText(/\/10/)).toBeVisible();
});

Then('I see the current version number', async ({ page }) => {
  const root = page.getByTestId('skill-detail-root');
  const versionBadge = root.locator('.font-mono').first();
  await expect(versionBadge).toBeVisible();
});
