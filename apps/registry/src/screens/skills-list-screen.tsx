import { encodeSkillName } from "@internals/helpers";
import { Link } from "@tanstack/react-router";
import { Download, Lock, ShieldAlert, ShieldCheck, Star } from "lucide-react";

import { AtomKindBadges } from "~/components/skills/atom-kind-badge";
import { MobileSkillsFilters } from "~/components/skills/mobile-skills-filters";
import { SearchBar } from "~/components/skills/search-bar";
import { SkillsFilters } from "~/components/skills/skills-filters";
import { SkillsSort } from "~/components/skills/skills-sort";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type {
  FreshnessBucket,
  PopularityBucket,
  SecurityVerdict,
  SkillSearchResponse,
  SkillSearchResult,
  SortOption,
  VisibilityFilter,
} from "~/lib/skills/data";

export interface SkillsListScreenProps {
  data: SkillSearchResponse;
  query: string;
  page: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  securityVerdict: SecurityVerdict;
  freshness: FreshnessBucket;
  popularity: PopularityBucket;
  hasReadme: boolean;
  isLoggedIn: boolean;
  atomKind?: string;
}

const LIMIT = 20;

export function SkillsListScreen({
  data,
  query,
  page,
  sort,
  visibility,
  securityVerdict,
  freshness,
  popularity,
  hasReadme,
  isLoggedIn,
  atomKind,
}: SkillsListScreenProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  const countLabel = query
    ? `${data.total.toLocaleString()} result${data.total !== 1 ? "s" : ""} for "${query}"`
    : `${data.total.toLocaleString()} package${data.total !== 1 ? "s" : ""}`;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6" data-testid="skills-list-root">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Packages</h1>
        <p className="mt-2 text-muted-foreground">Discover verified AI agent packages for your projects.</p>
      </div>

      <SearchBar defaultValue={query} />

      <MobileSkillsFilters
        currentVisibility={visibility}
        currentSecurityVerdict={securityVerdict}
        currentFreshness={freshness}
        currentPopularity={popularity}
        currentHasReadme={hasReadme}
        isLoggedIn={isLoggedIn}
        currentAtomKind={atomKind}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <SkillsFilters
            currentVisibility={visibility}
            currentSecurityVerdict={securityVerdict}
            currentFreshness={freshness}
            currentPopularity={popularity}
            currentHasReadme={hasReadme}
            isLoggedIn={isLoggedIn}
            currentAtomKind={atomKind}
          />
        </div>

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

const verdictConfig: Record<string, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  pass: { label: "Pass", className: "text-green-600", Icon: ShieldCheck },
  pass_with_notes: { label: "Notes", className: "text-yellow-600", Icon: ShieldCheck },
  flagged: { label: "Flagged", className: "text-orange-600", Icon: ShieldAlert },
  fail: { label: "Unsafe", className: "text-red-600", Icon: ShieldAlert },
};

function SkillCard({ skill, isLoggedIn }: { skill: SkillSearchResult; isLoggedIn: boolean }) {
  const verdict = skill.scanVerdict ? verdictConfig[skill.scanVerdict] : null;

  return (
    <Card className="relative h-full transition-colors hover:border-primary/50" data-testid="skill-card">
      <Link
        to="/skills/$"
        params={{ _splat: encodeSkillName(skill.name) }}
        className="absolute inset-0 rounded-[inherit]"
        aria-label={skill.name}
      />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {verdict && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${verdict.className}`}>
                <verdict.Icon className="size-3" />
                {verdict.label}
              </span>
            )}
            {isLoggedIn && skill.visibility === "private" && <Lock className="size-3.5 text-muted-foreground" />}
          </div>
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
          <span className="flex items-center gap-1 ml-auto">
            <Download className="size-3" />
            {skill.downloads.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Star className="size-3" />
            {skill.stars.toLocaleString()}
          </span>
        </div>
        <div className="relative z-10 mt-1.5">
          <AtomKindBadges kinds={skill.atomKinds ?? ["skill"]} size="xs" asLinks />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 py-16 text-center">
      <p className="text-lg font-medium">{query ? "No packages found" : "No packages published yet"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? `No results for "${query}". Try a different search term or adjust filters.`
          : "Be the first to publish a package!"}
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
