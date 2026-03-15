// Feature: bdd/features/browser/tanstack/search/search.feature
// Intent: idd/modules/search/INTENT.md

import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

Given('public skills have been published', async ({ publishedPublicSkill, bddState }) => {
  bddState.skillName = publishedPublicSkill.name;
});

When('I visit the skills page', async ({ page }) => {
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
});

When('I type a skill name in the search bar', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  const searchInput = page.getByTestId('skills-search').getByRole('searchbox');
  await searchInput.fill(bddState.skillName);
  await page.waitForLoadState('networkidle');
});

Then('I see a list of skills', async ({ page }) => {
  const grid = page.getByTestId('skills-grid');
  await expect(grid).toBeVisible();
  const cards = grid.locator(':scope > *');
  await expect(cards.first()).toBeVisible();
});

Then('I see matching skills in the results', async ({ page, bddState }) => {
  if (!bddState.skillName) throw new Error('No skill name set in state');
  const grid = page.getByTestId('skills-grid');
  await expect(grid).toBeVisible();
  await expect(grid.getByText(bddState.skillName)).toBeVisible();
});
