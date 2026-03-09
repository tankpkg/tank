import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { type AdminAuthContext, withAdminAuth } from '@/lib/admin-middleware';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apikey, organization, user } from '@/lib/db/auth-schema';
import { serviceAccounts } from '@/lib/db/schema';

const allowedScopes = new Set(['skills:read', 'skills:publish', 'skills:admin']);

function normalizeScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return ['skills:read'];
  }

  const scopes = Array.from(
    new Set(
      raw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0 && allowedScopes.has(value))
    )
  );

  if (scopes.includes('skills:admin') && !scopes.includes('skills:read')) {
    scopes.push('skills:read');
  }

  return scopes.length > 0 ? scopes : ['skills:read'];
}

export const GET = withAdminAuth(async (): Promise<NextResponse> => {
  const accounts = await db
    .select({
      id: serviceAccounts.id,
      userId: serviceAccounts.userId,
      ownerUserId: serviceAccounts.ownerUserId,
      orgId: serviceAccounts.orgId,
      displayName: serviceAccounts.displayName,
      description: serviceAccounts.description,
      disabled: serviceAccounts.disabled,
      createdAt: serviceAccounts.createdAt,
      updatedAt: serviceAccounts.updatedAt,
      ownerName: user.name,
      ownerEmail: user.email,
      orgName: organization.name,
      orgSlug: organization.slug
    })
    .from(serviceAccounts)
    .leftJoin(user, eq(user.id, serviceAccounts.ownerUserId))
    .leftJoin(organization, eq(organization.id, serviceAccounts.orgId))
    .orderBy(desc(serviceAccounts.createdAt));

  const userIds = accounts.map((account) => account.userId);
  const keys =
    userIds.length === 0
      ? []
      : await db
          .select({
            id: apikey.id,
            userId: apikey.userId,
            name: apikey.name,
            start: apikey.start,
            prefix: apikey.prefix,
            enabled: apikey.enabled,
            expiresAt: apikey.expiresAt,
            lastRequest: apikey.lastRequest,
            createdAt: apikey.createdAt,
            permissions: apikey.permissions
          })
          .from(apikey)
          .where(inArray(apikey.userId, userIds))
          .orderBy(desc(apikey.createdAt));

  return NextResponse.json({
    serviceAccounts: accounts.map((account) => ({
      ...account,
      keys: keys
        .filter((key) => key.userId === account.userId)
        .map((key) => ({
          ...key,
          scopes:
            typeof key.permissions === 'string' && key.permissions.trim().length > 0 ? JSON.parse(key.permissions) : []
        }))
    }))
  });
});

export const POST = withAdminAuth(
  async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { displayName, description, orgId, expiresInDays, keyName, scopes } = body as Record<string, unknown>;

    if (typeof displayName !== 'string' || displayName.trim().length < 3) {
      return NextResponse.json({ error: 'displayName must be at least 3 characters' }, { status: 400 });
    }

    const normalizedScopes = normalizeScopes(scopes);
    const keyExpiresInDays =
      typeof expiresInDays === 'number' && Number.isFinite(expiresInDays)
        ? Math.max(1, Math.min(365, Math.floor(expiresInDays)))
        : 30;

    const created = await db.transaction(async (tx) => {
      const serviceUserId = randomUUID();
      const serviceEmail = `svc_${Date.now()}_${serviceUserId.slice(0, 8)}@tank.local`;

      await tx.insert(user).values({
        id: serviceUserId,
        name: displayName.trim(),
        email: serviceEmail,
        emailVerified: true,
        role: 'service'
      });

      const [serviceAccount] = await tx
        .insert(serviceAccounts)
        .values({
          userId: serviceUserId,
          ownerUserId: adminUser.id,
          orgId: typeof orgId === 'string' && orgId.trim().length > 0 ? orgId.trim() : null,
          displayName: displayName.trim(),
          description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null
        })
        .returning();

      return { serviceAccount, serviceUserId };
    });

    const keyResult = await auth.api.createApiKey({
      body: {
        name: typeof keyName === 'string' && keyName.trim().length > 0 ? keyName.trim() : `${displayName.trim()} key`,
        userId: created.serviceUserId,
        expiresIn: keyExpiresInDays * 24 * 60 * 60,
        permissions: JSON.stringify(normalizedScopes),
        metadata: JSON.stringify({ serviceAccountId: created.serviceAccount.id })
      } as never
    });

    return NextResponse.json({
      serviceAccount: created.serviceAccount,
      apiKey: keyResult,
      scopes: normalizedScopes
    });
  }
);
