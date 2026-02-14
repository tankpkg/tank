import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _request: Request,
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

  // 4. Return response
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
  });
}
