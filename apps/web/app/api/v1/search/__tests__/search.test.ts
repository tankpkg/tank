import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchSkills = vi.fn();
const mockResolveRequestUserId = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/data/skills', () => ({
  searchSkills: (...args: unknown[]) => mockSearchSkills(...args),
}));

vi.mock('@/lib/auth-helpers', () => ({
  resolveRequestUserId: (...args: unknown[]) => mockResolveRequestUserId(...args),
}));

function makeGetRequest(url: string) {
  return new Request(url, { method: 'GET' });
}

function makeSearchResponse(
  items: Array<{
    name: string;
    description: string | null;
    latestVersion: string | null;
    auditScore: number | null;
    publisher: string;
    visibility?: string;
    downloads?: number;
    stars?: number;
  }>,
  overrides?: { page?: number; limit?: number; total?: number },
) {
  return {
    results: items.map((item) => ({
      name: item.name,
      description: item.description,
      visibility: item.visibility ?? 'public',
      latestVersion: item.latestVersion,
      auditScore: item.auditScore,
      publisher: item.publisher,
      downloads: item.downloads ?? 0,
      stars: item.stars ?? 0,
    })),
    page: overrides?.page ?? 1,
    limit: overrides?.limit ?? 20,
    total: overrides?.total ?? items.length,
  };
}

const searchItems = [
  {
    name: '@community/seo-audit',
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
    name: '@org/latest-skill',
    description: 'Most recently updated',
    latestVersion: '3.0.0',
    auditScore: 7.0,
    publisher: 'Recent Publisher',
  },
  {
    name: '@org/another-skill',
    description: 'Another skill',
    latestVersion: '1.0.0',
    auditScore: 6.5,
    publisher: 'Another Publisher',
  },
];

describe('GET /api/v1/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRequestUserId.mockResolvedValue(null);
  });

  it('returns matching skills when searching by name', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse(searchItems, { total: 2 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=seo'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe('@community/seo-audit');
    expect(data.total).toBe(2);
  });

  it('passes query, page, limit, and userId to searchSkills', async () => {
    mockResolveRequestUserId.mockResolvedValueOnce('user-abc');
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=react&page=3&limit=10'));

    expect(mockSearchSkills).toHaveBeenCalledWith('react', 3, 10, 'user-abc');
  });

  it('returns most recently published skills when query is empty', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse(recentItems, { total: 2 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].name).toBe('@org/latest-skill');
    expect(mockSearchSkills).toHaveBeenCalledWith('', 1, 20, null);
  });

  it('results include name, description, latestVersion, auditScore, publisher, downloads', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([searchItems[0]], { total: 1 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=seo'));

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
    mockSearchSkills.mockResolvedValueOnce(
      makeSearchResponse([searchItems[1]], { page: 2, limit: 1, total: 2 }),
    );

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=seo&page=2&limit=1'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.page).toBe(2);
    expect(data.limit).toBe(1);
    expect(data.total).toBe(2);
  });

  it('default limit is 20', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { limit: 20, total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=test'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.limit).toBe(20);
    expect(mockSearchSkills).toHaveBeenCalledWith('test', 1, 20, null);
  });

  it('limit is capped at 50', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { limit: 50, total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=test&limit=100'));

    expect(mockSearchSkills).toHaveBeenCalledWith('test', 1, 50, null);
  });

  it('no results returns empty array with total=0', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=nonexistent-xyz'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('invalid page/limit defaults gracefully', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { page: 1, limit: 20, total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=test&page=-5&limit=abc'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(mockSearchSkills).toHaveBeenCalledWith('test', 1, 20, null);
  });

  it('returns correct response shape with page and limit fields', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse(searchItems, { total: 42 }));

    const { GET } = await import('@/app/api/v1/search/route');
    const response = await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=seo&page=1&limit=20'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('page', 1);
    expect(data).toHaveProperty('limit', 20);
    expect(data).toHaveProperty('total', 42);
  });

  it('applies public visibility filter for unauthenticated requests', async () => {
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=test'));

    expect(mockResolveRequestUserId).toHaveBeenCalledTimes(1);
    expect(mockSearchSkills).toHaveBeenCalledWith('test', 1, 20, null);
  });

  it('passes authenticated userId to searchSkills', async () => {
    mockResolveRequestUserId.mockResolvedValueOnce('user-123');
    mockSearchSkills.mockResolvedValueOnce(makeSearchResponse([], { total: 0 }));

    const { GET } = await import('@/app/api/v1/search/route');
    await GET(makeGetRequest('http://localhost:3000/api/v1/search?q=test'));

    expect(mockResolveRequestUserId).toHaveBeenCalledTimes(1);
    expect(mockSearchSkills).toHaveBeenCalledWith('test', 1, 20, 'user-123');
  });
});
