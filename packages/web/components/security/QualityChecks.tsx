'use client';

import { Check, X } from 'lucide-react';
import type { QualityCategory } from './quality-checks-utils';

export type { QualityCategory, QualityCategoryName } from './quality-checks-utils';
export { computeQualityChecks } from './quality-checks-utils';

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
            {c.passed ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-red-600" />}
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
            {c.passed ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-red-600" />}
            <span className={`font-medium ${c.passed ? '' : 'text-muted-foreground'}`}>{c.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">{c.details}</span>
        </div>
      ))}
    </div>
  );
}
