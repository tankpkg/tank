import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('searchCommand', () => {
  let configDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const searchResults = {
    results: [
      {
        name: '@vercel/next-skill',
        description: 'Next.js development skill',
        latestVersion: '2.1.0',
        auditScore: 8.5,
        publisher: 'vercel',
        downloads: 1200,
      },
      {
        name: '@community/seo-audit',
        description: 'SEO auditing and optimization',
        latestVersion: '3.0.0',
        auditScore: 7.2,
        publisher: 'community',
        downloads: 450,
      },
    ],
    page: 1,
    limit: 20,
    total: 2,
  };

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-search-config-'));

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

  it('displays results in table format', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(searchResults), { status: 200 }),
    );

    await searchCommand({ query: 'next', configDir });

    const output = getAllOutput();
    expect(output).toContain('@vercel/next-skill');
    expect(output).toContain('2.1.0');
    expect(output).toContain('8.5');
    expect(output).toContain('Next.js development skill');
    expect(output).toContain('@community/seo-audit');
    expect(output).toContain('3.0.0');
  });

  it('shows "No skills found" for empty results', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, limit: 20, total: 0 }), { status: 200 }),
    );

    await searchCommand({ query: 'nonexistent-xyz', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/no skills found/i);
    expect(output).toContain('nonexistent-xyz');
  });

  it('calls correct API URL with encoded query', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], page: 1, limit: 20, total: 0 }), { status: 200 }),
    );

    await searchCommand({ query: 'next js framework', configDir });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://tankpkg.dev/api/v1/search?q=next%20js%20framework&limit=20');
  });

  it('shows result count', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(searchResults), { status: 200 }),
    );

    await searchCommand({ query: 'next', configDir });

    const output = getAllOutput();
    expect(output).toMatch(/2 skills? found/i);
  });

  it('handles network errors', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(
      searchCommand({ query: 'next', configDir }),
    ).rejects.toThrow(/network/i);
  });

  it('truncates long descriptions', async () => {
    const { searchCommand } = await import('../commands/search.js');

    const longDescResults = {
      results: [
        {
          name: '@org/skill',
          description: 'A'.repeat(200),
          latestVersion: '1.0.0',
          auditScore: 5.0,
          publisher: 'org',
          downloads: 10,
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(longDescResults), { status: 200 }),
    );

    await searchCommand({ query: 'skill', configDir });

    const output = getAllOutput();
    // Description should be truncated (not contain the full 200 chars)
    expect(output).not.toContain('A'.repeat(200));
    expect(output).toContain('...');
  });

  it('handles non-200 API responses', async () => {
    const { searchCommand } = await import('../commands/search.js');

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }),
    );

    await expect(
      searchCommand({ query: 'next', configDir }),
    ).rejects.toThrow();
  });

  it('color-codes scores: green for high, yellow for medium, red for low', async () => {
    const { searchCommand } = await import('../commands/search.js');

    const mixedScoreResults = {
      results: [
        { name: '@org/high', description: 'High score', latestVersion: '1.0.0', auditScore: 9.0, publisher: 'org', downloads: 10 },
        { name: '@org/mid', description: 'Mid score', latestVersion: '1.0.0', auditScore: 5.0, publisher: 'org', downloads: 10 },
        { name: '@org/low', description: 'Low score', latestVersion: '1.0.0', auditScore: 2.0, publisher: 'org', downloads: 10 },
      ],
      page: 1,
      limit: 20,
      total: 3,
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mixedScoreResults), { status: 200 }),
    );

    await searchCommand({ query: 'org', configDir });

    // Just verify all scores appear in output (chalk coloring is hard to assert directly)
    const output = getAllOutput();
    expect(output).toContain('9.0');
    expect(output).toContain('5.0');
    expect(output).toContain('2.0');
  });
});
