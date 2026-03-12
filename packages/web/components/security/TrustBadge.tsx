'use client';

import { AlertOctagon, AlertTriangle, Clock, type LucideIcon, Shield, XCircle } from 'lucide-react';
import type { TrustLevel } from '@/lib/trust-level';
import { getTrustBadgeConfig } from '@/lib/trust-level';

const ICONS: Record<string, LucideIcon> = {
  'shield-check': Shield,
  'alert-triangle': AlertTriangle,
  'alert-octagon': AlertOctagon,
  'x-circle': XCircle,
  clock: Clock
};

interface TrustBadgeProps {
  trustLevel: TrustLevel;
  findings?: { critical: number; high: number; medium: number; low: number };
  size?: 'sm' | 'md';
}

export function TrustBadge({ trustLevel, findings, size = 'sm' }: TrustBadgeProps) {
  const config = getTrustBadgeConfig(trustLevel);
  const Icon = ICONS[config.icon];
  const totalFindings = findings ? findings.critical + findings.high + findings.medium + findings.low : 0;

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5 gap-1' : 'text-sm px-2 py-1 gap-1.5';

  return (
    <span className={`inline-flex items-center rounded ${config.bgClass} ${config.textClass} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      <span className="font-medium">{config.label}</span>
      {trustLevel === 'review_recommended' && totalFindings > 0 && (
        <span className="opacity-75">({totalFindings})</span>
      )}
    </span>
  );
}
