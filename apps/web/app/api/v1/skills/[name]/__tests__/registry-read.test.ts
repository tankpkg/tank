import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock Drizzle db with chainable query builder
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

// Create a thenable that resolves to empty array for scan results queries
const createThenable = () => ({
  then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    return Promise.resolve([]).then(onFulfilled, onRejected);
  },
});

const mockLimit = vi.fn(() => createThenable());
// mockWhere returns a chainable that supports .limit() and .orderBy()
// beforeEach overrides this with mockReturnValue for each test suite
const mockWhere = vi.fn((): Record<string, unknown> => ({
  limit: mockLimit,
  orderBy: vi.fn(() => ({ limit: mockLimit })),
  then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    // When awaited directly (without .limit()), resolve with empty array
    return Promise.resolve([]).then(onFulfilled, onRejected);
  },
}));
const mockOrderBy = vi.fn((): unknown => ({ limit: mockLimit }));
const mockFrom = vi.fn((): Record<string, unknown> => ({ where: mockWhere, innerJoin: mockInnerJoin, orderBy: mockOrderBy }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockSet = vi.fn(() => ({ where: vi.fn() }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

// Support for innerJoin chain: select().from().innerJoin().where().orderBy().limit()
const mockInnerJoinWhere = vi.fn((): Record<string, unknown> => ({ orderBy: mockOrderBy, limit: mockLimit }));
const mockInnerJoin = vi.fn((): Record<string, unknown> => ({ where: mockInnerJoinWhere, orderBy: mockOrderBy, limit: mockLimit }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: {
    id: 'skills.id',
    name: 'skills.name',
    description: 'skills.description',
    publisherId: 'skills.publisher_id',
    orgId: 'skills.org_id',
    createdAt: 'skills.created_at',
    updatedAt: 'skills.updated_at',
  },
  skillVersions: {
    id: 'skill_versions.id',
    skillId: 'skill_versions.skill_id',
    version: 'skill_versions.version',
    integrity: 'skill_versions.integrity',
    tarballPath: 'skill_versions.tarball_path',
    tarballSize: 'skill_versions.tarball_size',
    fileCount: 'skill_versions.file_count',
    manifest: 'skill_versions.manifest',
    permissions: 'skill_versions.permissions',
    auditScore: 'skill_versions.audit_score',
    auditStatus: 'skill_versions.audit_status',
    publishedBy: 'skill_versions.published_by',
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

vi.mock('@/lib/db/auth-schema', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    githubUsername: 'user.github_username',
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
    { raw: vi.fn((str: string) => ({ str, type: 'sql_raw' })) },
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

function makeGetRequest(url: string) {
  return new Request(url, { method: 'GET' });
}

const mockSkill = {
  id: 'skill-1',
  name: 'my-skill',
  description: 'A test skill',
  publisherId: 'user-1',
  orgId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
};

const mockScopedSkill = {
  id: 'skill-2',
  name: '@myorg/my-skill',
  description: 'A scoped skill',
  publisherId: 'user-1',
  orgId: 'org-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
};

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  githubUsername: 'testuser',
};

const mockVersion = {
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

const mockVersion2 = {
  id: 'version-2',
  skillId: 'skill-1',
  version: '2.0.0',
  integrity: 'sha512-def456',
  tarballPath: 'skills/skill-1/2.0.0.tgz',
  tarballSize: 3072,
  fileCount: 8,
  manifest: { name: 'my-skill', version: '2.0.0' },
  permissions: {},
  auditScore: 9.0,
  auditStatus: 'published',
  publishedBy: 'pub-1',
  createdAt: new Date('2026-02-01T00:00:00Z'),
};

// ─── GET /api/v1/skills/[name] ──────────────────────────────────────────────

describe('GET /api/v1/skills/[name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chain: from() returns { where, innerJoin }
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin, orderBy: mockOrderBy });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockInnerJoinWhere, orderBy: mockOrderBy, limit: mockLimit });
    mockInnerJoinWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
  });

  it('returns skill metadata with latest version for a valid skill', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([{ ...mockSkill, publisherName: mockUser.name }]);
    // Latest version lookup
    mockLimit.mockResolvedValueOnce([mockVersion2]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.description).toBe('A test skill');
    expect(data.latestVersion).toBe('2.0.0');
    expect(data.publisher).toBeDefined();
    expect(data.publisher.name).toBe('Test User');
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('returns 404 for non-existent skill', async () => {
    // Skill lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ name: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('handles scoped package names (URL-encoded)', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([{ ...mockScopedSkill, publisherName: mockUser.name }]);
    // Latest version lookup
    mockLimit.mockResolvedValueOnce([mockVersion]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    // URL-encoded @myorg/my-skill → %40myorg%2Fmy-skill
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/%40myorg%2Fmy-skill');
    const response = await GET(request, { params: Promise.resolve({ name: '%40myorg%2Fmy-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('@myorg/my-skill');
  });

  it('includes latest version info even when skill has no versions', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([{ ...mockSkill, publisherName: mockUser.name }]);
    // Latest version lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.latestVersion).toBeNull();
  });
});

// ─── GET /api/v1/skills/[name]/[version] ────────────────────────────────────

describe('GET /api/v1/skills/[name]/[version]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin, orderBy: mockOrderBy });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockInnerJoinWhere, orderBy: mockOrderBy, limit: mockLimit });
    mockInnerJoinWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
  });

  it('returns version details with download URL for valid version', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Version lookup
    mockLimit.mockResolvedValueOnce([mockVersion]);
    // Signed download URL
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/1.0.0');
    const response = await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.version).toBe('1.0.0');
    expect(data.integrity).toBe('sha512-abc123');
    expect(data.permissions).toEqual({ network: { outbound: ['*.example.com'] } });
    expect(data.auditScore).toBe(8.5);
    expect(data.auditStatus).toBe('published');
    expect(data.downloadUrl).toBe('https://storage.example.com/download?token=xyz');
    expect(data.publishedAt).toBeDefined();
  });

  it('returns 404 when skill does not exist', async () => {
    // Skill lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/nonexistent/1.0.0');
    const response = await GET(request, {
      params: Promise.resolve({ name: 'nonexistent', version: '1.0.0' }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('returns 404 when version does not exist', async () => {
    // Skill lookup returns skill
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Version lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/9.9.9');
    const response = await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '9.9.9' }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('generates signed download URL with 1 hour expiry', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Version lookup
    mockLimit.mockResolvedValueOnce([mockVersion]);
    // Signed download URL
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/1.0.0');
    await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
    });

    // Verify createSignedUrl was called with correct path and 1 hour (3600 seconds)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(mockVersion.tarballPath, 3600);
  });

  it('handles scoped package names for version lookup', async () => {
    const scopedVersion = {
      ...mockVersion,
      skillId: 'skill-2',
      tarballPath: 'skills/skill-2/1.0.0.tgz',
    };
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockScopedSkill]);
    // Version lookup
    mockLimit.mockResolvedValueOnce([scopedVersion]);
    // Signed download URL
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/%40myorg%2Fmy-skill/1.0.0');
    const response = await GET(request, {
      params: Promise.resolve({ name: '%40myorg%2Fmy-skill', version: '1.0.0' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('@myorg/my-skill');
  });

  it('returns 500 when signed URL generation fails', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Version lookup
    mockLimit.mockResolvedValueOnce([mockVersion]);
    // Signed URL fails
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Storage error' },
    });

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/1.0.0');
    const response = await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('download URL');
  });
});

// ─── GET /api/v1/skills/[name]/versions ─────────────────────────────────────

describe('GET /api/v1/skills/[name]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin, orderBy: mockOrderBy });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockInnerJoinWhere, orderBy: mockOrderBy, limit: mockLimit });
    mockInnerJoinWhere.mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
  });

  it('returns all versions for a valid skill', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Versions lookup — orderBy returns the array directly (no limit)
    mockOrderBy.mockResolvedValueOnce([mockVersion2, mockVersion]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.versions).toHaveLength(2);
    expect(data.versions[0].version).toBe('2.0.0');
    expect(data.versions[1].version).toBe('1.0.0');
    // Each version should have these fields
    expect(data.versions[0].integrity).toBeDefined();
    expect(data.versions[0].auditScore).toBeDefined();
    expect(data.versions[0].auditStatus).toBeDefined();
    expect(data.versions[0].publishedAt).toBeDefined();
  });

  it('returns 404 when skill does not exist', async () => {
    // Skill lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/nonexistent/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('returns empty versions array when skill has no versions', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Versions lookup returns empty
    mockOrderBy.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.versions).toHaveLength(0);
  });

  it('handles scoped package names for versions list', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockScopedSkill]);
    // Versions lookup
    mockOrderBy.mockResolvedValueOnce([mockVersion]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/%40myorg%2Fmy-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: '%40myorg%2Fmy-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('@myorg/my-skill');
    expect(data.versions).toHaveLength(1);
  });

  it('versions are ordered by createdAt descending (newest first)', async () => {
    // Skill lookup
    mockLimit.mockResolvedValueOnce([mockSkill]);
    // Versions lookup — already ordered by createdAt desc
    mockOrderBy.mockResolvedValueOnce([mockVersion2, mockVersion]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    // v2.0.0 (Feb 2026) should come before v1.0.0 (Jan 2026)
    expect(data.versions[0].version).toBe('2.0.0');
    expect(data.versions[1].version).toBe('1.0.0');
  });
});
