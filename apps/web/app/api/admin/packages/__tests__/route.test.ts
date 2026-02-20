import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();
const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();
const mockDbLimit = vi.fn();
const mockDbExecute = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSet = vi.fn();
const mockDbInsert = vi.fn();
const mockDbValues = vi.fn();
const mockDbOrderBy = vi.fn();
const mockDbOffset = vi.fn();

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
    execute: (...args: unknown[]) => mockDbExecute(...args),
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...args: unknown[]) => {
          mockDbFrom(...args);
          return {
            where: (...args: unknown[]) => {
              mockDbWhere(...args);
              return {
                limit: (...args: unknown[]) => mockDbLimit(...args),
                orderBy: (...args: unknown[]) => {
                  mockDbOrderBy(...args);
                  return {
                    limit: (...args: unknown[]) => mockDbLimit(...args),
                  };
                },
              };
            },
            orderBy: (...args: unknown[]) => {
              mockDbOrderBy(...args);
              return {
                limit: (...args: unknown[]) => mockDbLimit(...args),
                offset: (...args: unknown[]) => mockDbOffset(...args),
              };
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return {
        set: (...args: unknown[]) => {
          mockDbSet(...args);
          return {
            where: mockDbWhere,
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return {
        values: (...args: unknown[]) => {
          mockDbValues(...args);
          return Promise.resolve();
        },
      };
    },
  },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: { id: 'skills.id', name: 'skills.name', status: 'skills.status', featured: 'skills.featured', publisherId: 'skills.publisher_id' },
  skillVersions: { id: 'sv.id', skillId: 'sv.skill_id', createdAt: 'sv.created_at' },
  skillDownloads: { skillId: 'sd.skill_id' },
  auditEvents: { id: 'ae.id', targetId: 'ae.target_id', targetType: 'ae.target_type', createdAt: 'ae.created_at' },
  user: { id: 'user.id', role: 'user.role' },
}));

vi.mock('@/lib/db/auth-schema', () => ({
  user: { id: 'user.id', name: 'user.name', email: 'user.email', githubUsername: 'user.github_username', role: 'user.role' },
}));

vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn().mockReturnValue([{ ok: 1 }]), {
    end: vi.fn(),
    options: { parsers: {}, serializers: {}, transform: { undefined: undefined } },
    reserve: vi.fn(),
  });
  return { default: vi.fn(() => mockSql) };
});

function setupAdminAuth() {
  mockGetSession.mockResolvedValue({
    user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' },
    session: { id: 'session-1', token: 'token-1' },
  });
  mockDbLimit.mockResolvedValue([{ role: 'admin' }]);
}

function setupNonAdminAuth() {
  mockGetSession.mockResolvedValue({
    user: { id: 'user-1', name: 'User', email: 'user@test.com' },
    session: { id: 'session-2', token: 'token-2' },
  });
  mockDbLimit.mockResolvedValue([{ role: 'user' }]);
}

function setupNoAuth() {
  mockGetSession.mockResolvedValue(null);
}

describe('Admin Packages API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret';
  });

  describe('GET /api/admin/packages (list)', () => {
    it('returns 401 when not authenticated', async () => {
      setupNoAuth();
      const { GET } = await import('../route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 403 when not admin', async () => {
      setupNonAdminAuth();
      const { GET } = await import('../route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('returns packages list with pagination', async () => {
      setupAdminAuth();
      mockDbExecute
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{
          id: 'pkg-1',
          name: 'test-skill',
          description: 'A test skill',
          status: 'active',
          featured: false,
          publisherId: 'user-1',
          publisherName: 'Test User',
          publisherEmail: 'test@test.com',
          versionCount: 3,
          downloadCount: 42,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
        }]);

      const { GET } = await import('../route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages?page=1&limit=20');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.packages).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.packages[0].name).toBe('test-skill');
      expect(body.packages[0].publisher).toEqual({ name: 'Test User', email: 'test@test.com' });
      expect(body.packages[0].versionCount).toBe(3);
      expect(body.packages[0].downloadCount).toBe(42);
    });

    it('returns 400 for invalid status filter', async () => {
      setupAdminAuth();
      const { GET } = await import('../route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages?status=invalid');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Invalid status');
    });
  });

  describe('GET /api/admin/packages/[name] (detail)', () => {
    it('returns 401 when not authenticated', async () => {
      setupNoAuth();
      const { GET } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 404 when package not found', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([]);
      });

      const { GET } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/nonexistent');
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Package not found');
    });

    it('returns package detail with publisher, versions, downloads, and status history', async () => {
      setupAdminAuth();

      const mockSkill = {
        id: 'pkg-1',
        name: 'test-skill',
        description: 'A test',
        publisherId: 'user-1',
        status: 'active',
        featured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPublisher = {
        id: 'user-1',
        name: 'Publisher',
        email: 'pub@test.com',
        githubUsername: 'publisher',
      };

      const mockVersions = [
        { id: 'v1', version: '1.0.0', skillId: 'pkg-1', createdAt: new Date() },
      ];

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        if (callCount === 2) return Promise.resolve([mockSkill]);
        if (callCount === 3) return Promise.resolve([mockPublisher]);
        if (callCount === 4) return Promise.resolve([{ targetType: 'skill', action: 'skill.quarantine', actorId: 'admin-1', targetId: 'pkg-1', createdAt: new Date(), metadata: {} }]);
        return Promise.resolve([]);
      });

      mockDbOrderBy.mockImplementation(() => {
        return { limit: mockDbLimit };
      });

      mockDbSelect.mockImplementation(() => ({
        from: (...args: unknown[]) => {
          mockDbFrom(...args);
          return {
            where: (...args: unknown[]) => {
              mockDbWhere(...args);
              return {
                limit: mockDbLimit,
                orderBy: (...args: unknown[]) => {
                  mockDbOrderBy(...args);
                  if (callCount >= 3 && callCount < 5) {
                    return mockVersions;
                  }
                  return { limit: mockDbLimit };
                },
              };
            },
          };
        },
      }));

      const { GET } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/admin/packages/[name]', () => {
    it('returns 401 when not authenticated', async () => {
      setupNoAuth();
      const { DELETE } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill', { method: 'DELETE' });
      const res = await DELETE(req);
      expect(res.status).toBe(401);
    });

    it('returns 404 when package not found', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([]);
      });

      const { DELETE } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/nonexistent', { method: 'DELETE' });
      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });

    it('soft-deletes package and logs audit event', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([{ id: 'pkg-1', name: 'test-skill', status: 'active' }]);
      });

      mockDbWhere.mockResolvedValue(undefined);
      mockDbValues.mockResolvedValue(undefined);

      const { DELETE } = await import('../[name]/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill', { method: 'DELETE' });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('removed');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/packages/[name]/status', () => {
    it('returns 401 when not authenticated', async () => {
      setupNoAuth();
      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'quarantined', reason: 'test' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid status', async () => {
      setupAdminAuth();
      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'invalid', reason: 'test' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Invalid status');
    });

    it('returns 400 when reason is missing', async () => {
      setupAdminAuth();
      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'quarantined' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('reason is required');
    });

    it('returns 400 for invalid JSON body', async () => {
      setupAdminAuth();
      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/status', {
        method: 'PATCH',
        body: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('returns 404 when package not found', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([]);
      });

      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/nonexistent/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'quarantined', reason: 'Suspicious activity' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(404);
    });

    it('updates status and logs audit event', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([{ id: 'pkg-1', name: 'test-skill', status: 'active' }]);
      });

      mockDbWhere.mockResolvedValue(undefined);
      mockDbValues.mockResolvedValue(undefined);

      const { PATCH } = await import('../[name]/status/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'quarantined', reason: 'Suspicious activity' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.previousStatus).toBe('active');
      expect(body.status).toBe('quarantined');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/packages/[name]/feature', () => {
    it('returns 401 when not authenticated', async () => {
      setupNoAuth();
      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/feature', {
        method: 'POST',
        body: JSON.stringify({ featured: true }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 when featured is not boolean', async () => {
      setupAdminAuth();
      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/feature', {
        method: 'POST',
        body: JSON.stringify({ featured: 'yes' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('featured must be a boolean');
    });

    it('returns 400 for invalid JSON body', async () => {
      setupAdminAuth();
      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/feature', {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 404 when package not found', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([]);
      });

      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/nonexistent/feature', {
        method: 'POST',
        body: JSON.stringify({ featured: true }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    it('features a package and logs audit event', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([{ id: 'pkg-1', name: 'test-skill', featured: false }]);
      });

      mockDbWhere.mockResolvedValue(undefined);
      mockDbValues.mockResolvedValue(undefined);

      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/feature', {
        method: 'POST',
        body: JSON.stringify({ featured: true }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.featured).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('unfeatures a package and logs audit event', async () => {
      setupAdminAuth();

      let callCount = 0;
      mockDbLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ role: 'admin' }]);
        return Promise.resolve([{ id: 'pkg-1', name: 'test-skill', featured: true }]);
      });

      mockDbWhere.mockResolvedValue(undefined);
      mockDbValues.mockResolvedValue(undefined);

      const { POST } = await import('../[name]/feature/route');
      const req = new NextRequest('http://localhost:3000/api/admin/packages/test-skill/feature', {
        method: 'POST',
        body: JSON.stringify({ featured: false }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.featured).toBe(false);
    });
  });
});
