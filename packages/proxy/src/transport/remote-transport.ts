const AUTH_ENV_VAR_PREFIX = 'TANK_MCP_AUTH_';

export function deriveAuthEnvVarFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid remote URL: ${url}`);
  }
  const sanitized = parsed.hostname.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${AUTH_ENV_VAR_PREFIX}${sanitized.toUpperCase()}`;
}

export interface RemoteProxyEnvInput {
  url: string;
  requiresAuth: boolean;
  env: Record<string, string | undefined>;
  envVarName?: string;
}

export type RemoteProxyEnvResult = { ok: true } | { ok: false; exitCode: 2; message: string; missingVar: string };

export function validateRemoteProxyEnv(input: RemoteProxyEnvInput): RemoteProxyEnvResult {
  try {
    new URL(input.url);
  } catch {
    throw new Error(`invalid remote URL: ${input.url}`);
  }
  if (!input.requiresAuth) return { ok: true };
  const varName = input.envVarName ?? deriveAuthEnvVarFromUrl(input.url);
  const value = input.env[varName];
  if (value !== undefined && value.length > 0) return { ok: true };
  return {
    ok: false,
    exitCode: 2,
    missingVar: varName,
    message: `tank proxy: required auth env var ${varName} not set`
  };
}
