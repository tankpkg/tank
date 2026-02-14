import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockVerifyCliAuth = vi.fn();
vi.mock('@/lib/auth-helpers', () => ({
  verifyCliAuth: (...args: unknown[]) => mockVerifyCliAuth(...args),
}));

const mockGetFullOrganization = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getFullOrganization: (...args: unknown[]) => mockGetFullOrganization(...args),
    },
  },
}));

// Mock Drizzle db with chainable query builder
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  publishers: { id: 'publishers.id', userId: 'publishers.user_id', displayName: 'publishers.display_name' },
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
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
}));

const mockCreateSignedUploadUrl = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
      })),
    },
  },
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
  name: 'my-skill',
  version: '1.0.0',
  description: 'A test skill',
};

const scopedManifest = {
  name: '@myorg/my-skill',
  version: '1.0.0',
  description: 'A scoped skill',
};

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
      { manifest: { name: 'my-skill', version: 'not-semver' } },
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

    // Publisher lookup returns existing publisher
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: 'my-skill' }]);
    // Version conflict check returns empty
    mockLimit.mockResolvedValueOnce([]);
    // Version insert
    mockReturning.mockResolvedValueOnce([{ id: 'version-1' }]);
    // Supabase signed URL
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc', token: 'abc' },
      error: null,
    });

    const { POST } = await import('../route');
    // Name has uppercase — should be normalized
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: { name: 'My-Skill', version: '1.0.0' } },
      'tank_valid',
    );
    const response = await POST(request);

    // The name validation happens AFTER normalization, so lowercase 'my-skill' should pass
    // If it returns 200, the normalization worked
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skillId).toBe('skill-1');
  });

  it('returns 403 for scoped package when user is not org member', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Publisher lookup
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Org lookup returns org without user as member
    mockGetFullOrganization.mockResolvedValue({
      id: 'org-1',
      slug: 'myorg',
      members: [{ userId: 'other-user' }],
    });

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
    // Publisher lookup
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Org lookup returns null
    mockGetFullOrganization.mockResolvedValue(null);

    const { POST } = await import('../route');
    const request = makeRequest(
      'http://localhost:3000/api/v1/skills',
      { manifest: scopedManifest },
      'tank_valid',
    );
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('returns 409 for duplicate version', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Publisher lookup
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Skill lookup returns existing skill
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: 'my-skill', publisherId: 'pub-1' }]);
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
    // Publisher lookup returns existing publisher
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: 'my-skill' }]);
    // Version conflict check returns empty
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

  it('creates publisher if not exists', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Publisher lookup returns empty (new publisher)
    mockLimit.mockResolvedValueOnce([]);
    // Publisher insert
    mockReturning.mockResolvedValueOnce([{ id: 'pub-new', userId: 'user-1', displayName: 'user-1' }]);
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: 'my-skill' }]);
    // Version conflict check returns empty
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
    // Verify publisher insert was called
    expect(mockInsert).toHaveBeenCalled();
  });

  it('allows scoped package when user is org member', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Publisher lookup
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Org lookup returns org with user as member
    mockGetFullOrganization.mockResolvedValue({
      id: 'org-1',
      slug: 'myorg',
      members: [{ userId: 'user-1' }],
    });
    // Skill lookup returns empty (new skill)
    mockLimit.mockResolvedValueOnce([]);
    // Skill insert
    mockReturning.mockResolvedValueOnce([{ id: 'skill-1', name: '@myorg/my-skill' }]);
    // Version conflict check returns empty
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
    // Publisher lookup
    mockLimit.mockResolvedValueOnce([{ id: 'pub-1', userId: 'user-1', displayName: 'Test' }]);
    // Skill lookup returns existing skill
    mockLimit.mockResolvedValueOnce([{ id: 'skill-existing', name: 'my-skill', publisherId: 'pub-1' }]);
    // Version conflict check returns empty (new version)
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

  it('confirms publish and returns success', async () => {
    mockVerifyCliAuth.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });
    // Version lookup returns pending-upload version
    mockLimit.mockResolvedValueOnce([{
      id: 'version-1',
      skillId: 'skill-1',
      version: '1.0.0',
      auditStatus: 'pending-upload',
    }]);
    // Skill lookup for name
    mockLimit.mockResolvedValueOnce([{ id: 'skill-1', name: 'my-skill' }]);
    // Update succeeds (no return value needed)
    mockUpdateWhere.mockResolvedValueOnce(undefined);

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
    expect(data.name).toBe('my-skill');
    expect(data.version).toBe('1.0.0');
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
});
