import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { searchSkills } from '@/lib/data/skills';
import type { SkillSearchResult } from '@/lib/data/skills';
import { SearchBar } from './search-bar';

// ── Page ─────────────────────────────────────────────────────────────────────

interface SkillsPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const params = await searchParams;
  const query = params.q ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const limit = 20;

  // Direct DB query — no HTTP self-fetch to /api/v1/search
  const data = await searchSkills(query, page, limit);
  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Skills</h1>
        <p className="mt-2 text-muted-foreground">
          Discover verified AI agent skills for your projects.
        </p>
      </div>

      <SearchBar defaultValue={query} />

      {data.results.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.results.map((skill) => (
              <SkillCard key={skill.name} skill={skill} />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              query={query}
            />
          )}
        </>
      ) : (
        <EmptyState query={query} />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: SkillSearchResult }) {
  return (
    <Link href={`/skills/${encodeURIComponent(skill.name)}`}>
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader>
          <CardTitle className="text-base">{skill.name}</CardTitle>
          {skill.description && (
            <CardDescription className="line-clamp-2">
              {skill.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {skill.latestVersion && (
              <Badge variant="secondary">v{skill.latestVersion}</Badge>
            )}
            {skill.auditScore !== null && (
              <Badge
                variant={skill.auditScore >= 7 ? 'default' : 'destructive'}
              >
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
}: {
  page: number;
  totalPages: number;
  query: string;
}) {
  function buildHref(p: number) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/skills${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="flex items-center justify-center gap-4">
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
