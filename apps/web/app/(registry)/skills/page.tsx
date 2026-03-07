import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { searchSkills } from '@/lib/data/skills';
import type { SortOption, VisibilityFilter, ScoreBucket } from '@/lib/data/skills';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { SearchBar } from './search-bar';
import { SkillsFilters } from './skills-filters';
import { SkillsResults } from './skills-results';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Browse AI Agent Skills',
  description:
    'Discover, compare, and install security-verified AI agent skills. Every skill is scanned for credential theft, prompt injection, and supply chain attacks.',
  alternates: { canonical: 'https://tankpkg.dev/skills' },
  openGraph: {
    title: 'Browse AI Agent Skills — Tank',
    description:
      'Discover, compare, and install security-verified AI agent skills.',
    url: 'https://tankpkg.dev/skills',
    type: 'website',
    siteName: 'Tank',
  },
};

interface SkillsPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    visibility?: string;
    score?: string;
  }>;
}

const VALID_SORTS: SortOption[] = ['updated', 'downloads', 'stars', 'score', 'name'];
const VALID_VISIBILITY: VisibilityFilter[] = ['all', 'public', 'private'];
const VALID_SCORE: ScoreBucket[] = ['all', 'high', 'medium', 'low'];

function parseSortParam(raw: string | undefined): SortOption {
  if (raw && (VALID_SORTS as string[]).includes(raw)) return raw as SortOption;
  return 'updated';
}

function parseVisibilityParam(raw: string | undefined): VisibilityFilter {
  if (raw && (VALID_VISIBILITY as string[]).includes(raw)) return raw as VisibilityFilter;
  return 'all';
}

function parseScoreParam(raw: string | undefined): ScoreBucket {
  if (raw && (VALID_SCORE as string[]).includes(raw)) return raw as ScoreBucket;
  return 'all';
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  if (process.env.TANK_PERF_MODE === '1') noStore();

  const params = await searchParams;
  const query = params.q ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const limit = 20;
  const sort = parseSortParam(params.sort);
  const visibility = parseVisibilityParam(params.visibility);
  const scoreBucket = parseScoreParam(params.score);

  if (query) noStore();

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const isLoggedIn = Boolean(session?.user);

  const data = await searchSkills({
    q: query,
    page,
    limit,
    sort,
    visibility,
    scoreBucket,
    requesterUserId: session?.user?.id ?? null,
  });

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div className="space-y-6" data-testid="skills-list-root">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Skills</h1>
        <p className="mt-2 text-muted-foreground">
          Discover verified AI agent skills for your projects.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <Suspense>
          <SkillsFilters
            currentVisibility={visibility}
            currentScoreBucket={scoreBucket}
            isLoggedIn={isLoggedIn}
          />
        </Suspense>

        <div className="flex-1 min-w-0 space-y-4">
          <SearchBar defaultValue={query} />

          <Suspense>
            <SkillsResults
              results={data.results}
              totalCount={data.total}
              currentSort={sort}
              currentQuery={query}
            />
          </Suspense>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              query={query}
              sort={sort}
              visibility={visibility}
              scoreBucket={scoreBucket}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  query,
  sort,
  visibility,
  scoreBucket,
}: {
  page: number;
  totalPages: number;
  query: string;
  sort: SortOption;
  visibility: VisibilityFilter;
  scoreBucket: ScoreBucket;
}) {
  function buildHref(p: number) {
    const urlParams = new URLSearchParams();
    if (query) urlParams.set('q', query);
    if (sort !== 'updated') urlParams.set('sort', sort);
    if (visibility !== 'all') urlParams.set('visibility', visibility);
    if (scoreBucket !== 'all') urlParams.set('score', scoreBucket);
    if (p > 1) urlParams.set('page', String(p));
    const qs = urlParams.toString();
    return `/skills${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="flex items-center justify-center gap-4" data-testid="skills-pagination">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={buildHref(page - 1)}>Previous</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Previous
        </Button>
      )}

      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={buildHref(page + 1)}>Next</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Next
        </Button>
      )}
    </div>
  );
}
