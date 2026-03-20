import { z } from 'zod';

const zStr = z.string().trim().min(1);
const zOptStr = z.string().trim().optional().default('');
const zUrl = z.url();

export const zEnv = z.object({
  // ── Core ──
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: zUrl.default('http://localhost:5555'),
  APP_NAME: zStr.default('Tank'),

  // ── Database ──
  DATABASE_URL: zStr,

  // ── Auth ──
  BETTER_AUTH_SECRET: zStr,
  BETTER_AUTH_URL: zUrl.optional(),
  AUTH_PROVIDERS: zStr.default('credentials'),

  // ── GitHub OAuth (optional) ──
  GITHUB_CLIENT_ID: zOptStr,
  GITHUB_CLIENT_SECRET: zOptStr,

  // ── OIDC SSO (optional) ──
  OIDC_PROVIDER_ID: zStr.default('enterprise-oidc'),
  OIDC_CLIENT_ID: zOptStr,
  OIDC_CLIENT_SECRET: zOptStr,
  OIDC_DISCOVERY_URL: zOptStr,
  OIDC_AUTHORIZATION_URL: zOptStr,
  OIDC_TOKEN_URL: zOptStr,
  OIDC_USER_INFO_URL: zOptStr,

  // ── Storage ──
  STORAGE_BACKEND: z.enum(['s3', 'supabase']).default('supabase'),
  S3_ENDPOINT: zOptStr,
  S3_PUBLIC_ENDPOINT: zOptStr,
  S3_ACCESS_KEY: zOptStr,
  S3_SECRET_KEY: zOptStr,
  S3_BUCKET: zStr.default('packages'),
  S3_REGION: zStr.default('us-east-1'),
  SUPABASE_URL: zOptStr,
  SUPABASE_SERVICE_ROLE_KEY: zOptStr,
  STORAGE_BUCKET: zOptStr,

  // ── Email ──
  RESEND_API_KEY: zOptStr,
  EMAIL_FROM: zStr.default('noreply@tank.example.com'),
  SMTP_HOST: zOptStr,
  SMTP_PORT: zStr.default('587'),
  SMTP_SECURE: zStr.default('false'),
  SMTP_USER: zOptStr,
  SMTP_PASSWORD: zOptStr,
  SMTP_FROM: zStr.default('noreply@example.com'),

  // ── External Services ──
  PYTHON_API_URL: zOptStr,
  LOKI_URL: zUrl.default('http://localhost:3100'),

  // ── KV Store (Redis) ──
  REDIS_URL: zOptStr,

  // ── Admin ──
  FIRST_ADMIN_EMAIL: zOptStr
});

const result = zEnv.safeParse(process.env);

if (!result.success) {
  process.stderr.write(`Environment validation failed:\n${z.prettifyError(result.error)}\n`);
  process.exit(1);
}

export const env = result.data;

// ── Derived helpers ──
export const enabledProviders = new Set(
  env.AUTH_PROVIDERS.split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
);

export const githubEnabled = enabledProviders.has('github') && !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET;

export const oidcEnabled =
  enabledProviders.has('oidc') &&
  !!env.OIDC_CLIENT_ID &&
  !!env.OIDC_CLIENT_SECRET &&
  !!(env.OIDC_DISCOVERY_URL || (env.OIDC_AUTHORIZATION_URL && env.OIDC_TOKEN_URL && env.OIDC_USER_INFO_URL));
