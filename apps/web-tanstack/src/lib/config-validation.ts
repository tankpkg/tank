/**
 * Startup configuration validation for on-prem deployments.
 * Fails fast with clear error messages when required config is missing.
 */

function getEnabledProviders(): Set<string> {
  return new Set(
    (process.env.AUTH_PROVIDERS || 'credentials')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function validateAuthConfig(): void {
  const providers = getEnabledProviders();

  // Validate OIDC config if enabled
  if (providers.has('oidc')) {
    const missing: string[] = [];

    if (!process.env.OIDC_CLIENT_ID) missing.push('OIDC_CLIENT_ID');
    if (!process.env.OIDC_CLIENT_SECRET) missing.push('OIDC_CLIENT_SECRET');

    const hasDiscovery = !!process.env.OIDC_DISCOVERY_URL;
    const hasManualEndpoints =
      !!process.env.OIDC_AUTHORIZATION_URL && !!process.env.OIDC_TOKEN_URL && !!process.env.OIDC_USER_INFO_URL;

    if (!hasDiscovery && !hasManualEndpoints) {
      missing.push('OIDC_DISCOVERY_URL or (OIDC_AUTHORIZATION_URL + OIDC_TOKEN_URL + OIDC_USER_INFO_URL)');
    }

    if (missing.length > 0) {
      throw new Error(
        `AUTH_PROVIDERS includes "oidc" but required environment variables are missing:\n${missing
          .map((v) => `  - ${v}`)
          .join('\n')}\n\nEither set these variables or remove "oidc" from AUTH_PROVIDERS.`
      );
    }
  }

  // Validate GitHub config if enabled
  if (providers.has('github')) {
    const missing: string[] = [];
    if (!process.env.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID');
    if (!process.env.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET');

    if (missing.length > 0) {
      throw new Error(
        `AUTH_PROVIDERS includes "github" but required environment variables are missing:\n${missing
          .map((v) => `  - ${v}`)
          .join('\n')}\n\nEither set these variables or remove "github" from AUTH_PROVIDERS.`
      );
    }
  }

  // Validate credentials config if enabled
  if (providers.has('credentials')) {
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
      console.warn(
        'WARNING: credentials auth enabled but RESEND_API_KEY is not set. ' +
          'Email verification links will only be logged to console.'
      );
    }
  }
}

export function validateStorageConfig(): void {
  const backend = (process.env.STORAGE_BACKEND || 'supabase').toLowerCase();

  if (backend === 's3') {
    const missing: string[] = [];
    if (!process.env.S3_ACCESS_KEY) missing.push('S3_ACCESS_KEY');
    if (!process.env.S3_SECRET_KEY) missing.push('S3_SECRET_KEY');

    if (missing.length > 0) {
      throw new Error(
        `STORAGE_BACKEND is 's3' but required environment variables are missing:\n${missing
          .map((v) => `  - ${v}`)
          .join('\n')}`
      );
    }
  }

  if (backend === 'supabase') {
    const missing: string[] = [];
    if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missing.length > 0) {
      throw new Error(
        `STORAGE_BACKEND is 'supabase' but required environment variables are missing:\n${missing
          .map((v) => `  - ${v}`)
          .join('\n')}`
      );
    }
  }
}

export function validateSessionConfig(): void {
  const store = (process.env.SESSION_STORE || 'memory').toLowerCase();

  if (store === 'redis') {
    if (!process.env.REDIS_URL) {
      throw new Error('SESSION_STORE is "redis" but REDIS_URL is not set.');
    }
  }
}

export function validateAllConfig(): void {
  validateAuthConfig();
  validateStorageConfig();
  validateSessionConfig();

  // Critical: BETTER_AUTH_SECRET must always be set
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required. Generate one with: openssl rand -base64 32');
  }
}
