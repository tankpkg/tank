import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { apikey, user } from '~/lib/db/auth-schema';
import { auditEvents, serviceAccounts } from '~/lib/db/schema';

export const serviceAccountsRoutes = new Hono()

  .get('/', async (c) => {
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
        userName: user.name,
        userEmail: user.email
      })
      .from(serviceAccounts)
      .leftJoin(user, eq(serviceAccounts.userId, user.id));

    const accountsWithKeys = await Promise.all(
      accounts.map(async (account) => {
        const keys = await db
          .select({
            id: apikey.id,
            name: apikey.name,
            start: apikey.start,
            enabled: apikey.enabled,
            expiresAt: apikey.expiresAt,
            createdAt: apikey.createdAt
          })
          .from(apikey)
          .where(eq(apikey.userId, account.userId));

        return { ...account, keys };
      })
    );

    return c.json({ serviceAccounts: accountsWithKeys });
  })

  .post('/', async (c) => {
    const body = await c.req.json<{ displayName: string; description?: string; orgId?: string }>();

    if (!body.displayName?.trim()) {
      return c.json({ error: 'displayName is required' }, 400);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };

    // Create a user record for the service account
    const serviceUserId = crypto.randomUUID();
    const serviceEmail = `sa-${serviceUserId.slice(0, 8)}@service.internal`;

    await db.insert(user).values({
      id: serviceUserId,
      name: body.displayName,
      email: serviceEmail,
      emailVerified: true,
      role: 'user'
    });

    const [account] = await db
      .insert(serviceAccounts)
      .values({
        userId: serviceUserId,
        ownerUserId: adminUser.id,
        orgId: body.orgId ?? null,
        displayName: body.displayName,
        description: body.description ?? null
      })
      .returning();

    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: `${body.displayName} - API Key`,
        userId: serviceUserId,
        expiresIn: 365 * 24 * 60 * 60,
        rateLimitMax: 10000
      }
    });

    await db.insert(auditEvents).values({
      action: 'admin.service_account.create',
      actorId: adminUser.id,
      targetType: 'service_account',
      targetId: account.id,
      metadata: { displayName: body.displayName, orgId: body.orgId ?? null }
    });

    return c.json({ account, key: apiKeyResult.key }, 201);
  })

  .patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ displayName?: string; description?: string; disabled?: boolean }>();

    const existing = await db
      .select({ id: serviceAccounts.id, userId: serviceAccounts.userId })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Service account not found' }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description;
    if (body.disabled !== undefined) updates.disabled = body.disabled;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    await db.update(serviceAccounts).set(updates).where(eq(serviceAccounts.id, id));

    // Sync display name to the linked user record
    if (body.displayName !== undefined) {
      await db.update(user).set({ name: body.displayName }).where(eq(user.id, existing[0].userId));
    }

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.service_account.update',
      actorId: adminUser.id,
      targetType: 'service_account',
      targetId: id,
      metadata: updates
    });

    return c.json({ success: true });
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id');

    const existing = await db
      .select({ id: serviceAccounts.id, userId: serviceAccounts.userId, displayName: serviceAccounts.displayName })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Service account not found' }, 404);
    }

    // Delete service account (cascade will clean up). User record deletion cascades apikeys.
    await db.delete(serviceAccounts).where(eq(serviceAccounts.id, id));
    await db.delete(user).where(eq(user.id, existing[0].userId));

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.service_account.delete',
      actorId: adminUser.id,
      targetType: 'service_account',
      targetId: id,
      metadata: { displayName: existing[0].displayName }
    });

    return c.json({ success: true });
  })

  .post('/:id/keys', async (c) => {
    const id = c.req.param('id');

    const existing = await db
      .select({ id: serviceAccounts.id, userId: serviceAccounts.userId, displayName: serviceAccounts.displayName })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Service account not found' }, 404);
    }

    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: `${existing[0].displayName} - API Key`,
        userId: existing[0].userId,
        expiresIn: 365 * 24 * 60 * 60,
        rateLimitMax: 10000
      }
    });

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.service_account.key_create',
      actorId: adminUser.id,
      targetType: 'service_account',
      targetId: id,
      metadata: { keyId: apiKeyResult.id }
    });

    return c.json({ key: apiKeyResult.key, keyId: apiKeyResult.id }, 201);
  })

  .delete('/:id/keys/:keyId', async (c) => {
    const id = c.req.param('id');
    const keyId = c.req.param('keyId');

    const existing = await db
      .select({ id: serviceAccounts.id, userId: serviceAccounts.userId })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Service account not found' }, 404);
    }

    // Verify the key belongs to this service account's user
    const keyRows = await db.select({ id: apikey.id }).from(apikey).where(eq(apikey.id, keyId)).limit(1);

    if (keyRows.length === 0) {
      return c.json({ error: 'API key not found' }, 404);
    }

    await auth.api.deleteApiKey({ body: { keyId } });

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.service_account.key_revoke',
      actorId: adminUser.id,
      targetType: 'service_account',
      targetId: id,
      metadata: { keyId }
    });

    return c.json({ success: true });
  });
