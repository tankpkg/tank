import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
  db: { execute: mockExecute }
}));

vi.mock('@/lib/db/schema', () => ({
  skills: { name: 'skills.name' }
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      type: 'sql'
    })),
    { raw: vi.fn((str: string) => ({ str, type: 'sql_raw' })) }
  )
}));

async function callGET(nameParts: string[]) {
  const { GET } = await import('@/app/api/v1/badge/[...name]/route');
  const request = new Request('http://localhost:3000/api/v1/badge/test', { method: 'GET' });
  return GET(request, { params: Promise.resolve({ name: nameParts }) });
}

/**
 * Helper to create mock result row with trust badge fields
 */
function mockSkillResult(
  overrides: Partial<{
    auditScore: number | null;
    verdict: string | null;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  }> = {}
) {
  return [
    {
      auditScore: overrides.auditScore ?? null,
      verdict: overrides.verdict ?? null,
      criticalCount: overrides.criticalCount ?? 0,
      highCount: overrides.highCount ?? 0,
      mediumCount: overrides.mediumCount ?? 0,
      lowCount: overrides.lowCount ?? 0
    }
  ];
}

describe('GET /api/v1/badge/[...name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SVG with correct content-type', async () => {
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: 'pass' }));

    const response = await callGET(['my-skill']);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    const body = await response.text();
    expect(body).toContain('<svg');
    expect(body).toContain('tank');
  });

  it('returns verified badge for pass verdict with 0 findings', async () => {
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: 'pass', auditScore: 9 }));

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#4c1'); // green
    expect(body).toContain('verified');
    // Score preserved in title for backward compatibility
    expect(body).toContain('9/10');
  });

  it('returns review_recommended badge for pass with findings', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'pass',
        mediumCount: 2,
        lowCount: 1,
        auditScore: 7
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#dfb317'); // yellow
    expect(body).toContain('3 notes');
    expect(body).toContain('7/10'); // score in title
  });

  it('returns review_recommended badge for pass_with_notes verdict', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'pass_with_notes',
        lowCount: 1
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#dfb317'); // yellow
    expect(body).toContain('1 notes');
  });

  it('returns concerns badge for flagged verdict', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'flagged',
        highCount: 1
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#e05d44'); // orange/red
    expect(body).toContain('concerns');
  });

  it('returns unsafe badge for fail verdict', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'fail',
        criticalCount: 1
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#e05d44'); // red
    expect(body).toContain('unsafe');
  });

  it('returns pending badge when verdict is null', async () => {
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: null }));

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('#9f9f9f'); // gray
    expect(body).toContain('pending');
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
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: 'pass' }));

    await callGET(['%40myorg', 'my-skill']);

    const sqlCall = mockExecute.mock.calls[0][0];
    expect(sqlCall.values).toContain('@myorg/my-skill');
  });

  it('handles scoped names passed as already-decoded segments', async () => {
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: 'pass' }));

    await callGET(['@myorg', 'my-skill']);

    const sqlCall = mockExecute.mock.calls[0][0];
    expect(sqlCall.values).toContain('@myorg/my-skill');
  });

  it('badge contains label section with dark gray background', async () => {
    mockExecute.mockResolvedValueOnce(mockSkillResult({ verdict: 'pass' }));

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#555');
    expect(body).toContain('tank');
  });

  it('includes score in title when available', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'pass',
        auditScore: 8.5
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('<title>Security score: 8.5/10</title>');
    expect(body).toContain('verified');
  });

  it('handles review_recommended with no findings count', async () => {
    mockExecute.mockResolvedValueOnce(
      mockSkillResult({
        verdict: 'pass_with_notes',
        auditScore: 6
      })
    );

    const response = await callGET(['my-skill']);
    const body = await response.text();

    expect(body).toContain('#dfb317');
    expect(body).toContain('review');
  });
});
