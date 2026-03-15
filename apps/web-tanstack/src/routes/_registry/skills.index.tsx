import { createFileRoute } from '@tanstack/react-router';

import type { FreshnessBucket, PopularityBucket, ScoreBucket, SortOption, VisibilityFilter } from '~/lib/skills/data';
import { skillsListQueryOptions } from '~/query/skills-options';
import { SkillsListScreen } from '~/screens/skills/skills-list-screen';
import { getSession } from '~/server-fns/session';

const VALID_SORTS: SortOption[] = ['updated', 'downloads', 'stars', 'score', 'name'];
const VALID_VISIBILITY: VisibilityFilter[] = ['all', 'public', 'private'];
const VALID_SCORE: ScoreBucket[] = ['all', 'high', 'medium', 'low'];
const VALID_FRESHNESS: FreshnessBucket[] = ['all', 'week', 'month', 'year'];
const VALID_POPULARITY: PopularityBucket[] = ['all', 'popular', 'growing', 'new'];

function parseEnum<T extends string>(raw: string | undefined, valid: T[], fallback: T): T {
  if (raw && (valid as string[]).includes(raw)) return raw as T;
  return fallback;
}

export const Route = createFileRoute('/_registry/skills/')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: ((search.q as string) || '') as string | undefined,
    page: Math.max(1, Number(search.page) || 1) as number | undefined,
    sort: parseEnum(search.sort as string, VALID_SORTS, 'updated') as SortOption | undefined,
    visibility: parseEnum(search.visibility as string, VALID_VISIBILITY, 'all') as VisibilityFilter | undefined,
    score: parseEnum(search.score as string, VALID_SCORE, 'all') as ScoreBucket | undefined,
    freshness: parseEnum(search.freshness as string, VALID_FRESHNESS, 'all') as FreshnessBucket | undefined,
    popularity: parseEnum(search.popularity as string, VALID_POPULARITY, 'all') as PopularityBucket | undefined,
    docs: (search.docs === '1') as boolean | undefined
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const session = await getSession();
    const params = {
      q: deps.q ?? '',
      page: deps.page ?? 1,
      limit: 20,
      sort: deps.sort ?? 'updated',
      visibility: deps.visibility ?? 'all',
      scoreBucket: deps.score ?? 'all',
      freshness: deps.freshness && deps.freshness !== 'all' ? deps.freshness : undefined,
      popularity: deps.popularity && deps.popularity !== 'all' ? deps.popularity : undefined,
      hasReadme: deps.docs || undefined
    };
    const data = await context.queryClient.ensureQueryData(skillsListQueryOptions(params));
    return { data, isLoggedIn: !!session?.user };
  },
  head: () => ({
    meta: [
      { title: 'Browse AI Agent Skills | Tank' },
      {
        name: 'description',
        content:
          'Discover, compare, and install security-verified AI agent skills. Every skill is scanned for credential theft, prompt injection, and supply chain attacks.'
      },
      { property: 'og:title', content: 'Browse AI Agent Skills | Tank' },
      {
        property: 'og:description',
        content:
          'Discover, compare, and install security-verified AI agent skills. Every skill is scanned for credential theft, prompt injection, and supply chain attacks.'
      },
      { property: 'og:url', content: 'https://www.tankpkg.dev/skills' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Tank' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Browse AI Agent Skills | Tank' },
      { name: 'twitter:description', content: 'Discover, compare, and install security-verified AI agent skills.' }
    ],
    links: [{ rel: 'canonical', href: 'https://www.tankpkg.dev/skills' }]
  }),
  component: SkillsPage
});

function SkillsPage() {
  const { data, isLoggedIn } = Route.useLoaderData();
  const search = Route.useSearch();

  return (
    <SkillsListScreen
      data={data}
      query={search.q ?? ''}
      page={search.page ?? 1}
      sort={search.sort ?? 'updated'}
      visibility={search.visibility ?? 'all'}
      scoreBucket={search.score ?? 'all'}
      freshness={search.freshness ?? 'all'}
      popularity={search.popularity ?? 'all'}
      hasReadme={search.docs ?? false}
      isLoggedIn={isLoggedIn}
    />
  );
}
