import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('infoCommand', () => {
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const skillMetadata = {
    name: '@vercel/next-skill',
    description: 'Next.js development skill for AI agents',
    latestVersion: '2.1.0',
    publisher: { displayName: 'vercel' },
    createdAt: '2026-02-14T00:00:00Z',
    updatedAt: '2026-02-14T12:00:00Z',
  };

  const versionDetails = {
    name: '@vercel/next-skill',
    version: '2.1.0',
    permissions: {
      network: { outbound: ['*.anthropic.com'] },
      filesystem: { read: ['./src/**'], write: ['./output/**'] },
      subprocess: false,
    },
    auditScore: 8.5,
    auditStatus: 'published',
    downloadUrl: 'https://storage.tankpkg.dev/next-skill-2.1.0.tgz',
    publishedAt: '2026-02-14T00:00:00Z',
  };

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-info-config-'));

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ registry: 'https://tankpkg.dev' }),
    );

    mockFetch.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function getAllOutput(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');
  }

  function setupSuccessfulInfo() {
    // 1. GET /api/v1/skills/{name}
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(skillMetadata), { status: 200 }),
    );
    // 2. GET /api/v1/skills/{name}/{version}
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(versionDetails), { status: 200 }),
    );
  }

  it('displays full skill info', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    const output = getAllOutput();
    expect(output).toContain('@vercel/next-skill');
    expect(output).toContain('Next.js development skill for AI agents');
    expect(output).toContain('2.1.0');
    expect(output).toContain('vercel');
    expect(output).toContain('8.5');
  });

  it('shows "Skill not found" for 404', async () => {
    const { infoCommand } = await import('../commands/info.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    );

    await infoCommand({ name: '@org/nonexistent', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/skill not found/i);
    expect(output).toContain('@org/nonexistent');
  });

  it('calls correct API URL with encoded name', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [metaUrl] = mockFetch.mock.calls[0];
    expect(metaUrl).toBe('https://tankpkg.dev/api/v1/skills/%40vercel%2Fnext-skill');

    const [versionUrl] = mockFetch.mock.calls[1];
    expect(versionUrl).toBe('https://tankpkg.dev/api/v1/skills/%40vercel%2Fnext-skill/2.1.0');
  });

  it('displays permissions section', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/permissions/i);
    expect(output).toContain('*.anthropic.com');
    expect(output).toContain('./src/**');
    expect(output).toContain('./output/**');
  });

  it('handles missing optional fields gracefully', async () => {
    const { infoCommand } = await import('../commands/info.js');

    // Skill metadata with minimal fields
    const minimalMeta = {
      name: '@org/minimal-skill',
      description: 'A minimal skill',
      latestVersion: '1.0.0',
      publisher: { displayName: 'org' },
      createdAt: '2026-01-01T00:00:00Z',
    };

    // Version details with no permissions
    const minimalVersion = {
      name: '@org/minimal-skill',
      version: '1.0.0',
      auditScore: 6.0,
      auditStatus: 'published',
      downloadUrl: 'https://storage.tankpkg.dev/minimal-1.0.0.tgz',
      publishedAt: '2026-01-01T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(minimalMeta), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(minimalVersion), { status: 200 }),
    );

    // Should not throw
    await infoCommand({ name: '@org/minimal-skill', configDir });

    const output = getAllOutput();
    expect(output).toContain('@org/minimal-skill');
    expect(output).toContain('1.0.0');
  });

  it('shows install command', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    const output = getAllOutput();
    expect(output).toContain('tank install @vercel/next-skill');
  });

  it('handles network errors', async () => {
    const { infoCommand } = await import('../commands/info.js');

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      infoCommand({ name: '@vercel/next-skill', configDir }),
    ).rejects.toThrow(/network/i);
  });

  it('displays created date', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    const output = getAllOutput();
    expect(output).toContain('2026-02-14');
  });

  it('shows subprocess permission as no when false', async () => {
    const { infoCommand } = await import('../commands/info.js');
    setupSuccessfulInfo();

    await infoCommand({ name: '@vercel/next-skill', configDir });

    const output = getAllOutput();
    // subprocess: false should display as "no"
    expect(output).toMatch(/subprocess/i);
    expect(output).toMatch(/no/i);
  });
});
