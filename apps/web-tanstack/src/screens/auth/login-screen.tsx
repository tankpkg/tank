'use client';

import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { authClient } from '~/lib/auth-client';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const signupSchema = loginSchema.extend({
  name: z.string().min(1, 'Name is required')
});

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

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
  const [verificationSent, setVerificationSent] = useState(false);

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
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
            setVerificationSent(true);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  });

  const handleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.social({
        provider: 'github',
        callbackURL: '/dashboard'
      });
      if (result.error) {
        setError(result.error.message || 'Failed to sign in with GitHub');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.oauth2({
        providerId: oidcProviderId,
        callbackURL: '/dashboard'
      });
      if (result.error) {
        setError(result.error.message || 'Failed to sign in with SSO');
      }
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
        {verificationSent ? (
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl">📧</div>
            <h3 className="text-lg font-semibold">Check your email</h3>
            <p className="text-sm text-muted-foreground">
              We sent a verification link to <strong>{form.getFieldValue('email')}</strong>. Click the link to activate your account.
            </p>
            <p className="text-xs text-muted-foreground">
              Didn&apos;t get it? Check your spam folder or{' '}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => setVerificationSent(false)}>
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const schema = mode === 'signup' ? signupSchema : loginSchema;
              const values = { name: form.getFieldValue('name'), email: form.getFieldValue('email'), password: form.getFieldValue('password') };
              const result = schema.safeParse(values);
              if (!result.success) {
                const issues = result.error.issues;
                for (const issue of issues) {
                  const field = issue.path?.[0];
                  if (field && typeof field === 'string') {
                    form.setFieldMeta(field as 'name' | 'email' | 'password', (prev) => ({
                      ...prev,
                      errorMap: { ...prev.errorMap, onChange: issue.message }
                    }));
                  }
                }
                return;
              }

              form.handleSubmit();
            }}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === 'signin' ? 'default' : 'outline'}
                  onClick={() => setMode('signin')}
                  disabled={isLoading}>
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={mode === 'signup' ? 'default' : 'outline'}
                  onClick={() => setMode('signup')}
                  disabled={isLoading}>
                  Create account
                </Button>
              </div>

              {mode === 'signup' && (
                <form.Field name="name">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="Jane Doe"
                        disabled={isLoading}
                      />
                      {field.state.meta.errorMap.onChange && (
                        <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                      )}
                    </div>
                  )}
                </form.Field>
              )}

              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="you@company.com"
                      autoComplete="email"
                      disabled={isLoading}
                    />
                    {field.state.meta.errorMap.onChange && (
                      <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="********"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      disabled={isLoading}
                    />
                    {field.state.meta.errorMap.onChange && (
                      <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                    )}
                  </div>
                )}
              </form.Field>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}>
                {isLoading
                  ? mode === 'signin'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'signin'
                    ? 'Sign in with email'
                    : 'Create account'}
              </Button>
            </div>
          </form>
        )}

        {!verificationSent && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {githubEnabled && (
              <Button
                type="button"
                onClick={handleSignIn}
                variant="outline"
                className="w-full"
                size="lg"
                disabled={isLoading}>
                <GitHubIcon className="size-5" />
                {isLoading ? 'Signing in...' : 'Sign in with GitHub'}
              </Button>
            )}

            {oidcEnabled && (
              <Button
                type="button"
                onClick={handleSsoSignIn}
                variant="outline"
                className="w-full"
                size="lg"
                disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign in with SSO'}
              </Button>
            )}

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
