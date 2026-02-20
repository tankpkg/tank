import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, user } from '@/lib/db/schema';

/**
 * GET /api/v1/skills/[name] — single-query skill metadata with latest version.
 *
 * Consolidation: merges skill lookup + latest version into one query via LEFT JOIN
 * with correlated subquery. Joins through user table (text FK) to get
 * publisher name from user.name field.
 * Round-trips: 1 (was 2).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  const results = await db.execute(sql`
    SELECT
      s.name,
      s.description,
      sv.version AS "latestVersion",
      coalesce(u.name, '') AS "publisherName",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt"
    FROM ${skills} s
    LEFT JOIN ${user} u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    WHERE s.name = ${name}
    LIMIT 1
  `);

  if (results.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const row = results[0] as Record<string, unknown>;

  return NextResponse.json({
    name: row.name as string,
    description: row.description as string | null,
    latestVersion: (row.latestVersion as string) ?? null,
    publisher: {
      name: (row.publisherName as string) || null,
    },
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  });
}
