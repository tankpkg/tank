'use client';

import { useState } from 'react';

interface Finding {
  stage: string;
  severity: string;
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
  corroborated?: boolean;
  corroborationCount?: number;
}

interface FindingsListProps {
  findings: Finding[];
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortOption = 'severity' | 'stage' | 'tool' | 'location';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500 bg-red-50';
    case 'high':
      return 'border-l-orange-500 bg-orange-50';
    case 'medium':
      return 'border-l-yellow-500 bg-yellow-50';
    case 'low':
      return 'border-l-blue-500 bg-blue-50';
    default:
      return 'border-l-gray-500 bg-gray-50';
  }
}

function getSeverityBadgeColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'high':
      return 'bg-orange-100 text-orange-700';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700';
    case 'low':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function FindingsList({ findings }: FindingsListProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('severity');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (severityFilter === 'all') return true;
    return f.severity === severityFilter;
  });

  // Sort findings
  const sortedFindings = [...filteredFindings].sort((a, b) => {
    switch (sortBy) {
      case 'severity':
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      case 'stage':
        return a.stage.localeCompare(b.stage);
      case 'tool':
        return (a.tool || '').localeCompare(b.tool || '');
      case 'location':
        return (a.location || '').localeCompare(b.location || '');
      default:
        return 0;
    }
  });

  // Count by severity
  const counts: Record<string, number> = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };

  if (findings.length === 0) {
    return (
      <div className="text-center py-12 bg-green-50 rounded-lg">
        <div className="text-4xl text-green-600 mb-2">✓</div>
        <p className="text-green-700 font-medium">No security issues detected</p>
        <p className="text-sm text-green-600 mt-1">
          All scanning tools completed without finding issues.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSeverityFilter(filter)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                severityFilter === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              {filter !== 'all' && counts[filter] > 0 && (
                <span className="ml-1 text-xs opacity-70">({counts[filter]})</span>
              )}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-3 py-1 text-sm border rounded-md bg-background"
        >
          <option value="severity">Sort by Severity</option>
          <option value="stage">Sort by Stage</option>
          <option value="tool">Sort by Tool</option>
          <option value="location">Sort by Location</option>
        </select>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground mb-4">
        Showing {sortedFindings.length} of {findings.length} findings
        {counts.critical > 0 && (
          <span className="text-red-600 ml-2">• {counts.critical} critical</span>
        )}
        {counts.high > 0 && (
          <span className="text-orange-600 ml-2">• {counts.high} high</span>
        )}
      </div>

      {/* Findings List */}
      <div className="space-y-3">
        {sortedFindings.map((finding, index) => (
          <div
            key={`${finding.stage}-${finding.type}-${index}`}
            className={`border-l-4 rounded-lg overflow-hidden ${getSeverityColor(finding.severity)}`}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${getSeverityBadgeColor(
                    finding.severity
                  )}`}
                >
                  {finding.severity.toUpperCase()}
                </span>
                <span className="font-medium text-sm">
                  {finding.type.replace(/_/g, ' ')}
                </span>
                {finding.corroborated && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    🛡️ {finding.corroborationCount} tools agree
                  </span>
                )}
              </div>
              {finding.location && (
                <code className="text-xs bg-black/10 px-2 py-0.5 rounded font-mono">
                  {finding.location}
                </code>
              )}
            </button>

            {/* Expanded Content */}
            {expandedIndex === index && (
              <div className="px-4 py-3 border-t border-black/10 bg-white/50">
                <p className="text-sm text-foreground mb-3">{finding.description}</p>

                {/* Tool Attribution */}
                {finding.tool && (
                  <div className="text-xs text-muted-foreground mb-2">
                    Detected by: <span className="font-medium text-foreground">{finding.tool}</span>
                  </div>
                )}

                {/* Evidence */}
                {finding.evidence && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Evidence:</div>
                    <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded font-mono overflow-x-auto">
                      {finding.evidence}
                    </pre>
                  </div>
                )}

                {/* Confidence Bar */}
                {finding.confidence !== null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Confidence:</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-32">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(finding.confidence || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground">
                      {Math.round((finding.confidence || 0) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
