/**
 * Admin API E2E tests (opt-in).
 *
 * Comprehensive coverage of ALL admin endpoints: users, packages, orgs,
 * audit logs. Real HTTP + real DB — zero mocks.
 *
 * Run with:
 *   RUN_ADMIN_E2E=1 bun test:e2e
 */

import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupE2E, type E2EContext, setupE2E } from '../../../../e2e/helpers/setup';

const runAdminE2E = process.env.RUN_ADMIN_E2E === '1';

/** Loose type for admin API JSON responses. */
interface AdminApiResponse {
  error?: string;
  [key: string]: unknown;
}

describe.skipIf(!runAdminE2E)('Admin E2E — comprehensive API coverage', () => {
  let ctx: E2EContext;
  let sql: postgres.Sql;

  // ---- Fixture IDs (deterministic for cleanup) ----
  const targetUserId = 'e2e-admin-target-user';
  const targetUser2Id = 'e2e-admin-target-user-2';
  const targetPublisherId = 'e2e-admin-target-publisher';
  const targetSkillId = 'e2e-admin-target-skill';
  const targetSkill2Id = 'e2e-admin-target-skill-2';
  const targetSkillName = '@e2etest/admin-target-skill'; // scoped
  const targetSkill2Name = 'admin-unscoped-skill'; // unscoped
  const targetSkillVersionId = 'e2e-admin-target-version-1';
  const targetSkillVersion2Id = 'e2e-admin-target-version-2';
  const targetSkillVersion = '1.0.0';
  const targetSkillVersion2 = '1.0.1';
  const targetOrgId = 'e2e-admin-target-org';
  const targetOrgSlug = 'e2e-admin-target-org';
  const targetMemberId = 'e2e-admin-target-member';
  const targetMember2Id = 'e2e-admin-target-member-2';

  // ---------------------------------------------------------------
  // Setup & Teardown
  // ---------------------------------------------------------------

  beforeAll(async () => {
    ctx = await setupE2E();
    sql = ctx.sql;

    // Promote test actor to registry admin
    await sql`UPDATE "user" SET role = 'admin' WHERE id = ${ctx.user.id}`;

    const now = new Date();

    // Two target users for moderation tests
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
      VALUES (${targetUserId}, 'Admin Target User', 'admin-target@tank.test', true, 'user', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
      VALUES (${targetUser2Id}, 'Admin Target User 2', 'admin-target-2@tank.test', true, 'user', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
      VALUES (${targetPublisherId}, 'Admin Target Publisher', 'admin-publisher@tank.test', true, 'user', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;

    // Two target skills — one scoped, one unscoped
    await sql`
      INSERT INTO skills (id, name, description, publisher_id, status, created_at, updated_at)
      VALUES (${targetSkillId}, ${targetSkillName}, 'Scoped admin target skill', ${targetPublisherId}, 'active', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO skills (id, name, description, publisher_id, status, created_at, updated_at)
      VALUES (${targetSkill2Id}, ${targetSkill2Name}, 'Unscoped admin target skill', ${targetPublisherId}, 'active', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO skill_versions (id, skill_id, version, tarball_size, file_count, integrity, tarball_path, created_at)
      VALUES (${targetSkillVersionId}, ${targetSkillId}, ${targetSkillVersion}, 123, 3, 'sha512-test-1', 'skills/test-1.tgz', ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO skill_versions (id, skill_id, version, tarball_size, file_count, integrity, tarball_path, created_at)
      VALUES (${targetSkillVersion2Id}, ${targetSkillId}, ${targetSkillVersion2}, 124, 4, 'sha512-test-2', 'skills/test-2.tgz', ${now})
      ON CONFLICT (id) DO NOTHING
    `;

    // Target org with two members (owner + regular member)
    await sql`
      INSERT INTO "organization" (id, name, slug, created_at)
      VALUES (${targetOrgId}, 'Admin Target Org', ${targetOrgSlug}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES (${targetMemberId}, ${targetOrgId}, ${targetUserId}, 'owner', ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES (${targetMember2Id}, ${targetOrgId}, ${targetUser2Id}, 'member', ${now})
      ON CONFLICT (id) DO NOTHING
    `;
  });

  afterAll(async () => {
    if (sql) {
      const allTargetIds = [targetUserId, targetUser2Id, targetPublisherId, targetSkillId, targetSkill2Id, targetOrgId];
      await sql`DELETE FROM audit_events WHERE actor_id = ${ctx.user.id}`;
      await sql`DELETE FROM audit_events WHERE target_id IN ${sql(allTargetIds)}`;
      await sql`DELETE FROM skill_downloads WHERE version_id IN ${sql([targetSkillVersionId, targetSkillVersion2Id])}`;
      await sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN ${sql([targetSkillVersionId, targetSkillVersion2Id])})`;
      await sql`DELETE FROM scan_results WHERE version_id IN ${sql([targetSkillVersionId, targetSkillVersion2Id])}`;
      await sql`DELETE FROM skill_versions WHERE id IN ${sql([targetSkillVersionId, targetSkillVersion2Id])}`;
      await sql`DELETE FROM "member" WHERE id IN ${sql([targetMemberId, targetMember2Id])}`;
      await sql`DELETE FROM "organization" WHERE id = ${targetOrgId}`;
      await sql`DELETE FROM skills WHERE id IN ${sql([targetSkillId, targetSkill2Id])}`;
      await sql`DELETE FROM user_status WHERE user_id IN ${sql([targetUserId, targetUser2Id, targetPublisherId])}`;
      await sql`DELETE FROM "user" WHERE id IN ${sql([targetUserId, targetUser2Id, targetPublisherId])}`;
    }
    if (ctx) {
      await cleanupE2E(ctx);
    }
  });

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${ctx.registry}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${ctx.token}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {})
      }
    });
  }

  function encodeName(name: string): string {
    return encodeURIComponent(name);
  }

  // =================================================================
  //  AUTH & ACCESS CONTROL
  // =================================================================

  it('denies non-admin access', async () => {
    const nonAdminCtx = await setupE2E();
    try {
      const response = await fetch(`${nonAdminCtx.registry}/api/admin/users`, {
        headers: { authorization: `Bearer ${nonAdminCtx.token}` }
      });
      expect([401, 403]).toContain(response.status);
    } finally {
      await cleanupE2E(nonAdminCtx);
    }
  });

  it('rejects requests without auth header', async () => {
    const response = await fetch(`${ctx.registry}/api/admin/users`);
    expect([401, 403]).toContain(response.status);
  });

  // =================================================================
  //  USERS — LIST
  // =================================================================

  it('lists users with pagination', async () => {
    const res = await adminFetch('/api/admin/users?limit=2&page=1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('searches users by name', async () => {
    const res = await adminFetch('/api/admin/users?search=Admin+Target+User');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const users = body.users as Array<{ id: string }>;
    expect(users.some((u) => u.id === targetUserId)).toBe(true);
  });

  it('filters users by role', async () => {
    const res = await adminFetch('/api/admin/users?role=admin');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const users = body.users as Array<{ role: string }>;
    // Our admin user should be present; all returned users should be admins
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.every((u) => u.role === 'admin')).toBe(true);
  });

  // =================================================================
  //  USERS — DETAIL
  // =================================================================

  it('gets user detail', async () => {
    const res = await adminFetch(`/api/admin/users/${targetUserId}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const user = body.user as { id: string; name: string; email: string };
    expect(user.id).toBe(targetUserId);
    expect(user.name).toBe('Admin Target User');
    expect(body.statusHistory).toBeDefined();
    expect(body.counts).toBeDefined();
  });

  it('returns 404 for non-existent user detail', async () => {
    const res = await adminFetch('/api/admin/users/nonexistent-user-id-99999');
    expect(res.status).toBe(404);
  });

  // =================================================================
  //  USERS — ROLE CHANGES
  // =================================================================

  it('prevents admin from changing own role', async () => {
    const res = await adminFetch(`/api/admin/users/${ctx.user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'user' })
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.error).toBeDefined();
  });

  it('promotes user to admin and demotes back', async () => {
    // Promote
    const promoteRes = await adminFetch(`/api/admin/users/${targetUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' })
    });
    expect(promoteRes.status).toBe(200);
    const promoteBody = (await promoteRes.json()) as AdminApiResponse;
    expect(promoteBody.newRole).toBe('admin');

    // Demote back to user
    const demoteRes = await adminFetch(`/api/admin/users/${targetUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'user' })
    });
    expect(demoteRes.status).toBe(200);
    const demoteBody = (await demoteRes.json()) as AdminApiResponse;
    expect(demoteBody.newRole).toBe('user');
  });

  // =================================================================
  //  USERS — STATUS CHANGES
  // =================================================================

  it('prevents admin from changing own status', async () => {
    const res = await adminFetch(`/api/admin/users/${ctx.user.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'banned', reason: 'self-ban attempt' })
    });
    expect(res.status).toBe(400);
  });

  it('requires reason when banning a user', async () => {
    const res = await adminFetch(`/api/admin/users/${targetUser2Id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'banned' }) // no reason
    });
    expect([400, 422]).toContain(res.status);
  });

  it('bans user and verifies via detail endpoint', async () => {
    const banRes = await adminFetch(`/api/admin/users/${targetUserId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'banned', reason: 'E2E ban test' })
    });
    expect(banRes.status).toBe(200);

    // Verify status appears in user detail
    const detailRes = await adminFetch(`/api/admin/users/${targetUserId}`);
    const detail = (await detailRes.json()) as AdminApiResponse;
    const history = detail.statusHistory as Array<{ status: string }>;
    expect(history.some((s) => s.status === 'banned')).toBe(true);

    // Unban
    const unbanRes = await adminFetch(`/api/admin/users/${targetUserId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'active' })
    });
    expect(unbanRes.status).toBe(200);
  });

  it('suspends user with expiry and restores', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const suspendRes = await adminFetch(`/api/admin/users/${targetUser2Id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'suspended', reason: 'E2E suspension', expiresAt })
    });
    expect(suspendRes.status).toBe(200);

    // Restore
    const restoreRes = await adminFetch(`/api/admin/users/${targetUser2Id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'active' })
    });
    expect(restoreRes.status).toBe(200);
  });

  // =================================================================
  //  PACKAGES — LIST
  // =================================================================

  it('lists packages with pagination', async () => {
    const res = await adminFetch('/api/admin/packages?limit=5&page=1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('searches packages by name', async () => {
    const res = await adminFetch('/api/admin/packages?search=admin-target');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const packages = body.packages as Array<{ name: string }>;
    expect(packages.some((p) => p.name === targetSkillName)).toBe(true);
  });

  it('filters packages by status', async () => {
    const res = await adminFetch('/api/admin/packages?status=active');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const packages = body.packages as Array<{ status: string }>;
    expect(packages.every((p) => p.status === 'active')).toBe(true);
  });

  // =================================================================
  //  PACKAGES — DETAIL (scoped & unscoped)
  // =================================================================

  it('gets scoped package detail', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const pkg = body.package as { name: string; publisher: unknown; versions: unknown[] };
    expect(pkg.name).toBe(targetSkillName);
    expect(pkg.publisher).toBeDefined();
    expect(Array.isArray(pkg.versions)).toBe(true);
  });

  it('gets unscoped package detail', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const pkg = body.package as { name: string };
    expect(pkg.name).toBe(targetSkill2Name);
  });

  it('returns 404 for non-existent package', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName('@fake/nonexistent-pkg')}`);
    expect(res.status).toBe(404);
  });

  // =================================================================
  //  PACKAGES — STATUS CHANGES
  // =================================================================

  it('quarantines and restores a package', async () => {
    // Quarantine
    const qRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'quarantined', reason: 'E2E quarantine test' })
    });
    expect(qRes.status).toBe(200);
    const qBody = (await qRes.json()) as AdminApiResponse;
    expect(qBody.status).toBe('quarantined');

    // Verify via list filter
    const listRes = await adminFetch('/api/admin/packages?status=quarantined');
    const listBody = (await listRes.json()) as AdminApiResponse;
    const quarantined = listBody.packages as Array<{ name: string }>;
    expect(quarantined.some((p) => p.name === targetSkillName)).toBe(true);

    // Restore
    const rRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', reason: 'E2E restore test' })
    });
    expect(rRes.status).toBe(200);
    expect(((await rRes.json()) as AdminApiResponse).status).toBe('active');
  });

  // =================================================================
  //  PACKAGES — FEATURE TOGGLE
  // =================================================================

  it('features and unfeatures a package', async () => {
    // Feature
    const fRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}/feature`, {
      method: 'POST',
      body: JSON.stringify({ featured: true })
    });
    expect(fRes.status).toBe(200);
    expect(((await fRes.json()) as AdminApiResponse).featured).toBe(true);

    // Verify via list filter
    const listRes = await adminFetch('/api/admin/packages?featured=true');
    const listBody = (await listRes.json()) as AdminApiResponse;
    const featured = listBody.packages as Array<{ name: string }>;
    expect(featured.some((p) => p.name === targetSkillName)).toBe(true);

    // Unfeature
    const ufRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}/feature`, {
      method: 'POST',
      body: JSON.stringify({ featured: false })
    });
    expect(ufRes.status).toBe(200);
    expect(((await ufRes.json()) as AdminApiResponse).featured).toBe(false);
  });

  // =================================================================
  //  PACKAGES — DELETE (sets status to 'removed')
  // =================================================================

  it('removes a package via DELETE', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.status).toBe('removed');

    // Restore for subsequent tests
    const restoreRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', reason: 'E2E restore after DELETE' })
    });
    expect(restoreRes.status).toBe(200);
  });

  it('deletes a specific version from a package', async () => {
    const res = await adminFetch(
      `/api/admin/packages/${encodeName(targetSkillName)}/versions/${encodeURIComponent(targetSkillVersion2)}`,
      { method: 'DELETE' }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.version).toBe(targetSkillVersion2);

    const detailRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}`);
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AdminApiResponse;
    const versions =
      detailBody.package && typeof detailBody.package === 'object'
        ? ((detailBody.package as { versions?: Array<{ version: string }> }).versions ?? [])
        : [];
    expect(versions.some((versionItem) => versionItem.version === targetSkillVersion2)).toBe(false);
  });

  it('force deletes a package with explicit confirmation payload', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}?force=true`, {
      method: 'DELETE',
      body: JSON.stringify({
        packageName: targetSkill2Name,
        confirmText: 'DELETE',
        reason: 'E2E force delete test'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.mode).toBe('force');

    const detailRes = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}`);
    expect(detailRes.status).toBe(404);

    const now = new Date();
    await sql`
      INSERT INTO skills (id, name, description, publisher_id, status, created_at, updated_at)
      VALUES (${targetSkill2Id}, ${targetSkill2Name}, 'Unscoped admin target skill', ${targetPublisherId}, 'active', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
  });

  it('bans package publisher and deletes all publisher packages', async () => {
    const res = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}/publisher-ban-delete`, {
      method: 'POST',
      body: JSON.stringify({
        packageName: targetSkillName,
        confirmText: 'BAN_DELETE_ALL',
        reason: 'E2E publisher ban + delete all'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.publisherId).toBe(targetPublisherId);
    expect(body.deletedPackageCount).toBeGreaterThanOrEqual(2);

    const scopedDetail = await adminFetch(`/api/admin/packages/${encodeName(targetSkillName)}`);
    expect(scopedDetail.status).toBe(404);
    const unscopedDetail = await adminFetch(`/api/admin/packages/${encodeName(targetSkill2Name)}`);
    expect(unscopedDetail.status).toBe(404);

    const publisherDetail = await adminFetch(`/api/admin/users/${targetPublisherId}`);
    expect(publisherDetail.status).toBe(200);
    const publisherBody = (await publisherDetail.json()) as AdminApiResponse;
    const statusHistory = publisherBody.statusHistory as Array<{ status: string }>;
    expect(statusHistory[0]?.status).toBe('banned');
  });

  // =================================================================
  //  ORGANIZATIONS — LIST
  // =================================================================

  it('lists organizations with pagination', async () => {
    const res = await adminFetch('/api/admin/orgs?limit=5&page=1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(Array.isArray(body.orgs)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('searches organizations by name', async () => {
    const res = await adminFetch('/api/admin/orgs?search=Admin+Target+Org');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const orgs = body.orgs as Array<{ id: string }>;
    expect(orgs.some((o) => o.id === targetOrgId)).toBe(true);
  });

  // =================================================================
  //  ORGANIZATIONS — DETAIL
  // =================================================================

  it('gets org detail with members and packages', async () => {
    const res = await adminFetch(`/api/admin/orgs/${targetOrgId}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(body.name).toBe('Admin Target Org');
    expect(body.slug).toBe(targetOrgSlug);

    const members = body.members as Array<{ userId: string }>;
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.some((m) => m.userId === targetUserId)).toBe(true);
    expect(members.some((m) => m.userId === targetUser2Id)).toBe(true);

    expect(Array.isArray(body.packages)).toBe(true);
  });

  it('returns 404 for non-existent org', async () => {
    const res = await adminFetch('/api/admin/orgs/nonexistent-org-id-99999');
    expect(res.status).toBe(404);
  });

  // =================================================================
  //  ORGANIZATIONS — MEMBER REMOVAL
  // =================================================================

  it('removes a non-owner member from org', async () => {
    const res = await adminFetch(`/api/admin/orgs/${targetOrgId}/members/${targetMember2Id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.success).toBe(true);

    // Verify member is gone via detail endpoint
    const detailRes = await adminFetch(`/api/admin/orgs/${targetOrgId}`);
    const detailBody = (await detailRes.json()) as AdminApiResponse;
    const members = detailBody.members as Array<{ id: string }>;
    expect(members.some((m) => m.id === targetMember2Id)).toBe(false);
  });

  it('prevents removing last owner from org', async () => {
    // targetMemberId is now the sole owner
    const res = await adminFetch(`/api/admin/orgs/${targetOrgId}/members/${targetMemberId}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as AdminApiResponse;
    expect(body.error).toBeDefined();
  });

  it('returns 404 when removing non-existent member', async () => {
    const res = await adminFetch(`/api/admin/orgs/${targetOrgId}/members/nonexistent-member-id`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  // =================================================================
  //  AUDIT LOGS — LIST & FILTERS
  // =================================================================

  it('lists audit logs with pagination', async () => {
    const res = await adminFetch('/api/admin/audit-logs?limit=5&page=1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
  });

  it('filters audit logs by action', async () => {
    const res = await adminFetch('/api/admin/audit-logs?action=user.ban');
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const events = body.events as Array<{ action: string }>;
    expect(events.every((e) => e.action === 'user.ban')).toBe(true);
  });

  it('filters audit logs by actor', async () => {
    const res = await adminFetch(`/api/admin/audit-logs?actorId=${ctx.user.id}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const events = body.events as Array<{ actorId: string }>;
    expect(events.every((e) => e.actorId === ctx.user.id)).toBe(true);
  });

  it('filters audit logs by date range', async () => {
    const startDate = new Date(Date.now() - 3_600_000).toISOString();
    const endDate = new Date(Date.now() + 3_600_000).toISOString();
    const res = await adminFetch(`/api/admin/audit-logs?startDate=${startDate}&endDate=${endDate}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    expect(Array.isArray(body.events)).toBe(true);
  });

  // =================================================================
  //  AUDIT LOG — COMPREHENSIVE TRAIL VERIFICATION
  //  (MUST run last — verifies all actions from tests above)
  // =================================================================

  it('recorded all admin actions in audit log', async () => {
    const res = await adminFetch(`/api/admin/audit-logs?actorId=${ctx.user.id}&limit=100`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdminApiResponse;
    const events = body.events as Array<{ action: string; targetId?: string | null }>;
    const actions = events.map((e) => e.action);

    // User moderation
    expect(actions).toContain('user.ban');
    expect(actions).toContain('user.unban');
    expect(actions).toContain('user.suspend');

    // Role changes
    expect(actions).toContain('user.promote');
    expect(actions).toContain('user.demote');

    // Package moderation
    expect(actions).toContain('skill.quarantine');
    expect(actions).toContain('skill.restore');
    expect(actions).toContain('skill.feature');
    expect(actions).toContain('skill.unfeature');
    expect(actions).toContain('skill.remove');
    expect(actions).toContain('skill.version.delete');
    expect(actions).toContain('skill.force_delete');
    expect(actions.filter((action) => action === 'user.ban').length).toBeGreaterThanOrEqual(2);

    // Org management
    expect(actions).toContain('org.member.remove');

    // Verify target IDs are correct for key actions
    expect(events.some((e) => e.action === 'user.ban' && e.targetId === targetUserId)).toBe(true);
    expect(events.some((e) => e.action === 'skill.quarantine' && e.targetId === targetSkillId)).toBe(true);
    expect(events.some((e) => e.action === 'skill.remove' && e.targetId === targetSkill2Id)).toBe(true);
    expect(events.some((e) => e.action === 'user.ban' && e.targetId === targetPublisherId)).toBe(true);
  });
});
