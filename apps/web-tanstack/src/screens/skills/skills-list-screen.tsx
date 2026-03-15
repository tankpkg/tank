import { encodeSkillName } from '@internals/helpers';
import { Link } from '@tanstack/react-router';
import { Download, Lock, Star } from 'lucide-react';

import { SearchBar } from '~/components/skills/search-bar';
import { SkillsFilters } from '~/components/skills/skills-filters';
import { SkillsSort } from '~/components/skills/skills-sort';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import type {
  FreshnessBucket,
  PopularityBucket,
  ScoreBucket,
  SkillSearchResponse,
  SkillSearchResult,
  SortOption,
  VisibilityFilter
} from '~/lib/skills/data';

export interface SkillsListScreenProps {
  data: SkillSearchResponse;
  query: string;
  page: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  scoreBucket: ScoreBucket;
  freshness: FreshnessBucket;
  popularity: PopularityBucket;
  hasReadme: boolean;
  isLoggedIn: boolean;
}

const LIMIT = 20;

export function SkillsListScreen({
  data,
  query,
  page,
  sort,
  visibility,
  scoreBucket,
  freshness,
  popularity,
  hasReadme,
  isLoggedIn
}: SkillsListScreenProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  const countLabel = query
    ? `${data.total.toLocaleString()} result${data.total !== 1 ? 's' : ''} for "${query}"`
    : `${data.total.toLocaleString()} skill${data.total !== 1 ? 's' : ''}`;

  return (
    <div className="space-y-6" data-testid="skills-list-root">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Skills</h1>
        <p className="mt-2 text-muted-foreground">Discover verified AI agent skills for your projects.</p>
      </div>

      <SearchBar defaultValue={query} />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SkillsFilters
          currentVisibility={visibility}
          currentScoreBucket={scoreBucket}
          currentFreshness={freshness}
          currentPopularity={popularity}
          currentHasReadme={hasReadme}
          isLoggedIn={isLoggedIn}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground" data-testid="skills-count">
              {countLabel}
            </p>
            <SkillsSort currentSort={sort} />
          </div>

          {data.results.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="skills-grid">
                {data.results.map((skill) => (
                  <SkillCard key={skill.name} skill={skill} isLoggedIn={isLoggedIn} />
                ))}
              </div>

              {totalPages > 1 && <Pagination page={page} totalPages={totalPages} />}
            </>
          ) : (
            <EmptyState query={query} />
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Inline components ---------------------------------------------------- */

export function FiltersSkeleton() {
  return (
    <aside>
      <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-5 animate-pulse">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-7 w-full rounded bg-muted" />
          <div className="h-7 w-full rounded bg-muted" />
          <div className="h-7 w-full rounded bg-muted" />
        </div>
      </div>
    </aside>
  );
}

function SkillCard({ skill, isLoggedIn }: { skill: SkillSearchResult; isLoggedIn: boolean }) {
  return (
    <Link to="/skills/$" params={{ _splat: encodeSkillName(skill.name) }}>
      <Card className="h-full cursor-pointer transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
            {isLoggedIn && skill.visibility === 'private' && (
              <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
          {skill.description && <CardDescription className="line-clamp-2 text-xs">{skill.description}</CardDescription>}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {skill.latestVersion && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                v{skill.latestVersion}
              </Badge>
            )}
            {skill.auditScore !== null && <ScoreBadge score={skill.auditScore} />}
            <span className="flex items-center gap-1 ml-auto">
              <Download className="size-3" />
              {skill.downloads.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {skill.stars.toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 7) {
    return <Badge className="text-[10px] px-1.5 py-0 tank-badge-success border">Score: {score}</Badge>;
  }
  if (score >= 4) {
    return <Badge className="text-[10px] px-1.5 py-0 tank-badge-warning border">Score: {score}</Badge>;
  }
  return (
    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
      Score: {score}
    </Badge>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 py-16 text-center">
      <p className="text-lg font-medium">{query ? 'No skills found' : 'No skills published yet'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? `No results for "${query}". Try a different search term or adjust filters.`
          : 'Be the first to publish a skill!'}
      </p>
    </div>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  function buildSearch(p: number) {
    return ((prev: Record<string, unknown>) => ({ ...prev, page: p })) as never;
  }

  return (
    <div className="flex items-center justify-center gap-4" data-testid="skills-pagination">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link to="/skills" search={buildSearch(page - 1 > 1 ? page - 1 : 1)}>
            Previous
          </Link>
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
          <Link to="/skills" search={buildSearch(page + 1)}>
            Next
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Next
        </Button>
      )}
    </div>
  );
}
