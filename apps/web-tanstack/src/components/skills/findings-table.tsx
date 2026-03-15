import type { ScanFinding } from '~/lib/data/skills';

export interface FindingsTableProps {
  findings: ScanFinding[];
}

const severityColor: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 dark:bg-red-950',
  high: 'text-orange-600 bg-orange-50 dark:bg-orange-950',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950',
  low: 'text-blue-600 bg-blue-50 dark:bg-blue-950'
};

export function FindingsTable({ findings }: FindingsTableProps) {
  if (findings.length === 0) {
    return <div className="rounded-lg border p-6 text-center text-muted-foreground text-sm">No findings reported.</div>;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2 font-medium">Severity</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Description</th>
            <th className="text-left px-3 py-2 font-medium">Location</th>
            <th className="text-left px-3 py-2 font-medium">Tool</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: findings can have duplicate stage+type
            <tr key={`${f.stage}-${f.type}-${i}`} className="border-b last:border-0">
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${severityColor[f.severity] ?? ''}`}>
                  {f.severity}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{f.type}</td>
              <td className="px-3 py-2 max-w-xs truncate">{f.description}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.location ?? '\u2014'}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{f.tool ?? f.stage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
