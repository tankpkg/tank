'use client';

interface ScanTool {
  name: string;
  category: string;
  ran: boolean;
  findingCount: number;
}

interface ScanningToolsStripProps {
  tools: ScanTool[];
}

const DEFAULT_TOOLS: ScanTool[] = [
  { name: 'Semgrep', category: 'SAST', ran: false, findingCount: 0 },
  { name: 'Bandit', category: 'Python AST', ran: false, findingCount: 0 },
  { name: 'Cisco Skill Scanner', category: 'Agent Threats', ran: false, findingCount: 0 },
  { name: 'detect-secrets', category: 'Secrets', ran: false, findingCount: 0 },
  { name: 'OSV API', category: 'SCA', ran: false, findingCount: 0 },
];

export function ScanningToolsStrip({ tools = DEFAULT_TOOLS }: ScanningToolsStripProps) {
  // Merge with defaults to ensure all tools are shown
  const displayTools = DEFAULT_TOOLS.map((defaultTool) => {
    const found = tools.find((t) => t.name === defaultTool.name);
    return found || defaultTool;
  });

  return (
    <div className="flex flex-wrap gap-3 py-4">
      {displayTools.map((tool) => (
        <div
          key={tool.name}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
            tool.ran
              ? 'bg-card border-border'
              : 'bg-muted/30 border-muted opacity-60'
          }`}
          title={tool.ran ? `${tool.name} ran and found ${tool.findingCount} issue(s)` : `${tool.name} did not run`}
        >
          <div className="flex items-center gap-2">
            {tool.ran ? (
              <span className="text-green-500 text-sm">✓</span>
            ) : (
              <span className="text-muted-foreground text-sm">○</span>
            )}
            <div>
              <div className={`text-sm font-medium ${tool.ran ? 'text-foreground' : 'text-muted-foreground'}`}>
                {tool.name}
              </div>
              <div className="text-xs text-muted-foreground">{tool.category}</div>
            </div>
          </div>
          {tool.ran && tool.findingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
              {tool.findingCount}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
