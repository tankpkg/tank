import { Hono } from 'hono';
import { getSystemConfig } from '~/lib/setup';

interface StorageUpdate {
  backend?: string;
  endpoint?: string;
  publicEndpoint?: string;
  region?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}

interface ScannerUpdate {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  litellmUrl?: string;
}

interface AuthUpdate {
  githubEnabled?: boolean;
  githubClientId?: string;
  githubClientSecret?: string;
  oidcEnabled?: boolean;
  oidcDiscoveryUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcProviderId?: string;
}

interface SettingsBody {
  instanceUrl?: string;
  storage?: StorageUpdate;
  scanner?: ScannerUpdate;
  auth?: AuthUpdate;
}

function normalizeBackend(raw: string): string {
  return ['minio', 's3-compatible'].includes(raw) ? 's3' : raw;
}

export const settingsRoutes = new Hono()
  .get('/', async (c) => {
    if (process.env.TANK_MODE !== 'selfhosted') {
      return c.json({ error: 'Not available in cloud mode' }, 404);
    }
    const config = await getSystemConfig();
    if (!config) return c.json({ error: 'No configuration found' }, 404);

    return c.json({
      instanceUrl: config.instanceUrl || '',
      storage: {
        backend: config.storageBackend || '',
        endpoint: config.storageEndpoint || '',
        publicEndpoint: config.storagePublicEndpoint || '',
        region: config.storageRegion || '',
        bucket: config.storageBucket || '',
        accessKey: config.storageAccessKey || '',
        hasSecretKey: !!config.storageSecretKeyEnc,
        supabaseUrl: config.supabaseUrl || '',
        hasSupabaseServiceKey: !!config.supabaseServiceKeyEnc
      },
      scanner: {
        provider: config.scannerProvider || 'disabled',
        baseUrl: config.scannerBaseUrl || '',
        model: config.scannerModel || '',
        litellmUrl: config.scannerLitellmUrl || '',
        hasApiKey: !!config.scannerApiKeyEnc
      },
      auth: {
        githubEnabled: config.githubEnabled,
        githubClientId: config.githubClientId || '',
        hasGithubSecret: !!config.githubClientSecretEnc,
        oidcEnabled: config.oidcEnabled,
        oidcDiscoveryUrl: config.oidcDiscoveryUrl || '',
        oidcClientId: config.oidcClientId || '',
        hasOidcSecret: !!config.oidcClientSecretEnc,
        oidcProviderId: config.oidcProviderId || ''
      }
    });
  })
  .post('/', async (c) => {
    if (process.env.TANK_MODE !== 'selfhosted') {
      return c.json({ error: 'Not available in cloud mode' }, 404);
    }

    const body = await c.req.json<SettingsBody>();
    const { encryptSecret, upsertSystemConfig, decryptSecret } = await import('~/lib/setup');
    const update: Record<string, unknown> = {};

    if (body.instanceUrl) {
      update.instanceUrl = body.instanceUrl;
      process.env.APP_URL = body.instanceUrl;
      process.env.BETTER_AUTH_URL = body.instanceUrl;
      const { resetAuth } = await import('~/lib/auth/core');
      resetAuth();
    }

    if (body.storage) {
      const s = body.storage;
      const normalized = s.backend ? normalizeBackend(s.backend) : undefined;
      if (s.backend) update.storageBackend = normalized;
      if (s.endpoint !== undefined) update.storageEndpoint = s.endpoint || null;
      if (s.publicEndpoint !== undefined) update.storagePublicEndpoint = s.publicEndpoint || null;
      if (s.region !== undefined) update.storageRegion = s.region || null;
      if (s.bucket !== undefined) update.storageBucket = s.bucket || null;
      if (s.accessKey !== undefined) update.storageAccessKey = s.accessKey || null;
      if (s.secretKey) update.storageSecretKeyEnc = encryptSecret(s.secretKey);
      if (s.supabaseUrl !== undefined) update.supabaseUrl = s.supabaseUrl || null;
      if (s.supabaseServiceKey) update.supabaseServiceKeyEnc = encryptSecret(s.supabaseServiceKey);

      const existing = await getSystemConfig();
      const { setStorageOverride } = await import('~/services/storage/provider');
      setStorageOverride({
        backend: normalized || existing?.storageBackend || 's3',
        bucket: s.bucket || existing?.storageBucket || undefined,
        endpoint: s.endpoint || existing?.storageEndpoint || undefined,
        publicEndpoint: s.publicEndpoint || existing?.storagePublicEndpoint || undefined,
        region: s.region || existing?.storageRegion || undefined,
        accessKey: s.accessKey || existing?.storageAccessKey || undefined,
        secretKey:
          s.secretKey || (existing?.storageSecretKeyEnc ? decryptSecret(existing.storageSecretKeyEnc) : undefined),
        supabaseUrl: s.supabaseUrl || existing?.supabaseUrl || undefined,
        supabaseServiceKey:
          s.supabaseServiceKey ||
          (existing?.supabaseServiceKeyEnc ? decryptSecret(existing.supabaseServiceKeyEnc) : undefined)
      });

      if (s.publicEndpoint !== undefined) {
        process.env.S3_PUBLIC_ENDPOINT = s.publicEndpoint;
      }
    }

    if (body.scanner) {
      const sc = body.scanner;
      if (sc.provider) update.scannerProvider = sc.provider;
      if (sc.apiKey) update.scannerApiKeyEnc = encryptSecret(sc.apiKey);
      if (sc.baseUrl !== undefined) update.scannerBaseUrl = sc.baseUrl || null;
      if (sc.model !== undefined) update.scannerModel = sc.model || null;
      if (sc.litellmUrl !== undefined) update.scannerLitellmUrl = sc.litellmUrl || null;
    }

    if (body.auth) {
      const a = body.auth;
      if (a.githubEnabled !== undefined) update.githubEnabled = a.githubEnabled;
      if (a.githubClientId !== undefined) update.githubClientId = a.githubClientId || null;
      if (a.githubClientSecret) update.githubClientSecretEnc = encryptSecret(a.githubClientSecret);
      if (a.oidcEnabled !== undefined) update.oidcEnabled = a.oidcEnabled;
      if (a.oidcDiscoveryUrl !== undefined) update.oidcDiscoveryUrl = a.oidcDiscoveryUrl || null;
      if (a.oidcClientId !== undefined) update.oidcClientId = a.oidcClientId || null;
      if (a.oidcClientSecret) update.oidcClientSecretEnc = encryptSecret(a.oidcClientSecret);
      if (a.oidcProviderId !== undefined) update.oidcProviderId = a.oidcProviderId || null;
    }

    await upsertSystemConfig(update);
    return c.json({ ok: true });
  });
