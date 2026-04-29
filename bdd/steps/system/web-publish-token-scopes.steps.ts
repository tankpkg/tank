/**
 * BDD step definitions for /api/v1/skills scope-based authorization.
 *
 * Intent: idd/modules/web-publish/INTENT.md (C1a, C1b, C1c, C1d; E1a, E1b, E1c, E3)
 * Feature: bdd/features/system/web-publish/api-token-scopes.feature
 *
 * Bug context (2026-04-28): All newly-issued scoped CI/CD tokens fail publish
 * with 401, even though tank whoami succeeds. The legacy publish-api.feature
 * uses an unscoped key (treated as unrestricted) and therefore did not cover
 * this surface — that gap is what allowed the bug to ship.
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 *   - Keys are inserted directly into the apikey table with the EXACT
 *     permissions JSON shape the production code writes (matches better-auth's
 *     storage shape for `auth.api.createApiKey`). Direct insert is necessary
 *     because better-auth blocks HTTP clients from setting `permissions` via
 *     /api/auth/api-key/create (SERVER_ONLY_PROPERTY).
 *   - The hash matches better-auth's defaultKeyHasher (sha256 + base64url, no
 *     padding); cipher-kit/node's `hash` produces the identical output.
 *   - Publish requests go through the same code path the real CLI hits.
 *
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 */
import { randomUUID } from 'node:crypto';

import { generateUuid, hash } from 'cipher-kit/node';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRegistryUrl } from '../../../e2e/targets.js';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

interface ScopedKeyContext {
  apiKeyId: string;
  plainKey: string;
}

interface ScopedTokensWorld {
  registry: string;
  sql: postgres.Sql | null;
  baseRunId: string;
  orgSlug: string;
  orgId: string;
  ownerUserId: string;
  ownerMemberId: string;
}

const world: ScopedTokensWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? getRegistryUrl(),
  sql: null,
  baseRunId: '',
  orgSlug: '',
  orgId: '',
  ownerUserId: '',
  ownerMemberId: ''
};

function buildPlainKey(seed: string): string {
  let key = `tank_e2e_scope_${seed}_${generateUuid().replace(/-/g, '')}`;
  while (key.length < 64) {
    key += generateUuid().replace(/-/g, '');
  }
  return key;
}

/**
 * Insert an apikey row owned by the shared org-owner user with the requested
 * permissions JSON. Returns the plaintext token for use in Authorization
 * headers.
 *
 * `permissions` accepts:
 *   - null            → legacy unscoped key (pre-scope enforcement)
 *   - JSON string     → e.g. '{"skills":["skills:publish"]}' to mirror the exact
 *     shape tokens.ts:createTokenFn writes today (note the double-prefix)
 */
async function insertScopedApiKey(permissions: string | null): Promise<ScopedKeyContext> {
  const sql = world.sql;
  if (!sql) {
    throw new Error('insertScopedApiKey called before world.sql initialized');
  }

  const runId = generateUuid().replace(/-/g, '').slice(0, 12);
  const apiKeyId = `e2e-scope-key-${runId}`;
  const plainKey = buildPlainKey(runId);
  const hashedKey = hash(plainKey);
  const now = new Date();

  await sql`
    INSERT INTO "apikey" (id, key, start, prefix, user_id, enabled, rate_limit_enabled,
                          rate_limit_time_window, rate_limit_max, request_count,
                          permissions, created_at, updated_at)
    VALUES (${apiKeyId}, ${hashedKey}, ${plainKey.substring(0, 6)}, ${'tank_'},
            ${world.ownerUserId}, true, false, 86400000, 1000, 0,
            ${permissions}, ${now}, ${now})
  `;

  return { apiKeyId, plainKey };
}

interface PublishResponse {
  status: number;
  body: Record<string, unknown>;
}

async function postPublish(token: string, manifest: Record<string, unknown>): Promise<PublishResponse> {
  const res = await fetch(`${world.registry}/api/v1/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ manifest })
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

function buildManifest(suffix: string): Record<string, unknown> {
  return {
    name: `@${world.orgSlug}/scope-test-${suffix}-${randomUUID().slice(0, 8)}`,
    version: '1.0.0',
    description: 'BDD scope-token publish test'
  };
}

describe('Feature: Publish API — scope-based authorization for API tokens', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for BDD scope-token tests');
    }
    world.sql = postgres(connectionString);

    world.baseRunId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.ownerUserId = `e2e-scope-owner-${world.baseRunId}`;
    world.orgId = `e2e-scope-org-${world.baseRunId}`;
    world.orgSlug = `e2escope-${world.baseRunId}`;
    world.ownerMemberId = `e2e-scope-member-${world.baseRunId}`;
    const now = new Date();

    // Single org-owning user; per-scenario API keys are minted off this user
    // so org-membership is always satisfied and publish hits the scope check.
    await world.sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${world.ownerUserId}, ${'E2E Scope Owner'}, ${`scope-owner-${world.baseRunId}@tank.test`}, true, ${now}, ${now})
    `;
    await world.sql`
      INSERT INTO "organization" (id, name, slug, created_at)
      VALUES (${world.orgId}, ${'E2E Scope Org'}, ${world.orgSlug}, ${now})
    `;
    await world.sql`
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES (${world.ownerMemberId}, ${world.orgId}, ${world.ownerUserId}, ${'owner'}, ${now})
    `;
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;

    const safeDelete = async (q: ReturnType<typeof sql>) => {
      try {
        await q;
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code !== '42P01') throw error;
      }
    };

    try {
      const skillIds = sql`SELECT id FROM skills WHERE publisher_id = ${world.ownerUserId}`;
      const versionIds = sql`SELECT sv.id FROM skill_versions sv JOIN skills s ON sv.skill_id = s.id WHERE s.publisher_id = ${world.ownerUserId}`;

      await safeDelete(
        sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (${versionIds}))`
      );
      await safeDelete(sql`DELETE FROM scan_results WHERE version_id IN (${versionIds})`);
      await safeDelete(sql`DELETE FROM skill_stars WHERE skill_id IN (${skillIds})`);
      await safeDelete(sql`DELETE FROM skill_access WHERE skill_id IN (${skillIds})`);
      await safeDelete(sql`DELETE FROM skill_download_daily WHERE skill_id IN (${skillIds})`);
      await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
      await sql`DELETE FROM skills WHERE publisher_id = ${world.ownerUserId}`;

      await sql`DELETE FROM audit_events WHERE actor_id = ${world.ownerUserId}`;
      await sql`DELETE FROM "apikey" WHERE user_id = ${world.ownerUserId}`;
      await sql`DELETE FROM "member" WHERE id = ${world.ownerMemberId}`;
      await sql`DELETE FROM "organization" WHERE id = ${world.orgId}`;
      await sql`DELETE FROM "session" WHERE user_id = ${world.ownerUserId}`;
      await sql`DELETE FROM "user" WHERE id = ${world.ownerUserId}`;
    } catch (_error) {
      // Best-effort cleanup.
    }

    await sql.end();
  }, 30_000);

  // ── Positive: skills:publish scope (C1a, E1a) — the bug case ───────────

  describe('Scenario: API key with skills:publish scope can publish (E1a)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)(
      'returns 200 with uploadUrl/skillId/versionId — NOT 401',
      async () => {
        // Mirrors tokens.ts:createTokenFn output verbatim — the `skills:` prefix
        // is INSIDE the array, the same double-prefix the production dashboard
        // writes today via `permissions: { skills: normalizedScopes }` where
        // normalizedScopes already contains `skills:publish`.
        const ctx = await insertScopedApiKey('{"skills":["skills:publish"]}');
        const res = await postPublish(ctx.plainKey, buildManifest('publish-scope'));

        expect(res.status, `expected 200 for skills:publish, got ${res.status} body=${JSON.stringify(res.body)}`).toBe(
          200
        );
        expect(res.body).toHaveProperty('uploadUrl');
        expect(res.body).toHaveProperty('skillId');
        expect(res.body).toHaveProperty('versionId');
      },
      30_000
    );
  });

  // ── Positive: skills:admin scope (C1b, E1b) ─────────────────────────────

  describe('Scenario: API key with skills:admin scope can publish (E1b)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)(
      'returns 200 — admin scope implies publish',
      async () => {
        const ctx = await insertScopedApiKey('{"skills":["skills:admin"]}');
        const res = await postPublish(ctx.plainKey, buildManifest('admin-scope'));

        expect(res.status, `expected 200 for skills:admin, got ${res.status} body=${JSON.stringify(res.body)}`).toBe(
          200
        );
        expect(res.body).toHaveProperty('uploadUrl');
      },
      30_000
    );
  });

  // ── Positive: legacy NULL permissions (C1c, E1c) ────────────────────────

  describe('Scenario: Legacy API key with NULL permissions still authenticates (E1c)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)(
      'returns 200 — backward compatibility',
      async () => {
        const ctx = await insertScopedApiKey(null);
        const res = await postPublish(ctx.plainKey, buildManifest('legacy-null'));

        expect(res.status, `expected 200 for NULL permissions (legacy), got ${res.status}`).toBe(200);
        expect(res.body).toHaveProperty('uploadUrl');
      },
      30_000
    );
  });

  // ── Negative: missing publish scope (C1d, E3) — must be 403 not 401 ────

  describe('Scenario: API key without publish or admin scope is rejected with 403 (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)(
      'returns 403 — never 401 — when permissions lack skills:publish',
      async () => {
        const ctx = await insertScopedApiKey('{"skills":["skills:read"]}');
        const res = await postPublish(ctx.plainKey, buildManifest('read-only'));

        // 401 here would be the bug: it tells the CLI to log in again,
        // but the user is fully authenticated — they just lack scope.
        expect(res.status, `must be 403 not 401; got ${res.status} body=${JSON.stringify(res.body)}`).toBe(403);
        expect(res.status).not.toBe(401);
      },
      30_000
    );
  });
});
