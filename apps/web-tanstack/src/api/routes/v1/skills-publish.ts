import { skillsJsonSchema } from '@internals/schemas';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { verifyCliAuth } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { account, member, organization, user } from '~/lib/db/auth-schema';
import { skills, skillVersions } from '~/lib/db/schema';
import { checkPermissionEscalation, type VersionPermissions } from '~/lib/skills/permission-escalation';
import { getStorageProvider } from '~/lib/services/storage/provider';

export const skillsPublishRoutes = new Hono().post('/', async (c) => {
  const verified = await verifyCliAuth(c.req.raw, ['skills:publish']);
  if (!verified) {
    return c.json({ error: 'Unauthorized. Valid API key with skills:publish scope required.' }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { manifest: rawManifest, readme, files } = body as { manifest?: unknown; readme?: string; files?: string[] };
  if (!rawManifest || typeof rawManifest !== 'object') {
    return c.json({ error: 'Missing manifest in request body' }, 400);
  }

  const manifestInput = rawManifest as Record<string, unknown>;
  if (typeof manifestInput.name === 'string') {
    manifestInput.name = manifestInput.name.toLowerCase().trim();
  }

  const parsed = skillsJsonSchema.safeParse(manifestInput);
  if (!parsed.success) {
    return c.json({ error: 'Invalid manifest', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const manifest = parsed.data;
  const { name, version } = manifest;

  // Fetch GitHub username if not already set (best-effort, non-blocking)
  let authUser: { name: string | null; githubUsername: string | null } | undefined;
  try {
    const result = await db
      .select({ name: user.name, githubUsername: user.githubUsername })
      .from(user)
      .where(eq(user.id, verified.userId))
      .limit(1);
    authUser = result[0];
  } catch {
    // Column may not exist in runtime DB
  }

  if (authUser && !authUser.githubUsername) {
    try {
      const [githubAccount] = await db
        .select({ accessToken: account.accessToken })
        .from(account)
        .where(and(eq(account.userId, verified.userId), eq(account.providerId, 'github')))
        .limit(1);

      if (githubAccount?.accessToken) {
        try {
          const ghRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${githubAccount.accessToken}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000)
          });
          if (ghRes.ok) {
            const gh = (await ghRes.json()) as { login: string };
            try {
              await db.update(user).set({ githubUsername: gh.login }).where(eq(user.id, verified.userId));
            } catch {
              // Update may fail if column missing
            }
          }
        } catch {
          // GitHub API call failed
        }
      }
    } catch {
      // Account lookup failed
    }
  }

  // Check org membership for scoped packages
  let orgId: string | null = null;
  const scopeMatch = name.match(/^@([^/]+)\//);
  if (scopeMatch) {
    const orgSlug = scopeMatch[1];

    const orgs = await db.select().from(organization).where(eq(organization.slug, orgSlug)).limit(1);

    if (orgs.length === 0) {
      return c.json(
        { error: `Organization '${orgSlug}' not found. You must create the org before publishing scoped packages.` },
        404
      );
    }

    const org = orgs[0];

    const members = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, org.id), eq(member.userId, verified.userId)))
      .limit(1);

    if (members.length === 0) {
      return c.json({ error: `You are not a member of org '${orgSlug}'` }, 403);
    }

    orgId = org.id;
  }

  const resolvedVisibility = manifest.visibility ?? 'public';

  // Find or create skill record
  const existingSkills = await db.select().from(skills).where(eq(skills.name, name)).limit(1);

  let skill = existingSkills[0];
  if (!skill) {
    const [newSkill] = await db
      .insert(skills)
      .values({
        name,
        description: manifest.description ?? null,
        repositoryUrl: manifest.repository ?? null,
        publisherId: verified.userId,
        orgId,
        visibility: resolvedVisibility
      })
      .returning();
    skill = newSkill;
  } else {
    const updates: Record<string, string | null> = {};
    if (manifest.description !== undefined) {
      updates.description = manifest.description;
    }
    if (manifest.repository !== undefined) {
      updates.repositoryUrl = manifest.repository;
    }
    if (manifest.visibility !== undefined) {
      updates.visibility = manifest.visibility;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(skills).set(updates).where(eq(skills.id, skill.id));
    }
  }

  // Check for version conflict
  const existingVersions = await db
    .select()
    .from(skillVersions)
    .where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)))
    .limit(1);

  if (existingVersions.length > 0) {
    return c.json({ error: `Version ${version} already exists for ${name}` }, 409);
  }

  // Permission escalation check
  const previousVersions = await db
    .select({ version: skillVersions.version, permissions: skillVersions.permissions })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt))
    .limit(1);

  if (previousVersions.length > 0) {
    const prev = previousVersions[0];
    const escalationResult = checkPermissionEscalation(
      prev.version,
      prev.permissions as VersionPermissions,
      version,
      (manifest.permissions ?? {}) as VersionPermissions
    );

    if (!escalationResult.allowed) {
      return c.json(
        {
          error: 'Permission escalation detected',
          details: escalationResult.violations
        },
        400
      );
    }
  }

  // Clean up stale pending-upload versions before creating new one
  await db
    .delete(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.publishedBy, verified.userId),
        eq(skillVersions.auditStatus, 'pending-upload')
      )
    );

  // Create skill_version record with pending-upload status
  const tarballPath = `skills/${skill.id}/${version}.tgz`;
  const manifestWithFiles = {
    ...manifest,
    ...(Array.isArray(files) && files.length > 0 ? { files } : {})
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
      readme: typeof readme === 'string' ? readme : null
    })
    .returning();

  // Generate signed upload URL
  let signedUploadUrl: string;
  try {
    const uploadData = await getStorageProvider().createSignedUploadUrl(tarballPath);
    signedUploadUrl = uploadData.signedUrl;
  } catch {
    return c.json({ error: 'Failed to generate upload URL' }, 500);
  }

  return c.json({
    uploadUrl: signedUploadUrl,
    skillId: skill.id,
    versionId: skillVersion.id
  });
});
