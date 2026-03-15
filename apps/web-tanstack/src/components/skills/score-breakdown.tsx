import type { LLMAnalysisInfo } from '~/lib/skills/data';

export interface ScoreCriterion {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

export interface ScoreBreakdownProps {
  criteria: ScoreCriterion[];
  totalScore: number;
  llmAnalysis?: LLMAnalysisInfo | null;
}

export function ScoreBreakdown({ criteria, totalScore, llmAnalysis }: ScoreBreakdownProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Score Breakdown</h3>
      <div className="rounded-lg border overflow-hidden">
        <div className="divide-y">
          {criteria.map((c) => (
            <div key={c.label} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={c.passed ? 'text-green-600' : 'text-red-600'}>{c.passed ? '\u2713' : '\u2717'}</span>
                <span>{c.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.points}/{c.maxPoints}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-2 flex items-center justify-between bg-muted/50">
          <span className="font-medium text-sm">Total</span>
          <span className="font-bold">{totalScore}/10</span>
        </div>
        {llmAnalysis?.enabled && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            LLM analysis: {llmAnalysis.mode === 'byollm' ? 'Custom' : 'Built-in'} model
          </div>
        )}
      </div>
    </div>
  );
}
