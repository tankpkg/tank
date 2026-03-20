import { randomUUID } from 'node:crypto';

import { getKVStore } from '~/services/kv';

export interface CliAuthSession {
  state: string;
  status: 'pending' | 'authorized';
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const KEY_PREFIX = 'cli-auth:';

function key(sessionCode: string) {
  return `${KEY_PREFIX}${sessionCode}`;
}

export async function createSession(state: string): Promise<string> {
  const kv = getKVStore();
  const sessionCode = randomUUID();
  const session: CliAuthSession = { state, status: 'pending', createdAt: Date.now() };
  await kv.set(key(sessionCode), JSON.stringify(session), SESSION_TTL_MS);
  return sessionCode;
}

export async function getSession(sessionCode: string): Promise<CliAuthSession | null> {
  const kv = getKVStore();
  const raw = await kv.get(key(sessionCode));
  if (!raw) return null;
  return JSON.parse(raw) as CliAuthSession;
}

export async function authorizeSession(
  sessionCode: string,
  userId: string,
  userInfo?: { name?: string; email?: string }
): Promise<boolean> {
  const session = await getSession(sessionCode);
  if (!session || session.status !== 'pending') return false;
  session.status = 'authorized';
  session.userId = userId;
  session.userName = userInfo?.name;
  session.userEmail = userInfo?.email;
  const kv = getKVStore();
  const remaining = SESSION_TTL_MS - (Date.now() - session.createdAt);
  if (remaining <= 0) return false;
  await kv.set(key(sessionCode), JSON.stringify(session), remaining);
  return true;
}

export async function consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
  const session = await getSession(sessionCode);
  if (!session) return null;
  if (session.status !== 'authorized') return null;
  if (session.state !== state) return null;
  const kv = getKVStore();
  await kv.del(key(sessionCode));
  return session;
}

export async function deleteSession(sessionCode: string): Promise<void> {
  const kv = getKVStore();
  await kv.del(key(sessionCode));
}

export async function clearAllSessions(): Promise<void> {
  // With KV stores (Redis), sessions auto-expire via TTL.
  // No-op — clearing all keys would require SCAN which is expensive.
}
