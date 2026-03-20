import { count, eq, ilike, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { member, organization } from '~/lib/db/auth-schema';
import { auditEvents } from '~/lib/db/schema';

export const orgsRoutes = new Hono()

  .get('/', async (c) => {
    const search = c.req.query('search');
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const where = search ? ilike(organization.name, `%${search}%`) : undefined;

    const memberCount = db
      .select({
        organizationId: member.organizationId,
        count: count().as('member_count')
      })
      .from(member)
      .groupBy(member.organizationId)
      .as('member_counts');

    let query = db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        memberCount: sql<number>`coalesce(${memberCount.count}, 0)`
      })
      .from(organization)
      .leftJoin(memberCount, eq(organization.id, memberCount.organizationId))
      .$dynamic();

    if (where) {
      query = query.where(where);
    }

    const [orgs, totalRows] = await Promise.all([
      query.orderBy(organization.createdAt).offset(offset).limit(limit),
      db.select({ count: count() }).from(organization).where(where)
    ]);

    return c.json({ orgs, total: totalRows[0].count, page, limit });
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');

    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        metadata: organization.metadata
      })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const members = await db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt
      })
      .from(member)
      .where(eq(member.organizationId, id));

    return c.json({ ...rows[0], members, memberCount: members.length });
  })

  .delete('/:id/members/:memberId', async (c) => {
    const orgId = c.req.param('id');
    const memberId = c.req.param('memberId');

    const orgRows = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (orgRows.length === 0) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    try {
      await auth.api.removeMember({
        headers: c.req.raw.headers,
        body: { organizationId: orgId, memberIdOrEmail: memberId }
      });
    } catch (err) {
      return c.json(
        { error: 'Failed to remove member', details: err instanceof Error ? err.message : 'Unknown error' },
        400
      );
    }

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.org.remove_member',
      actorId: adminUser.id,
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId }
    });

    return c.json({ success: true });
  });
