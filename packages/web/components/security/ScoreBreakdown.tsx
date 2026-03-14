'use client';

import { Brain } from 'lucide-react';

interface ScoreCriterion {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

interface LLMAnalysisInfo {
  enabled: boolean;
  mode: string;
  providers?: Array<{
    name: string;
    model: string;
    status: string;
    latency_ms: number | null;
  }>;
  findings_reviewed?: number;
  findings_dismissed?: number;
  findings_confirmed?: number;
}

interface ScoreBreakdownProps {
  criteria: ScoreCriterion[];
  totalScore: number;
  llmAnalysis?: LLMAnalysisInfo | null;
}

const DEFAULT_CRITERIA: ScoreCriterion[] = [
  { label: 'SKILL.md present', passed: true, points: 1, maxPoints: 1 },
  { label: 'Description provided', passed: true, points: 1, maxPoints: 1 },
  { label: 'Permissions declared', passed: true, points: 1, maxPoints: 1 },
  { label: 'No security issues', passed: true, points: 2, maxPoints: 2 },
  { label: 'Permissions match detected usage', passed: true, points: 2, maxPoints: 2 },
  { label: 'File count under 100', passed: true, points: 1, maxPoints: 1 },
  { label: 'README documentation', passed: true, points: 1, maxPoints: 1 },
  { label: 'Package under 5MB', passed: true, points: 1, maxPoints: 1 }
];

export function ScoreBreakdown({ criteria = DEFAULT_CRITERIA, llmAnalysis }: ScoreBreakdownProps) {
  const earnedPoints = criteria.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Score Breakdown</h3>
        <div className="text-right">
          <span className="text-2xl font-bold text-foreground">{earnedPoints}</span>
          <span className="text-sm text-muted-foreground">/{maxPoints}</span>
        </div>
      </div>

      <div className="space-y-2">
        {criteria.map((criterion) => (
          <div
            key={criterion.label}
            className={`flex items-center justify-between py-1.5 px-2 rounded ${
              criterion.passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
            <div className="flex items-center gap-2">
              <span
                className={criterion.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {criterion.passed ? '✓' : '✗'}
              </span>
              <span className={`text-sm ${criterion.passed ? 'text-foreground' : 'text-muted-foreground'}`}>
                {criterion.label}
              </span>
            </div>
            <span
              className={`text-sm font-medium ${criterion.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {criterion.passed ? `+${criterion.points}` : `0`}
              <span className="text-muted-foreground font-normal">/{criterion.maxPoints}</span>
            </span>
          </div>
        ))}
      </div>

      {/* LLM Analysis Status */}
      {llmAnalysis && (
        <div className="mt-4 p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">LLM Security Analysis</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                llmAnalysis.enabled
                  ? 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
              {llmAnalysis.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {llmAnalysis.enabled && (
            <div className="text-xs text-purple-600 dark:text-purple-400 space-y-1">
              <div>
                Mode:{' '}
                {llmAnalysis.mode === 'byollm'
                  ? 'Custom LLM'
                  : llmAnalysis.mode === 'builtin'
                    ? 'Built-in (Groq/OpenRouter)'
                    : llmAnalysis.mode}
              </div>
              {llmAnalysis.findings_reviewed !== undefined && (
                <div>Findings reviewed: {llmAnalysis.findings_reviewed}</div>
              )}
              {llmAnalysis.findings_dismissed !== undefined && llmAnalysis.findings_dismissed > 0 && (
                <div className="text-green-600 dark:text-green-400">
                  False positives dismissed: {llmAnalysis.findings_dismissed}
                </div>
              )}
              {llmAnalysis.findings_confirmed !== undefined && llmAnalysis.findings_confirmed > 0 && (
                <div className="text-red-600 dark:text-red-400">
                  Threats confirmed: {llmAnalysis.findings_confirmed}
                </div>
              )}
            </div>
          )}
          {!llmAnalysis.enabled && (
            <div className="text-xs text-muted-foreground">
              Configure GROQ_API_KEY or OPENROUTER_API_KEY to enable LLM-powered false positive reduction.
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(earnedPoints / maxPoints) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
