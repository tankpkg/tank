import { ChevronDown, ChevronUp, Download, ExternalLink, RefreshCw, ShieldCheck, ShieldX, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { SecurityOverview } from '~/components/skills/security-overview';
import { TrustBadge } from '~/components/skills/trust-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

// ── Types ────────────────────────────────────────────────────────────────────

type SourceFilter = 'internal' | 'external' | 'all';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface InternalSkillSummary {
  name: string;
  description: string | null;
  latestVersion: string | null;
  scanVerdict: string | null;
  publisher: string;
  downloads: number;
  url: string | null;
  severityCounts: SeverityCounts;
}

interface ExternalSkillSummary {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  installCount: number;
  scanVerdict: string | null;
  url: string;
  severityCounts: SeverityCounts;
}

interface TopSkillsResponse {
  internal: InternalSkillSummary[];
  external: ExternalSkillSummary[];
  total: number;
}

// ── Severity count helpers ───────────────────────────────────────────────────

function verdictToSummary(verdict: string | null): string {
  if (!verdict || verdict === 'pending') return 'Not scanned';
  if (verdict === 'pass') return 'Clean';
  if (verdict === 'pass_with_notes') return 'Passed with notes';
  if (verdict === 'flagged') return 'Flagged';
  if (verdict === 'fail') return 'Unsafe';
  return verdict;
}

function isClean(verdict: string | null): boolean {
  return verdict === 'pass';
}

function hasIssues(verdict: string | null): boolean {
  return verdict === 'flagged' || verdict === 'fail' || verdict === 'pass_with_notes';
}

// ── Internal skill card ─────────────────────────────────────────────────────

function InternalSkillCard({ skill }: { skill: InternalSkillSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="font-display text-lg font-semibold tracking-tight truncate">{skill.name}</CardTitle>
            {skill.publisher && <p className="mt-0.5 text-xs text-muted-foreground">by {skill.publisher}</p>}
          </div>
          <TrustBadge verdict={skill.scanVerdict} criticalCount={skill.severityCounts.critical} highCount={skill.severityCounts.high} mediumCount={skill.severityCounts.medium} />
        </div>
        {skill.description && <CardDescription className="mt-1 line-clamp-2">{skill.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {isClean(skill.scanVerdict) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
              <ShieldCheck className="size-3" />
              {verdictToSummary(skill.scanVerdict)}
            </span>
          )}
          {hasIssues(skill.scanVerdict) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-400">
              <ShieldX className="size-3" />
              {verdictToSummary(skill.scanVerdict)}
            </span>
          )}
          {!skill.scanVerdict && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Not scanned
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="size-3" />
            {skill.downloads.toLocaleString()}
          </span>
          {skill.latestVersion && (
            <span className="font-mono text-xs text-muted-foreground">v{skill.latestVersion}</span>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="w-full justify-between">
          <span className="text-xs">
            {skill.scanVerdict === 'pass' ? 'Why safe' : skill.scanVerdict ? 'View details' : 'Scan this skill'}
          </span>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>

        {expanded && (
          <div className="space-y-4 border-t pt-4">
            {skill.scanVerdict ? (
              <>
                <SecurityOverview
                  verdict={skill.scanVerdict}
                  durationMs={null}
                  scannedAt={null}
                  criticalCount={skill.severityCounts.critical}
                  highCount={skill.severityCounts.high}
                  mediumCount={skill.severityCounts.medium}
                  lowCount={skill.severityCounts.low}
                  llmAnalysis={null}
                />
                <p className="text-xs text-muted-foreground">
                  Full findings available on the{' '}
                  <a href={`/skills/${encodeURIComponent(skill.name)}`} className="text-blue-500 hover:underline">
                    skill detail page
                  </a>
                  .
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This skill has not been scanned yet.{' '}
                <a href={`/scan`} className="text-blue-500 hover:underline">
                  Run a scan
                </a>
                .
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── External skill card ─────────────────────────────────────────────────────

function ExternalSkillCard({ skill }: { skill: ExternalSkillSummary }) {
  const [expanded, setExpanded] = useState(false);

  // Parse scan result findings from external_skills cache (not available in summary API)
  const clean = isClean(skill.scanVerdict);
  const issues = hasIssues(skill.scanVerdict);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="font-display text-lg font-semibold tracking-tight truncate">{skill.name}</CardTitle>
            {skill.author && <p className="mt-0.5 text-xs text-muted-foreground">by {skill.author}</p>}
          </div>
          <TrustBadge verdict={skill.scanVerdict} criticalCount={skill.severityCounts.critical} highCount={skill.severityCounts.high} mediumCount={skill.severityCounts.medium} />
        </div>
        {skill.description && <CardDescription className="mt-1 line-clamp-2">{skill.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {clean && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
              <ShieldCheck className="size-3" />
              Clean
            </span>
          )}
          {issues && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-400">
              <ShieldX className="size-3" />
              {verdictToSummary(skill.scanVerdict)}
            </span>
          )}
          {!skill.scanVerdict && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Not scanned
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            {skill.installCount.toLocaleString()} installs
          </span>
        </div>

        <div className="flex gap-2">
          <a
            href={skill.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <ExternalLink className="size-3" />
            Source
          </a>
          <a href={`/scan`} className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
            Scan
          </a>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="w-full justify-between">
          <span className="text-xs">{clean ? 'Why safe' : skill.scanVerdict ? 'Why flagged' : 'View details'}</span>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>

        {expanded && (
          <div className="space-y-4 border-t pt-4">
            {skill.scanVerdict ? (
              <SecurityOverview
                verdict={skill.scanVerdict}
                durationMs={null}
                scannedAt={null}
                criticalCount={skill.severityCounts.critical}
                highCount={skill.severityCounts.high}
                mediumCount={skill.severityCounts.medium}
                lowCount={skill.severityCounts.low}
                llmAnalysis={null}
              />
            ) : (
              <p className="text-sm text-muted-foreground">This external skill has not been scanned yet.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
        <Card key={i} className="min-w-0 animate-pulse">
          <CardHeader className="pb-3">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="mt-2 h-3 w-1/3 rounded bg-muted" />
            <div className="mt-2 h-4 w-full rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded bg-muted" />
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

type FetchState = 'loading' | 'success' | 'error';

export function TopSkillsScreen() {
  const [source, setSource] = useState<SourceFilter>('all');
  const [state, setState] = useState<FetchState>('loading');
  const [data, setData] = useState<TopSkillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTopSkills = useCallback(async () => {
    setState('loading');
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '20',
        source,
        page: '1'
      });

      const response = await fetch(`/api/v1/skills/top?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch (${response.status})`);
      }

      const result = (await response.json()) as TopSkillsResponse;
      setData(result);
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [source]);

  useEffect(() => {
    void fetchTopSkills();
  }, [fetchTopSkills]);

  return (
    <div className="tank-shell py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Security Showcase</h1>
        <p className="mt-1 text-muted-foreground">
          Top skills ranked by popularity, with security scan verdicts at a glance.
        </p>
      </div>

      {/* Source toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'internal', 'external'] as const).map((value) => (
          <Button
            key={value}
            variant={source === value ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setSource(value)}>
            {value === 'all' ? 'All Skills' : value === 'internal' ? 'Tank Registry' : 'External Skills'}
          </Button>
        ))}
        {(state === 'success' || state === 'error') && (
          <Button variant="ghost" size="sm" onClick={() => void fetchTopSkills()} className="ml-auto">
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {/* Loading */}
      {state === 'loading' && <LoadingSkeleton />}

      {/* Error */}
      {state === 'error' && error && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={() => void fetchTopSkills()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {state === 'success' && data && (
        <div className="space-y-8">
          {/* Internal skills */}
          {(source === 'all' || source === 'internal') && data.internal.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold tracking-tight">Tank Registry</h2>
              <p className="mt-1 text-sm text-muted-foreground">Skills published on Tank, ranked by downloads.</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.internal.map((skill) => (
                  <div key={skill.name} className="min-w-0">
                    <InternalSkillCard skill={skill} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* External skills */}
          {(source === 'all' || source === 'external') && data.external.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold tracking-tight">External Skills (skills.sh)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Popular skills from the broader ecosystem, ranked by installs.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.external.map((skill) => (
                  <div key={skill.id} className="min-w-0">
                    <ExternalSkillCard skill={skill} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {data.internal.length === 0 && data.external.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No skills found.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
