import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { skillsJsonSchema } from '@tank/shared';
import { verifyCliAuth } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { organization, member, user, account } from '@/lib/db/auth-schema';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  // 1. Verify CLI auth
  const verified = await verifyCliAuth(request);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { manifest: rawManifest, readme, files } = body as { manifest?: unknown; readme?: string; files?: string[] };
  if (!rawManifest || typeof rawManifest !== 'object') {
    return NextResponse.json({ error: 'Missing manifest in request body' }, { status: 400 });
  }

  // 3. Normalize name to lowercase
  const manifestInput = rawManifest as Record<string, unknown>;
  if (typeof manifestInput.name === 'string') {
    manifestInput.name = manifestInput.name.toLowerCase().trim();
  }

  // 4. Validate manifest against schema
  const parsed = skillsJsonSchema.safeParse(manifestInput);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid manifest', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const manifest = parsed.data;
  const { name, version } = manifest;

  // 5. Ensure user has githubUsername populated (fetch from GitHub if not set)
  const [authUser] = await db
    .select({ name: user.name, githubUsername: user.githubUsername })
    .from(user)
    .where(eq(user.id, verified.userId))
    .limit(1);

  // Fetch GitHub username if not already set
  if (authUser && !authUser.githubUsername) {
    const [githubAccount] = await db
      .select({ accessToken: account.accessToken })
      .from(account)
      .where(and(eq(account.userId, verified.userId), eq(account.providerId, 'github')))
      .limit(1);

    if (githubAccount?.accessToken) {
      try {
        const ghRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${githubAccount.accessToken}`, Accept: 'application/json' },
        });
        if (ghRes.ok) {
          const gh = await ghRes.json() as { login: string };
          // Update user with github username
          await db
            .update(user)
            .set({ githubUsername: gh.login })
            .where(eq(user.id, verified.userId));
        }
      } catch { /* non-critical — fall back to null */ }
    }
  }

  // 6. Check org membership for scoped packages
  let orgId: string | null = null;
  const scopeMatch = name.match(/^@([^/]+)\//);
  if (scopeMatch) {
    const orgSlug = scopeMatch[1];

    // Look up the organization by slug directly (API key auth can't use session-based auth.api)
    const orgs = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    if (orgs.length === 0) {
      return NextResponse.json(
        { error: `Organization '${orgSlug}' not found. You must create the org before publishing scoped packages.` },
        { status: 403 },
      );
    }

    const org = orgs[0];

    const members = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, org.id), eq(member.userId, verified.userId)))
      .limit(1);

    if (members.length === 0) {
      return NextResponse.json(
        { error: `You are not a member of org '${orgSlug}'` },
        { status: 403 },
      );
    }

    orgId = org.id;
  }

  // 7. Find or create skill record
  const existingSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  let skill = existingSkills[0];
  if (!skill) {
    const [newSkill] = await db
      .insert(skills)
      .values({
        name,
        description: manifest.description ?? null,
        publisherId: verified.userId,
        orgId,
      })
      .returning();
    skill = newSkill;
  }

  // 8. Check for version conflict
  const existingVersions = await db
    .select()
    .from(skillVersions)
    .where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)))
    .limit(1);

  if (existingVersions.length > 0) {
    return NextResponse.json(
      { error: `Version ${version} already exists for ${name}` },
      { status: 409 },
    );
  }

  // 9. Create skill_version record with pending-upload status
  const tarballPath = `skills/${skill.id}/${version}.tgz`;
  // Add files array to manifest for UI display (after validation)
  const manifestWithFiles = {
    ...manifest,
    ...(Array.isArray(files) && files.length > 0 ? { files } : {}),
  } as Record<string, unknown>;
  const [skillVersion] = await db
    .insert(skillVersions)
    .values({
      skillId: skill.id,
      version,
      integrity: 'pending',
      tarballPath,
      tarballSize: 0,
      fileCount: 0,
      manifest: manifestWithFiles,
      permissions: (manifest.permissions ?? {}) as Record<string, unknown>,
      auditStatus: 'pending-upload',
      publishedBy: verified.userId,
      readme: typeof readme === 'string' ? readme : null,
    })
    .returning();

  // 10. Generate signed upload URL from Supabase Storage
  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('packages')
    .createSignedUploadUrl(tarballPath);

  if (uploadError || !uploadData) {
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 },
    );
  }

  // 11. Return response
  return NextResponse.json({
    uploadUrl: uploadData.signedUrl,
    skillId: skill.id,
    versionId: skillVersion.id,
  });
}
