'use client';

import { Check, X } from 'lucide-react';

export type QualityCategoryName = 'Documentation' | 'Package Hygiene' | 'Permissions';

export interface QualityCategory {
  name: QualityCategoryName;
  passed: boolean;
  details: string;
}

interface QualityChecksProps {
  checks: QualityCategory[];
  variant?: 'compact' | 'full';
}

export function QualityChecks({ checks, variant = 'compact' }: QualityChecksProps) {
  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-sm">
            {c.passed ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <X className="w-4 h-4 text-red-600" />
            )}
            <span className={c.passed ? '' : 'text-muted-foreground'}>{c.name}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((c) => (
        <div key={c.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
          <div className="flex items-center gap-2">
            {c.passed ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <X className="w-4 h-4 text-red-600" />
            )}
            <span className={`font-medium ${c.passed ? '' : 'text-muted-foreground'}`}>{c.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">{c.details}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Compute quality checks from skill data.
 */
export function computeQualityChecks(input: {
  readme: string | null;
  description: string | null;
  license: string | null;
  repositoryUrl: string | null;
  permissions: Record<string, unknown>;
}): QualityCategory[] {
  return [
    {
      name: 'Documentation',
      passed: !!(input.readme && input.readme.trim().length > 0) && !!(input.description && input.description.trim().length > 0),
      details: input.readme && input.description ? 'README + description' : input.readme ? 'README only' : input.description ? 'Description only' : 'Missing'
    },
    {
      name: 'Package Hygiene',
      passed: !!(input.license || input.repositoryUrl),
      details: input.license && input.repositoryUrl ? 'License + repo' : input.license ? 'License only' : input.repositoryUrl ? 'Repo only' : 'Missing'
    },
    {
      name: 'Permissions',
      passed: Object.keys(input.permissions).length > 0,
      details: Object.keys(input.permissions).length > 0 ? `${Object.keys(input.permissions).length} declared` : 'None declared'
    }
  ];
}
