/**
 * Admin workflow E2E tests (opt-in).
 *
 * Run with:
 * RUN_ADMIN_E2E=1 pnpm test:e2e
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { setupE2E, cleanupE2E, type E2EContext } from './helpers/setup';

const runAdminE2E = process.env.RUN_ADMIN_E2E === '1';

interface AdminApiResponse {
  error?: string;
  [key: string]: unknown;
}

describe.skipIf(!runAdminE2E)('Admin E2E — moderation workflow', () => {
  let ctx: E2EContext;
  let sql: postgres.Sql;

  const targetUserId = 'e2e-admin-target-user';
  const targetSkillId = 'e2e-admin-target-skill';
  const targetSkillName = '@e2etest/admin-target-skill';

  beforeAll(async () => {
    ctx = await setupE2E();
    sql = ctx.sql;

    // Promote test actor to registry admin
    await sql`UPDATE "user" SET role = 'admin' WHERE id = ${ctx.user.id}`;

    // Seed target user and package for moderation flow
    const now = new Date();

    await sql`
      INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
      VALUES (${targetUserId}, 'Admin Target User', 'admin-target@tank.test', true, 'user', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO skills (id, name, description, publisher_id, status, created_at, updated_at)
      VALUES (${targetSkillId}, ${targetSkillName}, 'Admin workflow target skill', ${ctx.user.id}, 'active', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
  });

  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM audit_events WHERE target_id IN (${targetUserId}, ${targetSkillId})`;
      await sql`DELETE FROM skills WHERE id = ${targetSkillId}`;
      await sql`DELETE FROM user_status WHERE user_id = ${targetUserId}`;
      await sql`DELETE FROM "user" WHERE id = ${targetUserId}`;
    }

    if (ctx) {
      await cleanupE2E(ctx);
    }
  });

  async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${ctx.registry}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${ctx.token}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }

  it('denies non-admin access', async () => {
    const nonAdminCtx = await setupE2E();

    try {
      const response = await fetch(`${nonAdminCtx.registry}/api/admin/users`, {
        headers: {
          authorization: `Bearer ${nonAdminCtx.token}`,
        },
      });

      expect([401, 403]).toContain(response.status);
    } finally {
      await cleanupE2E(nonAdminCtx);
    }
  });

  it('supports admin moderation flow and writes audit logs', async () => {
    // 1) Dashboard access for admin
    const usersResponse = await adminFetch('/api/admin/users?limit=5');
    expect(usersResponse.status).toBe(200);

    // 2) Ban target user
    const banResponse = await adminFetch(`/api/admin/users/${targetUserId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'banned', reason: 'E2E moderation test' }),
    });
    expect(banResponse.status).toBe(200);

    // 3) Quarantine package
    const quarantineResponse = await adminFetch(
      `/api/admin/packages/${encodeURIComponent(targetSkillName)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'quarantined', reason: 'E2E moderation test' }),
      },
    );
    expect(quarantineResponse.status).toBe(200);

    // 4) Feature package
    const featureResponse = await adminFetch(
      `/api/admin/packages/${encodeURIComponent(targetSkillName)}/feature`,
      {
        method: 'POST',
        body: JSON.stringify({ featured: true }),
      },
    );
    expect(featureResponse.status).toBe(200);

    // 5) Verify audit entries exist
    const auditResponse = await adminFetch('/api/admin/audit-logs?limit=100');
    expect(auditResponse.status).toBe(200);

    const auditPayload = (await auditResponse.json()) as AdminApiResponse;
    const events = Array.isArray(auditPayload.events)
      ? (auditPayload.events as Array<{ action?: string; targetId?: string | null }>)
      : [];

    expect(
      events.some((entry) => entry.action === 'user.ban' && entry.targetId === targetUserId),
    ).toBe(true);
    expect(
      events.some((entry) => entry.action === 'skill.quarantine' && entry.targetId === targetSkillId),
    ).toBe(true);
    expect(
      events.some((entry) => entry.action === 'skill.feature' && entry.targetId === targetSkillId),
    ).toBe(true);
  });
});
