import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGetSession = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...args: unknown[]) => {
          mockFrom(...args);
          return {
            where: (...args: unknown[]) => {
              mockWhere(...args);
              return {
                limit: (...args: unknown[]) => mockLimit(...args),
              };
            },
          };
        },
      };
    },
  },
}));

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

describe('admin-middleware', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockWhere.mockReset();
    mockLimit.mockReset();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-unit-tests';
  });

  describe('requireAdmin', () => {
    it('returns user and session when user is admin', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Admin User', email: 'admin@example.com' },
        session: { id: 'session-1', token: 'token-123' },
      });
      mockLimit.mockResolvedValue([{ role: 'admin' }]);

      const { requireAdmin } = await import('../admin-middleware');
      const result = await requireAdmin();

      expect(result).not.toBeInstanceOf(NextResponse);
      if (!(result instanceof NextResponse)) {
        expect(result.user.id).toBe('user-123');
        expect(result.session.id).toBe('session-1');
      }
    });

    it('returns 401 when no session exists', async () => {
      mockGetSession.mockResolvedValue(null);

      const { requireAdmin } = await import('../admin-middleware');
      const result = await requireAdmin();

      expect(result).toBeInstanceOf(NextResponse);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(401);
        const body = await result.json();
        expect(body.error).toBe('Unauthorized');
      }
    });

    it('returns 404 when user not found in database', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        session: { id: 'session-1', token: 'token-123' },
      });
      mockLimit.mockResolvedValue([]);

      const { requireAdmin } = await import('../admin-middleware');
      const result = await requireAdmin();

      expect(result).toBeInstanceOf(NextResponse);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(404);
        const body = await result.json();
        expect(body.error).toBe('User not found');
      }
    });

    it('returns 403 when user is not admin', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Regular User', email: 'user@example.com' },
        session: { id: 'session-1', token: 'token-123' },
      });
      mockLimit.mockResolvedValue([{ role: 'user' }]);

      const { requireAdmin } = await import('../admin-middleware');
      const result = await requireAdmin();

      expect(result).toBeInstanceOf(NextResponse);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(403);
        const body = await result.json();
        expect(body.error).toBe('Forbidden');
      }
    });
  });

  describe('withAdminAuth', () => {
    it('passes user to handler when admin', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Admin User', email: 'admin@example.com' },
        session: { id: 'session-1', token: 'token-123' },
      });
      mockLimit.mockResolvedValue([{ role: 'admin' }]);

      const { withAdminAuth } = await import('../admin-middleware');
      const mockHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrappedHandler = withAdminAuth(mockHandler);

      const req = new NextRequest('http://localhost:3000/api/admin/test');
      const result = await wrappedHandler(req);

      expect(mockHandler).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-123' }),
          session: expect.objectContaining({ id: 'session-1' }),
        })
      );
      expect(result.status).toBe(200);
    });

    it('returns 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const { withAdminAuth } = await import('../admin-middleware');
      const mockHandler = vi.fn();
      const wrappedHandler = withAdminAuth(mockHandler);

      const req = new NextRequest('http://localhost:3000/api/admin/test');
      const result = await wrappedHandler(req);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result.status).toBe(401);
    });

    it('returns 403 when user is not admin', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', name: 'Regular User', email: 'user@example.com' },
        session: { id: 'session-1', token: 'token-123' },
      });
      mockLimit.mockResolvedValue([{ role: 'user' }]);

      const { withAdminAuth } = await import('../admin-middleware');
      const mockHandler = vi.fn();
      const wrappedHandler = withAdminAuth(mockHandler);

      const req = new NextRequest('http://localhost:3000/api/admin/test');
      const result = await wrappedHandler(req);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result.status).toBe(403);
    });
  });
});
