import { randomUUID } from 'crypto';

export interface CliAuthSession {
  state: string;
  status: 'pending' | 'authorized';
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// globalThis persistence: Next.js dev mode re-evaluates modules on hot reload,
// which would create a new Map and lose all active sessions.
declare global {
  // eslint-disable-next-line no-var
  var _cliAuthSessions: Map<string, CliAuthSession> | undefined;
}

if (!globalThis._cliAuthSessions) {
  globalThis._cliAuthSessions = new Map<string, CliAuthSession>();
}
const sessions = globalThis._cliAuthSessions;

/**
 * Remove all expired sessions from the store.
 * Called on every access to prevent unbounded growth.
 */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(code);
    }
  }
}

/**
 * Create a new CLI auth session.
 * Returns the unique session code.
 */
export function createSession(state: string): string {
  cleanupExpired();
  const sessionCode = randomUUID();
  sessions.set(sessionCode, {
    state,
    status: 'pending',
    createdAt: Date.now(),
  });
  return sessionCode;
}

/**
 * Get a session by its code.
 * Returns null if not found or expired.
 */
export function getSession(sessionCode: string): CliAuthSession | null {
  cleanupExpired();
  const session = sessions.get(sessionCode);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionCode);
    return null;
  }
  return session;
}

/**
 * Mark a session as authorized with the given user ID.
 * Returns true if successful, false if session not found or already authorized.
 */
export function authorizeSession(
  sessionCode: string,
  userId: string,
  userInfo?: { name?: string; email?: string }
): boolean {
  cleanupExpired();
  const session = sessions.get(sessionCode);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionCode);
    return false;
  }
  if (session.status !== 'pending') return false;
  session.status = 'authorized';
  session.userId = userId;
  session.userName = userInfo?.name;
  session.userEmail = userInfo?.email;
  return true;
}

/**
 * Consume a session (one-time use).
 * Returns the session if valid and authorized, then deletes it.
 * Returns null if not found, expired, not authorized, or state mismatch.
 */
export function consumeSession(sessionCode: string, state: string): CliAuthSession | null {
  cleanupExpired();
  const session = sessions.get(sessionCode);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionCode);
    return null;
  }
  if (session.status !== 'authorized') return null;
  if (session.state !== state) return null;
  // One-time use: delete immediately
  sessions.delete(sessionCode);
  return session;
}

/**
 * Delete a session by its code.
 */
export function deleteSession(sessionCode: string): void {
  sessions.delete(sessionCode);
}

/**
 * Clear all sessions. Used for testing.
 */
export function clearAllSessions(): void {
  sessions.clear();
}
