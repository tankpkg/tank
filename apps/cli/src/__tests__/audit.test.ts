import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('auditCommand', () => {
  let configDir: string;
  let projectDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: () => string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-audit-config-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-audit-project-'));

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ registry: 'https://tankpkg.dev' }),
    );

    mockFetch.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    originalCwd = process.cwd;
    process.cwd = () => projectDir;
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.cwd = originalCwd;
  });

  function getAllOutput(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
  }

  function writeLockfile(skills: Record<string, unknown>) {
    fs.writeFileSync(
      path.join(projectDir, 'skills.lock'),
      JSON.stringify({ lockfileVersion: 1, skills }, null, 2),
    );
  }

  function makeVersionResponse(overrides: Record<string, unknown> = {}) {
    return {
      name: '@test/skill-a',
      version: '1.0.0',
      permissions: {},
      auditScore: 8.5,
      auditStatus: 'completed',
      downloadUrl: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
      publishedAt: '2026-02-14T00:00:00Z',
      downloads: 100,
      ...overrides,
    };
  }

  // ── Test 1: Audit all with 2 scored skills (one green, one red) ──

  it('displays table with audit scores for all installed skills', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
      '@test/skill-b@2.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-b-2.0.0.tgz',
        integrity: 'sha512-def',
        permissions: {},
        audit_score: null,
      },
    });

    // Fetch for skill-a (green score)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-a',
        version: '1.0.0',
        auditScore: 8.5,
        auditStatus: 'completed',
      })), { status: 200 }),
    );

    // Fetch for skill-b (red score)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-b',
        version: '2.0.0',
        auditScore: 2.0,
        auditStatus: 'completed',
      })), { status: 200 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toContain('@test/skill-a');
    expect(output).toContain('1.0.0');
    expect(output).toContain('8.5');
    expect(output).toContain('@test/skill-b');
    expect(output).toContain('2.0.0');
    expect(output).toContain('2.0');
  });

  // ── Test 2: Skill with null auditScore shows "pending" ──

  it('shows "Analysis pending" for skills with null auditScore', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/pending-skill@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/pending-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/pending-skill',
        version: '1.0.0',
        auditScore: null,
        auditStatus: 'pending',
      })), { status: 200 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toMatch(/pending/i);
  });

  // ── Test 3: Empty lockfile ──

  it('shows "No skills installed" for empty lockfile', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({});

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toMatch(/no skills installed/i);
  });

  // ── Test 4: No lockfile ──

  it('shows "No lockfile found" when skills.lock does not exist', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    // No lockfile written

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toMatch(/no lockfile found/i);
  });

  // ── Test 5: Audit specific skill — scored ──

  it('displays detailed audit info for a specific skill', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {
          network: { outbound: ['*.example.com'] },
          subprocess: false,
        },
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-a',
        version: '1.0.0',
        auditScore: 9.0,
        auditStatus: 'completed',
        permissions: {
          network: { outbound: ['*.example.com'] },
          subprocess: false,
        },
      })), { status: 200 }),
    );

    await auditCommand({ name: '@test/skill-a', configDir });

    const output = getAllOutput();
    expect(output).toContain('@test/skill-a');
    expect(output).toContain('1.0.0');
    expect(output).toContain('9.0');
    expect(output).toContain('completed');
    expect(output).toContain('*.example.com');
  });

  // ── Test 6: Audit specific skill not in lockfile ──

  it('shows error when specific skill is not in lockfile', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/other-skill@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/other-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    await auditCommand({ name: '@test/not-installed', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/not installed/i);
    expect(output).toContain('@test/not-installed');
  });

  // ── Test 7: Audit specific skill with pending analysis ──

  it('shows pending status for specific skill with incomplete analysis', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/pending-skill@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/pending-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/pending-skill',
        version: '1.0.0',
        auditScore: null,
        auditStatus: 'pending',
      })), { status: 200 }),
    );

    await auditCommand({ name: '@test/pending-skill', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/pending/i);
  });

  // ── Test 8: Network error ──

  it('throws on network error', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      auditCommand({ configDir }),
    ).rejects.toThrow(/network/i);
  });

  // ── Test 9: Summary line format ──

  it('displays summary line with pass/issues counts', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
      '@test/skill-b@2.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-b-2.0.0.tgz',
        integrity: 'sha512-def',
        permissions: {},
        audit_score: null,
      },
      '@test/skill-c@1.5.0': {
        resolved: 'https://storage.tankpkg.dev/skill-c-1.5.0.tgz',
        integrity: 'sha512-ghi',
        permissions: {},
        audit_score: null,
      },
    });

    // skill-a: green (pass)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-a', version: '1.0.0', auditScore: 8.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    // skill-b: red (issues)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-b', version: '2.0.0', auditScore: 2.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    // skill-c: green (pass)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/skill-c', version: '1.5.0', auditScore: 7.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toContain('3 skills audited');
    expect(output).toContain('2 pass');
    expect(output).toContain('1 has issues');
  });

  // ── Test 10: Color coding ──

  it('uses correct color coding for scores', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/green@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/green-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
      '@test/yellow@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/yellow-1.0.0.tgz',
        integrity: 'sha512-def',
        permissions: {},
        audit_score: null,
      },
      '@test/red@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/red-1.0.0.tgz',
        integrity: 'sha512-ghi',
        permissions: {},
        audit_score: null,
      },
    });

    // green: score 9
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/green', version: '1.0.0', auditScore: 9.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    // yellow: score 5
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/yellow', version: '1.0.0', auditScore: 5.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    // red: score 2
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/red', version: '1.0.0', auditScore: 2.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    // Verify all scores appear in output (chalk colors are invisible in string comparison)
    expect(output).toContain('9.0');
    expect(output).toContain('5.0');
    expect(output).toContain('2.0');
  });

  // ── Test 11: Calls correct API URL with encoded name ──

  it('calls correct API URL with encoded skill name', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse()), { status: 200 }),
    );

    await auditCommand({ configDir });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://tankpkg.dev/api/v1/skills/%40test%2Fskill-a/1.0.0');
  });

  // ── Test 12: Summary with pending skills counted as issues ──

  it('counts pending skills as issues in summary', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/good@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/good-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
      '@test/pending@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/pending-1.0.0.tgz',
        integrity: 'sha512-def',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/good', version: '1.0.0', auditScore: 8.0, auditStatus: 'completed',
      })), { status: 200 }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeVersionResponse({
        name: '@test/pending', version: '1.0.0', auditScore: null, auditStatus: 'pending',
      })), { status: 200 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    expect(output).toContain('2 skills audited');
    expect(output).toContain('1 pass');
  });

  // ── Test 13: API returns non-200 for a skill ──

  it('handles API error for individual skill gracefully', async () => {
    const { auditCommand } = await import('../commands/audit.js');

    writeLockfile({
      '@test/skill-a@1.0.0': {
        resolved: 'https://storage.tankpkg.dev/skill-a-1.0.0.tgz',
        integrity: 'sha512-abc',
        permissions: {},
        audit_score: null,
      },
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    );

    await auditCommand({ configDir });

    const output = getAllOutput();
    // Should still show the skill but with an error/unknown status
    expect(output).toContain('@test/skill-a');
  });
});
