'use client';

import { useSession } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

function CliLoginContent() {
  const searchParams = useSearchParams();
  const sessionCode = searchParams.get('session');
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState<'idle' | 'authorizing' | 'authorized' | 'denied' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleAuthorize = useCallback(async () => {
    if (!sessionCode) return;
    setStatus('authorizing');
    try {
      const res = await fetch('/api/v1/cli-auth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || 'Authorization failed');
        setStatus('error');
        return;
      }
      setStatus('authorized');
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }, [sessionCode]);

  const handleDeny = useCallback(() => {
    setStatus('denied');
  }, []);

  // No session code in URL
  if (!sessionCode) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Invalid Request</h1>
          <p style={styles.text}>No session code provided. Please start the login flow from the Tank CLI.</p>
        </div>
      </div>
    );
  }

  // Loading auth state
  if (isPending) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.text}>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!session?.user) {
    const callbackUrl = `/cli-login?session=${encodeURIComponent(sessionCode)}`;
    if (typeof window !== 'undefined') {
      window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    }
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.text}>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Authorization complete
  if (status === 'authorized') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.heading}>CLI Authorized!</h1>
          <p style={styles.successText}>You can close this tab and return to your terminal.</p>
        </div>
      </div>
    );
  }

  // Denied
  if (status === 'denied') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Authorization Denied</h1>
          <p style={styles.text}>You denied the CLI authorization request. You can close this tab.</p>
        </div>
      </div>
    );
  }

  // Error
  if (status === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Authorization Failed</h1>
          <p style={styles.errorText}>{errorMessage}</p>
          <button style={styles.primaryButton} onClick={() => setStatus('idle')}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Main authorization prompt
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Authorize Tank CLI</h1>
        <p style={styles.text}>
          The Tank CLI is requesting access to your account.
        </p>
        <div style={styles.userInfo}>
          <p style={styles.userText}>
            Signed in as <strong>{session.user.name || session.user.email}</strong>
          </p>
          {session.user.email && session.user.name && (
            <p style={styles.emailText}>{session.user.email}</p>
          )}
        </div>
        <p style={styles.text}>
          This will create an API key that allows the CLI to act on your behalf.
        </p>
        <div style={styles.buttonRow}>
          <button
            style={styles.primaryButton}
            onClick={handleAuthorize}
            disabled={status === 'authorizing'}
          >
            {status === 'authorizing' ? 'Authorizing...' : 'Authorize'}
          </button>
          <button
            style={styles.secondaryButton}
            onClick={handleDeny}
            disabled={status === 'authorizing'}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CliLoginPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={styles.text}>Loading...</p>
          </div>
        </div>
      }
    >
      <CliLoginContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '1rem',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '1rem',
    color: '#111',
  },
  text: {
    fontSize: '0.95rem',
    color: '#555',
    marginBottom: '1rem',
    lineHeight: 1.5,
  },
  userInfo: {
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
  },
  userText: {
    fontSize: '0.95rem',
    color: '#333',
    margin: 0,
  },
  emailText: {
    fontSize: '0.85rem',
    color: '#777',
    margin: '0.25rem 0 0 0',
  },
  successText: {
    fontSize: '0.95rem',
    color: '#16a34a',
    marginBottom: '1rem',
    lineHeight: 1.5,
  },
  errorText: {
    fontSize: '0.95rem',
    color: '#dc2626',
    marginBottom: '1rem',
    lineHeight: 1.5,
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    marginTop: '1.5rem',
  },
  primaryButton: {
    backgroundColor: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.6rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '0.6rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
