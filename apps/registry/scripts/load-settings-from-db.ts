import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { decrypt } from "../src/lib/crypto";
import { systemConfig } from "../src/lib/db/schema";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) process.exit(0);

const masterKey = process.env.BETTER_AUTH_SECRET;
if (!masterKey) process.exit(0);

try {
  const client = postgres(dbUrl);
  const db = drizzle(client, { schema: { systemConfig } });

  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  await client.end();

  if (!config?.setupCompleted) process.exit(0);

  const exports: string[] = [];

  if (config.instanceUrl) {
    exports.push(`BETTER_AUTH_URL=${config.instanceUrl}`);
    exports.push(`VITE_PUBLIC_APP_URL=${config.instanceUrl}`);
  }

  if (config.githubEnabled && config.githubClientId) {
    exports.push(`GITHUB_CLIENT_ID=${config.githubClientId}`);
    if (config.githubClientSecretEnc) {
      exports.push(`GITHUB_CLIENT_SECRET=${decrypt(config.githubClientSecretEnc, masterKey)}`);
    }
    const current = process.env.AUTH_PROVIDERS || "credentials";
    if (!current.includes("github")) {
      exports.push(`AUTH_PROVIDERS=${current},github`);
      exports.push(`NEXT_PUBLIC_AUTH_PROVIDERS=${current},github`);
    }
  }

  if (config.oidcEnabled && config.oidcClientId) {
    if (config.oidcDiscoveryUrl) exports.push(`OIDC_DISCOVERY_URL=${config.oidcDiscoveryUrl}`);
    exports.push(`OIDC_CLIENT_ID=${config.oidcClientId}`);
    if (config.oidcClientSecretEnc) {
      exports.push(`OIDC_CLIENT_SECRET=${decrypt(config.oidcClientSecretEnc, masterKey)}`);
    }
    if (config.oidcProviderId) {
      exports.push(`OIDC_PROVIDER_ID=${config.oidcProviderId}`);
      exports.push(`NEXT_PUBLIC_OIDC_PROVIDER_ID=${config.oidcProviderId}`);
    }
    const current = process.env.AUTH_PROVIDERS || "credentials";
    if (!current.includes("oidc")) {
      exports.push(`AUTH_PROVIDERS=${current},oidc`);
      exports.push(`NEXT_PUBLIC_AUTH_PROVIDERS=${current},oidc`);
    }
  }

  if (config.scannerProvider && config.scannerProvider !== "disabled") {
    if (config.scannerApiKeyEnc) {
      const key = decrypt(config.scannerApiKeyEnc, masterKey);
      switch (config.scannerProvider) {
        case "groq":
          exports.push(`GROQ_API_KEY=${key}`);
          break;
        case "openrouter":
          exports.push(`OPENROUTER_API_KEY=${key}`);
          break;
        case "custom":
          exports.push(`LLM_API_KEY=${key}`);
          if (config.scannerBaseUrl) exports.push(`LLM_BASE_URL=${config.scannerBaseUrl}`);
          if (config.scannerModel) exports.push(`LLM_MODEL=${config.scannerModel}`);
          break;
      }
    }
    if (config.scannerProvider === "litellm" && config.scannerLitellmUrl) {
      exports.push(`LITELLM_URL=${config.scannerLitellmUrl}`);
    }
  }

  if (config.storageBackend) {
    exports.push(`STORAGE_BACKEND=${config.storageBackend}`);
    if (config.storageEndpoint) exports.push(`S3_ENDPOINT=${config.storageEndpoint}`);
    if (config.storageRegion) exports.push(`S3_REGION=${config.storageRegion}`);
    if (config.storageBucket) exports.push(`S3_BUCKET=${config.storageBucket}`);
    if (config.storageAccessKey) exports.push(`S3_ACCESS_KEY=${config.storageAccessKey}`);
    if (config.storageSecretKeyEnc) {
      exports.push(`S3_SECRET_KEY=${decrypt(config.storageSecretKeyEnc, masterKey)}`);
    }
    if (config.supabaseUrl) exports.push(`SUPABASE_URL=${config.supabaseUrl}`);
    if (config.supabaseServiceKeyEnc) {
      exports.push(`SUPABASE_SERVICE_KEY=${decrypt(config.supabaseServiceKeyEnc, masterKey)}`);
    }
    if (config.storageBackend === "filesystem") {
      exports.push(`STORAGE_FS_PATH=${process.env.STORAGE_FS_PATH || "/app/data/packages"}`);
    }
  }

  for (const line of exports) {
    console.log(line);
  }
} catch {
  process.exit(0);
}
