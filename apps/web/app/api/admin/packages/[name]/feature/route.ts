import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skills, auditEvents } from '@/lib/db/schema';

function extractName(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  const packagesIdx = segments.indexOf('packages');
  return decodeURIComponent(segments[packagesIdx + 1]);
}

export const POST = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
  const name = extractName(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { featured } = body as Record<string, unknown>;

  if (typeof featured !== 'boolean') {
    return NextResponse.json(
      { error: 'featured must be a boolean' },
      { status: 400 },
    );
  }

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, featured: skills.featured })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        featured,
        featuredBy: featured ? adminUser.id : null,
        featuredAt: featured ? new Date() : null,
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: featured ? 'skill.feature' : 'skill.unfeature',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { featured },
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    featured,
  });
});
