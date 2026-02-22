'use client';

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'flagged' | 'failed' | 'skipped' | 'pending';
  findingCount: number;
  durationMs: number;
  tools: string[];
}

interface ScanPipelineProps {
  stages: PipelineStage[];
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'stage0', name: 'Ingestion', description: 'Download & extract tarball safely', status: 'pending', findingCount: 0, durationMs: 0, tools: ['httpx', 'tarfile', 'hashlib'] },
  { id: 'stage1', name: 'Structure Validation', description: 'Check file types, sizes, paths', status: 'pending', findingCount: 0, durationMs: 0, tools: ['charset-normalizer', 'unicodedata'] },
  { id: 'stage2', name: 'Static Analysis', description: 'Detect dangerous code patterns', status: 'pending', findingCount: 0, durationMs: 0, tools: ['Semgrep', 'Bandit', 'Custom AST'] },
  { id: 'stage3', name: 'Injection Detection', description: 'Find prompt/shell injections', status: 'pending', findingCount: 0, durationMs: 0, tools: ['Cisco Skill Scanner', 'Regex patterns'] },
  { id: 'stage4', name: 'Secrets Scanning', description: 'Detect leaked credentials', status: 'pending', findingCount: 0, durationMs: 0, tools: ['detect-secrets', 'Custom patterns'] },
  { id: 'stage5', name: 'Dependency Audit', description: 'Check supply chain risks', status: 'pending', findingCount: 0, durationMs: 0, tools: ['OSV API', 'pip-audit'] },
];

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✓';
    case 'flagged':
      return '⚠';
    case 'failed':
      return '✗';
    case 'skipped':
      return '○';
    default:
      return '◌';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'passed':
      return 'text-green-500';
    case 'flagged':
      return 'text-yellow-500';
    case 'failed':
      return 'text-red-500';
    case 'skipped':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

function getLineColor(status: string): string {
  switch (status) {
    case 'passed':
      return 'bg-green-500';
    case 'flagged':
      return 'bg-yellow-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-muted';
  }
}

export function ScanPipeline({ stages = DEFAULT_STAGES }: ScanPipelineProps) {
  // Merge defaults with provided stages
  const displayStages = DEFAULT_STAGES.map((defaultStage) => {
    const found = stages.find((s) => s.id === defaultStage.id);
    return found || defaultStage;
  });

  // Determine overall pipeline health for line coloring
  const hasFailed = displayStages.some((s) => s.status === 'failed');
  const hasFlagged = displayStages.some((s) => s.status === 'flagged');

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Scan Pipeline</h3>
      <div className="relative">
        {displayStages.map((stage, index) => (
          <div key={stage.id} className="relative">
            {/* Connecting Line */}
            {index < displayStages.length - 1 && (
              <div
                className={`absolute left-3 top-8 w-0.5 h-full ${
                  stage.status === 'passed' ? 'bg-green-500' :
                  stage.status === 'failed' ? 'bg-red-500' :
                  stage.status === 'flagged' ? 'bg-yellow-500' : 'bg-muted'
                }`}
              />
            )}

            {/* Stage Node */}
            <div className="flex items-start gap-3 pb-4 relative z-10">
              {/* Status Icon */}
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full bg-background border-2 ${
                  getStatusColor(stage.status)
                } ${
                  stage.status === 'passed' ? 'border-green-500' :
                  stage.status === 'failed' ? 'border-red-500' :
                  stage.status === 'flagged' ? 'border-yellow-500' : 'border-muted'
                }`}
              >
                <span className="text-xs">{getStatusIcon(stage.status)}</span>
              </div>

              {/* Stage Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{stage.name}</span>
                    {stage.findingCount > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">
                        {stage.findingCount} issue{stage.findingCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {stage.durationMs > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {(stage.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                {stage.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {stage.tools.map((tool) => (
                      <span
                        key={tool}
                        className="text-[10px] px-1.5 py-0.5 bg-muted rounded"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
