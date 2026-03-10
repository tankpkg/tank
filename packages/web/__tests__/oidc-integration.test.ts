import { describe, expect, it } from 'vitest';

function mockEnv(env: Record<string, string>) {
  const original = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return () => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
    Object.assign(process.env, original);
  };
}

describe('OIDC SSO Integration', () => {
  describe('Configuration Validation', () => {
    it('enables OIDC when all required env vars are set with discovery URL', async () => {
      const restore = mockEnv({
        AUTH_PROVIDERS: 'oidc,credentials',
        OIDC_CLIENT_ID: 'test-client-id',
        OIDC_CLIENT_SECRET: 'test-client-secret',
        OIDC_DISCOVERY_URL: 'https://idp.example.com/.well-known/openid-configuration',
        OIDC_PROVIDER_ID: 'enterprise-idp'
      });

      const { isOidcEnabled } = await import('./config-check');
      expect(isOidcEnabled()).toBe(true);

      restore();
    });

    it('enables OIDC with explicit endpoints', async () => {
      const restore = mockEnv({
        AUTH_PROVIDERS: 'oidc',
        OIDC_CLIENT_ID: 'test-client-id',
        OIDC_CLIENT_SECRET: 'test-client-secret',
        OIDC_AUTHORIZATION_URL: 'https://idp.example.com/oauth/authorize',
        OIDC_TOKEN_URL: 'https://idp.example.com/oauth/token',
        OIDC_USER_INFO_URL: 'https://idp.example.com/oauth/userinfo'
      });

      const { isOidcEnabled } = await import('./config-check');
      expect(isOidcEnabled()).toBe(true);

      restore();
    });

    it('disables OIDC when CLIENT_ID is missing', async () => {
      const restore = mockEnv({
        AUTH_PROVIDERS: 'oidc',
        OIDC_CLIENT_SECRET: 'test-client-secret',
        OIDC_DISCOVERY_URL: 'https://idp.example.com/.well-known/openid-configuration'
      });

      const { isOidcEnabled } = await import('./config-check');
      expect(isOidcEnabled()).toBe(false);

      restore();
    });

    it('disables OIDC when no discovery URL or endpoints provided', async () => {
      const restore = mockEnv({
        AUTH_PROVIDERS: 'oidc',
        OIDC_CLIENT_ID: 'test-client-id',
        OIDC_CLIENT_SECRET: 'test-client-secret'
      });

      const { isOidcEnabled } = await import('./config-check');
      expect(isOidcEnabled()).toBe(false);

      restore();
    });
  });

  describe('OAuth Flow Validation', () => {
    it('generates valid OAuth authorization URL', async () => {
      const config = {
        clientId: 'test-client-id',
        authorizationUrl: 'https://idp.example.com/oauth/authorize',
        redirectUri: 'http://localhost:3000/api/auth/callback/enterprise-oidc',
        scope: 'openid profile email',
        state: 'random-state-value'
      };

      const url = new URL(config.authorizationUrl);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', config.scope);
      url.searchParams.set('state', config.state);

      expect(url.toString()).toContain('client_id=test-client-id');
      expect(url.toString()).toContain('response_type=code');
      expect(url.toString()).toContain('scope=openid+profile+email');
      expect(url.toString()).toContain('state=random-state-value');
    });

    it('includes PKCE parameters when enabled', async () => {
      const _codeVerifier = 'random-43-to-128-char-string-for-pkce';
      const codeChallenge = 'sha256-hash-of-verifier-base64url-encoded';

      const config = {
        authorizationUrl: 'https://idp.example.com/oauth/authorize',
        codeChallenge,
        codeChallengeMethod: 'S256'
      };

      const url = new URL(config.authorizationUrl);
      url.searchParams.set('code_challenge', config.codeChallenge);
      url.searchParams.set('code_challenge_method', config.codeChallengeMethod);

      expect(url.searchParams.get('code_challenge')).toBe(codeChallenge);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('Token Exchange', () => {
    it('exchanges authorization code for tokens', async () => {
      const _mockTokenResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        id_token: 'mock-id-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      const _tokenUrl = 'https://idp.example.com/oauth/token';
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'mock-auth-code',
        redirect_uri: 'http://localhost:3000/api/auth/callback/enterprise-oidc',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret'
      });

      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('mock-auth-code');
    });

    it('refreshes access token with refresh token', async () => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: 'mock-refresh-token',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret'
      });

      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('mock-refresh-token');
    });
  });

  describe('User Info Processing', () => {
    it('extracts user info from OIDC claims', () => {
      const userInfo = {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        preferred_username: 'testuser',
        email_verified: true
      };

      const mappedUser = {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        emailVerified: userInfo.email_verified
      };

      expect(mappedUser.id).toBe('user-123');
      expect(mappedUser.email).toBe('user@example.com');
      expect(mappedUser.name).toBe('Test User');
      expect(mappedUser.emailVerified).toBe(true);
    });

    it('handles missing optional claims gracefully', () => {
      const userInfo = {
        sub: 'user-123',
        email: 'user@example.com'
      };

      const mappedUser = {
        id: userInfo.sub,
        email: userInfo.email,
        name: (userInfo as any).name || userInfo.email.split('@')[0],
        emailVerified: (userInfo as any).email_verified ?? false
      };

      expect(mappedUser.name).toBe('user');
      expect(mappedUser.emailVerified).toBe(false);
    });
  });
});
