import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillStars } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { canReadSkill, resolveRequestUserId } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ name: string }>;
}

let skillStarsTableExists: boolean | null = null;

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '42P01' || maybeError.cause?.code === '42P01';
}

async function hasSkillStarsTable(): Promise<boolean> {
  if (skillStarsTableExists !== null) {
    return skillStarsTableExists;
  }

  try {
    const result = await db.execute(
      sql`SELECT to_regclass('public.skill_stars') IS NOT NULL AS "exists"`,
    ) as Array<{ exists: boolean }>;
    skillStarsTableExists = Boolean(result[0]?.exists);
  } catch {
    skillStarsTableExists = false;
  }

  return skillStarsTableExists;
}

function starsUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Stars feature is temporarily unavailable. Migration pending.',
      code: 'STARS_UNAVAILABLE',
    },
    { status: 503 },
  );
}

function starsUnavailableReadResponse(): NextResponse {
  return NextResponse.json({ starCount: 0, isStarred: false, starsAvailable: false });
}

async function resolveSkillWithAccess(
  name: string,
  userId: string | null,
): Promise<string | null> {
  const skillRows = await db
    .select({
      id: skills.id,
      visibility: skills.visibility,
      publisherId: skills.publisherId,
      orgId: skills.orgId,
    })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (skillRows.length === 0) {
    return null;
  }

  const row = skillRows[0];
  const normalizedVisibility = row.visibility === 'private' ? 'private' : 'public';
  const allowed = await canReadSkill(
    { skillId: row.id, visibility: normalizedVisibility, publisherId: row.publisherId, orgId: row.orgId },
    userId,
  );

  if (!allowed) {
    return null;
  }

  return row.id;
}

async function getStarCount(skillId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillStars)
    .where(eq(skillStars.skillId, skillId));
  return result[0]?.count ?? 0;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { name: rawName } = await params;
    const name = decodeURIComponent(rawName);

    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? await resolveRequestUserId(request);

    const skillId = await resolveSkillWithAccess(name, userId ?? null);
    if (!skillId) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const starsTableAvailable = await hasSkillStarsTable();
    if (!starsTableAvailable) {
      return starsUnavailableReadResponse();
    }

    const starCount = await getStarCount(skillId);

    let isStarred = false;
    if (userId) {
      const starRows = await db
        .select({ id: skillStars.id })
        .from(skillStars)
        .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, userId)))
        .limit(1);
      isStarred = starRows.length > 0;
    }

    return NextResponse.json({ starCount, isStarred });
  } catch (error) {
    if (isMissingRelationError(error)) {
      skillStarsTableExists = false;
      return starsUnavailableReadResponse();
    }
    console.error('[Star GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { name: rawName } = await params;
    const name = decodeURIComponent(rawName);

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const skillId = await resolveSkillWithAccess(name, userId);
    if (!skillId) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const starsTableAvailable = await hasSkillStarsTable();
    if (!starsTableAvailable) {
      return starsUnavailableResponse();
    }

    const existing = await db
      .select({ id: skillStars.id })
      .from(skillStars)
      .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, userId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ message: 'Already starred' });
    }

    await db.insert(skillStars).values({ skillId, userId });
    const starCount = await getStarCount(skillId);

    return NextResponse.json({ starCount, isStarred: true });
  } catch (error) {
    if (isMissingRelationError(error)) {
      skillStarsTableExists = false;
      return starsUnavailableResponse();
    }
    console.error('[Star POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { name: rawName } = await params;
    const name = decodeURIComponent(rawName);

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const skillId = await resolveSkillWithAccess(name, userId);
    if (!skillId) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const starsTableAvailable = await hasSkillStarsTable();
    if (!starsTableAvailable) {
      return starsUnavailableResponse();
    }

    await db
      .delete(skillStars)
      .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, userId)));

    const starCount = await getStarCount(skillId);

    return NextResponse.json({ starCount, isStarred: false });
  } catch (error) {
    if (isMissingRelationError(error)) {
      skillStarsTableExists = false;
      return starsUnavailableResponse();
    }
    console.error('[Star DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
