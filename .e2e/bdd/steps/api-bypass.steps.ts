import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

type ActorName = 'Alice' | 'Bob' | 'Charlie';

interface ApiState {
  lastStatus: number;
  lastBody: string;
}

const apiState: ApiState = { lastStatus: 0, lastBody: '' };

function resolveSkillName(skillName: string, orgSlug: string): string {
  if (skillName.startsWith('@')) {
    return skillName;
  }
  return `@${orgSlug}/${skillName}`;
}

function resolveToken(
  actor: ActorName,
  fixtures: {
    e2eContext: { token: string };
    secondUser: { token: string };
    thirdUser: { token: string };
  }
): string {
  if (actor === 'Alice') return fixtures.e2eContext.token;
  if (actor === 'Bob') return fixtures.secondUser.token;
  return fixtures.thirdUser.token;
}

function interpolatePath(rawPath: string, skillName: string, searchQuery: string): string {
  return rawPath
    .replace('{skill}', encodeURIComponent(skillName))
    .replace('{searchQuery}', encodeURIComponent(searchQuery));
}

async function callApi(registry: string, apiPath: string, token?: string): Promise<{ status: number; body: string }> {
  const url = `${registry}${apiPath}`;
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  const body = await res.text();
  return { status: res.status, body };
}

When(
  '{word} calls GET {string} with auth',
  async ({ e2eContext, secondUser, thirdUser, bddState }, actor: ActorName, rawPath: string) => {
    const skillName = resolveSkillName('private-access-skill', e2eContext.orgSlug);
    bddState.skillName = skillName;
    const apiPath = interpolatePath(rawPath, skillName, bddState.searchQuery);
    const token = resolveToken(actor, { e2eContext, secondUser, thirdUser });
    const { status, body } = await callApi(e2eContext.registry, apiPath, token);
    apiState.lastStatus = status;
    apiState.lastBody = body;
  }
);

When('an unauthenticated user calls GET {string}', async ({ e2eContext, bddState }, rawPath: string) => {
  const skillName = resolveSkillName('private-access-skill', e2eContext.orgSlug);
  bddState.skillName = skillName;
  const apiPath = interpolatePath(rawPath, skillName, bddState.searchQuery);
  const { status, body } = await callApi(e2eContext.registry, apiPath);
  apiState.lastStatus = status;
  apiState.lastBody = body;
});

Then('the API response status should be {int}', async ({ e2eContext: _ctx }, expectedStatus: number) => {
  expect(apiState.lastStatus).toBe(expectedStatus);
});

Then('the API response body should not contain the private skill name', async ({ e2eContext }) => {
  const skillName = resolveSkillName('private-access-skill', e2eContext.orgSlug);
  expect(apiState.lastBody).not.toContain(skillName);
});

Then('the API response body should contain the private skill name', async ({ e2eContext }) => {
  const skillName = resolveSkillName('private-access-skill', e2eContext.orgSlug);
  expect(apiState.lastBody).toContain(skillName);
});
