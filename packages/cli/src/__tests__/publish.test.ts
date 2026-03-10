import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the packer module — we don't want to actually create tarballs in tests
vi.mock('../lib/packer.js', () => ({
  pack: vi.fn()
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock ora — spinner is a side-effect UI concern
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

describe('publishCommand', () => {
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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-publish-test-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-publish-config-'));

    // Write a valid tank.json in the "project" directory
    fs.writeFileSync(path.join(tmpDir, 'tank.json'), JSON.stringify(validManifest, null, 2));

    // Write a config with auth token
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

  it('publishes successfully: pack → API step 1 → upload → confirm', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1: POST /api/v1/skills → returns uploadUrl, skillId, versionId
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );

    // Step 2: PUT upload tarball
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    // Step 3: POST /api/v1/skills/confirm
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          name: '@test-org/my-skill',
          version: '1.0.0'
        }),
        { status: 200 }
      )
    );

    await publishCommand({ directory: tmpDir, configDir });

    // Verify pack was called with the directory
    expect(mockPack).toHaveBeenCalledWith(tmpDir);

    // Verify 3 fetch calls were made
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify step 1: POST /api/v1/skills with manifest
    const [step1Url, step1Opts] = mockFetch.mock.calls[0];
    expect(step1Url).toBe('https://tankpkg.dev/api/v1/skills');
    expect(step1Opts.method).toBe('POST');
    expect(step1Opts.headers.Authorization).toBe('Bearer tank_test-token');
    const step1Body = JSON.parse(step1Opts.body);
    expect(step1Body.manifest).toEqual(validManifest);

    // Verify step 2: PUT tarball to upload URL
    const [step2Url, step2Opts] = mockFetch.mock.calls[1];
    expect(step2Url).toBe('https://storage.example.com/upload?token=abc');
    expect(step2Opts.method).toBe('PUT');
    expect(step2Opts.headers['Content-Type']).toBe('application/octet-stream');
    expect(new Uint8Array(step2Opts.body)).toEqual(new Uint8Array(mockPackResult.tarball));

    // Verify step 3: POST /api/v1/skills/confirm
    const [step3Url, step3Opts] = mockFetch.mock.calls[2];
    expect(step3Url).toBe('https://tankpkg.dev/api/v1/skills/confirm');
    expect(step3Opts.method).toBe('POST');
    const step3Body = JSON.parse(step3Opts.body);
    expect(step3Body).toEqual({
      versionId: 'version-456',
      integrity: 'sha512-abc123',
      fileCount: 5,
      tarballSize: 2048,
      readme: '# Test Skill\n\nA test skill.'
    });
  });

  it('dry run: packs, prints summary, and verifies auth with server', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ valid: true }), { status: 200 }));

    await publishCommand({ directory: tmpDir, configDir, dryRun: true });

    expect(mockPack).toHaveBeenCalledWith(tmpDir);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/whoami');
    expect(opts.headers.Authorization).toBe('Bearer tank_test-token');
  });

  it('dry run: warns when server auth check fails', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    await publishCommand({ directory: tmpDir, configDir, dryRun: true });

    const allOutput = getAllOutput();
    expect(allOutput).toMatch(/expired|invalid/i);
  });

  it('dry run: warns when server is unreachable', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await publishCommand({ directory: tmpDir, configDir, dryRun: true });

    const allOutput = getAllOutput();
    expect(allOutput).toMatch(/could not reach server/i);
  });

  it('sets manifest.visibility=private when private option is enabled', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, name: '@test-org/my-skill', version: '1.0.0' }), { status: 200 })
    );

    await publishCommand({ directory: tmpDir, configDir, private: true });

    const [, step1Opts] = mockFetch.mock.calls[0];
    const step1Body = JSON.parse(step1Opts.body);
    expect(step1Body.manifest.visibility).toBe('private');
  });

  it('uses explicit visibility option when provided', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, name: '@test-org/my-skill', version: '1.0.0' }), { status: 200 })
    );

    await publishCommand({ directory: tmpDir, configDir, visibility: 'public' });

    const [, step1Opts] = mockFetch.mock.calls[0];
    const step1Body = JSON.parse(step1Opts.body);
    expect(step1Body.manifest.visibility).toBe('public');
  });

  it('errors when not logged in (no token)', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    // Write config without token
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry: 'https://tankpkg.dev' }));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Not logged in/);

    // No pack or fetch calls
    expect(mockPack).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('errors when tank.json is missing', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    // Remove tank.json
    fs.unlinkSync(path.join(tmpDir, 'tank.json'));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/tank\.json/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles API 401 with auth error message', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Authentication failed/);
  });

  it('handles API 403 by forwarding server error message', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "You are not a member of org 'test-org'" }), { status: 403 })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/not a member of org/i);
  });

  it('handles API 403 with scope error by forwarding message', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Insufficient API key scope. Required: skills:publish' }), { status: 403 })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/skills:publish/i);
  });

  it('handles API 404 for org not found', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "Organization 'solarai' not found. You must create the org before publishing scoped packages."
        }),
        { status: 404 }
      )
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/not found/i);
  });

  it('handles API 409 with version conflict message', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 returns 409
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Version 1.0.0 already exists' }), { status: 409 })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Version already exists/);
  });

  it('handles upload failure', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );

    // Step 2: Upload fails
    mockFetch.mockResolvedValueOnce(new Response('Storage error', { status: 500 }));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/upload/i);
  });

  it('handles confirm step failure', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );

    // Step 2: Upload succeeds
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    // Step 3: Confirm fails
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/confirm/i);
  });

  it('handles generic API error with message from response', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 returns 500 with error message
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Database connection failed' }), { status: 500 })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Database connection failed/);
  });

  it('formats file size correctly in dry run output', async () => {
    const { formatSize } = await import('../commands/publish.js');

    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(2621440)).toBe('2.5 MB');
  });

  it('errors when tank.json is invalid JSON', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    // Write invalid JSON to tank.json
    fs.writeFileSync(path.join(tmpDir, 'tank.json'), '{ invalid json }');

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/tank\.json/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('errors when visibility option is invalid', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    await expect(publishCommand({ directory: tmpDir, configDir, visibility: 'internal' })).rejects.toThrow(
      /Invalid visibility/
    );

    expect(mockPack).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('errors when pack fails', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockRejectedValueOnce(new Error('Missing required file: SKILL.md'));

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Missing required file/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('dry run: warns when server returns non-ok, non-401 status', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Mock whoami to return 500
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }));

    await publishCommand({ directory: tmpDir, configDir, dryRun: true });

    const allOutput = getAllOutput();
    expect(allOutput).toMatch(/could not verify token/i);
  });

  it('step 1 non-ok with non-JSON body uses statusText', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 returns 500 with plain text body (not JSON)
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Internal Server Error/);
  });

  it('confirm step non-ok with non-JSON body uses statusText', async () => {
    const { publishCommand } = await import('../commands/publish.js');

    mockPack.mockResolvedValueOnce(mockPackResult);

    // Step 1 succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          skillId: 'skill-123',
          versionId: 'version-456'
        }),
        { status: 200 }
      )
    );

    // Step 2: Upload succeeds
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    // Step 3: Confirm fails with plain text body
    mockFetch.mockResolvedValueOnce(
      new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
    );

    await expect(publishCommand({ directory: tmpDir, configDir })).rejects.toThrow(/Service Unavailable/);
  });
});
