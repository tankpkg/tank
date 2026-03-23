import { Hono } from 'hono';

import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { systemConfig, user } from '~/lib/db/schema';
import { decryptSecret, encryptSecret, getSystemConfig, isSetupCompleted, upsertSystemConfig } from '~/lib/setup';

export const setupRoutes = new Hono()
  .use('*', async (c, next) => {
    if (c.req.method === 'GET') return next();
    const { isSetupCompleted } = await import('~/lib/setup');
    const completed = await isSetupCompleted();
    if (completed) {
      return c.json({ error: 'Setup already completed' }, 403);
    }
    return next();
  })
  .get('/detect-network', async (c) => {
    const { networkInterfaces, hostname } = await import('node:os');
    const nets = networkInterfaces();
    const addresses: { label: string; url: string }[] = [];
    const port = process.env.APP_PORT || process.env.PORT || '3000';

    const host = hostname();
    if (host) addresses.push({ label: `Hostname: ${host}`, url: `http://${host}:${port}` });

    for (const [name, interfaces] of Object.entries(nets)) {
      if (!interfaces) continue;
      for (const iface of interfaces) {
        if (iface.internal || iface.family !== 'IPv4') continue;
        addresses.push({ label: `${name}: ${iface.address}`, url: `http://${iface.address}:${port}` });
      }
    }

    addresses.push({ label: 'Localhost', url: `http://localhost:${port}` });
    return c.json({ addresses });
  })

  .get('/status', async (c) => {
    const completed = await isSetupCompleted();
    const dbUrl = process.env.DATABASE_URL || '';

    let dbConfig: Awaited<ReturnType<typeof getSystemConfig>> | null = null;
    try {
      dbConfig = await getSystemConfig();
    } catch {
      // DB not initialized yet
    }

    return c.json({
      completed,
      currentStep: completed ? null : await detectCurrentStep(),
      defaults: {
        databaseUrl: dbUrl ? dbUrl.replace(/:[^:@/]+@/, ':***@') : '',
        hasDatabaseUrl: !!dbUrl,
        storage: {
          backend: dbConfig?.storageBackend || process.env.STORAGE_BACKEND || '',
          endpoint: dbConfig?.storageEndpoint || process.env.S3_ENDPOINT || '',
          region: dbConfig?.storageRegion || process.env.S3_REGION || '',
          bucket: dbConfig?.storageBucket || process.env.S3_BUCKET || process.env.STORAGE_BUCKET || '',
          accessKey: dbConfig?.storageAccessKey || process.env.S3_ACCESS_KEY || '',
          hasSecretKey: !!dbConfig?.storageSecretKeyEnc || !!process.env.S3_SECRET_KEY,
          supabaseUrl: dbConfig?.supabaseUrl || process.env.SUPABASE_URL || '',
          hasSupabaseServiceKey: !!dbConfig?.supabaseServiceKeyEnc || !!process.env.SUPABASE_SERVICE_ROLE_KEY
        }
      }
    });
  })

  .post('/test-db', async (c) => {
    const body = await c.req.json<{ databaseUrl?: string; useEnv?: boolean }>();
    const databaseUrl = body.useEnv ? process.env.DATABASE_URL : body.databaseUrl;
    if (!databaseUrl) return c.json({ ok: false, error: 'No database URL provided' }, 400);
    try {
      const testClient = (await import('postgres')).default(databaseUrl);
      await testClient`SELECT 1`;
      await testClient.end();
      if (!body.useEnv) {
        process.env.DATABASE_URL = databaseUrl;
        try {
          const fs = await import('node:fs');
          fs.mkdirSync('/app/data', { recursive: true });
          fs.writeFileSync('/app/data/.tank-bootstrap', `export DATABASE_URL="${databaseUrl}"\n`, { mode: 0o600 });
        } catch {
          // Volume may not be mounted — works without persistence
        }
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Connection failed' }, 400);
    }
  })

  .post('/check-db', async (c) => {
    const body = await c.req.json<{ databaseUrl?: string; useEnv?: boolean }>();
    const databaseUrl = body.useEnv ? process.env.DATABASE_URL : body.databaseUrl;
    if (!databaseUrl) return c.json({ ok: false, error: 'No database URL provided' }, 400);
    try {
      const pg = (await import('postgres')).default(databaseUrl);
      const tables = await pg`
        SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;
      await pg.end();

      const tableNames = tables.map((r) => (r as Record<string, string>).tablename);
      const hasTankTables = tableNames.some((t: string) => t === 'user' || t === 'skill' || t === 'system_config');
      const hasSystemConfig = tableNames.includes('system_config');

      return c.json({
        ok: true,
        tableCount: tableNames.length,
        tables: tableNames,
        hasTankTables,
        hasSystemConfig,
        empty: tableNames.length === 0
      });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Check failed' }, 400);
    }
  })

  .post('/init-db', async (c) => {
    try {
      const { execSync } = await import('node:child_process');
      execSync('/usr/local/bin/bun ./node_modules/drizzle-kit/bin.cjs push --force --config=drizzle.config.js 2>&1', {
        env: { ...process.env, HOME: '/app' },
        cwd: '/app',
        timeout: 60_000
      });
      const { reinitializeDb } = await import('~/lib/db');
      reinitializeDb(process.env.DATABASE_URL!);

      await db.insert(systemConfig).values({ id: 1 }).onConflictDoNothing();

      const secret = process.env.BETTER_AUTH_SECRET;
      if (secret) {
        await upsertSystemConfig({ authSecret: secret });
      }

      return c.json({ ok: true });
    } catch (e: unknown) {
      const err = e as { stdout?: Buffer; message?: string };
      const detail = err.stdout?.toString() || err.message || 'Schema push failed';
      return c.json({ ok: false, error: detail }, 500);
    }
  })

  .post('/instance-url', async (c) => {
    const { instanceUrl } = await c.req.json<{ instanceUrl: string }>();
    if (!instanceUrl) return c.json({ error: 'Instance URL is required' }, 400);
    await upsertSystemConfig({ instanceUrl });
    process.env.APP_URL = instanceUrl;
    process.env.BETTER_AUTH_URL = instanceUrl;
    const { resetAuth } = await import('~/lib/auth/core');
    resetAuth();
    return c.json({ ok: true });
  })

  .post('/storage', async (c) => {
    const body = await c.req.json<{
      backend: string;
      endpoint?: string;
      region?: string;
      bucket?: string;
      accessKey?: string;
      secretKey?: string;
      supabaseUrl?: string;
      supabaseServiceKey?: string;
    }>();

    const normalizedBackend = ['minio', 's3', 's3-compatible'].includes(body.backend) ? 's3' : body.backend;

    const update: Record<string, unknown> = {
      storageBackend: normalizedBackend,
      storageEndpoint: body.endpoint || null,
      storageRegion: body.region || null,
      storageBucket: body.bucket || null,
      storageAccessKey: body.accessKey || null
    };

    if (body.secretKey) update.storageSecretKeyEnc = encryptSecret(body.secretKey);
    if (body.supabaseUrl) update.supabaseUrl = body.supabaseUrl;
    if (body.supabaseServiceKey) update.supabaseServiceKeyEnc = encryptSecret(body.supabaseServiceKey);

    await upsertSystemConfig(update as Partial<typeof systemConfig.$inferInsert>);

    const existing = await getSystemConfig();
    const decryptedSecretKey =
      body.secretKey || (existing?.storageSecretKeyEnc ? decryptSecret(existing.storageSecretKeyEnc) : undefined);
    const decryptedSupabaseKey =
      body.supabaseServiceKey ||
      (existing?.supabaseServiceKeyEnc ? decryptSecret(existing.supabaseServiceKeyEnc) : undefined);

    const { setStorageOverride } = await import('~/services/storage/provider');
    setStorageOverride({
      backend: normalizedBackend,
      bucket: body.bucket || existing?.storageBucket || undefined,
      endpoint: body.endpoint || existing?.storageEndpoint || undefined,
      region: body.region || existing?.storageRegion || undefined,
      accessKey: body.accessKey || existing?.storageAccessKey || undefined,
      secretKey: decryptedSecretKey,
      supabaseUrl: body.supabaseUrl || existing?.supabaseUrl || undefined,
      supabaseServiceKey: decryptedSupabaseKey
    });

    return c.json({ ok: true });
  })

  .post('/test-storage', async (c) => {
    try {
      type StorageTestBody = {
        backend?: string;
        endpoint?: string;
        region?: string;
        bucket?: string;
        accessKey?: string;
        secretKey?: string;
        supabaseUrl?: string;
        supabaseServiceKey?: string;
      };
      const body: StorageTestBody = await c.req.json<StorageTestBody>().catch(() => ({}));

      const testPath = `_setup_test_${Date.now()}.txt`;
      const testBody = new TextEncoder().encode('tank-storage-test');

      if (!body.backend) {
        const { getStorageProvider } = await import('~/services/storage/provider');
        const storage = getStorageProvider();
        if (storage.putObject) {
          await storage.putObject(testPath, testBody);
        } else {
          const { signedUrl } = await storage.createSignedUploadUrl(testPath, 60);
          if (!signedUrl) throw new Error('Failed to create signed URL');
        }
        return c.json({ ok: true });
      }

      const backend = body.backend;

      if (backend === 'filesystem') {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const baseDir = process.env.STORAGE_FS_PATH || '/app/data/packages';
        const fullPath = path.join(baseDir, testPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, testBody);
        fs.unlinkSync(fullPath);
        return c.json({ ok: true });
      }

      if (['s3', 'minio', 's3-compatible'].includes(backend)) {
        if (!body.accessKey || !body.secretKey) {
          return c.json({ ok: false, error: 'S3 access key and secret key are required' }, 400);
        }
        const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } = await import(
          '@aws-sdk/client-s3'
        );
        const bucket = body.bucket || 'packages';
        const client = new S3Client({
          region: body.region || 'us-east-1',
          endpoint: body.endpoint || undefined,
          forcePathStyle: !!body.endpoint,
          credentials: { accessKeyId: body.accessKey, secretAccessKey: body.secretKey },
          requestHandler: { requestTimeout: 10_000, httpsAgent: undefined }
        });

        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch {
          try {
            await client.send(new CreateBucketCommand({ Bucket: bucket }));
          } catch (createErr: unknown) {
            const name = (createErr as { name?: string })?.name;
            if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw createErr;
          }
        }

        await client.send(
          new PutObjectCommand({ Bucket: bucket, Key: testPath, Body: testBody, ContentType: 'text/plain' })
        );
        return c.json({ ok: true });
      }

      if (backend === 'supabase') {
        if (!body.supabaseUrl || !body.supabaseServiceKey) {
          return c.json({ ok: false, error: 'Supabase URL and Service Role Key are required' }, 400);
        }
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(body.supabaseUrl, body.supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const bucket = body.bucket || 'packages';
        const { error } = await client.storage.from(bucket).upload(testPath, testBody);
        if (error) throw error;
        return c.json({ ok: true });
      }

      return c.json({ ok: false, error: `Unknown storage backend: ${backend}` }, 400);
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Storage test failed' }, 400);
    }
  })

  .post('/admin', async (c) => {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);
    if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

    try {
      const ctx = await auth.api.signUpEmail({ body: { email, password, name: 'Admin' } });
      if (!ctx?.user?.id) return c.json({ error: 'User creation failed' }, 500);

      const { eq } = await import('drizzle-orm');
      await db.update(user).set({ role: 'admin', emailVerified: true }).where(eq(user.id, ctx.user.id));
      return c.json({ ok: true, userId: ctx.user.id });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Admin creation failed' }, 500);
    }
  })

  .post('/auth-providers', async (c) => {
    const body = await c.req.json<{
      githubEnabled?: boolean;
      githubClientId?: string;
      githubClientSecret?: string;
      oidcEnabled?: boolean;
      oidcDiscoveryUrl?: string;
      oidcClientId?: string;
      oidcClientSecret?: string;
      oidcProviderId?: string;
    }>();

    const update: Record<string, unknown> = {};

    if (body.githubEnabled !== undefined) {
      update.githubEnabled = body.githubEnabled;
      if (body.githubClientId) update.githubClientId = body.githubClientId;
      if (body.githubClientSecret) update.githubClientSecretEnc = encryptSecret(body.githubClientSecret);
    }

    if (body.oidcEnabled !== undefined) {
      update.oidcEnabled = body.oidcEnabled;
      if (body.oidcDiscoveryUrl) update.oidcDiscoveryUrl = body.oidcDiscoveryUrl;
      if (body.oidcClientId) update.oidcClientId = body.oidcClientId;
      if (body.oidcClientSecret) update.oidcClientSecretEnc = encryptSecret(body.oidcClientSecret);
      if (body.oidcProviderId) update.oidcProviderId = body.oidcProviderId;
    }

    await upsertSystemConfig(update as Partial<typeof systemConfig.$inferInsert>);
    return c.json({ ok: true, restartRequired: body.githubEnabled || body.oidcEnabled });
  })

  .post('/scanner-llm', async (c) => {
    const body = await c.req.json<{
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      litellmUrl?: string;
    }>();

    const update: Record<string, unknown> = {
      scannerProvider: body.provider
    };

    if (body.apiKey) update.scannerApiKeyEnc = encryptSecret(body.apiKey);
    if (body.baseUrl) update.scannerBaseUrl = body.baseUrl;
    if (body.model) update.scannerModel = body.model;
    if (body.litellmUrl) update.scannerLitellmUrl = body.litellmUrl;

    await upsertSystemConfig(update as Partial<typeof systemConfig.$inferInsert>);
    return c.json({ ok: true });
  })

  .post('/test-llm', async (c) => {
    const { provider, apiKey, litellmUrl } = await c.req.json<{
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      litellmUrl?: string;
    }>();

    try {
      if (provider !== 'disabled' && !apiKey && !litellmUrl) {
        return c.json({ ok: false, error: 'API key or LiteLLM URL required' }, 400);
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'LLM test failed' }, 400);
    }
  })

  .post('/complete', async (c) => {
    await upsertSystemConfig({ setupCompleted: true });
    return c.json({ ok: true, redirect: '/' });
  });

async function detectCurrentStep(): Promise<string> {
  try {
    const config = await getSystemConfig();
    if (!config) return 'database';
    if (!config.instanceUrl) return 'instance-url';
    return 'storage';
  } catch {
    return 'database';
  }
}
