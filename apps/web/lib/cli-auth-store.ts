import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export interface CliAuthSession {
  state: string;
  status: 'pending' | 'authorized';
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const REDIS_KEY_PREFIX = 'cli_auth:';

// globalThis persistence: Next.js dev mode re-evaluates modules on hot reload,
// which would create a new Map and lose all active sessions.
declare global {
  // eslint-disable-next-line no-var
  var _cliAuthSessions: Map<string, CliAuthSession> | undefined;
}

if (!globalThis._cliAuthSessions) globalThis._cliAuthSessions = new Map<string, CliAuthSession>();

interface CliAuthStore {
  createSession(state: string): Promise<string>;
  getSession(sessionCode: string): Promise<CliAuthSession | null>;
  authorizeSession(
    sessionCode: string,
    userId: string,
    userInfo?: { name?: string; email?: string }
  ): Promise<boolean>;
  consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null>;
  deleteSession(sessionCode: string): Promise<void>;
  clearAllSessions(): Promise<void>;
}

class MemoryCliAuthStore implements CliAuthStore {
  private readonly sessions: Map<string, CliAuthSession>;

  constructor() {
    this.sessions = globalThis._cliAuthSessions ?? new Map<string, CliAuthSession>();
    globalThis._cliAuthSessions = this.sessions;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [code, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(code);
      }
    }
  }

  async createSession(state: string): Promise<string> {
    this.cleanupExpired();
    const sessionCode = randomUUID();
    this.sessions.set(sessionCode, {
      state,
      status: 'pending',
      createdAt: Date.now(),
    });
    return sessionCode;
  }

  async getSession(sessionCode: string): Promise<CliAuthSession | null> {
    this.cleanupExpired();
    const session = this.sessions.get(sessionCode);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionCode);
      return null;
    }
    return session;
  }

  async authorizeSession(
    sessionCode: string,
    userId: string,
    userInfo?: { name?: string; email?: string }
  ): Promise<boolean> {
    this.cleanupExpired();
    const session = this.sessions.get(sessionCode);
    if (!session) return false;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionCode);
      return false;
    }
    if (session.status !== 'pending') return false;
    session.status = 'authorized';
    session.userId = userId;
    session.userName = userInfo?.name;
    session.userEmail = userInfo?.email;
    return true;
  }

  async consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
    this.cleanupExpired();
    const session = this.sessions.get(sessionCode);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionCode);
      return null;
    }
    if (session.status !== 'authorized') return null;
    if (session.state !== state) return null;
    this.sessions.delete(sessionCode);
    return session;
  }

  async deleteSession(sessionCode: string): Promise<void> {
    this.sessions.delete(sessionCode);
  }

  async clearAllSessions(): Promise<void> {
    this.sessions.clear();
  }
}

class RedisCliAuthStore implements CliAuthStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  private key(sessionCode: string): string {
    return `${REDIS_KEY_PREFIX}${sessionCode}`;
  }

  async createSession(state: string): Promise<string> {
    const sessionCode = randomUUID();
    const session: CliAuthSession = {
      state,
      status: 'pending',
      createdAt: Date.now(),
    };
    await this.redis.set(this.key(sessionCode), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
    return sessionCode;
  }

  async getSession(sessionCode: string): Promise<CliAuthSession | null> {
    const raw = await this.redis.get(this.key(sessionCode));
    if (!raw) return null;
    return JSON.parse(raw) as CliAuthSession;
  }

  async authorizeSession(
    sessionCode: string,
    userId: string,
    userInfo?: { name?: string; email?: string }
  ): Promise<boolean> {
    const key = this.key(sessionCode);
    const raw = await this.redis.get(key);
    if (!raw) return false;
    const session = JSON.parse(raw) as CliAuthSession;
    if (session.status !== 'pending') return false;

    const updated: CliAuthSession = {
      ...session,
      status: 'authorized',
      userId,
      userName: userInfo?.name,
      userEmail: userInfo?.email,
    };
    await this.redis.set(key, JSON.stringify(updated), 'EX', SESSION_TTL_SECONDS);
    return true;
  }

  async consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
    const key = this.key(sessionCode);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as CliAuthSession;
    if (session.status !== 'authorized') return null;
    if (session.state !== state) return null;
    await this.redis.del(key);
    return session;
  }

  async deleteSession(sessionCode: string): Promise<void> {
    await this.redis.del(this.key(sessionCode));
  }

  async clearAllSessions(): Promise<void> {
    const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

let storeInstance: CliAuthStore | null = null;

function getStore(): CliAuthStore {
  if (storeInstance) return storeInstance;

  const backend = (process.env.SESSION_STORE || 'memory').trim().toLowerCase();
  if (backend === 'redis') {
    const redisUrl = (process.env.REDIS_URL || '').trim();
    if (!redisUrl) {
      throw new Error('SESSION_STORE=redis requires REDIS_URL');
    }
    storeInstance = new RedisCliAuthStore(redisUrl);
    return storeInstance;
  }

  storeInstance = new MemoryCliAuthStore();
  return storeInstance;
}

/**
 * Create a new CLI auth session.
 * Returns the unique session code.
 */
export async function createSession(state: string): Promise<string> {
  return getStore().createSession(state);
}

/**
 * Get a session by its code.
 * Returns null if not found or expired.
 */
export async function getSession(sessionCode: string): Promise<CliAuthSession | null> {
  return getStore().getSession(sessionCode);
}

/**
 * Mark a session as authorized with the given user ID.
 * Returns true if successful, false if session not found or already authorized.
 */
export async function authorizeSession(
  sessionCode: string,
  userId: string,
  userInfo?: { name?: string; email?: string }
): Promise<boolean> {
  return getStore().authorizeSession(sessionCode, userId, userInfo);
}

/**
 * Consume a session (one-time use).
 * Returns the session if valid and authorized, then deletes it.
 * Returns null if not found, expired, not authorized, or state mismatch.
 */
export async function consumeSession(sessionCode: string, state: string): Promise<CliAuthSession | null> {
  return getStore().consumeSession(sessionCode, state);
}

/**
 * Delete a session by its code.
 */
export async function deleteSession(sessionCode: string): Promise<void> {
  return getStore().deleteSession(sessionCode);
}

/**
 * Clear all sessions. Used for testing.
 */
export async function clearAllSessions(): Promise<void> {
  return getStore().clearAllSessions();
}
