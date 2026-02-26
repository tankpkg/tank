import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
  db: { execute: mockExecute },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: { name: 'skills.name' },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      type: 'sql',
    })),
    { raw: vi.fn((str: string) => ({ str, type: 'sql_raw' })) },
  ),
}));

async function callGET(nameParts: string[]) {
  const { GET } = await import('@/app/api/v1/badge/[...name]/route');
  const request = new Request('http://localhost:3000/api/v1/badge/test', { method: 'GET' });
  return GET(request, { params: Promise.resolve({ name: nameParts }) });
}

describe('GET /api/v1/badge/[...name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SVG with correct content-type', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 9 }]);

    const response = await callGET(['my-skill']);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    const body = await response.text();
    expect(body).toContain('<svg');
    expect(body).toContain('tank');
  });

  it('returns green badge for score 8-10', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 9 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#4c1');
    expect(body).toContain('9/10');
  });

  it('returns green badge for score exactly 8', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 8 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#4c1');
    expect(body).toContain('8/10');
  });

  it('returns yellow badge for score 5-7', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 6 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#dfb317');
    expect(body).toContain('6/10');
  });

  it('returns yellow badge for score exactly 5', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 5 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#dfb317');
    expect(body).toContain('5/10');
  });

  it('returns red badge for score 1-4', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 3 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#e05d44');
    expect(body).toContain('3/10');
  });

  it('returns "unscored" gray badge when audit_score is null', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: null }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('#9f9f9f');
    expect(body).toContain('unscored');
  });

  it('returns 404 "not found" badge for nonexistent skill', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const response = await callGET(['nonexistent']);
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain('<svg');
    expect(body).toContain('not found');
    expect(body).toContain('#9f9f9f');
  });

  it('decodes URL-encoded scoped skill names', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 10 }]);

    await callGET(['%40myorg', 'my-skill']);

    const sqlCall = mockExecute.mock.calls[0][0];
    expect(sqlCall.values).toContain('@myorg/my-skill');
  });

  it('handles scoped names passed as already-decoded segments', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 7 }]);

    await callGET(['@myorg', 'my-skill']);

    const sqlCall = mockExecute.mock.calls[0][0];
    expect(sqlCall.values).toContain('@myorg/my-skill');
  });

  it('badge contains label section with dark gray background', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 10 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#555');
    expect(body).toContain('tank');
  });

  it('returns score with decimal preserved', async () => {
    mockExecute.mockResolvedValueOnce([{ auditScore: 8.5 }]);

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('8.5/10');
    expect(body).toContain('#4c1');
  });
});
