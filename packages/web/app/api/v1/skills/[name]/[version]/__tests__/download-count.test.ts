import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockExecute
  }
}));

vi.mock('@/lib/db/schema', () => ({
  skills: {
    id: 'skills.id',
    name: 'skills.name',
    description: 'skills.description',
    publisherId: 'skills.publisher_id'
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
    createdAt: 'skill_versions.created_at'
  },
  skillDownloadDaily: {
    id: 'skill_download_daily.id',
    skillId: 'skill_download_daily.skill_id',
    date: 'skill_download_daily.date',
    count: 'skill_download_daily.count'
  },
  scanResults: {
    id: 'scan_results.id',
    versionId: 'scan_results.version_id',
    verdict: 'scan_results.verdict',
    createdAt: 'scan_results.created_at'
  },
  scanFindings: {
    id: 'scan_findings.id',
    scanId: 'scan_findings.scan_id',
    stage: 'scan_findings.stage',
    severity: 'scan_findings.severity',
    type: 'scan_findings.type',
    description: 'scan_findings.description',
    location: 'scan_findings.location'
  }
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
  desc: vi.fn((col) => ({ col, type: 'desc' })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      type: 'sql'
    })),
    {
      raw: vi.fn((str: string) => ({ str, type: 'sql_raw' }))
    }
  )
}));

const mockCreateSignedUrl = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl
      }))
    }
  }
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, {
    method: 'GET',
    headers: headers ?? {}
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
  publishedAt: '2026-01-10T00:00:00Z'
};

const defaultMetaRow = {
  downloadCount: 0,
  scanVerdict: null,
  findingStage: null,
  findingSeverity: null,
  findingType: null,
  findingDescription: null,
  findingLocation: null
};

function setupSuccessfulFetch(options?: { downloadCount?: number }) {
  const { downloadCount = 0 } = options ?? {};

  mockExecute.mockResolvedValueOnce([skillVersionRow]);
  mockExecute.mockResolvedValueOnce(undefined);
  mockExecute.mockResolvedValueOnce([{ ...defaultMetaRow, downloadCount }]);

  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
    error: null
  });
}

async function callVersionEndpoint(headers?: Record<string, string>) {
  const { GET } = await import('@/app/api/v1/skills/[name]/[version]/route');
  const request = makeGetRequest('http://localhost:3000/api/v1/skills/my-skill/1.0.0', headers);
  return GET(request, {
    params: Promise.resolve({ name: 'my-skill', version: '1.0.0' })
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
      'x-forwarded-for': '192.168.1.1'
    });

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('includes download count in response', async () => {
    setupSuccessfulFetch({ downloadCount: 42 });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.downloads).toBe(42);
  });

  it("download counting errors don't break the response", async () => {
    mockExecute.mockResolvedValueOnce([skillVersionRow]);
    mockExecute.mockRejectedValueOnce(new Error('DB connection failed'));
    mockExecute.mockResolvedValueOnce([defaultMetaRow]);

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/download?token=xyz' },
      error: null
    });

    const response = await callVersionEndpoint({
      'x-forwarded-for': '192.168.1.1'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('my-skill');
    expect(data.downloadUrl).toBe('https://storage.example.com/download?token=xyz');
  });
});
