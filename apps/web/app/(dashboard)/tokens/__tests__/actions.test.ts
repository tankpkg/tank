import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockCreateApiKey = vi.fn();
const mockListApiKeys = vi.fn();
const mockDeleteApiKey = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
      listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
      deleteApiKey: (...args: unknown[]) => mockDeleteApiKey(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock postgres to prevent DB connection attempts
vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn().mockReturnValue([{ ok: 1 }]), {
    end: vi.fn(),
    options: {
      parsers: {},
      serializers: {},
      transform: { undefined: undefined },
    },
    reserve: vi.fn(),
  });
  return { default: vi.fn(() => mockSql) };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('token server actions', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateApiKey.mockReset();
    mockListApiKeys.mockReset();
    mockDeleteApiKey.mockReset();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-unit-tests';
  });

  describe('createToken', () => {
    it('creates a token and returns key with tank_ prefix', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        session: { id: 'session-1' },
      });
      mockCreateApiKey.mockResolvedValue({
        id: 'key-1',
        key: 'tank_abc123def456',
        name: 'My Token',
        start: 'tank_a',
        prefix: 'tank_',
        createdAt: new Date(),
      });

      const { createToken } = await import('../actions');
      const result = await createToken('My Token');

      expect(result).toBeDefined();
      expect((result as { key: string }).key).toBe('tank_abc123def456');
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        body: {
          name: 'My Token',
          userId: 'user-123',
          expiresIn: 90 * 24 * 60 * 60,
          rateLimitMax: 1000,
        },
      });
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { createToken } = await import('../actions');
      await expect(createToken('My Token')).rejects.toThrow('Unauthorized');
    });
  });

  describe('listTokens', () => {
    it('returns array of API keys', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        session: { id: 'session-1' },
      });
      const mockKeys = [
        {
          id: 'key-1',
          name: 'Token 1',
          start: 'tank_a',
          prefix: 'tank_',
          createdAt: new Date(),
          lastRequest: null,
          expiresAt: null,
          enabled: true,
        },
        {
          id: 'key-2',
          name: 'Token 2',
          start: 'tank_b',
          prefix: 'tank_',
          createdAt: new Date(),
          lastRequest: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          enabled: true,
        },
      ];
      mockListApiKeys.mockResolvedValue(mockKeys);

      const { listTokens } = await import('../actions');
      const result = await listTokens();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Token 1');
      expect(result[1].name).toBe('Token 2');
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { listTokens } = await import('../actions');
      await expect(listTokens()).rejects.toThrow('Unauthorized');
    });
  });

  describe('revokeToken', () => {
    it('calls deleteApiKey with the correct keyId', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        session: { id: 'session-1' },
      });
      mockDeleteApiKey.mockResolvedValue({ success: true });

      const { revokeToken } = await import('../actions');
      const result = await revokeToken('key-1');

      expect(result).toEqual({ success: true });
      expect(mockDeleteApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { keyId: 'key-1' },
        })
      );
    });

    it('throws when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const { revokeToken } = await import('../actions');
      await expect(revokeToken('key-1')).rejects.toThrow('Unauthorized');
    });
  });
});
