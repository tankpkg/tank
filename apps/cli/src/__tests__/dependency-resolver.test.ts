import { describe, it, expect, vi } from 'vitest';
import {
  resolveDependencyTree,
  buildSkillKey,
  type RegistryFetcher,
  type RegistrySkillMeta,
  type RegistryVersionInfo,
} from '../lib/dependency-resolver.js';

function makeVersionInfo(version: string): RegistryVersionInfo {
  return {
    version,
    integrity: `sha512-${version}`,
    auditScore: 8,
    auditStatus: 'published',
    publishedAt: '2026-01-01T00:00:00Z',
  };
}

function makeMeta(
  name: string,
  version: string,
  dependencies: Record<string, string> = {},
): RegistrySkillMeta {
  return {
    name,
    version,
    description: `${name} ${version}`,
    integrity: `sha512-${name}-${version}`,
    permissions: {},
    auditScore: 9,
    downloadUrl: `https://registry.example/${encodeURIComponent(name)}/${version}.tgz`,
    dependencies,
  };
}

function makeMockRegistryFetcher(config: {
  versions: Record<string, string[]>;
  metadata: Record<string, RegistrySkillMeta>;
}): {
  fetcher: RegistryFetcher;
  fetchVersions: ReturnType<typeof vi.fn>;
  fetchMetadata: ReturnType<typeof vi.fn>;
} {
  const fetchVersions = vi.fn(async (name: string) => {
    const versions = config.versions[name] ?? [];
    return versions.map(makeVersionInfo);
  });

  const fetchMetadata = vi.fn(async (name: string, version: string) => {
    const key = buildSkillKey(name, version);
    const meta = config.metadata[key];
    if (!meta) {
      throw new Error(`Missing metadata for ${key}`);
    }
    return meta;
  });

  return {
    fetcher: { fetchVersions, fetchMetadata },
    fetchVersions,
    fetchMetadata,
  };
}

describe('buildSkillKey', () => {
  it("buildSkillKey('foo', '1.0.0') returns foo@1.0.0", () => {
    expect(buildSkillKey('foo', '1.0.0')).toBe('foo@1.0.0');
  });

  it("buildSkillKey('@org/skill', '2.3.4') returns @org/skill@2.3.4", () => {
    expect(buildSkillKey('@org/skill', '2.3.4')).toBe('@org/skill@2.3.4');
  });
});

describe('resolveDependencyTree', () => {
  it('returns empty graph and installOrder for empty root deps', async () => {
    const { fetcher, fetchVersions, fetchMetadata } = makeMockRegistryFetcher({
      versions: {},
      metadata: {},
    });

    const graph = await resolveDependencyTree({}, fetcher);

    expect(graph.nodes.size).toBe(0);
    expect(graph.installOrder).toEqual([]);
    expect(fetchVersions).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it('resolves single skill with no transitive deps to highest satisfying version', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: { foo: ['1.0.0', '1.1.0'] },
      metadata: {
        'foo@1.1.0': makeMeta('foo', '1.1.0'),
      },
    });

    const graph = await resolveDependencyTree({ foo: '^1.0.0' }, fetcher);

    expect(graph.nodes.size).toBe(1);
    expect(graph.installOrder).toEqual(['foo@1.1.0']);
    expect(graph.nodes.get('foo')).toMatchObject({
      name: 'foo',
      version: '1.1.0',
      dependencies: {},
    });
  });

  it('resolves single skill with one transitive dep', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        foo: ['1.0.0'],
        bar: ['1.0.0', '1.2.0'],
      },
      metadata: {
        'foo@1.0.0': makeMeta('foo', '1.0.0', { bar: '^1.0.0' }),
        'bar@1.2.0': makeMeta('bar', '1.2.0'),
      },
    });

    const graph = await resolveDependencyTree({ foo: '^1.0.0' }, fetcher);

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.get('foo')?.version).toBe('1.0.0');
    expect(graph.nodes.get('bar')?.version).toBe('1.2.0');
  });

  it('resolves deep chain A->B->C->D', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0'],
        D: ['1.0.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { B: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '^1.0.0' }),
        'C@1.0.0': makeMeta('C', '1.0.0', { D: '^1.0.0' }),
        'D@1.0.0': makeMeta('D', '1.0.0'),
      },
    });

    const graph = await resolveDependencyTree({ A: '^1.0.0' }, fetcher);

    expect(graph.nodes.size).toBe(4);
    expect(graph.nodes.get('A')?.dependencies).toEqual({ B: '1.0.0' });
    expect(graph.nodes.get('B')?.dependencies).toEqual({ C: '1.0.0' });
    expect(graph.nodes.get('C')?.dependencies).toEqual({ D: '1.0.0' });
  });

  it('deduplicates diamond dependencies when both parents require same range', async () => {
    const { fetcher, fetchMetadata } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0', '1.2.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { C: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '^1.0.0' }),
        'C@1.2.0': makeMeta('C', '1.2.0'),
      },
    });

    const graph = await resolveDependencyTree(
      { A: '^1.0.0', B: '^1.0.0' },
      fetcher,
    );

    expect(graph.nodes.size).toBe(3);
    expect(graph.nodes.get('C')?.version).toBe('1.2.0');
    const cMetaCalls = fetchMetadata.mock.calls.filter(
      ([name]) => name === 'C',
    );
    expect(cMetaCalls).toHaveLength(1);
  });

  it('resolves diamond with tightening constraints to highest satisfying both', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0', '1.2.0', '1.4.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { C: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '>=1.2.0' }),
        'C@1.4.0': makeMeta('C', '1.4.0'),
      },
    });

    const graph = await resolveDependencyTree(
      { A: '^1.0.0', B: '^1.0.0' },
      fetcher,
    );

    expect(graph.nodes.get('C')?.version).toBe('1.4.0');
  });

  it('sorts installOrder alphabetically by skillKey', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        zebra: ['1.0.0'],
        alpha: ['2.0.0'],
        middle: ['3.0.0'],
      },
      metadata: {
        'zebra@1.0.0': makeMeta('zebra', '1.0.0'),
        'alpha@2.0.0': makeMeta('alpha', '2.0.0'),
        'middle@3.0.0': makeMeta('middle', '3.0.0'),
      },
    });

    const graph = await resolveDependencyTree(
      { zebra: '^1.0.0', alpha: '^2.0.0', middle: '^3.0.0' },
      fetcher,
    );

    expect(graph.installOrder).toEqual([
      'alpha@2.0.0',
      'middle@3.0.0',
      'zebra@1.0.0',
    ]);
  });

  it('stores resolved dependency versions in node.dependencies', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        foo: ['1.0.0'],
        bar: ['1.0.0', '1.2.0'],
      },
      metadata: {
        'foo@1.0.0': makeMeta('foo', '1.0.0', { bar: '^1.0.0' }),
        'bar@1.2.0': makeMeta('bar', '1.2.0'),
      },
    });

    const graph = await resolveDependencyTree({ foo: '^1.0.0' }, fetcher);

    expect(graph.nodes.get('foo')?.dependencies).toEqual({ bar: '1.2.0' });
  });

  it('throws Version conflict when dependency ranges are incompatible', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0', '1.1.0', '2.0.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { C: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '^2.0.0' }),
      },
    });

    await expect(
      resolveDependencyTree({ A: '^1.0.0', B: '^1.0.0' }, fetcher),
    ).rejects.toThrow(/Version conflict for C/);
  });

  it('throws when no available versions exist for a required skill', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: { foo: [] },
      metadata: {},
    });

    await expect(resolveDependencyTree({ foo: '^1.0.0' }, fetcher)).rejects.toThrow(
      /Version conflict for foo/,
    );
  });

  it('throws when no available version satisfies the requested range', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: { foo: ['1.0.0', '1.1.0'] },
      metadata: {},
    });

    await expect(resolveDependencyTree({ foo: '^2.0.0' }, fetcher)).rejects.toThrow(
      /Version conflict for foo/,
    );
  });

  it('handles cycle A<->B without infinite loop and resolves both', async () => {
    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { B: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { A: '^1.0.0' }),
      },
    });

    const graph = await resolveDependencyTree({ A: '^1.0.0' }, fetcher);

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.get('A')?.version).toBe('1.0.0');
    expect(graph.nodes.get('B')?.version).toBe('1.0.0');
  });

  it('calls fetchMetadata exactly once per (name, version)', async () => {
    const { fetcher, fetchMetadata } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { C: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '^1.0.0' }),
        'C@1.0.0': makeMeta('C', '1.0.0'),
      },
    });

    await resolveDependencyTree({ A: '^1.0.0', B: '^1.0.0' }, fetcher);

    const cCalls = fetchMetadata.mock.calls.filter(
      ([name, version]) => name === 'C' && version === '1.0.0',
    );
    expect(cCalls).toHaveLength(1);
  });

  it('calls fetchVersions exactly once per skill name', async () => {
    const { fetcher, fetchVersions } = makeMockRegistryFetcher({
      versions: {
        A: ['1.0.0'],
        B: ['1.0.0'],
        C: ['1.0.0', '1.2.0'],
      },
      metadata: {
        'A@1.0.0': makeMeta('A', '1.0.0', { C: '^1.0.0' }),
        'B@1.0.0': makeMeta('B', '1.0.0', { C: '^1.0.0' }),
        'C@1.2.0': makeMeta('C', '1.2.0'),
      },
    });

    await resolveDependencyTree({ A: '^1.0.0', B: '^1.0.0' }, fetcher);

    const countsBySkill = fetchVersions.mock.calls.reduce(
      (acc: Record<string, number>, [name]: [string]) => {
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(countsBySkill).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('builds graph nodes with expected name, version, meta, and dependencies', async () => {
    const fooMeta = makeMeta('foo', '1.0.0', { bar: '^2.0.0' });
    const barMeta = makeMeta('bar', '2.2.0');

    const { fetcher } = makeMockRegistryFetcher({
      versions: {
        foo: ['1.0.0'],
        bar: ['2.0.0', '2.2.0'],
      },
      metadata: {
        'foo@1.0.0': fooMeta,
        'bar@2.2.0': barMeta,
      },
    });

    const graph = await resolveDependencyTree({ foo: '^1.0.0' }, fetcher);

    expect(graph.nodes.size).toBe(2);

    const fooNode = graph.nodes.get('foo');
    const barNode = graph.nodes.get('bar');

    expect(fooNode).toEqual({
      name: 'foo',
      version: '1.0.0',
      meta: fooMeta,
      dependencies: { bar: '2.2.0' },
    });

    expect(barNode).toEqual({
      name: 'bar',
      version: '2.2.0',
      meta: barMeta,
      dependencies: {},
    });
  });
});
