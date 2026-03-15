import { expect } from '@playwright/test';

import { Given, Then, When } from './fixtures';

const SETTLE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

Given('a published skill exists in the registry', async ({ publishedPublicSkill, e2eContext }) => {
  const rows = await e2eContext.sql`
    SELECT id FROM skills WHERE name = ${publishedPublicSkill.name}
  `;
  expect(rows.length).toBe(1);
});

Given('the skill has no prior downloads today', async ({ publishedPublicSkill, e2eContext }) => {
  await e2eContext.sql`
    DELETE FROM skill_download_daily
    WHERE skill_id = (SELECT id FROM skills WHERE name = ${publishedPublicSkill.name})
      AND date = CURRENT_DATE
  `;
});

Given(
  'the skill has {int} recorded downloads for today',
  async ({ publishedPublicSkill, e2eContext }, count: number) => {
    const skillRows = await e2eContext.sql`
    SELECT id FROM skills WHERE name = ${publishedPublicSkill.name}
  `;
    const skillId = skillRows[0]?.id as string;

    await e2eContext.sql`
    DELETE FROM skill_download_daily
    WHERE skill_id = ${skillId} AND date = CURRENT_DATE
  `;
    await e2eContext.sql`
    INSERT INTO skill_download_daily (skill_id, date, count)
    VALUES (${skillId}, CURRENT_DATE, ${count})
  `;
  }
);

When('the version metadata endpoint is fetched', async ({ publishedPublicSkill, e2eContext, bddState }) => {
  const encodedName = encodeURIComponent(publishedPublicSkill.name);
  const url = `${e2eContext.registry}/api/v1/skills/${encodedName}/${publishedPublicSkill.version}`;
  const response = await fetch(url);
  bddState.lastResponse = response;
  bddState.lastResponseBody = asRecord(await response.json());
  await sleep(SETTLE_MS);
});

When(
  'the version metadata endpoint is fetched {int} times',
  async ({ publishedPublicSkill, e2eContext, bddState }, times: number) => {
    const encodedName = encodeURIComponent(publishedPublicSkill.name);
    const url = `${e2eContext.registry}/api/v1/skills/${encodedName}/${publishedPublicSkill.version}`;

    for (let i = 0; i < times; i++) {
      const response = await fetch(url);
      bddState.lastResponse = response;
      bddState.lastResponseBody = asRecord(await response.json());
    }
    await sleep(SETTLE_MS);
  }
);

Then(
  'the daily download count for today should be {int}',
  async ({ publishedPublicSkill, e2eContext }, expected: number) => {
    const rows = await e2eContext.sql`
    SELECT count FROM skill_download_daily
    WHERE skill_id = (SELECT id FROM skills WHERE name = ${publishedPublicSkill.name})
      AND date = CURRENT_DATE
  `;
    expect(rows.length).toBe(1);
    expect(Number(rows[0]?.count)).toBe(expected);
  }
);

Then('only one download row exists for today', async ({ publishedPublicSkill, e2eContext }) => {
  const rows = await e2eContext.sql`
    SELECT count(*) as row_count FROM skill_download_daily
    WHERE skill_id = (SELECT id FROM skills WHERE name = ${publishedPublicSkill.name})
      AND date = CURRENT_DATE
  `;
  expect(Number(rows[0]?.row_count)).toBe(1);
});

Then('the response should include a downloads field of at least {int}', async ({ bddState }, minDownloads: number) => {
  expect(bddState.lastResponseBody).toBeDefined();
  const downloads = bddState.lastResponseBody?.downloads;
  expect(typeof downloads).toBe('number');
  expect(downloads as number).toBeGreaterThanOrEqual(minDownloads);
});
