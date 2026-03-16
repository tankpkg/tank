export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'flagged' | 'skipped';
  findingCount: number;
  durationMs: number;
  tools: string[];
}

export interface ScanPipelineProps {
  stages: PipelineStage[];
}

const statusIcon: Record<string, string> = {
  passed: '\u2713',
  flagged: '\u26A0',
  skipped: '\u2014'
};

const statusColor: Record<string, string> = {
  passed: 'text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800',
  flagged: 'text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800',
  skipped: 'text-muted-foreground border-border bg-muted/50'
};

export function ScanPipeline({ stages }: ScanPipelineProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Scan Pipeline</h3>
      <div className="space-y-2">
        {stages.map((stage) => (
          <div key={stage.id} className={`rounded-lg border p-3 ${statusColor[stage.status] ?? ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{statusIcon[stage.status]}</span>
                <span className="font-medium text-sm">{stage.name}</span>
              </div>
              {stage.findingCount > 0 && <span className="text-xs">{stage.findingCount} finding(s)</span>}
            </div>
            <div className="text-xs mt-1 opacity-80">{stage.description}</div>
            <div className="text-xs mt-1 opacity-60">Tools: {stage.tools.join(', ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
