export interface ScanningTool {
  name: string;
  category: string;
  ran: boolean;
  findingCount: number;
}

export interface ScanningToolsStripProps {
  tools: ScanningTool[];
}

export function ScanningToolsStrip({ tools }: ScanningToolsStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {tools.map((tool) => (
        <div
          key={tool.name}
          className={`rounded-lg border p-3 text-sm ${tool.ran ? 'bg-background' : 'bg-muted/50 opacity-60'}`}>
          <div className="font-medium truncate">{tool.name}</div>
          <div className="text-xs text-muted-foreground">{tool.category}</div>
          {tool.ran && (
            <div className={`text-xs mt-1 ${tool.findingCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {tool.findingCount > 0 ? `${tool.findingCount} finding(s)` : 'Clean'}
            </div>
          )}
          {!tool.ran && <div className="text-xs mt-1 text-muted-foreground">Skipped</div>}
        </div>
      ))}
    </div>
  );
}
