import { expect } from '@playwright/test';
import { Given, When, Then, runTank, expectSuccess, createSkillFixture } from './fixtures';

Given('Alice is authenticated with the registry', async ({ e2eContext }) => {
  expect(e2eContext.token.length).toBeGreaterThan(0);
});

Given('Alice has a skill {string} ready to publish', async ({ e2eContext, bddState }, skillName: string) => {
  const skill = createSkillFixture({
    orgSlug: e2eContext.orgSlug,
    skillName,
    description: `Private packages ${bddState.searchQuery}`,
  });
  bddState.skill = skill;
  bddState.skillName = skill.name;
  bddState.tempDirs.push(skill.dir);
});

When('Alice publishes the skill with private visibility', async ({ e2eContext, bddState }) => {
  if (!bddState.skill) {
    throw new Error('No skill fixture available for publish.');
  }
  bddState.lastResult = await runTank(['publish', '--private'], {
    cwd: bddState.skill.dir,
    home: e2eContext.home,
    timeoutMs: 60_000,
  });
});

When('Alice publishes the skill without specifying visibility', async ({ e2eContext, bddState }) => {
  if (!bddState.skill) {
    throw new Error('No skill fixture available for publish.');
  }
  bddState.lastResult = await runTank(['publish'], {
    cwd: bddState.skill.dir,
    home: e2eContext.home,
    timeoutMs: 60_000,
  });
});

When('Alice publishes the skill with the private flag', async ({ e2eContext, bddState }) => {
  if (!bddState.skill) {
    throw new Error('No skill fixture available for publish.');
  }
  bddState.lastResult = await runTank(['publish', '--private'], {
    cwd: bddState.skill.dir,
    home: e2eContext.home,
    timeoutMs: 60_000,
  });
});

Then('the skill should be published successfully', async ({ bddState }) => {
  if (!bddState.lastResult) {
    throw new Error('No CLI result available for assertion.');
  }
  expectSuccess(bddState.lastResult);
});

Then('the skill should have {string} visibility in the registry', async ({ e2eContext, bddState }, visibility: string) => {
  const skillName = bddState.skillName ?? bddState.skill?.name;
  if (!skillName) {
    throw new Error('No skill name available for visibility check.');
  }

  const rows = await e2eContext.sql`
    SELECT visibility FROM skills WHERE name = ${skillName}
  `;
  expect(rows.length).toBe(1);
  expect(rows[0]?.visibility).toBe(visibility);
});
