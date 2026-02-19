import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { user } from '@/lib/db/auth-schema';

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
      publisherName: user.name,
    })
    .from(skills)
    .innerJoin(user, eq(skills.publisherId, user.id))
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
      name: skill.publisherName,
    },
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  });
}
