import { NextResponse } from 'next/server';
import { sql, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillVersions, publishers } from '@/lib/db/schema';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const offset = (page - 1) * limit;

  // Build the full-text search condition (only when q is provided)
  const searchCondition = q
    ? sql`to_tsvector('english', ${skills.name} || ' ' || coalesce(${skills.description}, '')) @@ plainto_tsquery('english', ${q})`
    : undefined;

  // Count total matching results
  const countResult = searchCondition
    ? await db.execute(
        sql`SELECT count(*)::int as count FROM skills WHERE ${searchCondition}`,
      )
    : await db.execute(sql`SELECT count(*)::int as count FROM skills`);

  const total = countResult[0]?.count ?? 0;

  // Fetch paginated results with latest version info
  let query = db
    .select({
      name: skills.name,
      description: skills.description,
      latestVersion: skillVersions.version,
      auditScore: skillVersions.auditScore,
      publisher: publishers.displayName,
    })
    .from(skills)
    .leftJoin(publishers, eq(skills.publisherId, publishers.id))
    .leftJoin(
      skillVersions,
      sql`${skillVersions.skillId} = ${skills.id} AND ${skillVersions.createdAt} = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = ${skills.id}
      )`,
    );

  const results = searchCondition
    ? await query
        .where(searchCondition)
        .orderBy(
          sql`ts_rank(to_tsvector('english', ${skills.name} || ' ' || coalesce(${skills.description}, '')), plainto_tsquery('english', ${q})) DESC`,
        )
        .offset(offset)
        .limit(limit)
    : await query.orderBy(desc(skills.updatedAt)).offset(offset).limit(limit);

  // Map results to response shape
  const mappedResults = results.map((row) => ({
    name: row.name,
    description: row.description,
    latestVersion: row.latestVersion ?? null,
    auditScore: row.auditScore ?? null,
    publisher: row.publisher ?? '',
    downloads: 0,
  }));

  return NextResponse.json({
    results: mappedResults,
    page,
    limit,
    total,
  });
}
