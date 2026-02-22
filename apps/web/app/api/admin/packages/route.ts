import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';

/**
 * GET /api/admin/packages — List packages with pagination, search, status & featured filters.
 *
 * Query params:
 *   page     (default 1)
 *   limit    (default 25, max 100)
 *   search   (optional, ilike on name/description)
 *   status   (optional: 'active'|'deprecated'|'quarantined'|'removed')
 *   featured (optional: 'true'|'false')
 */
export const GET = withAdminAuth(async (req: NextRequest, _ctx: AdminAuthContext): Promise<NextResponse> => {
  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));
  const search = url.searchParams.get('search')?.trim() || null;
  const status = url.searchParams.get('status') || null;
  const featured = url.searchParams.get('featured') || null;
  const offset = (page - 1) * limit;

  // Validate status if provided
  const validStatuses = ['active', 'deprecated', 'quarantined', 'removed'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    );
  }

  // Build WHERE conditions
  const conditions: ReturnType<typeof sql>[] = [];
  if (status) {
    conditions.push(sql`s.status = ${status}`);
  }
  if (featured === 'true') {
    conditions.push(sql`s.featured = true`);
  } else if (featured === 'false') {
    conditions.push(sql`s.featured = false`);
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(sql`(s.name ILIKE ${pattern} OR s.description ILIKE ${pattern})`);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  // Count query
  const countResult = await db.execute(sql`
    SELECT count(*)::int AS total
    FROM ${skills} s
    ${whereClause}
  `);
  const total = (countResult[0] as { total: number }).total;
  const totalPages = Math.ceil(total / limit);

  // Data query with publisher info, version count, and download count
  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.name,
      s.description,
      s.status,
      s.featured,
      s.publisher_id AS "publisherId",
      coalesce(u.name, '') AS "publisherName",
      coalesce(u.email, '') AS "publisherEmail",
      coalesce(vc.version_count, 0)::int AS "versionCount",
      coalesce(dc.download_count, 0)::int AS "downloadCount",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt"
    FROM ${skills} s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS version_count
      FROM skill_versions sv
      WHERE sv.skill_id = s.id
    ) vc ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS download_count
      FROM skill_downloads sd
      WHERE sd.skill_id = s.id
    ) dc ON true
    ${whereClause}
    ORDER BY s.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const packages = (rows as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    status: row.status as string,
    featured: row.featured as boolean,
    publisherId: row.publisherId as string,
    publisher: {
      name: row.publisherName as string,
      email: row.publisherEmail as string,
    },
    versionCount: row.versionCount as number,
    downloadCount: row.downloadCount as number,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  }));

  return NextResponse.json({ packages, total, page, limit, totalPages });
});
