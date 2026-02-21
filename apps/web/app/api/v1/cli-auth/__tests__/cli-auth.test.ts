import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  getSession,
  authorizeSession,
  consumeSession,
  clearAllSessions,
} from '@/lib/cli-auth-store';

// ─── CLI Auth Store Tests ────────────────────────────────────────────────────

describe('cli-auth-store', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  describe('createSession', () => {
    it('creates a session and returns a session code', () => {
      const code = createSession('my-state');
      expect(code).toBeTruthy();
      expect(typeof code).toBe('string');
      // UUID format
      expect(code).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('creates unique session codes', () => {
      const code1 = createSession('state-1');
      const code2 = createSession('state-2');
      expect(code1).not.toBe(code2);
    });
  });

  describe('getSession', () => {
    it('returns the session for a valid code', () => {
      const code = createSession('my-state');
      const session = getSession(code);
      expect(session).not.toBeNull();
      expect(session!.state).toBe('my-state');
      expect(session!.status).toBe('pending');
      expect(session!.userId).toBeUndefined();
    });

    it('returns null for unknown code', () => {
      expect(getSession('nonexistent')).toBeNull();
    });

    it('returns null for expired session', () => {
      const code = createSession('my-state');
      // Manually expire by manipulating time
      vi.useFakeTimers();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1); // 5 min + 1ms
      expect(getSession(code)).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('authorizeSession', () => {
    it('marks a pending session as authorized', () => {
      const code = createSession('my-state');
      const result = authorizeSession(code, 'user-123');
      expect(result).toBe(true);

      const session = getSession(code);
      expect(session!.status).toBe('authorized');
      expect(session!.userId).toBe('user-123');
    });

    it('returns false for unknown code', () => {
      expect(authorizeSession('nonexistent', 'user-123')).toBe(false);
    });

    it('returns false for expired session', () => {
      const code = createSession('my-state');
      vi.useFakeTimers();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(authorizeSession(code, 'user-123')).toBe(false);
      vi.useRealTimers();
    });

    it('returns false if session is already authorized', () => {
      const code = createSession('my-state');
      authorizeSession(code, 'user-123');
      // Second authorization attempt should fail
      expect(authorizeSession(code, 'user-456')).toBe(false);
    });
  });

  describe('consumeSession', () => {
    it('returns and deletes an authorized session with matching state', () => {
      const code = createSession('my-state');
      authorizeSession(code, 'user-123');

      const session = consumeSession(code, 'my-state');
      expect(session).not.toBeNull();
      expect(session!.userId).toBe('user-123');
      expect(session!.status).toBe('authorized');

      // Session should be deleted (one-time use)
      expect(getSession(code)).toBeNull();
    });

    it('returns null for unknown code', () => {
      expect(consumeSession('nonexistent', 'state')).toBeNull();
    });

    it('returns null for pending (not authorized) session', () => {
      const code = createSession('my-state');
      expect(consumeSession(code, 'my-state')).toBeNull();
      // Session should still exist (not consumed)
      expect(getSession(code)).not.toBeNull();
    });

    it('returns null for state mismatch', () => {
      const code = createSession('my-state');
      authorizeSession(code, 'user-123');
      expect(consumeSession(code, 'wrong-state')).toBeNull();
      // Session should still exist (not consumed due to state mismatch)
      expect(getSession(code)).not.toBeNull();
    });

    it('returns null for expired session', () => {
      const code = createSession('my-state');
      authorizeSession(code, 'user-123');
      vi.useFakeTimers();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(consumeSession(code, 'my-state')).toBeNull();
      vi.useRealTimers();
    });

    it('prevents replay — second consume returns null', () => {
      const code = createSession('my-state');
      authorizeSession(code, 'user-123');

      const first = consumeSession(code, 'my-state');
      expect(first).not.toBeNull();

      const second = consumeSession(code, 'my-state');
      expect(second).toBeNull();
    });
  });
});

// ─── Route Handler Tests ─────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockCreateApiKey = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
    },
  },
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('POST /api/v1/cli-auth/start', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it('returns authUrl and sessionCode for valid state', async () => {
    const { POST } = await import('../start/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'random-state-123' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.sessionCode).toBeTruthy();
    expect(data.authUrl).toContain('/cli-login?session=');
    expect(data.authUrl).toContain(data.sessionCode);
  });

  it('returns 400 when state is missing', async () => {
    const { POST } = await import('../start/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('state');
  });

  it('returns 400 when state is not a string', async () => {
    const { POST } = await import('../start/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 123 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('../start/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/cli-auth/authorize', () => {
  beforeEach(() => {
    clearAllSessions();
    mockGetSession.mockReset();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const { POST } = await import('../authorize/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'some-code' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when sessionCode is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123', name: 'Test' } });

    const { POST } = await import('../authorize/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 when session code does not exist', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123', name: 'Test' } });

    const { POST } = await import('../authorize/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'nonexistent' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('authorizes a valid pending session and stores user info', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    });
    const code = createSession('my-state');

    const { POST } = await import('../authorize/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    const session = getSession(code);
    expect(session!.status).toBe('authorized');
    expect(session!.userId).toBe('user-123');
    expect(session!.userName).toBe('Test User');
    expect(session!.userEmail).toBe('test@example.com');
  });
});

describe('POST /api/v1/cli-auth/exchange', () => {
  beforeEach(() => {
    clearAllSessions();
    mockCreateApiKey.mockReset();
  });

  it('returns 400 when sessionCode is missing', async () => {
    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'my-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when state is missing', async () => {
    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'some-code' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid/expired session code', async () => {
    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'nonexistent', state: 'my-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for pending (not authorized) session', async () => {
    const code = createSession('my-state');

    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'my-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for state mismatch', async () => {
    const code = createSession('my-state');
    authorizeSession(code, 'user-123');

    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'wrong-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('exchanges valid authorized session for API key', async () => {
    const code = createSession('my-state');
    authorizeSession(code, 'user-123', { name: 'Test User', email: 'test@example.com' });

    mockCreateApiKey.mockResolvedValue({ key: 'tank_abc123xyz' });

    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'my-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.token).toBe('tank_abc123xyz');
    expect(data.user).toEqual({ name: 'Test User', email: 'test@example.com' });

    expect(mockCreateApiKey).toHaveBeenCalledWith({
      body: {
        name: 'CLI Token',
        userId: 'user-123',
        expiresIn: 90 * 24 * 60 * 60,
        rateLimitMax: 1000,
      },
    });
  });

  it('prevents replay — second exchange returns 400', async () => {
    const code = createSession('my-state');
    authorizeSession(code, 'user-123', { name: 'Test User', email: 'test@example.com' });

    mockCreateApiKey.mockResolvedValue({ key: 'tank_abc123xyz' });

    const { POST } = await import('../exchange/route');

    // First exchange succeeds
    const request1 = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'my-state' }),
    });
    const response1 = await POST(request1);
    expect(response1.status).toBe(200);

    // Second exchange fails (replay protection)
    const request2 = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'my-state' }),
    });
    const response2 = await POST(request2);
    expect(response2.status).toBe(400);
  });

  it('returns 400 for expired session', async () => {
    const code = createSession('my-state');
    authorizeSession(code, 'user-123');

    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const { POST } = await import('../exchange/route');
    const request = new Request('http://localhost:3000/api/v1/cli-auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: code, state: 'my-state' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    vi.useRealTimers();
  });
});
