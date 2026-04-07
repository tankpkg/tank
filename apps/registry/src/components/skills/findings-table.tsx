import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import type { ScanFinding } from '~/lib/skills/data';

export interface FindingsTableProps {
  findings: ScanFinding[];
}

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  info: 'bg-muted text-muted-foreground'
};

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  info: 'bg-muted-foreground'
};

const TRUNCATE_LENGTH = 150;

const LLM_VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  confirmed_threat: { label: 'Confirmed', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  likely_benign: { label: 'Benign', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
  uncertain: { label: 'Uncertain', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400' }
};

function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">--</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

export function resolveExpandable(description: string, evidence: string | null) {
  const hasLongerEvidence = !!evidence && evidence.length > description.length;
  const isLongDescription = description.length > TRUNCATE_LENGTH;
  const expandable = hasLongerEvidence || isLongDescription;
  const collapsedText =
    isLongDescription && !hasLongerEvidence ? `${description.slice(0, TRUNCATE_LENGTH)}…` : description;
  const expandedText = hasLongerEvidence ? evidence : description;

  return { expandable, collapsedText, expandedText };
}

function ExpandableDescription({ description, evidence }: { description: string; evidence: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const { expandable, collapsedText, expandedText } = resolveExpandable(description, evidence);

  if (!expandable) {
    return <span>{description}</span>;
  }

  return (
    <div className="inline">
      <span className={expanded ? 'whitespace-pre-wrap break-words' : ''}>
        {expanded ? expandedText : collapsedText}
      </span>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-xs text-blue-500 hover:text-blue-400 hover:underline cursor-pointer whitespace-nowrap">
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

function CategoryGroup({ category, findings }: { category: string; findings: ScanFinding[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{category}</h4>
      <div className="rounded-lg border overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[80px] text-xs font-medium uppercase tracking-wide">Severity</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide">Description</TableHead>
              <TableHead className="w-[120px] text-xs font-medium uppercase tracking-wide">Confidence</TableHead>
              <TableHead className="w-[100px] text-xs font-medium uppercase tracking-wide">Tool</TableHead>
              <TableHead className="w-[60px] text-xs font-medium uppercase tracking-wide">CWE</TableHead>
              <TableHead className="w-[80px] text-xs font-medium uppercase tracking-wide">LLM</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide">How to Fix</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((f, i) => {
              const llmStyle = f.llm_verdict ? LLM_VERDICT_STYLES[f.llm_verdict] : null;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: findings can have duplicate stage+type
                <TableRow key={`${f.stage}-${f.type}-${i}`} className="align-top">
                  <TableCell className="min-w-0">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${severityColor[f.severity] ?? ''}`}>
                      <span className={`inline-block size-1.5 rounded-full ${severityDot[f.severity] ?? ''}`} />
                      {f.severity}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div>
                      <ExpandableDescription description={f.description} evidence={f.evidence ?? null} />
                    </div>
                    {f.location && (
                      <div
                        className="mt-0.5 font-mono text-xs text-muted-foreground truncate max-w-[240px]"
                        title={f.location}>
                        {f.location}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-0">
                    <ConfidenceBar value={f.confidence} />
                  </TableCell>
                  <TableCell className="min-w-0 text-xs text-muted-foreground">{f.tool ?? f.stage}</TableCell>
                  <TableCell className="min-w-0">
                    {f.cwe_id ? (
                      <a
                        href={`https://cwe.mitre.org/data/definitions/${f.cwe_id.replace('CWE-', '')}.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs font-mono text-blue-500 hover:underline">
                        {f.cwe_id}
                        <ExternalLink className="size-2.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-0">
                    {llmStyle ? (
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${llmStyle.className} border-0`}>
                        {llmStyle.label}
                      </Badge>
                    ) : f.llm_reviewed ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 border-0 bg-muted text-muted-foreground">
                        Reviewed
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-0 text-xs text-muted-foreground max-w-[200px]">
                    {f.remediation ? <span>{f.remediation}</span> : <span>--</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const CATEGORY_MAP: Record<string, string> = {
  stage0: 'Ingest & Download',
  stage1: 'Validation',
  stage2: 'Static Analysis',
  stage3: 'Injection Detection',
  stage4: 'Secrets & Credentials',
  stage5: 'Supply Chain'
};

function categorize(findings: ScanFinding[]): Map<string, ScanFinding[]> {
  const groups = new Map<string, ScanFinding[]>();
  for (const f of findings) {
    const key = CATEGORY_MAP[f.stage] ?? f.stage;
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  return groups;
}

export function FindingsTable({ findings }: FindingsTableProps) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/25 p-6 text-center text-muted-foreground text-sm">
        No findings reported.
      </div>
    );
  }

  const groups = categorize(findings);

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([category, groupFindings]) => (
        <CategoryGroup key={category} category={category} findings={groupFindings} />
      ))}
    </div>
  );
}
