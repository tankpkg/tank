import { NextRequest, NextResponse } from 'next/server';
import { eq, and, or, ilike, desc, sql, count } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { user, userStatus } from '@/lib/db/schema';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const search = url.searchParams.get('search') ?? undefined;
  const roleFilter = url.searchParams.get('role') ?? undefined;
  const statusFilter = url.searchParams.get('status') ?? undefined;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(user.name, `%${search}%`),
        ilike(user.email, `%${search}%`),
        ilike(user.githubUsername, `%${search}%`),
      ),
    );
  }

  if (roleFilter && (roleFilter === 'user' || roleFilter === 'admin')) {
    conditions.push(eq(user.role, roleFilter));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(user)
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const latestStatusSubquery = db
    .select({
      userId: userStatus.userId,
      status: userStatus.status,
      reason: userStatus.reason,
      expiresAt: userStatus.expiresAt,
      createdAt: userStatus.createdAt,
    })
    .from(userStatus)
    .where(
      sql`${userStatus.createdAt} = (
        SELECT MAX(us2.created_at) FROM user_status us2 WHERE us2.user_id = ${userStatus.userId}
      )`,
    )
    .as('latest_status');

  const statusConditions = [];
  if (whereClause) {
    statusConditions.push(whereClause);
  }
  if (statusFilter && (statusFilter === 'active' || statusFilter === 'suspended' || statusFilter === 'banned')) {
    if (statusFilter === 'active') {
      statusConditions.push(
        or(
          sql`${latestStatusSubquery.status} IS NULL`,
          eq(latestStatusSubquery.status, 'active'),
        ),
      );
    } else {
      statusConditions.push(eq(latestStatusSubquery.status, statusFilter));
    }
  }

  const combinedWhere = statusConditions.length > 0 ? and(...statusConditions) : undefined;

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      githubUsername: user.githubUsername,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
      latestStatusStatus: latestStatusSubquery.status,
      latestStatusReason: latestStatusSubquery.reason,
      latestStatusExpiresAt: latestStatusSubquery.expiresAt,
      latestStatusCreatedAt: latestStatusSubquery.createdAt,
    })
    .from(user)
    .leftJoin(latestStatusSubquery, eq(user.id, latestStatusSubquery.userId))
    .where(combinedWhere)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset(offset);

  const formattedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    githubUsername: u.githubUsername,
    image: u.image,
    role: u.role,
    createdAt: u.createdAt,
    latestStatus: u.latestStatusStatus
      ? {
          status: u.latestStatusStatus,
          reason: u.latestStatusReason,
          expiresAt: u.latestStatusExpiresAt,
          createdAt: u.latestStatusCreatedAt,
        }
      : null,
  }));

  return NextResponse.json({
    users: formattedUsers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});
