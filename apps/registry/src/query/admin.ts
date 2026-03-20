import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { isAdmin } from '~/lib/auth/authz';
import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { apikey, member, organization, user } from '~/lib/db/auth-schema';
import { auditEvents, serviceAccounts, skills, userStatus } from '~/lib/db/schema';

async function requireAdmin() {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('Unauthorized');
  const admin = await isAdmin(session.user.id);
  if (!admin) throw new Error('Forbidden');
  return session;
}

// ── Stats ─────────────────────────────────────────────────────────────────

export const adminStatsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin();

  const [userRow] = await db.select({ count: count() }).from(user);
  const [skillRow] = await db.select({ count: count() }).from(skills);
  const [flaggedRow] = await db.select({ count: count() }).from(skills).where(sql`${skills.status} != 'active'`);

  const recentEvents = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorId: auditEvents.actorId,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      createdAt: auditEvents.createdAt
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(5);

  return {
    userCount: userRow?.count ?? 0,
    skillCount: skillRow?.count ?? 0,
    flaggedCount: flaggedRow?.count ?? 0,
    recentEvents
  };
});

// ── Users ─────────────────────────────────────────────────────────────────

interface AdminUsersInput {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const adminUsersFn = createServerFn({ method: 'GET' })
  .inputValidator((input: AdminUsersInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();

    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (data.q) {
      conditions.push(or(ilike(user.name, `%${data.q}%`), ilike(user.email, `%${data.q}%`)));
    }
    if (data.role && data.role !== 'all') {
      conditions.push(eq(user.role, data.role));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(user).where(where);

    // Fetch moderation status for each user
    const userIds = rows.map((r) => r.id);
    const statuses =
      userIds.length > 0
        ? await db
            .select({ userId: userStatus.userId, status: userStatus.status })
            .from(userStatus)
            .where(sql`${userStatus.userId} IN ${userIds}`)
            .orderBy(desc(userStatus.createdAt))
        : [];

    const statusMap = new Map<string, string>();
    for (const s of statuses) {
      if (!statusMap.has(s.userId)) statusMap.set(s.userId, s.status);
    }

    const users = rows.map((r) => ({
      ...r,
      status: statusMap.get(r.id) ?? 'active'
    }));

    return { users, total: total?.count ?? 0, page, limit };
  });

export const adminUpdateUserRoleFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { userId: string; role: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.update(user).set({ role: data.role }).where(eq(user.id, data.userId));
    return { ok: true };
  });

export const adminSetUserStatusFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { userId: string; status: string; reason?: string; expiresAt?: string }) => input)
  .handler(async ({ data }) => {
    const session = await requireAdmin();
    await db.insert(userStatus).values({
      userId: data.userId,
      status: data.status,
      reason: data.reason ?? null,
      bannedBy: session.user.id,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
    });
    return { ok: true };
  });

// ── Packages ──────────────────────────────────────────────────────────────

interface AdminPackagesInput {
  q?: string;
  status?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
}

export const adminPackagesFn = createServerFn({ method: 'GET' })
  .inputValidator((input: AdminPackagesInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();

    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (data.q) {
      conditions.push(ilike(skills.name, `%${data.q}%`));
    }
    if (data.status && data.status !== 'all') {
      conditions.push(eq(skills.status, data.status));
    }
    if (data.featured !== undefined) {
      conditions.push(eq(skills.featured, data.featured));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        status: skills.status,
        featured: skills.featured,
        visibility: skills.visibility,
        publisherId: skills.publisherId,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt
      })
      .from(skills)
      .where(where)
      .orderBy(desc(skills.updatedAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(skills).where(where);

    // Resolve publisher names
    const publisherIds = [...new Set(rows.map((r) => r.publisherId))];
    const publishers =
      publisherIds.length > 0
        ? await db.select({ id: user.id, name: user.name }).from(user).where(sql`${user.id} IN ${publisherIds}`)
        : [];
    const pubMap = new Map(publishers.map((p) => [p.id, p.name]));

    const packages = rows.map((r) => ({
      ...r,
      publisherName: pubMap.get(r.publisherId) ?? 'Unknown'
    }));

    return { packages, total: total?.count ?? 0, page, limit };
  });

export const adminUpdatePackageFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { skillId: string; status?: string; featured?: boolean }) => input)
  .handler(async ({ data }) => {
    const session = await requireAdmin();
    const updates: Record<string, unknown> = {};
    if (data.status !== undefined) {
      updates.status = data.status;
      updates.statusChangedBy = session.user.id;
      updates.statusChangedAt = new Date();
    }
    if (data.featured !== undefined) {
      updates.featured = data.featured;
      updates.featuredBy = session.user.id;
      updates.featuredAt = data.featured ? new Date() : null;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(skills).set(updates).where(eq(skills.id, data.skillId));
    }
    return { ok: true };
  });

export const adminDeletePackageFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { skillId: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(skills).where(eq(skills.id, data.skillId));
    return { ok: true };
  });

// ── Organizations ─────────────────────────────────────────────────────────

interface AdminOrgsInput {
  q?: string;
  page?: number;
  limit?: number;
}

export const adminOrgsFn = createServerFn({ method: 'GET' })
  .inputValidator((input: AdminOrgsInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();

    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (data.q) {
      conditions.push(or(ilike(organization.name, `%${data.q}%`), ilike(organization.slug, `%${data.q}%`)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt
      })
      .from(organization)
      .where(where)
      .orderBy(desc(organization.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(organization).where(where);

    // Count members per org
    const orgIds = rows.map((r) => r.id);
    const memberCounts =
      orgIds.length > 0
        ? await db
            .select({ orgId: member.organizationId, count: count() })
            .from(member)
            .where(sql`${member.organizationId} IN ${orgIds}`)
            .groupBy(member.organizationId)
        : [];
    const mcMap = new Map(memberCounts.map((m) => [m.orgId, m.count]));

    const orgs = rows.map((r) => ({
      ...r,
      memberCount: mcMap.get(r.id) ?? 0
    }));

    return { orgs, total: total?.count ?? 0, page, limit };
  });

export const adminOrgMembersFn = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => input)
  .handler(async ({ data: orgId }) => {
    await requireAdmin();
    const members = await db
      .select({
        id: member.id,
        role: member.role,
        userId: member.userId,
        userName: user.name,
        userEmail: user.email,
        createdAt: member.createdAt
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, orgId));
    return members;
  });

// ── Service Accounts ──────────────────────────────────────────────────────

interface AdminServiceAccountsInput {
  q?: string;
  page?: number;
  limit?: number;
}

export const adminServiceAccountsFn = createServerFn({ method: 'GET' })
  .inputValidator((input: AdminServiceAccountsInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();

    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (data.q) {
      conditions.push(ilike(serviceAccounts.displayName, `%${data.q}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: serviceAccounts.id,
        displayName: serviceAccounts.displayName,
        description: serviceAccounts.description,
        disabled: serviceAccounts.disabled,
        ownerUserId: serviceAccounts.ownerUserId,
        orgId: serviceAccounts.orgId,
        userId: serviceAccounts.userId,
        createdAt: serviceAccounts.createdAt
      })
      .from(serviceAccounts)
      .where(where)
      .orderBy(desc(serviceAccounts.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(serviceAccounts).where(where);

    // Resolve owner names
    const ownerIds = [...new Set(rows.map((r) => r.ownerUserId))];
    const owners =
      ownerIds.length > 0
        ? await db.select({ id: user.id, name: user.name }).from(user).where(sql`${user.id} IN ${ownerIds}`)
        : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

    // Count API keys per service account user
    const saUserIds = rows.map((r) => r.userId);
    const keyCounts =
      saUserIds.length > 0
        ? await db
            .select({ userId: apikey.userId, count: count() })
            .from(apikey)
            .where(sql`${apikey.userId} IN ${saUserIds}`)
            .groupBy(apikey.userId)
        : [];
    const keyMap = new Map(keyCounts.map((k) => [k.userId, k.count]));

    const accounts = rows.map((r) => ({
      ...r,
      ownerName: ownerMap.get(r.ownerUserId) ?? 'Unknown',
      apiKeyCount: keyMap.get(r.userId) ?? 0
    }));

    return { accounts, total: total?.count ?? 0, page, limit };
  });

export const adminToggleServiceAccountFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { accountId: string; disabled: boolean }) => input)
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.update(serviceAccounts).set({ disabled: data.disabled }).where(eq(serviceAccounts.id, data.accountId));
    return { ok: true };
  });

// ── Audit Logs ────────────────────────────────────────────────────────────

interface AdminAuditLogsInput {
  action?: string;
  page?: number;
  limit?: number;
}

export const adminAuditLogsFn = createServerFn({ method: 'GET' })
  .inputValidator((input: AdminAuditLogsInput) => input)
  .handler(async ({ data }) => {
    await requireAdmin();

    const page = data.page ?? 1;
    const limit = data.limit ?? 30;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (data.action && data.action !== 'all') {
      conditions.push(eq(auditEvents.action, data.action));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorId: auditEvents.actorId,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt
      })
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(auditEvents).where(where);

    // Resolve actor names
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors =
      actorIds.length > 0
        ? await db.select({ id: user.id, name: user.name }).from(user).where(sql`${user.id} IN ${actorIds}`)
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.name]));

    const events = rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actorId,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata ? JSON.stringify(r.metadata) : null,
      createdAt: r.createdAt,
      actorName: r.actorId ? (actorMap.get(r.actorId) ?? 'Unknown') : 'System'
    }));

    return { events, total: total?.count ?? 0, page, limit };
  });
