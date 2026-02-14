import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  // 1. Look up skill by name
  const existingSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (existingSkills.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const skill = existingSkills[0];

  // 2. Get all versions ordered by createdAt descending
  const versions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  // 3. Return response
  return NextResponse.json({
    name: skill.name,
    versions: versions.map((v) => ({
      version: v.version,
      integrity: v.integrity,
      auditScore: v.auditScore,
      auditStatus: v.auditStatus,
      publishedAt: v.createdAt,
    })),
  });
}
