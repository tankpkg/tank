import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveRequestUserId } from '@/lib/auth-helpers';
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
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const requesterUserId = await resolveRequestUserId(_request);
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const visibilityClause = requesterUserId
    ? sql`(
      s.visibility = 'public'
      OR s.publisher_id = ${requesterUserId}
      OR (
        s.visibility = 'private'
        AND (
          (s.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM "member" m WHERE m.organization_id = s.org_id AND m.user_id = ${requesterUserId}))
          OR EXISTS (
            SELECT 1
            FROM skill_access sa
            WHERE sa.skill_id = s.id
              AND (
                sa.granted_user_id = ${requesterUserId}
                OR (
                  sa.granted_org_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM "member" m2
                    WHERE m2.organization_id = sa.granted_org_id
                      AND m2.user_id = ${requesterUserId}
                  )
                )
              )
          )
        )
      )
    )`
    : sql`s.visibility = 'public'`;

  const results = await db.execute(sql`
    SELECT
      s.name,
      s.description,
      s.visibility,
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
    WHERE s.name = ${name} AND ${visibilityClause}
    LIMIT 1
  `);

  if (results.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const row = results[0] as Record<string, unknown>;

  return NextResponse.json({
    name: row.name as string,
    description: row.description as string | null,
    visibility: row.visibility as 'public' | 'private',
    latestVersion: (row.latestVersion as string) ?? null,
    publisher: {
      name: (row.publisherName as string) || null
    },
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  });
}
