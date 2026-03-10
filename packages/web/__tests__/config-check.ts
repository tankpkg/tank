export function isOidcEnabled(): boolean {
  const enabledProviders = new Set(
    (process.env.AUTH_PROVIDERS || '')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean)
  );

  if (!enabledProviders.has('oidc')) {
    return false;
  }

  const hasClientId = !!process.env.OIDC_CLIENT_ID;
  const hasClientSecret = !!process.env.OIDC_CLIENT_SECRET;
  const hasDiscoveryUrl = !!process.env.OIDC_DISCOVERY_URL;
  const hasExplicitEndpoints = !!(
    process.env.OIDC_AUTHORIZATION_URL &&
    process.env.OIDC_TOKEN_URL &&
    process.env.OIDC_USER_INFO_URL
  );

  return hasClientId && hasClientSecret && (hasDiscoveryUrl || hasExplicitEndpoints);
}

export function getOidcConfig() {
  if (!isOidcEnabled()) {
    return null;
  }

  return {
    providerId: process.env.OIDC_PROVIDER_ID || 'enterprise-oidc',
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    discoveryUrl: process.env.OIDC_DISCOVERY_URL,
    authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
    tokenUrl: process.env.OIDC_TOKEN_URL,
    userInfoUrl: process.env.OIDC_USER_INFO_URL,
    scopes: (process.env.OIDC_SCOPES || 'openid,profile,email').split(',')
  };
}
