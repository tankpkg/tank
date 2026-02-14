import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { skills, skillVersions, skillDownloads } from '@/lib/db/schema';
import { supabaseAdmin } from '@/lib/supabase';

async function recordDownload(
  request: Request,
  skillId: string,
  versionId: string,
): Promise<void> {
  // 1. Hash the IP address for privacy
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex');

  // 2. Check for duplicate within last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const existing = await db
    .select({ id: skillDownloads.id })
    .from(skillDownloads)
    .where(
      and(
        eq(skillDownloads.skillId, skillId),
        eq(skillDownloads.ipHash, ipHash),
        sql`${skillDownloads.createdAt} > ${oneHourAgo}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) return; // Already counted within the hour

  // 3. Insert download record
  await db.insert(skillDownloads).values({
    skillId,
    versionId,
    ipHash,
    userAgent: request.headers.get('user-agent') ?? null,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; version: string }> },
) {
  const { name: rawName, version } = await params;
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

  // 2. Look up specific version
  const existingVersions = await db
    .select()
    .from(skillVersions)
    .where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)))
    .limit(1);

  if (existingVersions.length === 0) {
    return NextResponse.json(
      { error: `Version ${version} not found for ${name}` },
      { status: 404 },
    );
  }

  const skillVersion = existingVersions[0];

  // 3. Generate signed download URL (1 hour expiry)
  const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
    .from('packages')
    .createSignedUrl(skillVersion.tarballPath, 3600);

  if (downloadError || !downloadData) {
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 },
    );
  }

  // 4. Record download (fire-and-forget, don't block the response)
  recordDownload(request, skill.id, skillVersion.id).catch(() => {
    // Silently ignore download counting errors — don't break the download
  });

  // 5. Count total downloads for this skill
  const downloadCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillDownloads)
    .where(eq(skillDownloads.skillId, skill.id));

  // 6. Return response
  return NextResponse.json({
    name: skill.name,
    version: skillVersion.version,
    description: skill.description,
    integrity: skillVersion.integrity,
    permissions: skillVersion.permissions,
    auditScore: skillVersion.auditScore,
    auditStatus: skillVersion.auditStatus,
    downloadUrl: downloadData.signedUrl,
    publishedAt: skillVersion.createdAt,
    downloads: downloadCount[0]?.count ?? 0,
  });
}
