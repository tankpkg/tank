import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillStars } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

interface RouteParams {
  params: Promise<{ name: string }>;
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
    const userId = session?.user?.id;

    const skillRows = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, name))
      .limit(1);

    if (skillRows.length === 0) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const skillId = skillRows[0].id;
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

    const skillRows = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, name))
      .limit(1);

    if (skillRows.length === 0) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const skillId = skillRows[0].id;

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

    const skillRows = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, name))
      .limit(1);

    if (skillRows.length === 0) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const skillId = skillRows[0].id;

    await db
      .delete(skillStars)
      .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, userId)));

    const starCount = await getStarCount(skillId);

    return NextResponse.json({ starCount, isStarred: false });
  } catch (error) {
    console.error('[Star DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
