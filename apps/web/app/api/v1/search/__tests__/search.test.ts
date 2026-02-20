import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockExecute,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: {
    name: 'skills.name',
    description: 'skills.description',
    updatedAt: 'skills.updated_at',
  },
  skillVersions: {},
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn((col) => ({ col, type: 'desc' })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
      type: 'sql',
    }),
    { raw: (s: string) => ({ raw: s, type: 'sql_raw' }) },
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url, { method: 'GET' });
}

/**
 * Build mock rows as returned by the consolidated window-function query.
 * Each row includes a `total` field (count(*) OVER()).
 */
function makeRows(
  items: Array<{
    name: string;
    description: string;
    latestVersion: string | null;
    auditScore: number | null;
    publisher: string;
  }>,
  total?: number,
) {
  const t = total ?? items.length;
  return items.map((item) => ({
    name: item.name,
    description: item.description,
    latestVersion: item.latestVersion,
    auditScore: item.auditScore,
    publisher: item.publisher,
    total: t,
  }));
}

const searchItems = [
  {
    name: 'seo-audit',
    description: 'SEO audit skill for websites',
    latestVersion: '1.2.0',
    auditScore: 8.5,
    publisher: 'Test Publisher',
  },
  {
    name: '@community/seo-checker',
    description: 'Check SEO scores',
    latestVersion: '2.0.0',
    auditScore: 9.0,
    publisher: 'Community Dev',
  },
];

const recentItems = [
  {
    name: 'latest-skill',
    description: 'Most recently updated',
    latestVersion: '3.0.0',
    auditScore: 7.0,
    publisher: 'Recent Publisher',
  },
  {
    name: 'another-skill',
    description: 'Another skill',
    latestVersion: '1.0.0',
    auditScore: 6.5,
    publisher: 'Another Publisher',
  },
];

// ─── GET /api/v1/search ─────────────────────────────────────────────────────

describe('GET /api/v1/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching skills when searching by name', async () => {
    mockExecute.mockResolvedValueOnce(makeRows(searchItems, 2));

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
    mockExecute.mockResolvedValueOnce(makeRows([searchItems[0]], 1));

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=audit');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].description).toContain('audit');
  });

  it('returns most recently published skills when query is empty', async () => {
    mockExecute.mockResolvedValueOnce(makeRows(recentItems, 2));

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe('latest-skill');
  });

  it('results include name, description, latestVersion, auditScore, publisher, downloads', async () => {
    mockExecute.mockResolvedValueOnce(makeRows([searchItems[0]], 1));

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
    mockExecute.mockResolvedValueOnce(makeRows([searchItems[1]], 2));

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
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(20);
  });

  it('limit is capped at 50', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test&limit=100');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(50);
  });

  it('no results returns empty array with total=0', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=nonexistent-xyz');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('invalid page/limit defaults gracefully', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/search/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/search?q=test&page=-5&limit=abc');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
  });

  it('returns correct response shape with page and limit fields', async () => {
    mockExecute.mockResolvedValueOnce(makeRows(searchItems, 42));

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
