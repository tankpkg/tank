import { useState } from 'react';

import type { CredentialValues } from '~/components/auth/credential-form';
import { CredentialForm } from '~/components/auth/credential-form';
import { SocialProviders } from '~/components/auth/social-providers';
import { VerificationNotice } from '~/components/auth/verification-notice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { authClient } from '~/lib/auth/client';

interface LoginScreenProps {
  enabledProviders: Set<string>;
  oidcProviderId: string;
}

export function LoginScreen({ enabledProviders, oidcProviderId }: LoginScreenProps) {
  const githubEnabled = enabledProviders.has('github');
  const oidcEnabled = enabledProviders.has('oidc');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const handleCredentialSubmit = async (value: CredentialValues) => {
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'signin') {
        const result = await authClient.signIn.email({
          email: value.email,
          password: value.password,
          callbackURL: '/dashboard'
        });
        if (result.error) {
          setError(result.error.message || 'Failed to sign in');
        }
      } else {
        const result = await authClient.signUp.email({
          name: value.name || value.email.split('@')[0] || 'User',
          email: value.email,
          password: value.password,
          callbackURL: '/dashboard'
        });
        if (result.error) {
          setError(result.error.message || 'Failed to create account');
        } else {
          setVerificationEmail(value.email);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHub = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' });
      if (result.error) setError(result.error.message || 'Failed to sign in with GitHub');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSso = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.oauth2({ providerId: oidcProviderId, callbackURL: '/dashboard' });
      if (result.error) setError(result.error.message || 'Failed to sign in with SSO');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Tank</CardTitle>
        <CardDescription>Security-first package manager for AI agent skills</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {verificationEmail ? (
          <VerificationNotice email={verificationEmail} onRetry={() => setVerificationEmail(null)} />
        ) : (
          <CredentialForm mode={mode} onModeChange={setMode} isLoading={isLoading} onSubmit={handleCredentialSubmit} />
        )}

        {!verificationEmail && (
          <>
            <SocialProviders
              githubEnabled={githubEnabled}
              oidcEnabled={oidcEnabled}
              isLoading={isLoading}
              onGitHub={handleGitHub}
              onSso={handleSso}
            />

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">Sign in failed</p>
                <p className="mt-1">{error}</p>
                {(error.includes('provider') || error.includes('config')) && (
                  <p className="mt-2 text-xs">GitHub OAuth may not be configured. Check your environment variables.</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
