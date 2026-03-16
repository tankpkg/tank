import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateUuid, hash } from 'cipher-kit/node';

import { test as base, createBdd } from 'playwright-bdd';

import { type CliResult, expectSuccess, runTank } from '../../../e2e/helpers/cli';
import { cleanupFixture, createSkillFixture, type SkillFixture } from '../../../e2e/helpers/fixtures';
import { cleanupE2E, type E2EContext, setupE2E } from '../../../e2e/helpers/setup';
import { getCurrentAppTarget } from '../../../e2e/targets.js';

export interface UserFixture {
  id: string;
  name: string;
  email: string;
  token: string;
  home: string;
}

export interface BddState {
  lastResult?: CliResult;
  lastResponse?: Response;
  lastResponseBody?: Record<string, unknown>;
  lastActor?: string;
  skill?: SkillFixture;
  skillName?: string;
  consumerDir?: string;
  tempDirs: string[];
  searchQuery: string;
}

interface BddTestFixtures {
  noAuthHome: string;
  bddState: BddState;
}

interface BddWorkerFixtures {
  e2eContext: E2EContext;
  secondUser: UserFixture;
  thirdUser: UserFixture;
  publishedPrivateSkill: SkillFixture;
  publishedPublicSkill: SkillFixture;
  searchQuery: string;
}

interface UserFixtureOptions {
  slug: string;
  name: string;
  emailPrefix: string;
  addToOrg: boolean;
}

function hashApiKey(plainKey: string): string {
  return hash(plainKey);
}

function createApiKey(seed: string): string {
  let key = `tank_e2e_${seed}_${generateUuid().replace(/-/g, '')}`;
  while (key.length < 64) {
    key += generateUuid().replace(/-/g, '');
  }
  return key;
}

function createHomeDir(registry: string, token?: string, user?: { name: string; email: string }): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-'));
  const tankDir = path.join(home, '.tank');
  fs.mkdirSync(tankDir, { recursive: true, mode: 0o700 });
  const config: { registry: string; token?: string; user?: { name: string; email: string } } = {
    registry
  };
  if (token) {
    config.token = token;
  }
  if (user) {
    config.user = user;
  }
  fs.writeFileSync(path.join(tankDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return home;
}

function cleanupHomeDir(home: string): void {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createUserFixture(ctx: E2EContext, opts: UserFixtureOptions): Promise<UserFixture> {
  const now = new Date();
  const userId = `e2e-${opts.slug}-${ctx.runId}`;
  const apiKeyId = `e2e-apikey-${opts.slug}-${ctx.runId}`;
  const memberId = `e2e-member-${opts.slug}-${ctx.runId}`;
  const email = `${opts.emailPrefix}-${ctx.runId}@tank.test`;
  const plainKey = createApiKey(`${opts.slug}_${ctx.runId}`);
  const hashedKey = hashApiKey(plainKey);

  await ctx.sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${opts.name}, ${email}, true, ${now}, ${now})
  `;

  await ctx.sql`
    INSERT INTO "apikey" (id, key, start, prefix, user_id, enabled, rate_limit_enabled,
                          rate_limit_time_window, rate_limit_max, request_count,
                          created_at, updated_at)
    VALUES (${apiKeyId}, ${hashedKey}, ${plainKey.substring(0, 6)}, ${'tank_'},
            ${userId}, true, false, 86400000, 1000, 0, ${now}, ${now})
  `;

  if (opts.addToOrg) {
    const orgId = `e2e-org-${ctx.runId}`;
    await ctx.sql`
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES (${memberId}, ${orgId}, ${userId}, ${'member'}, ${now})
    `;
  }

  const home = createHomeDir(ctx.registry, plainKey, { name: opts.name, email });

  return {
    id: userId,
    name: opts.name,
    email,
    token: plainKey,
    home
  };
}

async function safeDelete(query: Promise<unknown>) {
  try {
    await query;
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code !== '42P01') throw e;
  }
}

async function cleanupUserFixture(ctx: E2EContext, user: UserFixture): Promise<void> {
  try {
    await safeDelete(ctx.sql`DELETE FROM skill_stars WHERE user_id = ${user.id}`);
    await safeDelete(ctx.sql`DELETE FROM skill_access WHERE granted_user_id = ${user.id}`);
    await ctx.sql`DELETE FROM audit_events WHERE actor_id = ${user.id}`;
    await ctx.sql`DELETE FROM "member" WHERE user_id = ${user.id}`;
    await ctx.sql`DELETE FROM "apikey" WHERE user_id = ${user.id}`;
    await ctx.sql`DELETE FROM "session" WHERE user_id = ${user.id}`;
    await ctx.sql`DELETE FROM "user" WHERE id = ${user.id}`;
  } catch (_err) {}

  cleanupHomeDir(user.home);
}

export const test = base.extend<BddTestFixtures, BddWorkerFixtures>({
  e2eContext: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructuring
    async ({}, use) => {
      const baseURL = test.info().project.use.baseURL;
      const ctx = await setupE2E(typeof baseURL === 'string' ? baseURL : getCurrentAppTarget().registryUrl);
      await use(ctx);
      await cleanupE2E(ctx);
    },
    { scope: 'worker' }
  ],
  searchQuery: [
    async ({ e2eContext }, use) => {
      await use(`private-packages-${e2eContext.runId}`);
    },
    { scope: 'worker' }
  ],
  secondUser: [
    async ({ e2eContext }, use) => {
      const user = await createUserFixture(e2eContext, {
        slug: 'bob',
        name: 'Bob',
        emailPrefix: 'bob',
        addToOrg: true
      });
      await use(user);
      await cleanupUserFixture(e2eContext, user);
    },
    { scope: 'worker' }
  ],
  thirdUser: [
    async ({ e2eContext }, use) => {
      const user = await createUserFixture(e2eContext, {
        slug: 'charlie',
        name: 'Charlie',
        emailPrefix: 'charlie',
        addToOrg: false
      });
      await use(user);
      await cleanupUserFixture(e2eContext, user);
    },
    { scope: 'worker' }
  ],
  noAuthHome: [
    async ({ e2eContext }, use) => {
      const home = createHomeDir(e2eContext.registry);
      await use(home);
      cleanupHomeDir(home);
    },
    { scope: 'test' }
  ],
  publishedPrivateSkill: [
    async ({ e2eContext, searchQuery }, use) => {
      const skill = createSkillFixture({
        orgSlug: e2eContext.orgSlug,
        skillName: 'private-access-skill',
        description: `Private packages ${searchQuery}`
      });

      const result = await runTank(['publish', '--private'], {
        cwd: skill.dir,
        home: e2eContext.home,
        timeoutMs: 60_000
      });
      expectSuccess(result);

      await use(skill);
      cleanupFixture(skill.dir);
    },
    { scope: 'worker' }
  ],
  publishedPublicSkill: [
    async ({ e2eContext, searchQuery }, use) => {
      const skill = createSkillFixture({
        orgSlug: e2eContext.orgSlug,
        skillName: 'public-search-skill',
        description: `Private packages ${searchQuery}`
      });

      const result = await runTank(['publish'], {
        cwd: skill.dir,
        home: e2eContext.home,
        timeoutMs: 60_000
      });
      expectSuccess(result);

      await use(skill);
      cleanupFixture(skill.dir);
    },
    { scope: 'worker' }
  ],
  bddState: [
    async ({ searchQuery }, use) => {
      const state: BddState = { tempDirs: [], searchQuery };
      await use(state);
      for (const dir of state.tempDirs) {
        cleanupFixture(dir);
      }
    },
    { scope: 'test' }
  ]
});

export const { Given, When, Then } = createBdd(test);
export { expectFailure } from '../../../e2e/helpers/cli';
export { type ConsumerFixture, createConsumerFixture, createSkillFixture } from '../../../e2e/helpers/fixtures';
export type { SkillFixture };
export { expectSuccess, runTank };
