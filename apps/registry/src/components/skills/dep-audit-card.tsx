import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import type { DepAuditData } from '~/lib/skills/data';

const severityBadgeClass: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
};

function scoreDotClass(score: number | null): string {
  if (score === null) return 'bg-muted';
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-yellow-500';
  if (score >= 0.2) return 'bg-orange-500';
  return 'bg-red-500';
}

function PackageRow({
  pkg,
  expanded,
  onToggle
}: {
  pkg: DepAuditData['packages'][0];
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasVulns = pkg.vulns.length > 0;

  return (
    <>
      <TableRow className="align-top">
        <TableCell className="min-w-0 font-medium">{pkg.name}</TableCell>
        <TableCell className="min-w-0 font-mono text-xs text-muted-foreground">{pkg.version}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <div className={`h-2 w-2 rounded-full ${scoreDotClass(pkg.overallScore)}`} />
            {pkg.overallScore !== null && <span className="text-xs">{Math.round(pkg.overallScore * 100)}</span>}
          </div>
        </TableCell>
        <TableCell className="text-right">
          {hasVulns ? (
            <span className="text-xs font-medium text-destructive">{pkg.vulns.length}</span>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </TableCell>
        <TableCell>
          {hasVulns && (
            <Button variant="ghost" size="xs" onClick={onToggle}>
              {expanded ? 'Hide' : 'Show'}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded &&
        pkg.vulns.map((vuln) => (
          <TableRow key={vuln.id} className="bg-muted/30">
            <TableCell colSpan={5} className="py-2 pl-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${severityBadgeClass[vuln.severity] ?? 'bg-muted text-muted-foreground'}`}>
                  {vuln.severity}
                </Badge>
                <span className="text-sm">{vuln.title}</span>
                {vuln.cve && (
                  <a
                    href={vuln.url ?? `https://nvd.nist.gov/vuln/detail/${vuln.cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-600 hover:underline">
                    {vuln.cve}
                  </a>
                )}
                {vuln.url && !vuln.cve && (
                  <a
                    href={vuln.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline">
                    View
                  </a>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}

export interface DepAuditCardProps {
  depAudit: DepAuditData | null;
}

export function DepAuditCard({ depAudit }: DepAuditCardProps) {
  const [expandedPkgs, setExpandedPkgs] = useState<Set<string>>(new Set());

  if (!depAudit) return null;

  const togglePkg = (name: string) => {
    setExpandedPkgs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (depAudit.status === 'failed' || depAudit.status === 'partial_failure') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dependency Audit</CardTitle>
          <CardDescription>Unavailable</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Dependency audit data is temporarily unavailable.</p>
        </CardContent>
      </Card>
    );
  }

  if (depAudit.packageCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dependency Audit</CardTitle>
          <CardDescription>No dependencies found</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[--tank-green-ui]">
            Clean bill of health -- no dependencies, no vulnerabilities detected
          </p>
        </CardContent>
      </Card>
    );
  }

  const { packages: pkgList, vulnSummary, tldr, healthScore, vulnerableCount, ecosystem } = depAudit;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dependency Audit</CardTitle>
            <CardDescription>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {ecosystem === 'npm'
                  ? 'Node.js / npm registry'
                  : ecosystem === 'pypi'
                    ? 'Python / PyPI'
                    : ecosystem === 'mixed'
                      ? 'Mixed ecosystems'
                      : 'No dependencies'}
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                role="status"
                className={`h-2 w-2 rounded-full ${scoreDotClass(healthScore)}`}
                aria-label={`Health score: ${healthScore !== null ? Math.round(healthScore * 100) : 'N/A'}`}
              />
              {healthScore !== null && <span className="text-xs font-medium">{Math.round(healthScore * 100)}</span>}
            </div>
            {vulnerableCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {vulnerableCount} {vulnerableCount === 1 ? 'vulnerability' : 'vulnerabilities'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {tldr && <p className="text-sm font-medium">{tldr}</p>}

        {vulnSummary && vulnSummary.critical + vulnSummary.high + vulnSummary.medium + vulnSummary.low > 0 && (
          <div className="flex flex-wrap gap-2">
            {vulnSummary.critical > 0 && (
              <Badge variant="destructive" className="text-xs">
                {vulnSummary.critical} critical
              </Badge>
            )}
            {vulnSummary.high > 0 && (
              <Badge className="border-orange-500 bg-orange-50 text-orange-700 text-xs dark:bg-orange-950 dark:text-orange-300">
                {vulnSummary.high} high
              </Badge>
            )}
            {vulnSummary.medium > 0 && (
              <Badge className="border-yellow-500 bg-yellow-50 text-yellow-700 text-xs dark:bg-yellow-950 dark:text-yellow-300">
                {vulnSummary.medium} medium
              </Badge>
            )}
            {vulnSummary.low > 0 && (
              <Badge className="border-blue-500 bg-blue-50 text-blue-700 text-xs dark:bg-blue-950 dark:text-blue-300">
                {vulnSummary.low} low
              </Badge>
            )}
          </div>
        )}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Package</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Version</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-right">Health</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-right">Vulns</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pkgList.map((pkg) => (
                <PackageRow
                  key={pkg.name}
                  pkg={pkg}
                  expanded={expandedPkgs.has(pkg.name)}
                  onToggle={() => togglePkg(pkg.name)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
