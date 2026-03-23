import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { decrypt } from '../src/lib/crypto';
import { systemConfig } from '../src/lib/db/schema';

function sanitize(value: string): string {
  return value.replace(/[`$\\"\n\r]/g, '');
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) process.exit(0);

let masterKey = process.env.BETTER_AUTH_SECRET;
if (!masterKey) process.exit(0);

try {
  const client = postgres(dbUrl);
  const db = drizzle(client, { schema: { systemConfig } });

  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  await client.end();

  if (!config?.setupCompleted) process.exit(0);

  const exports: string[] = [];

  if (config.authSecret) {
    masterKey = config.authSecret;
    exports.push(`BETTER_AUTH_SECRET=${sanitize(config.authSecret)}`);
  }

  if (config.instanceUrl) {
    exports.push(`APP_URL=${sanitize(config.instanceUrl)}`);
    exports.push(`BETTER_AUTH_URL=${sanitize(config.instanceUrl)}`);
    exports.push(`VITE_PUBLIC_APP_URL=${sanitize(config.instanceUrl)}`);
  }

  if (config.githubEnabled && config.githubClientId) {
    exports.push(`GITHUB_CLIENT_ID=${sanitize(config.githubClientId)}`);
    if (config.githubClientSecretEnc) {
      exports.push(`GITHUB_CLIENT_SECRET=${sanitize(decrypt(config.githubClientSecretEnc, masterKey))}`);
    }
  }

  if (config.oidcEnabled && config.oidcClientId) {
    if (config.oidcDiscoveryUrl) exports.push(`OIDC_DISCOVERY_URL=${sanitize(config.oidcDiscoveryUrl)}`);
    exports.push(`OIDC_CLIENT_ID=${sanitize(config.oidcClientId)}`);
    if (config.oidcClientSecretEnc) {
      exports.push(`OIDC_CLIENT_SECRET=${sanitize(decrypt(config.oidcClientSecretEnc, masterKey))}`);
    }
    if (config.oidcProviderId) {
      exports.push(`OIDC_PROVIDER_ID=${sanitize(config.oidcProviderId)}`);
      exports.push(`NEXT_PUBLIC_OIDC_PROVIDER_ID=${sanitize(config.oidcProviderId)}`);
    }
  }

  if (config.scannerProvider && config.scannerProvider !== 'disabled') {
    if (config.scannerApiKeyEnc) {
      const key = sanitize(decrypt(config.scannerApiKeyEnc, masterKey));
      switch (config.scannerProvider) {
        case 'groq':
          exports.push(`GROQ_API_KEY=${key}`);
          break;
        case 'openrouter':
          exports.push(`OPENROUTER_API_KEY=${key}`);
          break;
        case 'custom':
          exports.push(`LLM_API_KEY=${key}`);
          if (config.scannerBaseUrl) exports.push(`LLM_BASE_URL=${sanitize(config.scannerBaseUrl)}`);
          if (config.scannerModel) exports.push(`LLM_MODEL=${sanitize(config.scannerModel)}`);
          break;
      }
    }
    if (config.scannerProvider === 'litellm' && config.scannerLitellmUrl) {
      exports.push(`LITELLM_URL=${sanitize(config.scannerLitellmUrl)}`);
    }
  }

  if (config.storageBackend) {
    exports.push(`STORAGE_BACKEND=${sanitize(config.storageBackend)}`);
    if (config.storageEndpoint) exports.push(`S3_ENDPOINT=${sanitize(config.storageEndpoint)}`);
    if (config.storagePublicEndpoint) exports.push(`S3_PUBLIC_ENDPOINT=${sanitize(config.storagePublicEndpoint)}`);
    if (config.storageRegion) exports.push(`S3_REGION=${sanitize(config.storageRegion)}`);
    if (config.storageBucket) exports.push(`S3_BUCKET=${sanitize(config.storageBucket)}`);
    if (config.storageAccessKey) exports.push(`S3_ACCESS_KEY=${sanitize(config.storageAccessKey)}`);
    if (config.storageSecretKeyEnc) {
      exports.push(`S3_SECRET_KEY=${sanitize(decrypt(config.storageSecretKeyEnc, masterKey))}`);
    }
    if (config.supabaseUrl) exports.push(`SUPABASE_URL=${sanitize(config.supabaseUrl)}`);
    if (config.supabaseServiceKeyEnc) {
      exports.push(`SUPABASE_SERVICE_ROLE_KEY=${sanitize(decrypt(config.supabaseServiceKeyEnc, masterKey))}`);
    }
    if (config.storageBackend === 'filesystem') {
      exports.push(`STORAGE_FS_PATH=${process.env.STORAGE_FS_PATH || '/app/data/packages'}`);
    }
  }

  // Build AUTH_PROVIDERS from base + enabled providers
  const providers = new Set(
    (process.env.AUTH_PROVIDERS || 'credentials')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  );
  if (config.githubEnabled && config.githubClientId) providers.add('github');
  if (config.oidcEnabled && config.oidcClientId) providers.add('oidc');
  const providersStr = [...providers].join(',');
  if (providersStr !== (process.env.AUTH_PROVIDERS || 'credentials')) {
    exports.push(`AUTH_PROVIDERS=${providersStr}`);
  }

  for (const line of exports) {
    console.log(line);
  }
} catch {
  process.exit(0);
}
