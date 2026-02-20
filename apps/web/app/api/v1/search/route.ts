import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * GET /api/v1/search — single-query search with count(*) OVER() window function.
 *
 * Consolidation: eliminates the separate COUNT query by using a window function.
 * Joins through publishers table (uuid FK) to get publisher display name,
 * avoiding the uuid=text mismatch from joining skills directly to user table.
 * Round-trips: 1 (was 2).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const offset = (page - 1) * limit;

  // Build the full-text search condition (only when q is provided)
  // Use raw s.col references to match the FROM alias (not Drizzle column refs
  // which render as "skills"."col" and cause 42P01 alias mismatch).
  const searchCondition = q
    ? sql`to_tsvector('english', s.name || ' ' || coalesce(s.description, '')) @@ plainto_tsquery('english', ${q})`
    : undefined;

  // Single query: paginated results + total count via window function.
  // Joins through user table to resolve publisher name.
  const orderClause = q
    ? sql`ts_rank(to_tsvector('english', s.name || ' ' || coalesce(s.description, '')), plainto_tsquery('english', ${q})) DESC`
    : sql`s.updated_at DESC`;

  const whereClause = searchCondition
    ? sql`WHERE ${searchCondition}`
    : sql``;

  const results = await db.execute(sql`
    SELECT
      s.name,
      s.description,
      sv.version AS "latestVersion",
      sv.audit_score AS "auditScore",
      coalesce(u.name, '') AS publisher,
      count(*) OVER() AS total
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    ${whereClause}
    ORDER BY ${orderClause}
    OFFSET ${offset}
    LIMIT ${limit}
  `);

  const total = results.length > 0 ? Number(results[0].total) : 0;

  // Map results to response shape
  const mappedResults = results.map((row: Record<string, unknown>) => ({
    name: row.name as string,
    description: row.description as string | null,
    latestVersion: (row.latestVersion as string) ?? null,
    auditScore: row.auditScore != null ? Number(row.auditScore) : null,
    publisher: (row.publisher as string) ?? '',
    downloads: 0,
  }));

  return NextResponse.json({
    results: mappedResults,
    page,
    limit,
    total,
  });
}
