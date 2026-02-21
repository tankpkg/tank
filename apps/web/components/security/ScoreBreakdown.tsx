'use client';

interface ScoreCriterion {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

interface ScoreBreakdownProps {
  criteria: ScoreCriterion[];
  totalScore: number;
}

const DEFAULT_CRITERIA: ScoreCriterion[] = [
  { label: 'SKILL.md present', passed: true, points: 1, maxPoints: 1 },
  { label: 'Description provided', passed: true, points: 1, maxPoints: 1 },
  { label: 'Permissions declared', passed: true, points: 1, maxPoints: 1 },
  { label: 'No security issues', passed: true, points: 2, maxPoints: 2 },
  { label: 'Permissions match detected usage', passed: true, points: 2, maxPoints: 2 },
  { label: 'File count under 100', passed: true, points: 1, maxPoints: 1 },
  { label: 'README documentation', passed: true, points: 1, maxPoints: 1 },
  { label: 'Package under 5MB', passed: true, points: 1, maxPoints: 1 },
];

export function ScoreBreakdown({ criteria = DEFAULT_CRITERIA, totalScore }: ScoreBreakdownProps) {
  const earnedPoints = criteria.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Score Breakdown</h3>
        <div className="text-right">
          <span className="text-2xl font-bold">{totalScore}</span>
          <span className="text-sm text-muted-foreground">/{maxPoints}</span>
        </div>
      </div>

      <div className="space-y-2">
        {criteria.map((criterion, index) => (
          <div
            key={index}
            className={`flex items-center justify-between py-1.5 px-2 rounded ${
              criterion.passed ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={criterion.passed ? 'text-green-600' : 'text-red-600'}>
                {criterion.passed ? '✓' : '✗'}
              </span>
              <span className={`text-sm ${criterion.passed ? 'text-foreground' : 'text-muted-foreground'}`}>
                {criterion.label}
              </span>
            </div>
            <span className={`text-sm font-medium ${criterion.passed ? 'text-green-600' : 'text-red-600'}`}>
              {criterion.passed ? `+${criterion.points}` : `0`}
              <span className="text-muted-foreground font-normal">/{criterion.maxPoints}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(totalScore / maxPoints) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
