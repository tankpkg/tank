import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockVerifyCliAuth = vi.fn();
vi.mock('@/lib/auth-helpers', () => ({
  verifyCliAuth: mockVerifyCliAuth,
}));

vi.mock('@/lib/db/auth-schema', () => ({
  organization: { id: 'organization.id', slug: 'organization.slug', name: 'organization.name' },
  member: { id: 'member.id', organizationId: 'member.organization_id', userId: 'member.user_id', role: 'member.role' },
  user: { id: 'user.id', name: 'user.name', image: 'user.image', githubUsername: 'user.github_username' },
  account: { userId: 'account.user_id', providerId: 'account.provider_id', accountId: 'account.account_id', accessToken: 'account.access_token' },
}));

// Mock Drizzle db with chainable query builder
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockLimit = vi.fn();
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ limit: mockLimit, orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  skills: { id: 'skills.id', name: 'skills.name', publisherId: 'skills.publisher_id', orgId: 'skills.org_id' },
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
    auditStatus: 'skill_versions.audit_status',
    publishedBy: 'skill_versions.published_by',
    createdAt: 'skill_versions.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
  desc: vi.fn((col) => ({ col, type: 'desc' })),
}));

const mockCreateSignedUploadUrl = vi.fn();
const mockCreateSignedUrl = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  },
}));

// Mock fetch for the Python scan endpoint
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockComputeAuditScore = vi.fn(() => ({ score: 8, details: [] }));
vi.mock('@/lib/audit-score', () => ({
  computeAuditScore: mockComputeAuditScore,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(url: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const validManifest = {
  name: '@testorg/my-skill',
  version: '1.0.0',
  description: 'A test skill',
};

const scopedManifest = {
  name: '@myorg/my-skill',
  version: '1.0.0',
  description: 'A scoped skill',
};

/** Set up org + member mocks for @testorg scoped packages */
function mockOrgMembership() {
  // Org lookup returns existing org
  mockLimit.mockResolvedValueOnce([{ id: 'org-test', slug: 'testorg', name: 'Test Org' }]);
  // Member lookup returns user as member
  mockLimit.mockResolvedValueOnce([{ id: 'mem-1', organizationId: 'org-test', userId: 'user-1', role: 'owner' }]);
}

// ─── POST /api/v1/skills (Step 1: Validate + Upload URL) ────────────────────

describe('POST /api/v1/skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth token is missing', async () => {
    mockVerifyCliAuth.mockResolvedValue(null);

    const { POST } = await import('../route');
    const request = makeRequest('http://localhost:3000/api/v1/skills', { manifest: validManifest });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('returns 401 when auth token is invalid', async () => {
    mockVerifyCliAuth.mockResolvedValue(null);

    const { POST } = await import('../route');
    const request = makeRequest('http://localhost:3000/api/v1/skills', { manifest: validManifest }, 'tank_invalid');
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid manifest (missing name)', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: { version: '1.0.0' } },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('returns 400 for invalid manifest (bad version)', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: { name: '@testorg/my-skill', version: 'not-semver' } },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid manifest (unknown fields)', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: { ...validManifest, unknownField: true } },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../route');
    const request = new Request('http://localhost:3000/api/v1/skills', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tank_valid',
      },
      body: 'not json',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('normalizes name to lowercase', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    // User lookup returns existing user with githubUsername
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    // Version conflict check returns empty
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: { name: '@TestOrg/My-Skill', version: '1.0.0' } },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skillId).toBe('skill-1');
  });

  it('returns 403 for scoped package when user is not org member', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    // Org lookup returns existing org
    mockLimit.mockResolvedValueOnce([{ id: 'org-1', slug: 'myorg', name: 'My Org' }]);
    // Member lookup returns empty (user is NOT a member)
    mockLimit.mockResolvedValueOnce([]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: scopedManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('org');
  });

  it('returns 403 when org does not exist', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    // Org lookup returns empty (org does not exist)
    mockLimit.mockResolvedValueOnce([]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: scopedManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('returns 409 for duplicate version', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    // Skill lookup returns existing skill
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    // Version conflict check returns existing version
    mockLimit.mockResolvedValueOnce([{ id: 'version-existing', version: '1.0.0' }]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: validManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('Version');
  });

  it('returns uploadUrl, skillId, versionId for valid publish', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup returns existing user with githubUsername
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    // Version conflict check returns empty
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: validManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.uploadUrl).toBe('https://storage.example.com/upload?token=abc');
    expect(data.skillId).toBe('skill-1');
    expect(data.versionId).toBe('version-1');
  });

  it('updates githubUsername if not set', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup returns user without githubUsername
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: null }]);
    // Account lookup (for GitHub username)
    mockLimit.mockResolvedValueOnce([{ accessToken: 'ghu_fake' }]);
    // Mock global fetch for GitHub API call
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: 'testuser' }),
    }) as unknown as typeof fetch;
    mockOrgMembership();
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    // Version conflict check returns empty
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    try {
      const { POST } = await import('../route');
      const request = makeRequest(
        'http://localhost:3000/api/v1/skills',
        { manifest: validManifest },
        'tank_valid',
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      // Verify user update was called to set githubUsername
      expect(mockUpdate).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('allows scoped package when user is org member', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    // Org lookup returns existing org
    mockLimit.mockResolvedValueOnce([{ id: 'org-1', slug: 'myorg', name: 'My Org' }]);
    // Member lookup returns user as member
    mockLimit.mockResolvedValueOnce([{ id: 'mem-1', organizationId: 'org-1', userId: 'user-1', role: 'owner' }]);
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@myorg/my-skill' }]);
    // Version conflict check returns empty
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: scopedManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skillId).toBe('skill-1');
  });

  it('reuses existing skill record', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // User lookup
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    // Skill lookup returns existing skill
    mockLimit.mockResolvedValueOnce([{ id: 'skill-existing', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    // Version conflict check returns empty (new version)
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: validManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skillId).toBe('skill-existing');
  });

  it('includes repositoryUrl in skill insert when manifest has repository', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          repository: 'https://github.com/tankpkg/skills',
        },
      },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryUrl: 'https://github.com/tankpkg/skills' }),
    );
  });

  it('updates repositoryUrl on existing skill re-publish', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-existing', name: '@testorg/my-skill', publisherId: 'user-1', orgId: null }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload' },
      error: null,
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          description: 'Updated description',
          repository: 'https://github.com/tankpkg/skills',
        },
      },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryUrl: 'https://github.com/tankpkg/skills',
        description: 'Updated description',
      }),
    );
  });

  it('allows first publish with any permissions (no previous version)', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          permissions: { network: { outbound: ['evil.com'] }, subprocess: true },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('rejects PATCH bump that adds new permissions', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([{ version: '1.0.0', permissions: {} }]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          version: '1.0.1',
          permissions: { filesystem: { read: ['./secrets/**'] } },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Permission escalation detected');
    expect(data.details[0]).toContain('PATCH');
  });

  it('rejects MINOR bump that adds dangerous permissions (network outbound)', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([{ version: '1.0.0', permissions: {} }]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          version: '1.1.0',
          permissions: { network: { outbound: ['evil.com'] } },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Permission escalation detected');
    expect(data.details[0]).toContain('MINOR');
    expect(data.details[0]).toContain('MAJOR');
  });

  it('rejects MINOR bump that enables subprocess', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([{ version: '1.0.0', permissions: { subprocess: false } }]);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          version: '1.1.0',
          permissions: { subprocess: true },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Permission escalation detected');
    expect(data.details[0]).toContain('Subprocess');
  });

  it('allows MINOR bump with non-dangerous permission additions', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([{ version: '1.0.0', permissions: {} }]);
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          ...validManifest,
          version: '1.1.0',
          permissions: { filesystem: { write: ['./output/**'] } },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('allows MAJOR bump with any permission changes', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{ name: 'Test User', githubUsername: 'testuser' }]);
    mockOrgMembership();
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill', publisherId: 'user-1' }]);
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([{ version: '1.0.0', permissions: {} }]);
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      {
        manifest: {
          name: '@testorg/my-skill',
          version: '2.0.0',
          permissions: { network: { outbound: ['evil.com'] }, subprocess: true },
        },
      },
      'tank_valid',
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});

// ─── POST /api/v1/skills/confirm (Step 3: Finalize Publish) ─────────────────

describe('POST /api/v1/skills/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when auth token is missing', async () => {
    mockVerifyCliAuth.mockResolvedValue(null);

    const { POST } = await import('../confirm/route');
    const request = makeRequest('http://localhost:3000/api/v1/skills/confirm', {
      versionId: 'version-1',
      integrity: 'sha512-abc',
      fileCount: 5,
      tarballSize: 1024,
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 400 for missing versionId', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { integrity: 'sha512-abc', fileCount: 5, tarballSize: 1024 },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 404 when version does not exist', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Version lookup returns empty
    mockLimit.mockResolvedValueOnce([]);

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { versionId: 'nonexistent', integrity: 'sha512-abc', fileCount: 5, tarballSize: 1024 },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('version');
  });

  it('returns 400 when version is already published', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Version lookup returns already-published version
    mockLimit.mockResolvedValueOnce([{
      id: 'version-1',
      skillId: 'skill-1',
      version: '1.0.0',
      auditStatus: 'published',
      publishedBy: 'user-1',
    }]);

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { versionId: 'version-1', integrity: 'sha512-abc', fileCount: 5, tarballSize: 1024 },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already');
  });

  it('confirms publish and returns success with audit score', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockLimit.mockResolvedValueOnce([{
      id: 'version-1',
      skillId: 'skill-1',
      version: '1.0.0',
      auditStatus: 'pending-upload',
      publishedBy: 'user-1',
      manifest: { name: '@testorg/my-skill', version: '1.0.0', description: 'A test skill' },
      permissions: { network: { outbound: ['*.example.com'] } },
      readme: '# My Skill\nA test skill.',
      tarballPath: 'skills/my-skill/1.0.0.tgz',
    }]);
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/my-skill' }]);
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    // Mock the security scan flow
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        scan_id: 'scan-1',
        verdict: 'pass',
        findings: [],
        stage_results: [],
        duration_ms: 100,
        file_hashes: {},
      }),
    });

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { versionId: 'version-1', integrity: 'sha512-abc', fileCount: 5, tarballSize: 1024 },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.name).toBe('@testorg/my-skill');
    expect(data.version).toBe('1.0.0');
    expect(typeof data.auditScore).toBe('number');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { POST } = await import('../confirm/route');
    const request = new Request('http://localhost:3000/api/v1/skills/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tank_valid',
      },
      body: 'not json',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('stores audit score in db update with completed status', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockComputeAuditScore.mockReturnValueOnce({ score: 9, details: [] });
    mockLimit.mockResolvedValueOnce([{
      id: 'ver-1',
      skillId: 'skill-1',
      version: '1.0.0',
      auditStatus: 'pending-upload',
      publishedBy: 'user-1',
      manifest: { name: '@testorg/test-skill', version: '1.0.0', description: 'A test skill' },
      permissions: { network: { outbound: ['*.example.com'] } },
      readme: '# Test Skill',
      tarballPath: 'skills/test-skill/1.0.0.tgz',
    }]);
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/test-skill' }]);
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    // Mock the security scan flow
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        scan_id: 'scan-1',
        verdict: 'pass',
        findings: [],
        stage_results: [],
        duration_ms: 100,
        file_hashes: {},
      }),
    });

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { versionId: 'ver-1', integrity: 'sha512-abc', fileCount: 3, tarballSize: 512 },
      'tank_valid',
    );
    await POST(request);

    // The final mockSet call should have auditScore and auditStatus
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        auditScore: 9,
        auditStatus: 'completed',
      }),
    );
  });

  it('falls back to scan-failed status when scan fails', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    mockComputeAuditScore.mockReturnValueOnce({ score: 8, details: [] });
    mockLimit.mockResolvedValueOnce([{
      id: 'ver-1',
      skillId: 'skill-1',
      version: '1.0.0',
      auditStatus: 'pending-upload',
      publishedBy: 'user-1',
      manifest: { name: '@testorg/test-skill', version: '1.0.0' },
      permissions: {},
      readme: null,
      tarballPath: 'skills/test-skill/1.0.0.tgz',
    }]);
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: '@testorg/test-skill' }]);
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    // Mock the security scan flow to fail (no signed URL)
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'Failed to generate signed URL' },
    });

    const { POST } = await import('../confirm/route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills/confirm',
      { versionId: 'ver-1', integrity: 'sha512-abc', fileCount: 3, tarballSize: 512 },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    // When scan fails, it still computes a score using fallback
    expect(typeof data.auditScore).toBe('number');
    // The status should be 'scan-failed' when the scan doesn't work
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        auditStatus: 'scan-failed',
      }),
    );
  });
});
