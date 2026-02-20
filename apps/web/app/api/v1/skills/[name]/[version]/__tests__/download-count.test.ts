import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

const mockDedupLimit = vi.fn();
const mockDedupWhere = vi.fn((): Record<string, unknown> => ({ limit: mockDedupLimit }));
const mockDedupFrom = vi.fn((): Record<string, unknown> => ({ where: mockDedupWhere }));
const mockSelect = vi.fn(() => ({ from: mockDedupFrom }));

const mockInsertValues = vi.fn((_values?: unknown) => Promise.resolve());
const mockInsert = vi.fn((_table?: unknown) => ({ values: mockInsertValues }));

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockExecute,
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: {
    id: 'skills.id',
    name: 'skills.name',
    description: 'skills.description',
    publisherId: 'skills.publisher_id',
  },
  skillVersions: {
    id: 'skill_versions.id',
    skillId: 'skill_versions.skill_id',
    version: 'skill_versions.version',
    integrity: 'skill_versions.integrity',
    tarballPath: 'skill_versions.tarball_path',
    permissions: 'skill_versions.permissions',
    auditScore: 'skill_versions.audit_score',
    auditStatus: 'skill_versions.audit_status',
    createdAt: 'skill_versions.created_at',
  },
  skillDownloads: {
    id: 'skill_downloads.id',
    skillId: 'skill_downloads.skill_id',
    versionId: 'skill_downloads.version_id',
    ipHash: 'skill_downloads.ip_hash',
    userAgent: 'skill_downloads.user_agent',
    createdAt: 'skill_downloads.created_at',
  },
  scanResults: {
    id: 'scan_results.id',
    versionId: 'scan_results.version_id',
    verdict: 'scan_results.verdict',
    createdAt: 'scan_results.created_at',
  },
  scanFindings: {
    id: 'scan_findings.id',
    scanId: 'scan_findings.scan_id',
    stage: 'scan_findings.stage',
    severity: 'scan_findings.severity',
    type: 'scan_findings.type',
    description: 'scan_findings.description',
    location: 'scan_findings.location',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
  desc: vi.fn((col) => ({ col, type: 'desc' })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      type: 'sql',
    })),
    {
      raw: vi.fn((str: string) => ({ str, type: 'sql_raw' })),
    },
  ),
}));

const mockCreateSignedUrl = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, {
    method: 'GET',
    headers: headers ?? {},
  });
}

const skillVersionRow = {
  skillId: 'skill-1',
  name: 'my-skill',
  description: 'A test skill',
  versionId: 'version-1',
  version: '1.0.0',
  integrity: 'sha512-abc123',
  permissions: { network: { outbound: ['*.example.com'] } },
  auditScore: 8.5,
  auditStatus: 'published',
  tarballPath: 'skills/skill-1/1.0.0.tgz',
  publishedAt: '2026-01-10T00:00:00Z',
};

const defaultMetaRow = {
  downloadCount: 0,
  scanVerdict: null,
  findingStage: null,
  findingSeverity: null,
  findingType: null,
  findingDescription: null,
  findingLocation: null,
};

/**
 * Query order for a successful version fetch:
 *   1. db.execute → skill+version row
 *   2. supabaseAdmin.createSignedUrl → signed URL
 *   3. recordDownload (fire-and-forget): db.select chain → dedup check via mockDedupLimit
 *   4. db.execute → count+scan+findings meta row
 */
function setupSuccessfulFetch(options?: {
  existingDownloads?: unknown[];
  downloadCount?: number;
}) {
  const { existingDownloads = [], downloadCount = 0 } = options ?? {};

  // Execute call 1: skill+version
  mockExecute.mockResolvedValueOnce([skillVersionRow]);
  // Execute call 2: count+scan+findings meta
  mockExecute.mockResolvedValueOnce([{ ...defaultMetaRow, downloadCount }]);

  // Dedup check inside recordDownload (db.select chain)
  mockDedupLimit.mockResolvedValueOnce(existingDownloads);

  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
    error: null,
  });
}

async function callVersionEndpoint(headers?: Record<string, string>) {
  const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
  const request = makeGetRequest(
    'http://localhost:3000/api/v1/skills/my-skill/1.0.0',
    headers,
  );
  return GET(request, {
    params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Download counting - GET /api/v1/skills/[name]/[version]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records download on successful version fetch', async () => {
    setupSuccessfulFetch();

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    const insertCallArg = mockInsert.mock.calls[0]![0];
    expect(insertCallArg).toBeDefined();

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesCallArg).toMatchObject({
      skillId: 'skill-1',
      versionId: 'version-1',
    });
  });

  it('hashes IP address (not stored raw)', async () => {
    setupSuccessfulFetch();

    await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesCallArg.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(valuesCallArg.ipHash).not.toBe('192.168.1.1');
  });

  it('uses x-forwarded-for header for IP', async () => {
    setupSuccessfulFetch();

    await callVersionEndpoint({
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
    });

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update('10.0.0.1').digest('hex');
    expect(valuesCallArg.ipHash).toBe(expectedHash);
  });

  it("falls back to 'unknown' when no IP header", async () => {
    setupSuccessfulFetch();

    await callVersionEndpoint();

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update('unknown').digest('hex');
    expect(valuesCallArg.ipHash).toBe(expectedHash);
  });

  it('deduplicates within 1 hour (same IP + same skill)', async () => {
    setupSuccessfulFetch({
      existingDownloads: [{ id: 'existing-download-1' }],
    });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('allows download after 1 hour window (no existing)', async () => {
    setupSuccessfulFetch({ existingDownloads: [] });

    await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    await vi.waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
  });

  it('includes download count in response', async () => {
    setupSuccessfulFetch({ downloadCount: 42 });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.downloads).toBe(42);
  });

  it("download counting errors don't break the response", async () => {
    // Execute call 1: skill+version
    mockExecute.mockResolvedValueOnce([skillVersionRow]);
    // Execute call 2: count+scan+findings meta
    mockExecute.mockResolvedValueOnce([defaultMetaRow]);

    // Dedup check throws
    mockDedupLimit.mockRejectedValueOnce(new Error('DB connection failed'));

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.downloadUrl).toBe('https://storage.example.com/download?token=xyz');
  });

  it('includes user-agent in download record', async () => {
    setupSuccessfulFetch();

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = new Request(
      'http://localhost:3000/api/v1/skills/my-skill/1.0.0',
      {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'tank-cli/1.0.0',
        },
      },
    );
    const response = await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
    });

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesCallArg.userAgent).toBe('tank-cli/1.0.0');
  });

  it('handles null user-agent gracefully', async () => {
    setupSuccessfulFetch();

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesCallArg.userAgent).toBeNull();
  });
});
