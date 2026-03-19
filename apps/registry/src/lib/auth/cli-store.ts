import { randomUUID } from 'node:crypto';

export interface CliAuthSession {
  state: string;
  status: 'pending' | 'authorized';
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const sessions = new Map<string, CliAuthSession>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(code);
    }
  }
}

export async function createSession(state: string): Promise<string> {
  cleanupExpired();
  const sessionCode = randomUUID();
  sessions.set(sessionCode, {
    state,
    status: 'pending',
    createdAt: Date.now()
  });
  return sessionCode;
}

export async function getSession(sessionCode: string): Promise<CliAuthSession | null> {
  cleanupExpired();
  const session = sessions.get(sessionCode);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionCode);
    return null;
  }
  return session;
}

export async function authorizeSession(
  sessionCode: string,
  userId: string,
  userInfo?: { name?: string; email?: string }
): Promise<boolean> {
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

export async function consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
  cleanupExpired();
  const session = sessions.get(sessionCode);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionCode);
    return null;
  }
  if (session.status !== 'authorized') return null;
  if (session.state !== state) return null;
  sessions.delete(sessionCode);
  return session;
}

export async function deleteSession(sessionCode: string): Promise<void> {
  sessions.delete(sessionCode);
}

export async function clearAllSessions(): Promise<void> {
  sessions.clear();
}
