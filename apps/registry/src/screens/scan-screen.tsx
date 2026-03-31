import { useState } from 'react';

import { FindingsTable } from '~/components/skills/findings-table';
import { TrustBadge } from '~/components/skills/trust-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { useClipboard } from '~/lib/useClipboard';

interface ScanResult {
  verdict: string;
  findings: Array<{
    stage: string;
    severity: string;
    type: string;
    description: string;
    location: string | null;
    confidence: number | null;
    tool: string | null;
    evidence: string | null;
    llm_verdict?: string | null;
    llm_reviewed?: boolean;
    remediation?: string | null;
    cwe_id?: string | null;
  }>;
  duration_ms: number;
  stage_results: Array<{
    stage: string;
    status: string;
    duration_ms: number;
  }>;
}

type ScanState = 'idle' | 'loading' | 'success' | 'error';

export function ScanPage() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copiedLabel, copy } = useClipboard();

  async function handleScan() {
    if (!url.trim()) return;

    setState('loading');
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v1/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
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

  const criticalCount = result?.findings.filter((f) => f.severity === 'critical').length ?? 0;
  const highCount = result?.findings.filter((f) => f.severity === 'high').length ?? 0;
  const mediumCount = result?.findings.length ? result.findings.filter((f) => f.severity === 'medium').length : 0;

  return (
    <div className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Security Scanner</h1>
        <p className="mt-1 text-muted-foreground">Scan any npm package or tarball URL for security vulnerabilities.</p>
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl font-semibold tracking-tight">Scan a Package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://registry.npmjs.org/@scope/package/-/package-1.0.0.tgz"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              disabled={state === 'loading'}
              className="flex-1"
            />
            <Button onClick={handleScan} disabled={state === 'loading' || !url.trim()}>
              {state === 'loading' ? 'Scanning...' : 'Scan Now'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports npm registry URLs, GitHub release tarballs, and any HTTPS URL ending in .tar.gz or .tgz
          </p>
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
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl font-semibold tracking-tight">
                <div className="flex items-center justify-between">
                  <span>Scan Results</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => copy('Scan Result', JSON.stringify(result, null, 2))}>
                      {copiedLabel === 'Scan Result' ? 'Copied!' : 'Share'}
                    </Button>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <TrustBadge
                  verdict={result.verdict}
                  criticalCount={criticalCount}
                  highCount={highCount}
                  mediumCount={mediumCount}
                />
                <span className="text-sm text-muted-foreground">
                  {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''} in {result.duration_ms}ms
                </span>
              </div>

              {/* Pipeline stages */}
              {result.stage_results.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.stage_results.map((stage) => (
                    <span
                      key={stage.stage}
                      className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {stage.stage} ({stage.duration_ms}ms)
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Findings */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl font-semibold tracking-tight">Findings</CardTitle>
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
