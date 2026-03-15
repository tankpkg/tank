export function getScoreColor(score: number | null): string {
  if (score === null) return '#64748b';
  if (score >= 8) return '#22c55e';
  if (score >= 5) return '#eab308';
  return '#ef4444';
}

export function getScoreTextClass(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-yellow-600';
  if (score >= 4) return 'text-orange-600';
  return 'text-red-600';
}
