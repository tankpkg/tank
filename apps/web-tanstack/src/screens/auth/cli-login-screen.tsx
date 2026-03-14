'use client';

import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

interface CliLoginScreenProps {
  sessionCode: string;
}

export function CliLoginScreen({ sessionCode }: CliLoginScreenProps) {
  const [status, setStatus] = useState<'pending' | 'authorizing' | 'success' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);

  const handleAuthorize = async () => {
    setStatus('authorizing');
    setError(null);

    try {
      const res = await fetch('/api/v1/cli-auth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionCode })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || 'Authorization failed');
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!sessionCode) {
      setError('Missing session code');
      setStatus('error');
    }
  }, [sessionCode]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Authorize CLI</CardTitle>
        <CardDescription>The Tank CLI is requesting access to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' ? (
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl">✓</div>
            <h3 className="text-lg font-semibold text-green-600">Authorized</h3>
            <p className="text-sm text-muted-foreground">You can close this window and return to your terminal.</p>
          </div>
        ) : status === 'error' ? (
          <div className="text-center space-y-3 py-4">
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Authorization failed</p>
              {error && <p className="mt-1">{error}</p>}
            </div>
            <Button type="button" variant="outline" onClick={handleAuthorize}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Click below to grant the CLI access to publish skills and manage your account.
            </p>
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={handleAuthorize}
              disabled={status === 'authorizing'}>
              {status === 'authorizing' ? 'Authorizing...' : 'Authorize'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Session: <code className="rounded bg-muted px-1">{sessionCode.slice(0, 8)}...</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
