import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('~/services/logger', () => ({
  log: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
}));

// Mock env
vi.mock('~/consts/env', () => ({
  env: {
    PYTHON_API_URL: 'http://localhost:8000',
    SCANNER_SERVICE_KEY: 'test-key'
  }
}));

// Mock schemas with plain string column names (Drizzle columns used as identifiers)
vi.mock('~/lib/db/schema', () => ({
  externalSkills: {
    url: 'url',
    scanVerdict: 'scanVerdict',
    scanResult: 'scanResult',
    scannedAt: 'scannedAt',
    updatedAt: 'updatedAt'
  }
}));

// Helpers to set mock return values (declared before mock factories that reference them)
const mockStore = { selectResult: [] as unknown[] };

vi.mock('~/lib/db', () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mockStore.selectResult
        })
      })
    }),
    update: () => ({
      set: () => ({
        where: async () => {}
      })
    })
  };
  return { db };
});

// Mock url-expander
vi.mock('~/lib/scan/url-expander', () => ({
  expandScanUrl: vi.fn()
}));

import { expandScanUrl } from '~/lib/scan/url-expander';
import { scanExternalSkills, updateExternalSkillScanResult } from '../external-skills';

describe('scanExternalSkills', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockStore.selectResult = [];
  });

  it('does nothing when no unscanned skills exist', async () => {
    mockStore.selectResult = [];

    await scanExternalSkills();

    expect(expandScanUrl).not.toHaveBeenCalled();
  });

  it('scans skills with null verdict via tarball mode', async () => {
    mockStore.selectResult = [{ id: '1', url: 'https://skills.sh/owner/repo/skill1' }];

    vi.mocked(expandScanUrl).mockResolvedValueOnce({
      tarballUrl: 'https://codeload.github.com/owner/repo/tar.gz/main',
      subPath: 'skill1',
      fileContent: null,
      urlType: 'skills_sh',
      contentType: null
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ verdict: 'safe', findings: [], duration_ms: 100 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await scanExternalSkills();

    expect(expandScanUrl).toHaveBeenCalledWith('https://skills.sh/owner/repo/skill1');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles scan errors gracefully', async () => {
    mockStore.selectResult = [{ id: '2', url: 'https://skills.sh/owner/repo/broken' }];

    vi.mocked(expandScanUrl).mockResolvedValueOnce({
      tarballUrl: '',
      subPath: null,
      fileContent: null,
      urlType: 'unknown',
      contentType: null,
      error: 'Repository not found'
    });

    // Should not throw — error verdict is written
    await scanExternalSkills();

    expect(expandScanUrl).toHaveBeenCalledWith('https://skills.sh/owner/repo/broken');
  });

  it('scans skills via single-file mode when fileContent is present', async () => {
    mockStore.selectResult = [{ id: '3', url: 'https://skills.sh/owner/repo/skill2' }];

    vi.mocked(expandScanUrl).mockResolvedValueOnce({
      tarballUrl: '',
      subPath: null,
      fileContent: '# Skill\nContent here',
      urlType: 'skills_sh',
      contentType: 'text/markdown'
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ verdict: 'safe', findings: [], duration_ms: 50 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await scanExternalSkills();

    // Verify scanner was called with single_file_content
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const callBody = JSON.parse(requestInit.body as string);
    expect(callBody.single_file_content).toBe('# Skill\nContent here');
    expect(callBody.single_file_name).toBe('SKILL.md');
  });
});

describe('updateExternalSkillScanResult', () => {
  it('updates external_skills row by URL without throwing', async () => {
    await expect(
      updateExternalSkillScanResult(
        'https://skills.sh/owner/repo/skill1',
        'safe',
        { verdict: 'safe', findings: [], duration_ms: 100 },
        new Date('2026-01-01')
      )
    ).resolves.toBeUndefined();
  });
});
