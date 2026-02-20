import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

const mockLimit = vi.fn();
const mockWhere = vi.fn((): Record<string, unknown> => ({ limit: mockLimit }));
const mockFrom = vi.fn((): Record<string, unknown> => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockInsertValues = vi.fn(() => Promise.resolve());
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

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
    orgId: 'skills.org_id',
    createdAt: 'skills.created_at',
    updatedAt: 'skills.updated_at',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    githubUsername: 'user.github_username',
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

// ─── GET /api/v1/skills/[name] ──────────────────────────────────────────────

describe('GET /api/v1/skills/[name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns skill metadata with latest version for a valid skill', async () => {
    mockExecute.mockResolvedValueOnce([{
      name: 'my-skill',
      description: 'A test skill',
      latestVersion: '2.0.0',
      publisherName: 'Test User',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    }]);

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
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ name: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('handles scoped package names (URL-encoded)', async () => {
    mockExecute.mockResolvedValueOnce([{
      name: '@myorg/my-skill',
      description: 'A scoped skill',
      latestVersion: '1.0.0',
      publisherName: 'Test User',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    }]);

    const { GET } = await import('@/app/api/v1/skills/[name]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/%40myorg%2Fmy-skill');
    const response = await GET(request, { params: Promise.resolve({ name: '%40myorg%2Fmy-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('@myorg/my-skill');
  });

  it('includes latest version info even when skill has no versions', async () => {
    mockExecute.mockResolvedValueOnce([{
      name: 'my-skill',
      description: 'A test skill',
      latestVersion: null,
      publisherName: 'Test User',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    }]);

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
  });

  function setupSkillVersionExecute(row: Record<string, unknown> | null) {
    if (row) {
      mockExecute.mockResolvedValueOnce([row]);
    } else {
      mockExecute.mockResolvedValueOnce([]);
    }
  }

  function setupMetaExecute(downloadCount: number) {
    mockExecute.mockResolvedValueOnce([{
      downloadCount,
      scanVerdict: null,
      findingStage: null,
      findingSeverity: null,
      findingType: null,
      findingDescription: null,
      findingLocation: null,
    }]);
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

  const scopedSkillVersionRow = {
    ...skillVersionRow,
    skillId: 'skill-2',
    name: '@myorg/my-skill',
    tarballPath: 'skills/skill-2/1.0.0.tgz',
  };

  it('returns version details with download URL for valid version', async () => {
    setupSkillVersionExecute(skillVersionRow);
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });
    // recordDownload dedup check
    mockLimit.mockResolvedValueOnce([]);
    setupMetaExecute(0);

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
    // skill+version execute returns empty
    setupSkillVersionExecute(null);
    // Fallback skill check also returns empty
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
    // skill+version execute returns empty
    setupSkillVersionExecute(null);
    // Fallback skill check finds the skill
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1' }]);

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
    setupSkillVersionExecute(skillVersionRow);
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });
    mockLimit.mockResolvedValueOnce([]);
    setupMetaExecute(0);

    const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/1.0.0');
    await GET(request, {
      params: Promise.resolve({ name: 'my-skill', version: '1.0.0' }),
    });

    expect(mockCreateSignedUrl).toHaveBeenCalledWith(skillVersionRow.tarballPath, 3600);
  });

  it('handles scoped package names for version lookup', async () => {
    setupSkillVersionExecute(scopedSkillVersionRow);
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });
    mockLimit.mockResolvedValueOnce([]);
    setupMetaExecute(0);

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
    setupSkillVersionExecute(skillVersionRow);
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
  });

  const version1Row = {
    name: 'my-skill',
    version: '1.0.0',
    integrity: 'sha512-abc123',
    auditScore: 8.5,
    auditStatus: 'published',
    publishedAt: '2026-01-10T00:00:00Z',
  };

  const version2Row = {
    name: 'my-skill',
    version: '2.0.0',
    integrity: 'sha512-def456',
    auditScore: 9.0,
    auditStatus: 'published',
    publishedAt: '2026-02-01T00:00:00Z',
  };

  it('returns all versions for a valid skill', async () => {
    mockExecute.mockResolvedValueOnce([version2Row, version1Row]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.versions).toHaveLength(2);
    expect(data.versions[0].version).toBe('2.0.0');
    expect(data.versions[1].version).toBe('1.0.0');
    expect(data.versions[0].integrity).toBeDefined();
    expect(data.versions[0].auditScore).toBeDefined();
    expect(data.versions[0].auditStatus).toBeDefined();
    expect(data.versions[0].publishedAt).toBeDefined();
  });

  it('returns 404 when skill does not exist', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/nonexistent/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('returns empty versions array when skill has no versions', async () => {
    // Skill exists but LEFT JOIN produces a row with null version fields
    mockExecute.mockResolvedValueOnce([{
      name: 'my-skill',
      version: null,
      integrity: null,
      auditScore: null,
      auditStatus: null,
      publishedAt: null,
    }]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.versions).toHaveLength(0);
  });

  it('handles scoped package names for versions list', async () => {
    mockExecute.mockResolvedValueOnce([{
      ...version1Row,
      name: '@myorg/my-skill',
    }]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/%40myorg%2Fmy-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: '%40myorg%2Fmy-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('@myorg/my-skill');
    expect(data.versions).toHaveLength(1);
  });

  it('versions are ordered by createdAt descending (newest first)', async () => {
    mockExecute.mockResolvedValueOnce([version2Row, version1Row]);

    const { GET } = await import('@/app/api/v1/skills/[name]/versions/route');
    const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/versions');
    const response = await GET(request, { params: Promise.resolve({ name: 'my-skill' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.versions[0].version).toBe('2.0.0');
    expect(data.versions[1].version).toBe('1.0.0');
  });
});
