import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAdminUser = { id: 'admin-1', name: 'Admin', email: 'admin@test.com' };
const mockSession = { id: 'session-1' };
let mockAuthResult: { user: typeof mockAdminUser; session: typeof mockSession } | null = {
  user: mockAdminUser,
  session: mockSession,
};

vi.mock('@/lib/admin-middleware', () => ({
  withAdminAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      if (!mockAuthResult) {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return handler(req, mockAuthResult);
    };
  }),
}));

// Thenable chain mock — each DB call resolves to the next queued result via .then()
const dbResults: unknown[][] = [];
let dbResultIndex = 0;
const insertCalls: { table: unknown; values: unknown }[] = [];
const updateCalls: { table: unknown; set: unknown; where: unknown }[] = [];

function nextResult(): unknown[] {
  return dbResults[dbResultIndex++] ?? [];
}

function createChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'offset', 'leftJoin', 'as']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(nextResult());
  return chain;
}

const mockSelect = vi.fn((..._args: unknown[]) => createChain());

const mockInsertFn = vi.fn((...tableArgs: unknown[]) => ({
  values: vi.fn((...vArgs: unknown[]) => {
    insertCalls.push({ table: tableArgs[0], values: vArgs[0] });
    const inner: Record<string, unknown> = {};
    inner.returning = vi.fn(() => ({
      then: (resolve: (v: unknown) => unknown) => resolve(nextResult()),
    }));
    inner.then = (resolve: (v: unknown) => unknown) => resolve(nextResult());
    return inner;
  }),
}));

const mockUpdate = vi.fn((...tableArgs: unknown[]) => ({
  set: vi.fn((...sArgs: unknown[]) => ({
    where: vi.fn((...wArgs: unknown[]) => {
      updateCalls.push({ table: tableArgs[0], set: sArgs[0], where: wArgs[0] });
      return { then: (resolve: (v: unknown) => unknown) => resolve(undefined) };
    }),
    then: (resolve: (v: unknown) => unknown) => resolve(undefined),
  })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsertFn(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    transaction: async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => callback({
      insert: (...args: unknown[]) => mockInsertFn(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      select: (...args: unknown[]) => mockSelect(...args),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    githubUsername: 'user.github_username',
    image: 'user.image',
    role: 'user.role',
    createdAt: 'user.created_at',
    updatedAt: 'user.updated_at',
  },
  userStatus: {
    id: 'user_status.id',
    userId: 'user_status.user_id',
    status: 'user_status.status',
    reason: 'user_status.reason',
    bannedBy: 'user_status.banned_by',
    expiresAt: 'user_status.expires_at',
    createdAt: 'user_status.created_at',
  },
  auditEvents: {
    id: 'audit_events.id',
    action: 'audit_events.action',
    actorId: 'audit_events.actor_id',
    targetType: 'audit_events.target_type',
    targetId: 'audit_events.target_id',
    metadata: 'audit_events.metadata',
    createdAt: 'audit_events.created_at',
  },
  skills: {
    id: 'skills.id',
    publisherId: 'skills.publisher_id',
  },
  member: {
    id: 'member.id',
    userId: 'member.user_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  or: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'or' })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ col, val, type: 'ilike' })),
  desc: vi.fn((col: unknown) => ({ col, type: 'desc' })),
  count: vi.fn(() => 'count_fn'),
  sql: vi.fn(),
}));

vi.mock('@tank/shared', () => ({
  userRoleSchema: {
    safeParse: (value: unknown) => {
      if (value === 'user' || value === 'admin') {
        return { success: true, data: value };
      }
      return { success: false, error: { errors: [{ message: 'Invalid role' }] } };
    },
  },
  userStatusSchema: {
    safeParse: (value: unknown) => {
      if (value === 'active' || value === 'suspended' || value === 'banned') {
        return { success: true, data: value };
      }
      return { success: false, error: { errors: [{ message: 'Invalid status' }] } };
    },
  },
}));

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makeRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function resetMocks() {
  vi.clearAllMocks();
  dbResults.length = 0;
  dbResultIndex = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  mockAuthResult = { user: mockAdminUser, session: mockSession };
}

describe('GET /api/admin/users', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = null;
    const { GET } = await import('../route');
    const response = await GET(makeGetRequest('/api/admin/users'));
    expect(response.status).toBe(401);
  });

  it('returns paginated users with defaults', async () => {
    dbResults.push(
      [{ count: 2 }],
      [
        {
          id: 'user-1', name: 'Alice', email: 'alice@test.com',
          githubUsername: 'alice', image: null, role: 'user',
          createdAt: new Date('2024-01-01'),
          latestStatusStatus: null, latestStatusReason: null,
          latestStatusExpiresAt: null, latestStatusCreatedAt: null,
        },
        {
          id: 'user-2', name: 'Bob', email: 'bob@test.com',
          githubUsername: 'bob', image: null, role: 'admin',
          createdAt: new Date('2024-01-02'),
          latestStatusStatus: 'banned', latestStatusReason: 'Spam',
          latestStatusExpiresAt: null, latestStatusCreatedAt: new Date('2024-06-01'),
        },
      ],
    );

    const { GET } = await import('../route');
    const response = await GET(makeGetRequest('/api/admin/users'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.totalPages).toBe(1);
    expect(data.users[0].latestStatus).toBeNull();
    expect(data.users[1].latestStatus).toEqual(
      expect.objectContaining({ status: 'banned', reason: 'Spam' }),
    );
  });

  it('respects search, role, and pagination params', async () => {
    dbResults.push(
      [{ count: 1 }],
      [
        {
          id: 'user-1', name: 'Alice', email: 'alice@test.com',
          githubUsername: 'alice', image: null, role: 'admin',
          createdAt: new Date('2024-01-01'),
          latestStatusStatus: null, latestStatusReason: null,
          latestStatusExpiresAt: null, latestStatusCreatedAt: null,
        },
      ],
    );

    const { GET } = await import('../route');
    const response = await GET(
      makeGetRequest('/api/admin/users?search=alice&role=admin&page=1&limit=10'),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toHaveLength(1);
    expect(data.limit).toBe(10);
  });

  it('clamps limit to max 100', async () => {
    dbResults.push([{ count: 0 }], []);

    const { GET } = await import('../route');
    const response = await GET(makeGetRequest('/api/admin/users?limit=500'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(100);
  });
});

describe('GET /api/admin/users/[userId]', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = null;
    const { GET } = await import('../[userId]/route');
    const response = await GET(makeGetRequest('/api/admin/users/user-1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    dbResults.push([]);

    const { GET } = await import('../[userId]/route');
    const response = await GET(makeGetRequest('/api/admin/users/nonexistent'));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('User not found');
  });

  it('returns user detail with status history and counts', async () => {
    dbResults.push(
      [{
        id: 'user-1', name: 'Alice', email: 'alice@test.com',
        githubUsername: 'alice', image: null, role: 'user',
        createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-06-01'),
      }],
      [
        { id: 'status-1', status: 'banned', reason: 'Spam', bannedBy: 'admin-1', expiresAt: null, createdAt: new Date('2024-03-01') },
        { id: 'status-2', status: 'active', reason: 'Unbanned', bannedBy: 'admin-1', expiresAt: null, createdAt: new Date('2024-04-01') },
      ],
      [{ count: 5 }],
      [{ count: 2 }],
    );

    const { GET } = await import('../[userId]/route');
    const response = await GET(makeGetRequest('/api/admin/users/user-1'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe('user-1');
    expect(data.user.name).toBe('Alice');
    expect(data.statusHistory).toHaveLength(2);
    expect(data.counts.packages).toBe(5);
    expect(data.counts.organizations).toBe(2);
  });
});

describe('PATCH /api/admin/users/[userId]', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = null;
    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(makeRequest('/api/admin/users/user-1', 'PATCH', { role: 'admin' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid role', async () => {
    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/user-1', 'PATCH', { role: 'superadmin' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('role');
  });

  it('returns 400 for missing role', async () => {
    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/user-1', 'PATCH', {}),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { PATCH } = await import('../[userId]/route');
    const req = new NextRequest(new URL('/api/admin/users/user-1', 'http://localhost:3000'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await PATCH(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when trying to change own role', async () => {
    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/admin-1', 'PATCH', { role: 'user' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('own role');
  });

  it('returns 404 when target user not found', async () => {
    dbResults.push([]);

    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/nonexistent', 'PATCH', { role: 'admin' }),
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when user already has the role', async () => {
    dbResults.push([{ id: 'user-1', role: 'admin' }]);

    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/user-1', 'PATCH', { role: 'admin' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already');
  });

  it('promotes user to admin and logs audit event', async () => {
    dbResults.push([{ id: 'user-1', role: 'user' }]);

    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/user-1', 'PATCH', { role: 'admin' }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.oldRole).toBe('user');
    expect(data.newRole).toBe('admin');

    const auditInsert = insertCalls.find(
      (c) => (c.values as Record<string, unknown>)?.action === 'user.promote',
    );
    expect(auditInsert).toBeTruthy();
    expect(auditInsert!.values).toEqual(
      expect.objectContaining({
        action: 'user.promote',
        actorId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
      }),
    );
  });

  it('demotes admin to user and logs audit event', async () => {
    dbResults.push([{ id: 'user-2', role: 'admin' }]);

    const { PATCH } = await import('../[userId]/route');
    const response = await PATCH(
      makeRequest('/api/admin/users/user-2', 'PATCH', { role: 'user' }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.newRole).toBe('user');

    const auditInsert = insertCalls.find(
      (c) => (c.values as Record<string, unknown>)?.action === 'user.demote',
    );
    expect(auditInsert).toBeTruthy();
  });
});

describe('POST /api/admin/users/[userId]/status', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = null;
    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'banned', reason: 'Spam' }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid status', async () => {
    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'deleted', reason: 'test' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('status');
  });

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('../[userId]/status/route');
    const req = new NextRequest(new URL('/api/admin/users/user-1/status', 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 when banning without reason', async () => {
    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'banned' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Reason');
  });

  it('returns 400 when banning with empty reason', async () => {
    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'banned', reason: '  ' }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when trying to change own status', async () => {
    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/admin-1/status', 'POST', { status: 'banned', reason: 'test' }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('own status');
  });

  it('returns 404 when target user not found', async () => {
    dbResults.push([]);

    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/nonexistent/status', 'POST', { status: 'banned', reason: 'Spam' }),
    );
    expect(response.status).toBe(404);
  });

  it('bans user and logs audit event', async () => {
    dbResults.push([{ id: 'user-1' }]);

    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', {
        status: 'banned',
        reason: 'Spam account',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.userId).toBe('user-1');
    expect(data.status).toBe('banned');

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].values).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        status: 'banned',
        reason: 'Spam account',
        bannedBy: 'admin-1',
      }),
    );
  });

  it('suspends user with expiresAt', async () => {
    dbResults.push([{ id: 'user-1' }]);

    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', {
        status: 'suspended',
        reason: 'Temporary suspension',
        expiresAt: '2025-12-31T23:59:59Z',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('suspended');
  });

  it('unbans user without requiring reason', async () => {
    dbResults.push([{ id: 'user-1' }]);

    const { POST } = await import('../[userId]/status/route');
    const response = await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'active' }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('active');
  });

  it('logs correct audit action for each status', async () => {
    dbResults.push([{ id: 'user-1' }]);

    const { POST } = await import('../[userId]/status/route');
    await POST(
      makeRequest('/api/admin/users/user-1/status', 'POST', { status: 'banned', reason: 'Spam' }),
    );

    const auditInsert = insertCalls.find(
      (c) => (c.values as Record<string, unknown>)?.action === 'user.ban',
    );
    expect(auditInsert).toBeTruthy();
    expect(auditInsert!.values).toEqual(
      expect.objectContaining({
        action: 'user.ban',
        actorId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
      }),
    );
  });
});
