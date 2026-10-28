import { randomUUID } from 'node:crypto';

import { getKVStore } from '~/services/kv';

export interface CliAuthSession {
  state: string;
  status: 'pending' | 'authorized';
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt: number;
  /** Sessions without this marker are invalidated by the approved cutover. */
  expiryClock?: 'store';
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Isolate new sessions from unconditional legacy writes and deletes; upgraded
// replicas invalidate all pre-cutover logins. Drain legacy replicas to complete
// that invalidation and avoid login failures: they cannot read v2 sessions.
const KEY_PREFIX = 'cli-auth-v2:';

function key(sessionCode: string) {
  return `${KEY_PREFIX}${sessionCode}`;
}

export async function createSession(state: string): Promise<string> {
  const kv = getKVStore();
  const sessionCode = randomUUID();
  const session: CliAuthSession = { state, status: 'pending', createdAt: Date.now(), expiryClock: 'store' };
  await kv.set(key(sessionCode), JSON.stringify(session), SESSION_TTL_MS);
  return sessionCode;
}

async function getStoredSession(sessionCode: string): Promise<{ raw: string; session: CliAuthSession } | null> {
  const kv = getKVStore();
  const raw = await kv.get(key(sessionCode));
  if (!raw) return null;
  const session = JSON.parse(raw) as CliAuthSession | null;
  // Legacy app-clock timestamps cannot prove their true age across clock skew.
  if (!session || session.expiryClock !== 'store') return null;
  return { raw, session };
}

export async function getSession(sessionCode: string): Promise<CliAuthSession | null> {
  return (await getStoredSession(sessionCode))?.session ?? null;
}

export async function authorizeSession(
  sessionCode: string,
  userId: string,
  userInfo?: { name?: string; email?: string }
): Promise<boolean> {
  const stored = await getStoredSession(sessionCode);
  if (!stored || stored.session.status !== 'pending') return false;
  const session: CliAuthSession = {
    ...stored.session,
    status: 'authorized',
    userId,
    userName: userInfo?.name,
    userEmail: userInfo?.email
  };
  return getKVStore().compareAndSet(key(sessionCode), stored.raw, JSON.stringify(session));
}

export async function consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
  const stored = await getStoredSession(sessionCode);
  if (!stored || stored.session.status !== 'authorized' || stored.session.state !== state) return null;
  const consumed = await getKVStore().compareAndDelete(key(sessionCode), stored.raw);
  return consumed ? stored.session : null;
}

export async function deleteSession(sessionCode: string): Promise<void> {
  const kv = getKVStore();
  await kv.del(key(sessionCode));
}

export async function clearAllSessions(): Promise<void> {
  // With KV stores (Redis), sessions auto-expire via TTL.
  // No-op — clearing all keys would require SCAN which is expensive.
}
