import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { searchSkills } from '@/lib/data/skills';
import type { SkillSearchResult, SortOption, VisibilityFilter, ScoreBucket } from '@/lib/data/skills';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { SearchBar } from './search-bar';

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
    <div className="space-y-8" data-testid="skills-list-root">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Skills</h1>
        <p className="mt-2 text-muted-foreground">
          Discover verified AI agent skills for your projects.
        </p>
      </div>

      <SearchBar defaultValue={query} />

      {data.results.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="skills-grid">
            {data.results.map((skill) => (
              <SkillCard key={skill.name} skill={skill} isLoggedIn={isLoggedIn} />
            ))}
          </div>

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
        </>
      ) : (
        <EmptyState query={query} />
      )}
    </div>
  );
}

function SkillCard({
  skill,
  isLoggedIn,
}: {
  skill: SkillSearchResult;
  isLoggedIn: boolean;
}) {
  return (
    <Link href={`/skills/${encodeURIComponent(skill.name)}`}>
      <Card className="h-full cursor-pointer transition-colors hover:border-primary/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
            {isLoggedIn && skill.visibility === 'private' && (
              <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
          {skill.description && (
            <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {skill.latestVersion && <Badge variant="secondary">v{skill.latestVersion}</Badge>}
            {skill.auditScore !== null && (
              <Badge variant={skill.auditScore >= 7 ? 'default' : 'destructive'}>
                Score: {skill.auditScore}
              </Badge>
            )}
            <span>{skill.downloads.toLocaleString()} downloads</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <p className="text-lg font-medium">
        {query ? 'No skills found' : 'No skills published yet'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? `No results for "${query}". Try a different search term.`
          : 'Be the first to publish a skill!'}
      </p>
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
