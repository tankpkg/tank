import { expect } from '@playwright/test';
import { Given, runTank, Then, When } from './fixtures';

type ActorName = 'Alice' | 'Bob' | 'Charlie';

function resolveSkillName(skillName: string, orgSlug: string): string {
  if (skillName.startsWith('@')) {
    return skillName;
  }
  return `@${orgSlug}/${skillName}`;
}

function resolveHome(
  actor: ActorName,
  fixtures: { e2eContext: { home: string }; secondUser: { home: string }; thirdUser: { home: string } }
): string {
  if (actor === 'Alice') {
    return fixtures.e2eContext.home;
  }
  if (actor === 'Bob') {
    return fixtures.secondUser.home;
  }
  return fixtures.thirdUser.home;
}

Given(
  'Alice has published a public skill {string}',
  async ({ e2eContext, publishedPublicSkill, bddState }, skillName: string) => {
    const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
    if (resolved !== publishedPublicSkill.name) {
      throw new Error(`Expected published public skill to be ${resolved}, got ${publishedPublicSkill.name}`);
    }
    bddState.skillName = resolved;
  }
);

When('{word} searches for skills', async ({ e2eContext, secondUser, thirdUser, bddState }, actor: ActorName) => {
  const home = resolveHome(actor, { e2eContext, secondUser, thirdUser });
  bddState.lastActor = actor;
  bddState.lastResult = await runTank(['search', bddState.searchQuery], { home });
});

When('an unauthenticated user searches for skills', async ({ bddState, noAuthHome }) => {
  bddState.lastActor = 'Unauthenticated';
  bddState.lastResult = await runTank(['search', bddState.searchQuery], { home: noAuthHome });
});

Then(
  '{word} should see {string} in the results',
  async ({ e2eContext, bddState }, actor: ActorName, skillName: string) => {
    if (!bddState.lastResult) {
      throw new Error('No CLI result available for search assertion.');
    }
    expect(bddState.lastActor).toBe(actor);
    const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
    const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
    expect(output).toContain(resolved);
  }
);

Then(
  '{word} should not see {string} in the results',
  async ({ e2eContext, bddState }, actor: ActorName, skillName: string) => {
    if (!bddState.lastResult) {
      throw new Error('No CLI result available for search assertion.');
    }
    expect(bddState.lastActor).toBe(actor);
    const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
    const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
    expect(output).not.toContain(resolved);
  }
);

Then('the user should see {string} in the results', async ({ e2eContext, bddState }, skillName: string) => {
  if (!bddState.lastResult) {
    throw new Error('No CLI result available for search assertion.');
  }
  const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
  const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
  expect(output).toContain(resolved);
});

Then('the user should not see {string} in the results', async ({ e2eContext, bddState }, skillName: string) => {
  if (!bddState.lastResult) {
    throw new Error('No CLI result available for search assertion.');
  }
  const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
  const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
  expect(output).not.toContain(resolved);
});
