import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { FindingsTable } from '~/components/skills/findings-table';
import { buildScanningTools, ScanningToolsStrip } from '~/components/skills/scanning-tools-strip';
import { SecurityOverview } from '~/components/skills/security-overview';
import { TrustBadge } from '~/components/skills/trust-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import type { ScanFinding } from '~/lib/skills/data';
import { useClipboard } from '~/lib/useClipboard';

interface ScanResult {
  verdict: string;
  findings: ScanFinding[];
  duration_ms: number;
  stage_results: Array<{
    stage: string;
    status: string;
    duration_ms: number;
    findings?: ScanFinding[];
  }>;
  llm_analysis?: {
    enabled: boolean;
    mode: string;
    providers?: Array<{ name: string; model: string; status: string; latency_ms: number | null }>;
  } | null;
}

type ScanState = 'idle' | 'loading' | 'success' | 'error';

const URL_EXAMPLES = [
  'https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md',
  'https://github.com/owner/repo/tree/main/skill-dir',
  'https://raw.githubusercontent.com/owner/repo/main/SKILL.md',
  'https://skills.sh/owner/repo/skill-name',
  'https://agentskills.co.il/he/skills/category/skill-name'
];

export function ScanPage({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copiedLabel, copy } = useClipboard();
  const [placeholder] = useState(() => URL_EXAMPLES[0]);
  const lastAutoScannedUrl = useRef<string | null>(null);

  async function handleScan(targetUrl?: string) {
    const scanUrl = targetUrl ?? url;
    if (!scanUrl.trim()) return;

    setState('loading');
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scanUrl.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        setState('error');
        setError(data.error || `Scan failed (${response.status})`);
        return;
      }

      setResult(data);
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  // Auto-scan when deep-linked with ?url= parameter
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — run once per unique initialUrl
  useEffect(() => {
    if (initialUrl && lastAutoScannedUrl.current !== initialUrl) {
      lastAutoScannedUrl.current = initialUrl;
      void handleScan(initialUrl);
    }
  }, [initialUrl]);

  const criticalCount = result?.findings.filter((f) => f.severity === 'critical').length ?? 0;
  const highCount = result?.findings.filter((f) => f.severity === 'high').length ?? 0;
  const mediumCount = result?.findings.filter((f) => f.severity === 'medium').length ?? 0;
  const lowCount = result?.findings.filter((f) => f.severity === 'low').length ?? 0;

  const stagesRun =
    result?.stage_results?.filter((s) => s.status === 'passed' || s.status === 'failed').map((s) => s.stage) ?? [];

  const ingestFailure = result?.findings.find((f) => f.stage === 'stage0' && f.severity === 'critical');

  return (
    <div className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Security Scanner</h1>
        <p className="mt-1 text-muted-foreground">
          Scan any npm package, GitHub repo, raw file, skills.sh, or agentskills.co.il link for security
          vulnerabilities.{' '}
          <Link to="/scan/top-skills" className="text-blue-500 hover:underline">
            Browse top skills
          </Link>
        </p>
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl font-semibold tracking-tight">Scan a Package or Skill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              placeholder={placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              disabled={state === 'loading'}
              className="flex-1"
            />
            <Button onClick={() => void handleScan()} disabled={state === 'loading' || !url.trim()}>
              {state === 'loading' ? 'Scanning...' : 'Scan Now'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Supports:</span>
            {[
              'npm tarballs',
              'GitHub repos',
              'GitHub folders',
              'Raw .md files',
              'skills.sh links',
              'agentskills.co.il'
            ].map((type) => (
              <span
                key={type}
                className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {type}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {state === 'loading' && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4 text-muted-foreground">Running security scan...</p>
            <p className="text-xs text-muted-foreground">This may take up to 55 seconds</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <Card>
          <CardContent className="py-6">
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {state === 'success' && result && (
        <div className="space-y-6">
          {/* Ingest failure warning */}
          {ingestFailure && (
            <Card className="border-amber-300 dark:border-amber-800">
              <CardContent className="py-4 space-y-2">
                <p role="alert" className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Package download failed
                </p>
                <p className="text-sm text-muted-foreground break-words">
                  {ingestFailure.description.length > 200
                    ? `${ingestFailure.description.slice(0, 200)}...`
                    : ingestFailure.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Security Overview */}
          <SecurityOverview
            verdict={result.verdict}
            durationMs={result.duration_ms}
            scannedAt={new Date().toISOString()}
            criticalCount={criticalCount}
            highCount={highCount}
            mediumCount={mediumCount}
            lowCount={lowCount}
            llmAnalysis={
              result.llm_analysis
                ? {
                    enabled: result.llm_analysis.enabled,
                    mode: result.llm_analysis.mode,
                    providers: result.llm_analysis.providers?.map((p) => ({
                      name: p.name,
                      model: p.model,
                      api_key_configured: true,
                      base_url: '',
                      status: p.status,
                      latency_ms: p.latency_ms,
                      error: null
                    }))
                  }
                : null
            }
          />

          {/* Scanning Tools Strip */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-xl font-semibold tracking-tight">Scanning Tools</CardTitle>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copy('Scan Result', JSON.stringify(result, null, 2))}>
                  {copiedLabel === 'Scan Result' ? 'Copied!' : 'Share'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScanningToolsStrip
                tools={buildScanningTools({
                  stagesRun,
                  findings: result.findings,
                  llm_analysis: result.llm_analysis
                })}
              />
            </CardContent>
          </Card>

          {/* Findings Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-xl font-semibold tracking-tight">
                  Findings ({result.findings.length})
                </CardTitle>
                <TrustBadge
                  verdict={result.verdict}
                  criticalCount={criticalCount}
                  highCount={highCount}
                  mediumCount={mediumCount}
                />
              </div>
            </CardHeader>
            <CardContent>
              <FindingsTable findings={result.findings} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
