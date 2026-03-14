import { encodeSkillName } from "@internal/shared";
import { Download, Lock, Star } from "lucide-react";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrustBadge, VerifiedPublisherBadge } from "@/components/security";
import { auth } from "@/lib/auth";
import { formatInstallCount, formatLastScanLabel } from "@/lib/trust-signals";
import { computeTrustLevel } from "@/lib/trust-level";
import type {
  FreshnessBucket,
  PopularityBucket,
  ScoreBucket,
  SkillSearchResult,
  SortOption,
  VisibilityFilter,
} from "@/lib/data/skills";
import { searchSkills } from "@/lib/data/skills";
import { SearchBar } from "./search-bar";
import { SkillsFilters } from "./skills-filters";
import { SkillsSort } from "./skills-sort";

export const revalidate = 60;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.tankpkg.dev";

export const metadata: Metadata = {
  title: "Browse AI Agent Skills",
  description:
    "Discover, compare, and install security-verified AI agent skills. Every skill is scanned for credential theft, prompt injection, and supply chain attacks.",
  alternates: { canonical: `${BASE_URL}/skills` },
  openGraph: {
    title: "Browse AI Agent Skills — Tank",
    description: "Discover, compare, and install security-verified AI agent skills.",
    url: `${BASE_URL}/skills`,
    type: "website",
    siteName: "Tank",
  },
};

interface SkillsPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    visibility?: string;
    score?: string;
    freshness?: string;
    popularity?: string;
    docs?: string;
  }>;
}

const VALID_SORTS: SortOption[] = ["updated", "downloads", "stars", "security", "name"];
const VALID_VISIBILITY: VisibilityFilter[] = ["all", "public", "private"];
const VALID_SCORE: ScoreBucket[] = ["all", "high", "medium", "low"];
const VALID_FRESHNESS: FreshnessBucket[] = ["all", "week", "month", "year"];
const VALID_POPULARITY: PopularityBucket[] = ["all", "popular", "growing", "new"];

function parseSortParam(raw: string | undefined): SortOption {
  if (raw && (VALID_SORTS as string[]).includes(raw)) return raw as SortOption;
  return "updated";
}

function parseVisibilityParam(raw: string | undefined): VisibilityFilter {
  if (raw && (VALID_VISIBILITY as string[]).includes(raw)) return raw as VisibilityFilter;
  return "all";
}

function parseScoreParam(raw: string | undefined): ScoreBucket {
  if (raw && (VALID_SCORE as string[]).includes(raw)) return raw as ScoreBucket;
  return "all";
}

function parseFreshnessParam(raw: string | undefined): FreshnessBucket {
  if (raw && (VALID_FRESHNESS as string[]).includes(raw)) return raw as FreshnessBucket;
  return "all";
}

function parsePopularityParam(raw: string | undefined): PopularityBucket {
  if (raw && (VALID_POPULARITY as string[]).includes(raw)) return raw as PopularityBucket;
  return "all";
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  if (process.env.TANK_PERF_MODE === "1") noStore();

  const params = await searchParams;
  const query = params.q ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;
  const sort = parseSortParam(params.sort);
  const visibility = parseVisibilityParam(params.visibility);
  const scoreBucket = parseScoreParam(params.score);
  const freshness = parseFreshnessParam(params.freshness);
  const popularity = parsePopularityParam(params.popularity);
  const hasReadme = params.docs === "1";

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
    freshness,
    popularity,
    hasReadme: hasReadme || undefined,
    requesterUserId: session?.user?.id ?? null,
  });

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  const countLabel = query
    ? `${data.total.toLocaleString()} result${data.total !== 1 ? "s" : ""} for "${query}"`
    : `${data.total.toLocaleString()} skill${data.total !== 1 ? "s" : ""}`;

  return (
    <div className="space-y-6" data-testid="skills-list-root">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Skills</h1>
        <p className="mt-2 text-muted-foreground">Discover verified AI agent skills for your projects.</p>
      </div>

      <SearchBar defaultValue={query} />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Suspense fallback={<FiltersSkeleton />}>
          <SkillsFilters
            currentVisibility={visibility}
            currentScoreBucket={scoreBucket}
            currentFreshness={freshness}
            currentPopularity={popularity}
            currentHasReadme={hasReadme}
            isLoggedIn={isLoggedIn}
          />
        </Suspense>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground" data-testid="skills-count">
              {countLabel}
            </p>
            <Suspense fallback={null}>
              <SkillsSort currentSort={sort} />
            </Suspense>
          </div>

          {data.results.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="skills-grid">
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
                  freshness={freshness}
                  popularity={popularity}
                  hasReadme={hasReadme}
                />
              )}
            </>
          ) : (
            <EmptyState query={query} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Inline components ──────────────────────────────────────────────────── */

function FiltersSkeleton() {
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
    <Link href={`/skills/${encodeSkillName(skill.name)}`}>
      <Card className="h-full cursor-pointer transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
            <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
              {skill.publisherVerified && <VerifiedPublisherBadge compact />}
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
            <TrustBadge
              trustLevel={computeTrustLevel(
                skill.verdict,
                skill.criticalCount,
                skill.highCount,
                skill.mediumCount,
                skill.lowCount,
              )}
              findings={{
                critical: skill.criticalCount,
                high: skill.highCount,
                medium: skill.mediumCount,
                low: skill.lowCount,
              }}
              size="sm"
            />
            <span className="flex items-center gap-1 ml-auto">
              <Download className="size-3" />
              {formatInstallCount(skill.downloads)}
            </span>
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {skill.stars.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{formatLastScanLabel(skill.scannedAt)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 py-16 text-center">
      <p className="text-lg font-medium">{query ? "No skills found" : "No skills published yet"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? `No results for "${query}". Try a different search term or adjust filters.`
          : "Be the first to publish a skill!"}
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
  freshness,
  popularity,
  hasReadme,
}: {
  page: number;
  totalPages: number;
  query: string;
  sort: SortOption;
  visibility: VisibilityFilter;
  scoreBucket: ScoreBucket;
  freshness: FreshnessBucket;
  popularity: PopularityBucket;
  hasReadme: boolean;
}) {
  function buildHref(p: number) {
    const urlParams = new URLSearchParams();
    if (query) urlParams.set("q", query);
    if (sort !== "updated") urlParams.set("sort", sort);
    if (visibility !== "all") urlParams.set("visibility", visibility);
    if (scoreBucket !== "all") urlParams.set("score", scoreBucket);
    if (freshness !== "all") urlParams.set("freshness", freshness);
    if (popularity !== "all") urlParams.set("popularity", popularity);
    if (hasReadme) urlParams.set("docs", "1");
    if (p > 1) urlParams.set("page", String(p));
    const qs = urlParams.toString();
    return `/skills${qs ? `?${qs}` : ""}`;
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
