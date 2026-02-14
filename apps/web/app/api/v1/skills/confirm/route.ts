import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyCliAuth } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { computeAuditScore, type AuditScoreInput } from '@/lib/audit-score';

export async function POST(request: Request) {
  // 1. Verify CLI auth
  const verified = await verifyCliAuth(request);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { versionId, integrity, fileCount, tarballSize, readme } = body as {
    versionId?: string;
    integrity?: string;
    fileCount?: number;
    tarballSize?: number;
    readme?: string;
  };

  if (!versionId || !integrity) {
    return NextResponse.json(
      { error: 'Missing required fields: versionId, integrity' },
      { status: 400 },
    );
  }

  // 3. Look up version record
  const existingVersions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.id, versionId))
    .limit(1);

  if (existingVersions.length === 0) {
    return NextResponse.json(
      { error: 'Skill version not found' },
      { status: 404 },
    );
  }

  const version = existingVersions[0];

  // 4. Verify version is in pending-upload status
  if (version.auditStatus !== 'pending-upload') {
    return NextResponse.json(
      { error: 'Version is already confirmed or published' },
      { status: 400 },
    );
  }

  // 5. Look up skill name for response
  const existingSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.id, version.skillId))
    .limit(1);

  const skill = existingSkills[0];

  // 6. Update version record and compute audit score
  let auditScore: number | null = null;
  try {
    const manifest = version.manifest as AuditScoreInput['manifest'];
    const permissions = (version.permissions ?? {}) as Record<string, unknown>;

     const result = computeAuditScore({
      manifest,
      permissions,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      readme: typeof readme === 'string' ? readme : (version.readme ?? null),
      analysisResults: null, // No Python analysis yet — default scoring
    });

    auditScore = result.score;

    await db
      .update(skillVersions)
      .set({
        integrity,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        auditScore: result.score,
        auditStatus: 'completed',
        ...(typeof readme === 'string' ? { readme } : {}),
      })
      .where(eq(skillVersions.id, versionId));
  } catch {
    // Scoring failed — still mark as published (fallback)
    await db
      .update(skillVersions)
      .set({
        integrity,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        auditStatus: 'published',
        ...(typeof readme === 'string' ? { readme } : {}),
      })
      .where(eq(skillVersions.id, versionId));
  }

  // 7. Return success
  return NextResponse.json({
    success: true,
    name: skill?.name ?? 'unknown',
    version: version.version,
    auditScore,
  });
}
