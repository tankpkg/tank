// Feature: bdd/features/browser/tanstack/talk-to-skill/talk-to-skill.feature
// Intent: idd/modules/talk-to-skill/INTENT.md

import { encodeSkillName } from '@internals/helpers';
import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

let talkSkillName: string | null = null;
let cachedChatLink: string | null = null;

Given('a public skill exists in the registry', async ({ e2eContext }) => {
  const rows = await e2eContext.sql`
    SELECT s.name FROM skills s
    JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.visibility = 'public'
    ORDER BY sv.created_at DESC
    LIMIT 1
  `;
  if (!rows.length) throw new Error('No public skill found in DB — seed data required');
  talkSkillName = rows[0].name as string;
});

When('I visit the talk skill detail page', async ({ page }) => {
  if (!talkSkillName) throw new Error('No skill name resolved');
  await page.goto(`/skills/${encodeSkillName(talkSkillName)}`);
  await page.waitForLoadState('networkidle');
});

Then('I see the {string} header button', async ({ page }) => {
  await expect(page.getByTestId('talk-button-header')).toBeVisible();
});

Then('I see the floating chat bubble', async ({ page }) => {
  await expect(page.getByTestId('talk-bubble')).toBeVisible();
});

When('I click the {string} header button', async ({ page }) => {
  await expect(page.getByTestId('talk-button-header')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => !!document.getElementById('alice-and-bot-widget-root')?.querySelector('div[dir="ltr"]')?.shadowRoot,
    { timeout: 30_000, polling: 500 }
  );
  await page.getByTestId('talk-button-header').click();
  await page.waitForTimeout(2000);
});

When('I click the floating chat bubble', async ({ page }) => {
  await expect(page.getByTestId('talk-bubble')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('talk-bubble').evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(2000);
});

Then('the alice-and-bot chat widget is rendered on the page', async ({ page }) => {
  const widgetRoot = page.locator('#alice-and-bot-widget-root');
  await expect(widgetRoot).toBeAttached({ timeout: 30_000 });

  await page.waitForFunction(
    () => {
      const root = document.getElementById('alice-and-bot-widget-root');
      const host = root?.querySelector('div[dir="ltr"]');
      const shadow = host?.shadowRoot;
      if (!shadow) return false;
      return !!shadow.querySelector('[data-scrollable="true"]');
    },
    { timeout: 90_000, polling: 1000 }
  );
});

Then('I do not see the display-name dialog', async ({ page }) => {
  await expect(page.getByText('Enter your display name')).not.toBeVisible();
});

When('I close the alice-and-bot chat', async ({ page }) => {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('alice-and-bot-widget-root');
      const host = root?.querySelector('div[dir="ltr"]');
      const shadow = host?.shadowRoot;
      const btn = shadow?.querySelector('button[title="Close chat"]') as HTMLElement | null;
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    },
    { timeout: 10_000 }
  );
  await page.waitForTimeout(2000);
});

Then('the alice-and-bot chat panel is not visible', async ({ page }) => {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('alice-and-bot-widget-root');
      const host = root?.querySelector('div[dir="ltr"]');
      const shadow = host?.shadowRoot;
      return !shadow?.querySelector('[data-scrollable="true"]');
    },
    { timeout: 10_000 }
  );
});

When('I call the talk API for the skill', async ({ e2eContext, bddState }) => {
  if (!talkSkillName) throw new Error('No skill name resolved');
  const encoded = encodeURIComponent(talkSkillName);
  const res = await fetch(`${e2eContext.registry}/api/v1/skills/${encoded}/talk`, { method: 'POST' });
  const body = (await res.json()) as Record<string, unknown>;
  bddState.lastResponseBody = body;
  cachedChatLink = body.chatLink as string;
});

Then('the talk API returns a chat link', async ({ bddState }) => {
  expect(bddState.lastResponseBody?.chatLink).toBeTruthy();
  expect(typeof bddState.lastResponseBody?.chatLink).toBe('string');
});

Then('the talk API returns a bot public key', async ({ bddState }) => {
  expect(bddState.lastResponseBody?.botPublicKey).toBeTruthy();
  expect(typeof bddState.lastResponseBody?.botPublicKey).toBe('string');
});

Given('I have already called the talk API for the skill', async ({ e2eContext }) => {
  if (!talkSkillName) throw new Error('No skill name resolved');
  const encoded = encodeURIComponent(talkSkillName);
  const res = await fetch(`${e2eContext.registry}/api/v1/skills/${encoded}/talk`, { method: 'POST' });
  const body = (await res.json()) as Record<string, unknown>;
  cachedChatLink = body.chatLink as string;
});

When('I call the talk API for the skill again', async ({ e2eContext, bddState }) => {
  if (!talkSkillName) throw new Error('No skill name resolved');
  const encoded = encodeURIComponent(talkSkillName);
  const res = await fetch(`${e2eContext.registry}/api/v1/skills/${encoded}/talk`, { method: 'POST' });
  bddState.lastResponseBody = (await res.json()) as Record<string, unknown>;
});

Then('the talk API returns the same chat link', async ({ bddState }) => {
  expect(bddState.lastResponseBody?.chatLink).toBe(cachedChatLink);
});

Then('the page source does not contain {string}', async ({ page }) => {
  const content = await page.content();
  expect(content).not.toContain('prompt2botSecret');
});

When('the talk API is intercepted to return a 500 error', async ({ page }) => {
  await page.route('**/api/v1/skills/*/talk', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' })
  );
});

When('the talk API is intercepted to return a null bot key', async ({ page }) => {
  await page.route('**/api/v1/skills/*/talk', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ chatLink: 'https://example.com', botPublicKey: null })
    })
  );
});

When('I force-click the floating chat bubble', async ({ page }) => {
  await page.getByTestId('talk-bubble').click({ force: true });
  await page.waitForTimeout(1000);
});

Then('I see the talk error message', async ({ page }) => {
  await expect(page.getByTestId('talk-error')).toBeVisible({ timeout: 5000 });
});

Then('I do not see the talk error message', async ({ page }) => {
  await expect(page.getByTestId('talk-error')).not.toBeVisible();
});

Then('the talk error contains {string}', async ({ page }, text: string) => {
  await expect(page.getByTestId('talk-error')).toContainText(text);
});

When('I dismiss the talk error', async ({ page }) => {
  await page.getByTestId('talk-error-dismiss').click();
});
