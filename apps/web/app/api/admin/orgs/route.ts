import { NextRequest, NextResponse } from 'next/server';
import { sql, ilike, or, count } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { organization } from '@/lib/db/auth-schema';

export const GET = withAdminAuth(async (req: NextRequest, _ctx: AdminAuthContext) => {
  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));
  const search = url.searchParams.get('search')?.trim() || null;
  const offset = (page - 1) * limit;

  const searchCondition = search
    ? or(
        ilike(organization.name, `%${search}%`),
        ilike(organization.slug, `%${search}%`),
      )
    : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(organization)
    .where(searchCondition);
  const total = totalResult.count;

  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      createdAt: organization.createdAt,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM member
        WHERE member.organization_id = ${organization.id}
      )`,
      packageCount: sql<number>`(
        SELECT count(*)::int FROM skills
        WHERE skills.org_id = ${organization.id}
      )`,
    })
    .from(organization)
    .where(searchCondition)
    .orderBy(organization.createdAt)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    orgs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});
