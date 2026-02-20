import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';

/**
 * GET /api/v1/skills/[name]/versions — single query for skill + all versions.
 *
 * Consolidation: LEFT JOIN skill_versions onto skills in one query.
 * Filters out pending/incomplete versions in JS (same as before).
 * Round-trips: 1 (was 2).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  const rows = await db.execute(sql`
    SELECT
      s.name,
      sv.version,
      sv.integrity,
      sv.audit_score AS "auditScore",
      sv.audit_status AS "auditStatus",
      sv.created_at AS "publishedAt"
    FROM ${skills} s
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name}
    ORDER BY sv.created_at DESC
  `);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const skillName = (rows[0] as Record<string, unknown>).name as string;

  return NextResponse.json({
    name: skillName,
    versions: rows
      .filter((r: Record<string, unknown>) =>
        r.version !== null &&
        r.integrity !== 'pending' &&
        r.auditStatus !== 'pending-upload',
      )
      .map((r: Record<string, unknown>) => ({
        version: r.version as string,
        integrity: r.integrity as string,
        auditScore: r.auditScore != null ? Number(r.auditScore) : null,
        auditStatus: r.auditStatus as string,
        publishedAt: r.publishedAt as string,
      })),
  });
}
