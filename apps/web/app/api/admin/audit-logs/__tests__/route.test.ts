import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAdminUser = { id: 'admin-1', name: 'Admin', email: 'admin@test.com' };
const mockSession = { id: 'session-1' };
let mockAuthResult: { user: typeof mockAdminUser; session: typeof mockSession } | null = {
  user: mockAdminUser,
  session: mockSession,
};

vi.mock('@/lib/admin-middleware', () => ({
  withAdminAuth: vi.fn((handler: (req: NextRequest) => Promise<Response>) => {
    return async (req: NextRequest) => {
      if (!mockAuthResult) {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return handler(req);
    };
  }),
}));

const dbResults: unknown[][] = [];
let dbResultIndex = 0;
let selectCallCount = 0;

function nextResult(): unknown[] {
  return dbResults[dbResultIndex++] ?? [];
}

const mockSelect = vi.fn(() => {
  selectCallCount += 1;

  if (selectCallCount === 1) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(nextResult())),
      })),
    };
  }

  return {
    from: vi.fn(() => ({
      leftJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve(nextResult())),
            })),
          })),
        })),
      })),
    })),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: () => mockSelect(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  auditEvents: {
    id: 'audit_events.id',
    action: 'audit_events.action',
    actorId: 'audit_events.actor_id',
    targetType: 'audit_events.target_type',
    targetId: 'audit_events.target_id',
    metadata: 'audit_events.metadata',
    createdAt: 'audit_events.created_at',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  count: vi.fn(() => 'count_fn'),
  desc: vi.fn((column: unknown) => ({ type: 'desc', column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ type: 'eq', column, value })),
  gte: vi.fn((column: unknown, value: unknown) => ({ type: 'gte', column, value })),
  lte: vi.fn((column: unknown, value: unknown) => ({ type: 'lte', column, value })),
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function resetMocks() {
  vi.clearAllMocks();
  dbResults.length = 0;
  dbResultIndex = 0;
  selectCallCount = 0;
  mockAuthResult = { user: mockAdminUser, session: mockSession };
}

describe('GET /api/admin/audit-logs', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = null;
    const { GET } = await import('../route');
    const response = await GET(makeRequest('/api/admin/audit-logs'));
    expect(response.status).toBe(401);
  });

  it('returns paginated events with defaults', async () => {
    dbResults.push(
      [{ count: 2 }],
      [
        {
          id: 'evt-1',
          action: 'user.ban',
          actorId: 'admin-1',
          actorName: 'Admin',
          actorEmail: 'admin@test.com',
          targetType: 'user',
          targetId: 'user-1',
          metadata: { reason: 'spam' },
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'evt-2',
          action: 'skill.quarantine',
          actorId: 'admin-1',
          actorName: 'Admin',
          actorEmail: 'admin@test.com',
          targetType: 'skill',
          targetId: 'skill-1',
          metadata: { reason: 'malicious' },
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
      ],
    );

    const { GET } = await import('../route');
    const response = await GET(makeRequest('/api/admin/audit-logs'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.events).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.totalPages).toBe(1);
  });

  it('supports action and date filters', async () => {
    dbResults.push(
      [{ count: 1 }],
      [
        {
          id: 'evt-1',
          action: 'skill.remove',
          actorId: 'admin-1',
          actorName: 'Admin',
          actorEmail: 'admin@test.com',
          targetType: 'skill',
          targetId: 'skill-2',
          metadata: { reason: 'policy violation' },
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      ],
    );

    const { GET } = await import('../route');
    const response = await GET(
      makeRequest(
        '/api/admin/audit-logs?action=skill.remove&startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T00:00:00.000Z',
      ),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].action).toBe('skill.remove');
  });

  it('returns 400 for invalid date filter', async () => {
    const { GET } = await import('../route');
    const response = await GET(makeRequest('/api/admin/audit-logs?startDate=not-a-date'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid startDate');
  });
});
