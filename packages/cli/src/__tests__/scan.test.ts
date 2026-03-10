import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/packer.js', () => ({
  pack: vi.fn()
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('ora', () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: ''
  };
  return { default: vi.fn(() => spinner) };
});

import { pack } from '../lib/packer.js';

const mockPack = vi.mocked(pack);

describe('scanCommand', () => {
  let tmpDir: string;
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const validManifest = {
    name: '@test-org/my-skill',
    version: '1.0.0',
    description: 'A test skill',
    skills: {},
    permissions: {
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false
    }
  };

  const mockPackResult = {
    tarball: Buffer.from('fake-tarball-data'),
    integrity: 'sha512-abc123',
    fileCount: 5,
    totalSize: 2048,
    readme: '# Test Skill\n\nA test skill.',
    files: ['tank.json', 'SKILL.md', 'src/index.ts']
  };

  function makeScanResponse(overrides: Record<string, unknown> = {}) {
    return {
      scan_id: 'scan_123',
      verdict: 'pass',
      audit_score: 9.0,
      findings: [],
      stage_results: [
        { stage: 'ingest', status: 'passed', findings: [], duration_ms: 50 },
        { stage: 'structure', status: 'passed', findings: [], duration_ms: 30 },
        { stage: 'static', status: 'passed', findings: [], duration_ms: 120 }
      ],
      duration_ms: 200,
      ...overrides
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-scan-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-scan-config-'));

    fs.writeFileSync(path.join(tmpDir, 'tank.json'), JSON.stringify(validManifest, null, 2));

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        token: 'tank_test-token',
        user: { name: 'Test User', email: 'test@example.com' },
        registry: 'https://tankpkg.dev'
      })
    );

    mockPack.mockReset();
    mockFetch.mockReset();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function getAllOutput(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
  }

  it('throws when not logged in', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    const noAuthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-scan-noauth-'));
    fs.writeFileSync(path.join(noAuthDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

    await expect(scanCommand({ directory: tmpDir, configDir: noAuthDir })).rejects.toThrow(/not logged in/i);

    fs.rmSync(noAuthDir, { recursive: true, force: true });
  });

  it('throws when packing fails', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockRejectedValueOnce(new Error('Missing required file: skills.json'));

    await expect(scanCommand({ directory: tmpDir, configDir })).rejects.toThrow(/skills\.json/);
  });

  it('displays scan results for a clean skill', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(makeScanResponse()), { status: 200 }));

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('@test-org/my-skill@1.0.0');
    expect(output).toContain('PASS');
    expect(output).toContain('9.0');
    expect(output).toContain('No findings');
  });

  it('displays findings grouped by severity', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeScanResponse({
            verdict: 'flagged',
            audit_score: 4.5,
            findings: [
              {
                stage: 'static',
                severity: 'high',
                type: 'dangerous_function',
                description: 'Use of eval() detected',
                location: 'src/index.ts:10',
                confidence: 0.95,
                tool: 'semgrep',
                evidence: null
              },
              {
                stage: 'secrets',
                severity: 'critical',
                type: 'hardcoded_secret',
                description: 'API key found in source',
                location: 'src/config.ts:5',
                confidence: 0.99,
                tool: 'gitleaks',
                evidence: null
              },
              {
                stage: 'static',
                severity: 'medium',
                type: 'unsafe_pattern',
                description: 'Dynamic import from variable',
                location: 'src/loader.ts:20',
                confidence: 0.7,
                tool: 'semgrep',
                evidence: null
              }
            ]
          })
        ),
        { status: 200 }
      )
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('FLAGGED');
    expect(output).toContain('4.5');
    expect(output).toContain('Findings (3)');
    expect(output).toContain('CRITICAL (1)');
    expect(output).toContain('HIGH (1)');
    expect(output).toContain('MEDIUM (1)');
    expect(output).toContain('hardcoded_secret');
    expect(output).toContain('dangerous_function');
    expect(output).toContain('unsafe_pattern');
    expect(output).toContain('src/config.ts:5');
  });

  it('displays scan stages', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeScanResponse({
            stage_results: [
              { stage: 'ingest', status: 'passed', findings: [], duration_ms: 50 },
              { stage: 'structure', status: 'passed', findings: [], duration_ms: 30 },
              { stage: 'static', status: 'failed', findings: [], duration_ms: 120 }
            ]
          })
        ),
        { status: 200 }
      )
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('Scan Stages');
    expect(output).toContain('ingest');
    expect(output).toContain('structure');
    expect(output).toContain('static');
  });

  it('displays link to full report when scan_id present', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeScanResponse({ scan_id: 'scan_abc123' })), { status: 200 })
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('https://tankpkg.dev/scans/scan_abc123');
  });

  it('throws on 401 auth error', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    await expect(scanCommand({ directory: tmpDir, configDir })).rejects.toThrow(/authentication failed/i);
  });

  it('throws on non-401 API error', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Skill too large' }), { status: 413 }));

    await expect(scanCommand({ directory: tmpDir, configDir })).rejects.toThrow(/skill too large/i);
  });

  it('throws on network error', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(scanCommand({ directory: tmpDir, configDir })).rejects.toThrow(/network error/i);
  });

  it('calls correct API URL with auth header', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(makeScanResponse()), { status: 200 }));

    await scanCommand({ directory: tmpDir, configDir });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tankpkg.dev/api/v1/scan');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tank_test-token');
  });

  it('sends FormData with tarball and manifest', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(makeScanResponse()), { status: 200 }));

    await scanCommand({ directory: tmpDir, configDir });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);

    const formData = init.body as FormData;
    expect(formData.get('tarball')).toBeTruthy();
    expect(formData.get('manifest')).toBeTruthy();

    const manifestStr = formData.get('manifest') as string;
    const parsed = JSON.parse(manifestStr) as Record<string, unknown>;
    expect(parsed.name).toBe('@test-org/my-skill');
    expect(parsed.version).toBe('1.0.0');
  });

  it('displays fail verdict with correct formatting', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeScanResponse({
            verdict: 'fail',
            audit_score: 1.5,
            findings: [
              {
                stage: 'secrets',
                severity: 'critical',
                type: 'credential_exfiltration',
                description: 'Sends credentials to external server',
                location: 'src/index.ts:42',
                confidence: 0.99,
                tool: 'semgrep',
                evidence: null
              }
            ]
          })
        ),
        { status: 200 }
      )
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('FAIL');
    expect(output).toContain('1.5');
    expect(output).toContain('credential_exfiltration');
  });

  it('handles scan response without scan_id', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(makeScanResponse({ scan_id: null })), { status: 200 }));

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).not.toContain('/scans/');
  });

  it('handles scan response without stage_results', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(makeScanResponse({ stage_results: [] })), { status: 200 })
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).not.toContain('Scan Stages');
  });

  it('uses default directory (process.cwd()) when none specified', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    const originalCwd = process.cwd;
    process.cwd = vi.fn(() => tmpDir);

    try {
      mockPack.mockResolvedValueOnce(mockPackResult);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(makeScanResponse()), { status: 200 }));

      await scanCommand({ configDir });

      expect(mockPack).toHaveBeenCalledWith(tmpDir);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('displays pass_with_notes verdict correctly', async () => {
    const { scanCommand } = await import('../commands/scan.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeScanResponse({
            verdict: 'pass_with_notes',
            audit_score: 7.5,
            findings: [
              {
                stage: 'static',
                severity: 'low',
                type: 'deprecated_api',
                description: 'Using deprecated API',
                location: 'src/index.ts:15',
                confidence: 0.8,
                tool: 'semgrep',
                evidence: null
              }
            ]
          })
        ),
        { status: 200 }
      )
    );

    await scanCommand({ directory: tmpDir, configDir });

    const output = getAllOutput();
    expect(output).toContain('PASS_WITH_NOTES');
    expect(output).toContain('7.5');
  });
});
