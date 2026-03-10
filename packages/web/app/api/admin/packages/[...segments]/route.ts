import { skillStatusSchema } from '@internal/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { type AdminAuthContext, withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { organization, user } from '@/lib/db/auth-schema';
import {
  auditEvents,
  scanFindings,
  scanResults,
  skillAccess,
  skillDownloadDaily,
  skills,
  skillVersions,
  userStatus
} from '@/lib/db/schema';
import { rescanVersion } from '@/lib/rescan';

// Vercel CDN decodes %2F → / in URL paths, so scoped packages like
// @tank/skill-creator arrive as multiple path segments. Parse from URL path
// and split off trailing action keywords (feature, status).

const ACTIONS = new Set(['feature', 'status', 'visibility', 'access-grants', 'publisher-ban-delete']);

type ParsedRequest = {
  name: string;
  action:
    | 'feature'
    | 'status'
    | 'visibility'
    | 'access-grants'
    | 'publisher-ban-delete'
    | 'version'
    | 'rescan-version'
    | undefined;
  version: string | undefined;
};

function parseSegments(segments: string[]): ParsedRequest {
  // Match: {name}/versions/{version}/rescan
  if (
    segments.length >= 4 &&
    segments[segments.length - 3] === 'versions' &&
    segments[segments.length - 1] === 'rescan'
  ) {
    return {
      name: segments.slice(0, -3).join('/'),
      action: 'rescan-version',
      version: segments[segments.length - 2]
    };
  }

  // Match: {name}/versions/{version}
  if (segments.length >= 3 && segments[segments.length - 2] === 'versions') {
    return {
      name: segments.slice(0, -2).join('/'),
      action: 'version',
      version: segments[segments.length - 1]
    };
  }

  const last = segments[segments.length - 1];
  if (segments.length >= 2 && ACTIONS.has(last)) {
    return {
      name: segments.slice(0, -1).join('/'),
      action: last as 'feature' | 'status' | 'visibility' | 'access-grants' | 'publisher-ban-delete',
      version: undefined
    };
  }
  return { name: segments.join('/'), action: undefined, version: undefined };
}

function parseRequest(req: NextRequest): ParsedRequest {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const packagesIdx = segments.indexOf('packages');
  if (packagesIdx === -1 || packagesIdx === segments.length - 1) {
    return { name: '', action: undefined, version: undefined };
  }

  const packageSegments = segments.slice(packagesIdx + 1).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  return parseSegments(packageSegments);
}

async function handleGetDetail(name: string): Promise<NextResponse> {
  const [skill] = await db.select().from(skills).where(eq(skills.name, name)).limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const [publisher] = await db
    .select({ id: user.id, name: user.name, email: user.email, githubUsername: user.githubUsername })
    .from(user)
    .where(eq(user.id, skill.publisherId))
    .limit(1);

  const versions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const downloadCountResult = await db
    .select({ count: sql<number>`coalesce(sum(count), 0)::int` })
    .from(skillDownloadDaily)
    .where(eq(skillDownloadDaily.skillId, skill.id));
  const downloadCount = downloadCountResult[0]?.count ?? 0;

  const statusHistory = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, skill.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  const filteredHistory = statusHistory.filter((event) => event.targetType === 'skill');

  return NextResponse.json({
    package: {
      ...skill,
      publisher: publisher ?? null,
      versions,
      downloadCount,
      statusHistory: filteredHistory
    }
  });
}

async function handleDelete(name: string, adminUser: AdminAuthContext['user']): Promise<NextResponse> {
  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousStatus = skill.status;

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        status: 'removed',
        statusReason: 'Removed by admin',
        statusChangedBy: adminUser.id,
        statusChangedAt: new Date()
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: 'skill.remove',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { reason: 'Removed by admin', previousStatus }
    });
  });

  return NextResponse.json({ success: true, name: skill.name, status: 'removed' });
}

async function readJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  if (!req.body) {
    return null;
  }

  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function handleForceDelete(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  const body = await readJsonBody(req);

  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const packageName = body.packageName;
  const confirmText = body.confirmText;
  const reasonValue = body.reason;

  if (packageName !== name || confirmText !== 'DELETE') {
    return NextResponse.json({ error: 'Force delete confirmation failed' }, { status: 400 });
  }

  const reason =
    typeof reasonValue === 'string' && reasonValue.trim().length > 0 ? reasonValue.trim() : 'Force deleted by admin';

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const versionRows = await db
    .select({ id: skillVersions.id })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id));

  const versionIds = versionRows.map((row) => row.id);

  await db.transaction(async (tx) => {
    if (versionIds.length > 0) {
      await tx.delete(scanFindings).where(
        sql`${scanFindings.scanId} in (
            select ${scanResults.id}
            from ${scanResults}
            where ${inArray(scanResults.versionId, versionIds)}
          )`
      );

      await tx.delete(scanResults).where(inArray(scanResults.versionId, versionIds));
    }

    await tx.delete(skillDownloadDaily).where(eq(skillDownloadDaily.skillId, skill.id));

    await tx.delete(skillVersions).where(eq(skillVersions.skillId, skill.id));

    await tx.insert(auditEvents).values({
      action: 'skill.force_delete',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: {
        reason,
        previousStatus: skill.status,
        deletedVersionCount: versionIds.length
      }
    });

    await tx.delete(skills).where(eq(skills.id, skill.id));
  });

  return NextResponse.json({
    success: true,
    mode: 'force',
    name: skill.name,
    deletedVersionCount: versionIds.length
  });
}

async function handleDeleteVersion(
  name: string,
  version: string,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  const [skill] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const [versionRow] = await db
    .select({ id: skillVersions.id, version: skillVersions.version })
    .from(skillVersions)
    .where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(scanFindings).where(
      sql`${scanFindings.scanId} in (
          select ${scanResults.id}
          from ${scanResults}
          where ${scanResults.versionId} = ${versionRow.id}
        )`
    );

    await tx.delete(scanResults).where(eq(scanResults.versionId, versionRow.id));

    await tx.delete(skillVersions).where(eq(skillVersions.id, versionRow.id));

    await tx.update(skills).set({ updatedAt: new Date() }).where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: 'skill.version.delete',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { version: versionRow.version }
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    version: versionRow.version
  });
}

async function handleBanPublisherAndDeleteAll(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  const body = await readJsonBody(req);

  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const packageName = body.packageName;
  const confirmText = body.confirmText;
  const reasonValue = body.reason;

  if (packageName !== name || confirmText !== 'BAN_DELETE_ALL') {
    return NextResponse.json({ error: 'Ban + delete confirmation failed' }, { status: 400 });
  }

  const [sourceSkill] = await db
    .select({
      id: skills.id,
      name: skills.name,
      publisherId: skills.publisherId
    })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!sourceSkill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  if (adminUser.id === sourceSkill.publisherId) {
    return NextResponse.json({ error: 'Cannot ban your own account' }, { status: 400 });
  }

  const reason =
    typeof reasonValue === 'string' && reasonValue.trim().length > 0
      ? reasonValue.trim()
      : `Publisher banned while deleting all packages (source: ${name})`;

  const publisherSkills = await db
    .select({
      id: skills.id,
      name: skills.name,
      status: skills.status
    })
    .from(skills)
    .where(eq(skills.publisherId, sourceSkill.publisherId));

  if (publisherSkills.length === 0) {
    return NextResponse.json({ error: 'Publisher has no packages to delete' }, { status: 404 });
  }

  const skillIds = publisherSkills.map((row) => row.id);
  const versionRows = await db
    .select({ id: skillVersions.id })
    .from(skillVersions)
    .where(inArray(skillVersions.skillId, skillIds));
  const versionIds = versionRows.map((row) => row.id);

  await db.transaction(async (tx) => {
    await tx.insert(userStatus).values({
      userId: sourceSkill.publisherId,
      status: 'banned',
      reason,
      bannedBy: adminUser.id,
      expiresAt: null
    });

    await tx.insert(auditEvents).values({
      action: 'user.ban',
      actorId: adminUser.id,
      targetType: 'user',
      targetId: sourceSkill.publisherId,
      metadata: {
        reason,
        sourcePackage: sourceSkill.name,
        removedPackageCount: publisherSkills.length
      }
    });

    if (versionIds.length > 0) {
      await tx.delete(scanFindings).where(
        sql`${scanFindings.scanId} in (
            select ${scanResults.id}
            from ${scanResults}
            where ${inArray(scanResults.versionId, versionIds)}
          )`
      );

      await tx.delete(scanResults).where(inArray(scanResults.versionId, versionIds));
    }

    await tx.delete(skillDownloadDaily).where(inArray(skillDownloadDaily.skillId, skillIds));

    await tx.delete(skillVersions).where(inArray(skillVersions.skillId, skillIds));

    for (const publisherSkill of publisherSkills) {
      await tx.insert(auditEvents).values({
        action: 'skill.force_delete',
        actorId: adminUser.id,
        targetType: 'skill',
        targetId: publisherSkill.id,
        metadata: {
          reason,
          previousStatus: publisherSkill.status,
          publisherId: sourceSkill.publisherId,
          sourcePackage: sourceSkill.name
        }
      });
    }

    await tx.delete(skills).where(inArray(skills.id, skillIds));
  });

  return NextResponse.json({
    success: true,
    publisherId: sourceSkill.publisherId,
    deletedPackageCount: publisherSkills.length,
    deletedPackageNames: publisherSkills.map((row) => row.name)
  });
}

async function handleFeature(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
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
    return NextResponse.json({ error: 'featured must be a boolean' }, { status: 400 });
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
        featuredAt: featured ? new Date() : null
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: featured ? 'skill.feature' : 'skill.unfeature',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { featured }
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    featured
  });
}

const statusActionMap: Record<string, string> = {
  quarantined: 'skill.quarantine',
  removed: 'skill.remove',
  deprecated: 'skill.deprecate',
  active: 'skill.restore'
};

async function handleStatus(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status, reason } = body as Record<string, unknown>;

  const statusResult = skillStatusSchema.safeParse(status);
  if (!statusResult.success) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: active, deprecated, quarantined, removed' },
      { status: 400 }
    );
  }

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json({ error: 'reason is required and must be a non-empty string' }, { status: 400 });
  }

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousStatus = skill.status;
  const newStatus = statusResult.data;

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        status: newStatus,
        statusReason: reason.trim(),
        statusChangedBy: adminUser.id,
        statusChangedAt: new Date()
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: statusActionMap[newStatus] ?? `skill.status.${newStatus}`,
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { reason: reason.trim(), previousStatus }
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    previousStatus,
    status: newStatus
  });
}

async function handleVisibility(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { visibility } = body as Record<string, unknown>;
  if (visibility !== 'public' && visibility !== 'private') {
    return NextResponse.json({ error: 'Invalid visibility. Must be public or private' }, { status: 400 });
  }

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, visibility: skills.visibility })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousVisibility = skill.visibility;

  await db.transaction(async (tx) => {
    await tx.update(skills).set({ visibility }).where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: 'skill.visibility.update',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { previousVisibility, visibility }
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    previousVisibility,
    visibility
  });
}

async function handleGetAccessGrants(name: string): Promise<NextResponse> {
  const [skill] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const grants = await db
    .select({
      id: skillAccess.id,
      grantedUserId: skillAccess.grantedUserId,
      grantedOrgId: skillAccess.grantedOrgId,
      grantedBy: skillAccess.grantedBy,
      createdAt: skillAccess.createdAt,
      userName: user.name,
      userEmail: user.email,
      orgName: organization.name,
      orgSlug: organization.slug
    })
    .from(skillAccess)
    .leftJoin(user, eq(user.id, skillAccess.grantedUserId))
    .leftJoin(organization, eq(organization.id, skillAccess.grantedOrgId))
    .where(eq(skillAccess.skillId, skill.id))
    .orderBy(desc(skillAccess.createdAt));

  return NextResponse.json({
    packageName: skill.name,
    grants
  });
}

async function handleSetAccessGrants(
  name: string,
  req: NextRequest,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { userIds, orgIds } = body as {
    userIds?: unknown;
    orgIds?: unknown;
  };

  if ((userIds !== undefined && !Array.isArray(userIds)) || (orgIds !== undefined && !Array.isArray(orgIds))) {
    return NextResponse.json({ error: 'userIds/orgIds must be arrays when provided' }, { status: 400 });
  }

  const normalizedUserIds = Array.from(
    new Set(
      (userIds ?? [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    )
  );

  const normalizedOrgIds = Array.from(
    new Set(
      (orgIds ?? []).map((value) => (typeof value === 'string' ? value.trim() : '')).filter((value) => value.length > 0)
    )
  );

  const [skill] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(skillAccess).where(eq(skillAccess.skillId, skill.id));

    if (normalizedUserIds.length > 0) {
      await tx.insert(skillAccess).values(
        normalizedUserIds.map((grantedUserId) => ({
          skillId: skill.id,
          grantedUserId,
          grantedBy: adminUser.id
        }))
      );
    }

    if (normalizedOrgIds.length > 0) {
      await tx.insert(skillAccess).values(
        normalizedOrgIds.map((grantedOrgId) => ({
          skillId: skill.id,
          grantedOrgId,
          grantedBy: adminUser.id
        }))
      );
    }

    await tx.insert(auditEvents).values({
      action: 'skill.access.update',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: {
        userIds: normalizedUserIds,
        orgIds: normalizedOrgIds
      }
    });
  });

  return NextResponse.json({
    success: true,
    packageName: skill.name,
    userIds: normalizedUserIds,
    orgIds: normalizedOrgIds
  });
}

export const GET = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
  const { name, action } = parseRequest(req);

  if (!name) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (action === 'access-grants') {
    return handleGetAccessGrants(name);
  }

  if (action) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return handleGetDetail(name);
});

export const DELETE = withAdminAuth(
  async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
    const { name, action, version } = parseRequest(req);

    if (!name) {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (action === 'version' && version) {
      return handleDeleteVersion(name, version, adminUser);
    }

    if (action) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const force = req.nextUrl.searchParams.get('force') === 'true';
    if (force) {
      return handleForceDelete(name, req, adminUser);
    }

    return handleDelete(name, adminUser);
  }
);

async function handleRescanVersion(
  name: string,
  version: string,
  adminUser: AdminAuthContext['user']
): Promise<NextResponse> {
  const [skill] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const [versionRow] = await db
    .select({
      id: skillVersions.id,
      skillId: skillVersions.skillId,
      version: skillVersions.version,
      tarballPath: skillVersions.tarballPath,
      manifest: skillVersions.manifest,
      permissions: skillVersions.permissions,
      readme: skillVersions.readme,
      fileCount: skillVersions.fileCount,
      tarballSize: skillVersions.tarballSize
    })
    .from(skillVersions)
    .where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, version)))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const result = await rescanVersion(versionRow);

  await db.insert(auditEvents).values({
    action: 'skill.version.rescan',
    actorId: adminUser.id,
    targetType: 'skill',
    targetId: skill.id,
    metadata: {
      version: versionRow.version,
      success: result.success,
      verdict: result.verdict ?? null,
      error: result.error ?? null
    }
  });

  return NextResponse.json({
    success: result.success,
    name: skill.name,
    version: versionRow.version,
    verdict: result.verdict ?? null,
    auditStatus: result.success
      ? ({ pass: 'completed', pass_with_notes: 'completed', flagged: 'flagged', fail: 'failed' }[
          result.verdict ?? ''
        ] ?? 'completed')
      : 'scan-failed',
    error: result.error ?? null
  });
}

export const POST = withAdminAuth(
  async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
    const { name, action, version } = parseRequest(req);

    if (name && action === 'rescan-version' && version) {
      return handleRescanVersion(name, version, adminUser);
    }

    if (name && action === 'publisher-ban-delete') {
      return handleBanPublisherAndDeleteAll(name, req, adminUser);
    }

    if (name && action === 'feature') {
      return handleFeature(name, req, adminUser);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
);

export const PATCH = withAdminAuth(
  async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
    const { name, action } = parseRequest(req);

    if (name && action === 'status') {
      return handleStatus(name, req, adminUser);
    }

    if (name && action === 'visibility') {
      return handleVisibility(name, req, adminUser);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
);

export const PUT = withAdminAuth(
  async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
    const { name, action } = parseRequest(req);

    if (name && action === 'access-grants') {
      return handleSetAccessGrants(name, req, adminUser);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
);
