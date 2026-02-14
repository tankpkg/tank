import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Track all db query results in order. Each select chain consumes the next result.
const mockSelectResults: unknown[] = [];
let selectCallIndex = 0;

function nextResult() {
  const result = mockSelectResults[selectCallIndex] ?? [];
  selectCallIndex++;
  if (result === '__THROW__') {
    throw new Error('DB connection failed');
  }
  return result;
}

// Create a thenable chain object: can be awaited directly OR chained with .limit()
function createThenableChain() {
  let resolved = false;
  let resultValue: unknown;

  const getResult = () => {
    if (!resolved) {
      resultValue = nextResult();
      resolved = true;
    }
    return resultValue;
  };

  const chain: Record<string, unknown> = {
    limit: vi.fn(() => getResult()),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const result = getResult();
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return chain;
}

const mockSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => createThenableChain()),
  })),
}));

// Track insert calls
const mockInsertValues = vi.fn(() => Promise.resolve());
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
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
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
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

const mockSkill = {
  id: 'skill-1',
  name: 'my-skill',
  description: 'A test skill',
  publisherId: 'pub-1',
  orgId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
};

const mockVersionData = {
  id: 'version-1',
  skillId: 'skill-1',
  version: '1.0.0',
  integrity: 'sha512-abc123',
  tarballPath: 'skills/skill-1/1.0.0.tgz',
  tarballSize: 2048,
  fileCount: 5,
  manifest: { name: 'my-skill', version: '1.0.0' },
  permissions: { network: { outbound: ['*.example.com'] } },
  auditScore: 8.5,
  auditStatus: 'published',
  publishedBy: 'pub-1',
  createdAt: new Date('2026-01-10T00:00:00Z'),
};

/**
 * Sets up mock results for a successful version fetch.
 * Select call order:
 *   1. Skill lookup → [mockSkill]
 *   2. Version lookup → [mockVersionData]
 *   3. Dedup check (inside recordDownload) → existingDownloads
 *   4. Download count → [{ count: downloadCount }]
 */
function setupSuccessfulFetch(options?: {
  existingDownloads?: unknown[];
  downloadCount?: number;
}) {
  const { existingDownloads = [], downloadCount = 0 } = options ?? {};

  // Call 1: skill lookup
  mockSelectResults.push([mockSkill]);
  // Call 2: version lookup
  mockSelectResults.push([mockVersionData]);
  // Call 3: dedup check (existing downloads within hour)
  mockSelectResults.push(existingDownloads);
  // Call 4: download count
  mockSelectResults.push([{ count: downloadCount }]);

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
    mockSelectResults.length = 0;
    selectCallIndex = 0;
  });

  it('records download on successful version fetch', async () => {
    setupSuccessfulFetch();

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);

    // Wait for fire-and-forget promise to settle
    await vi.waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // Verify insert was called with skillDownloads table
    const insertCallArg = mockInsert.mock.calls[0][0];
    expect(insertCallArg).toBeDefined();

    // Verify values passed to insert
    const valuesCallArg = mockInsertValues.mock.calls[0][0];
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

    const valuesCallArg = mockInsertValues.mock.calls[0][0];
    // IP hash should be a 64-char hex string (SHA-256)
    expect(valuesCallArg.ipHash).toMatch(/^[a-f0-9]{64}$/);
    // Should NOT contain the raw IP
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

    // Should use the first IP from x-forwarded-for
    const valuesCallArg = mockInsertValues.mock.calls[0][0];
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update('10.0.0.1').digest('hex');
    expect(valuesCallArg.ipHash).toBe(expectedHash);
  });

  it("falls back to 'unknown' when no IP header", async () => {
    setupSuccessfulFetch();

    await callVersionEndpoint(); // No headers

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0][0];
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update('unknown').digest('hex');
    expect(valuesCallArg.ipHash).toBe(expectedHash);
  });

  it('deduplicates within 1 hour (same IP + same skill)', async () => {
    // Setup with existing download within the hour
    setupSuccessfulFetch({
      existingDownloads: [{ id: 'existing-download-1' }],
    });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    expect(response.status).toBe(200);

    // Give fire-and-forget time to settle
    await new Promise((r) => setTimeout(r, 50));

    // Insert should NOT have been called because dedup found existing
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('allows download after 1 hour window (no existing)', async () => {
    // Setup with no existing downloads (hour window passed)
    setupSuccessfulFetch({ existingDownloads: [] });

    await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    await vi.waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // Insert should have been called since no dedup match
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
    // Setup: skill and version found, signed URL works
    // Call 1: skill lookup
    mockSelectResults.push([mockSkill]);
    // Call 2: version lookup
    mockSelectResults.push([mockVersionData]);
    // Call 3: dedup check throws error — use a special marker
    mockSelectResults.push('__THROW__');
    // Call 4: download count — still works
    mockSelectResults.push([{ count: 0 }]);

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
    });

    // Response should still be 200 — download counting is fire-and-forget
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

    const valuesCallArg = mockInsertValues.mock.calls[0][0];
    expect(valuesCallArg.userAgent).toBe('tank-cli/1.0.0');
  });

  it('handles null user-agent gracefully', async () => {
    setupSuccessfulFetch();

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1',
      // No user-agent header
    });

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockInsertValues).toHaveBeenCalled();
    });

    const valuesCallArg = mockInsertValues.mock.calls[0][0];
    expect(valuesCallArg.userAgent).toBeNull();
  });
});
