import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publishers, skills, skillVersions } from '@/lib/db/schema';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  // 1. Look up skill by name
  const existingSkills = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      publisherId: skills.publisherId,
      orgId: skills.orgId,
      createdAt: skills.createdAt,
      updatedAt: skills.updatedAt,
      publisherDisplayName: publishers.displayName,
    })
    .from(skills)
    .innerJoin(publishers, eq(skills.publisherId, publishers.id))
    .where(eq(skills.name, name))
    .limit(1);

  if (existingSkills.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const skill = existingSkills[0];

  // 2. Get latest version (most recently published)
  const latestVersions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt))
    .limit(1);

  const latestVersion = latestVersions[0] ?? null;

  // 3. Return response
  return NextResponse.json({
    name: skill.name,
    description: skill.description,
    latestVersion: latestVersion?.version ?? null,
    publisher: {
      displayName: skill.publisherDisplayName,
    },
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  });
}
