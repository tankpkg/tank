import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import type { ScanFinding } from '~/lib/skills/data';

export interface FindingsTableProps {
  findings: ScanFinding[];
}

const severityColor: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 dark:bg-red-950',
  high: 'text-orange-600 bg-orange-50 dark:bg-orange-950',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950',
  low: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
  info: 'text-muted-foreground bg-muted'
};

const TRUNCATE_LENGTH = 100;

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

export function FindingsTable({ findings }: FindingsTableProps) {
  if (findings.length === 0) {
    return <div className="rounded-lg border p-6 text-center text-muted-foreground text-sm">No findings reported.</div>;
  }

  return (
    <div className="rounded-lg border overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[90px] text-xs font-medium uppercase tracking-wide">Severity</TableHead>
            <TableHead className="w-[100px] text-xs font-medium uppercase tracking-wide">Type</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide">Description</TableHead>
            <TableHead className="w-[160px] text-xs font-medium uppercase tracking-wide">Location</TableHead>
            <TableHead className="w-[100px] text-xs font-medium uppercase tracking-wide">Tool</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: findings can have duplicate stage+type
            <TableRow key={`${f.stage}-${f.type}-${i}`} className="align-top">
              <TableCell className="min-w-0">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${severityColor[f.severity] ?? ''}`}>
                  {f.severity}
                </span>
              </TableCell>
              <TableCell className="min-w-0 font-mono text-xs">{f.type}</TableCell>
              <TableCell className="min-w-0">
                <ExpandableDescription description={f.description} evidence={f.evidence ?? null} />
              </TableCell>
              <TableCell
                className="min-w-0 font-mono text-xs text-muted-foreground truncate max-w-[160px]"
                title={f.location ?? undefined}>
                {f.location ?? '\u2014'}
              </TableCell>
              <TableCell className="min-w-0 text-xs text-muted-foreground">{f.tool ?? f.stage}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
