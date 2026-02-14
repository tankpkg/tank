import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock Drizzle db with chainable query builder
const mockLimit = vi.fn();
const mockOffset = vi.fn(() => ({ limit: mockLimit }));
const mockOrderBy = vi.fn(() => ({ offset: mockOffset, limit: mockLimit }));
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit }));
const mockInnerJoinWhere = vi.fn(() => ({ orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit }));
const mockLeftJoin2 = vi.fn(() => ({ where: mockInnerJoinWhere, orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit }));
const mockLeftJoin = vi.fn(() => ({ leftJoin: mockLeftJoin2, where: mockInnerJoinWhere, orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit }));
const mockFrom = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere, orderBy: mockOrderBy }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  publishers: {
    id: 'publishers.id',
    displayName: 'publishers.display_name',
  },
  skills: {
    id: 'skills.id',
    name: 'skills.name',
    description: 'skills.description',
    publisherId: 'skills.publisher_id',
    updatedAt: 'skills.updated_at',
  },
  skillVersions: {
    id: 'skill_versions.id',
    skillId: 'skill_versions.skill_id',
    version: 'skill_versions.version',
    auditScore: 'skill_versions.audit_score',
    createdAt: 'skill_versions.created_at',
  },
  skillDownloads: {
    id: 'skill_downloads.id',
    skillId: 'skill_downloads.skill_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
  desc: vi.fn((col) => ({ col, type: 'desc' })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
      type: 'sql',
    }),
    { raw: (s: string) => ({ raw: s, type: 'sql_raw' }) },
  ),
  count: vi.fn((col) => ({ col, type: 'count' })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url, { method: 'GET' });
}

const mockSearchResults = [
  {
    name: 'seo-audit',
    description: 'SEO audit skill for websites',
    latestVersion: '1.2.0',
    auditScore: 8.5,
    publisher: 'Test Publisher',
    downloads: 0,
  },
  {
    name: '@community/seo-checker',
    description: 'Check SEO scores',
    latestVersion: '2.0.0',
    auditScore: 9.0,
    publisher: 'Community Dev',
    downloads: 0,
  },
];

const mockRecentResults = [
  {
    name: 'latest-skill',
    description: 'Most recently updated',
    latestVersion: '3.0.0',
    auditScore: 7.0,
    publisher: 'Recent Publisher',
    downloads: 0,
  },
  {
    name: 'another-skill',
    description: 'Another skill',
    latestVersion: '1.0.0',
    auditScore: 6.5,
    publisher: 'Another Publisher',
    downloads: 0,
  },
];

// ─── GET /api/v1/search ─────────────────────────────────────────────────────

describe('GET /api/v1/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain defaults
    mockFrom.mockReturnValue({ leftJoin: mockLeftJoin, where: mockWhere, orderBy: mockOrderBy });
    mockLeftJoin.mockReturnValue({ leftJoin: mockLeftJoin2, where: mockInnerJoinWhere, orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit });
    mockLeftJoin2.mockReturnValue({ where: mockInnerJoinWhere, orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit });
    mockInnerJoinWhere.mockReturnValue({ orderBy: mockOrderBy, offset: mockOffset, limit: mockLimit });
    mockOrderBy.mockReturnValue({ offset: mockOffset, limit: mockLimit });
    mockOffset.mockReturnValue({ limit: mockLimit });
  });

  it('returns matching skills when searching by name', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 2 }]);
    // Search results
    mockLimit.mockResolvedValueOnce(mockSearchResults);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=seo');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe('seo-audit');
    expect(data.total).toBe(2);
  });

  it('returns matching skills when searching by description keyword', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 1 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([mockSearchResults[0]]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=audit');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].description).toContain('audit');
  });

  it('returns most recently published skills when query is empty', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 2 }]);
    // Recent results
    mockLimit.mockResolvedValueOnce(mockRecentResults);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe('latest-skill');
  });

  it('results include name, description, latestVersion, auditScore, publisher, downloads', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 1 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([mockSearchResults[0]]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=seo');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    const result = data.results[0];
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('latestVersion');
    expect(result).toHaveProperty('auditScore');
    expect(result).toHaveProperty('publisher');
    expect(result).toHaveProperty('downloads');
  });

  it('pagination works (page=2 with limit=1)', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 2 }]);
    // Page 2 results
    mockLimit.mockResolvedValueOnce([mockSearchResults[1]]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=seo&page=2&limit=1');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.page).toBe(2);
    expect(data.limit).toBe(1);
    expect(data.total).toBe(2);
  });

  it('default limit is 20', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(20);
  });

  it('limit is capped at 50', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test&limit=100');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(50);
  });

  it('no results returns empty array with total=0', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=nonexistent-xyz');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('invalid page/limit defaults gracefully', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);
    // Search results
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test&page=-5&limit=abc');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
  });

  it('returns correct response shape with page and limit fields', async () => {
    // Count query
    mockExecute.mockResolvedValueOnce([{ count: 42 }]);
    // Search results
    mockLimit.mockResolvedValueOnce(mockSearchResults);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=seo&page=1&limit=20');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('page', 1);
    expect(data).toHaveProperty('limit', 20);
    expect(data).toHaveProperty('total', 42);
  });
});
