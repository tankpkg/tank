import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger to avoid real logging during tests
vi.mock('~/services/logger', () => ({
  log: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
}));

import {
  clearBranchCache,
  detectURLType,
  expandGitHubFolder,
  expandSkillsShUrl,
  resolveDefaultBranch
} from '../url-expander';

/** Helper: create a minimal Response-like object for fetch mocks. */
function mockResponse(
  overrides: Partial<Pick<Response, 'ok' | 'status' | 'json' | 'text'>> & { body?: Record<string, unknown> }
): Response {
  const { ok = true, status = 200, body } = overrides;
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    statusText: ok ? 'OK' : 'Not Found',
    headers: { 'Content-Type': 'application/json' }
  });
}

// ── resolveDefaultBranch ──────────────────────────────────────

describe('resolveDefaultBranch', () => {
  afterEach(() => {
    clearBranchCache();
    vi.restoreAllMocks();
  });

  it('returns cached branch without network call', async () => {
    const mockFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ body: { default_branch: 'master' } }));

    const first = await resolveDefaultBranch('test-owner', 'cached-repo');
    expect(first).toBe('master');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns default_branch from GitHub API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ body: { default_branch: 'develop' } }));

    const branch = await resolveDefaultBranch('owner', 'custom-branch-repo');
    expect(branch).toBe('develop');
  });

  it('falls back to HEAD probe when API fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 404 }))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const branch = await resolveDefaultBranch('owner', 'master-only-repo');
    expect(branch).toBe('master');
  });

  it('falls back to HEAD probe on network error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const branch = await resolveDefaultBranch('owner', 'network-error-repo');
    expect(branch).toBe('main');
  });

  it('returns "main" when all strategies fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({ ok: false, status: 404 }));

    const branch = await resolveDefaultBranch('owner', 'nonexistent-repo');
    expect(branch).toBe('main');
  });

  it('defaults to "main" when API returns no default_branch field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ body: {} }));

    const branch = await resolveDefaultBranch('owner', 'no-branch-field');
    expect(branch).toBe('main');
  });
});

// ── expandGitHubFolder ────────────────────────────────────────

describe('expandGitHubFolder', () => {
  afterEach(() => {
    clearBranchCache();
    vi.restoreAllMocks();
  });

  it('uses explicit branch from /tree/ URL without API call', async () => {
    const result = await expandGitHubFolder('https://github.com/owner/repo/tree/develop/src');
    expect(result).toEqual({
      tarballUrl: 'https://codeload.github.com/owner/repo/tar.gz/develop',
      subPath: 'src'
    });
  });

  it('resolves default branch for bare owner/repo URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ body: { default_branch: 'master' } }));

    const result = await expandGitHubFolder('https://github.com/owner/repo');
    expect(result).toEqual({
      tarballUrl: 'https://codeload.github.com/owner/repo/tar.gz/master',
      subPath: null
    });
  });

  it('strips .git suffix from repo name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ body: { default_branch: 'main' } }));

    const result = await expandGitHubFolder('https://github.com/owner/repo.git');
    expect(result?.tarballUrl).toContain('/owner/repo/tar.gz/main');
    // .git suffix stripped from repo name (codeload.github.com contains ".git" as substring, so check path segment)
    expect(result?.tarballUrl).not.toMatch(/\/repo\.git\//);
  });

  it('returns null for non-GitHub URLs', async () => {
    const result = await expandGitHubFolder('https://npmjs.com/package/foo');
    expect(result).toBeNull();
  });
});

// ── expandSkillsShUrl ─────────────────────────────────────────

describe('expandSkillsShUrl', () => {
  afterEach(() => {
    clearBranchCache();
    vi.restoreAllMocks();
  });

  it('resolves default branch for skills.sh URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({ body: { default_branch: 'master' } }));

    const result = await expandSkillsShUrl('https://skills.sh/owner/repo/my-skill');
    expect(result).toEqual({
      tarballUrl: 'https://codeload.github.com/owner/repo/tar.gz/master',
      subPath: 'my-skill'
    });
  });

  it('returns null for invalid skills.sh URL (missing skill name)', async () => {
    const result = await expandSkillsShUrl('https://skills.sh/owner/repo');
    expect(result).toBeNull();
  });
});

// ── detectURLType ─────────────────────────────────────────────

describe('detectURLType', () => {
  it('detects GitHub folder URLs', () => {
    expect(detectURLType('https://github.com/owner/repo')).toBe('github_folder');
  });

  it('detects GitHub tree URLs', () => {
    expect(detectURLType('https://github.com/owner/repo/tree/main/src')).toBe('github_folder');
  });

  it('detects GitHub blob URLs', () => {
    expect(detectURLType('https://github.com/owner/repo/blob/main/README.md')).toBe('github_blob_file');
  });

  it('detects raw GitHub URLs', () => {
    expect(detectURLType('https://raw.githubusercontent.com/owner/repo/main/file.md')).toBe('github_raw_file');
  });

  it('detects skills.sh URLs', () => {
    expect(detectURLType('https://skills.sh/owner/repo/skill')).toBe('skills_sh');
  });

  it('detects tarball URLs', () => {
    expect(detectURLType('https://example.com/package.tgz')).toBe('tarball');
    expect(detectURLType('https://example.com/package.tar.gz')).toBe('tarball');
  });

  it('detects unknown URLs', () => {
    expect(detectURLType('not-a-url')).toBe('unknown');
  });
});
