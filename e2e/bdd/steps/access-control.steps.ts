import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { createConsumerFixture, expectFailure, expectSuccess, Given, runTank, Then, When } from './fixtures';

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
  'Alice has published a private skill {string}',
  async ({ e2eContext, publishedPrivateSkill, bddState }, skillName: string) => {
    const resolved = resolveSkillName(skillName, e2eContext.orgSlug);
    if (resolved !== publishedPrivateSkill.name) {
      throw new Error(`Expected published private skill to be ${resolved}, got ${publishedPrivateSkill.name}`);
    }
    bddState.skillName = resolved;
  }
);

Given("Bob is an authenticated member of Alice's organization", async ({ secondUser }) => {
  expect(secondUser.token.length).toBeGreaterThan(0);
});

Given("Charlie is authenticated but not in Alice's organization", async ({ thirdUser }) => {
  expect(thirdUser.token.length).toBeGreaterThan(0);
});

When(
  '{word} requests info for {string}',
  async ({ e2eContext, secondUser, thirdUser, bddState }, actor: ActorName, skillName: string) => {
    const name = resolveSkillName(skillName, e2eContext.orgSlug);
    const home = resolveHome(actor, { e2eContext, secondUser, thirdUser });
    bddState.skillName = name;
    bddState.lastActor = actor;
    bddState.lastResult = await runTank(['info', name], { home });
  }
);

When(
  'an unauthenticated user requests info for {string}',
  async ({ e2eContext, noAuthHome, bddState }, skillName: string) => {
    const name = resolveSkillName(skillName, e2eContext.orgSlug);
    bddState.skillName = name;
    bddState.lastActor = 'Unauthenticated';
    bddState.lastResult = await runTank(['info', name], { home: noAuthHome });
  }
);

When(
  '{word} tries to install {string}',
  async ({ e2eContext, secondUser, thirdUser, bddState }, actor: ActorName, skillName: string) => {
    const name = resolveSkillName(skillName, e2eContext.orgSlug);
    const home = resolveHome(actor, { e2eContext, secondUser, thirdUser });
    const consumer = createConsumerFixture();

    bddState.tempDirs.push(consumer.dir);
    bddState.consumerDir = consumer.dir;
    bddState.skillName = name;
    bddState.lastActor = actor;
    bddState.lastResult = await runTank(['install', name], {
      cwd: consumer.dir,
      home,
      timeoutMs: 60_000
    });
  }
);

Then('{word} should see the skill metadata', async ({ bddState }, actor: ActorName) => {
  if (!bddState.lastResult || !bddState.skillName) {
    throw new Error('No CLI result available for metadata assertion.');
  }
  expect(bddState.lastActor).toBe(actor);
  expectSuccess(bddState.lastResult);
  const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
  expect(output).toContain(bddState.skillName);
});

Then('the request should return {string}', async ({ bddState }, message: string) => {
  if (!bddState.lastResult) {
    throw new Error('No CLI result available for error assertion.');
  }
  const combinedOutput = bddState.lastResult.stdout + bddState.lastResult.stderr;
  const lowerOutput = combinedOutput.toLowerCase();
  const lowerMessage = message.toLowerCase();
  expect(lowerOutput).toContain(lowerMessage);
});

Then('the installation should fail with {string}', async ({ bddState }, message: string) => {
  if (!bddState.lastResult) {
    throw new Error('No CLI result available for install failure assertion.');
  }
  expectFailure(bddState.lastResult, message);
});

Then('the skill should be installed successfully', async ({ bddState }) => {
  if (!bddState.lastResult || !bddState.skillName || !bddState.consumerDir) {
    throw new Error('Missing install state for verification.');
  }
  expectSuccess(bddState.lastResult);
  const output = bddState.lastResult.stdout + bddState.lastResult.stderr;
  expect(output).toContain(bddState.skillName);

  const [scope, name] = bddState.skillName.slice(1).split('/');
  const skillDir = path.join(bddState.consumerDir, '.tank', 'skills', `@${scope}`, name);
  expect(fs.existsSync(skillDir)).toBe(true);

  const lockPath = path.join(bddState.consumerDir, 'skills.lock');
  expect(fs.existsSync(lockPath)).toBe(true);
});
