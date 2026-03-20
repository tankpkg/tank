import { AlertTriangle, CheckCircle, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';

type TrustLevel = 'verified' | 'review_recommended' | 'concerns' | 'unsafe' | 'pending';

interface TrustBadgeProps {
  verdict: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

function deriveTrustLevel({ verdict, criticalCount, highCount }: TrustBadgeProps): TrustLevel {
  if (!verdict || verdict === 'pending') return 'pending';
  if (criticalCount > 0 || verdict === 'fail') return 'unsafe';
  if (highCount > 0 || verdict === 'flagged') return 'concerns';
  if (verdict === 'pass_with_notes') return 'review_recommended';
  return 'verified';
}

const config: Record<TrustLevel, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified', className: 'text-green-600 bg-green-50 border-green-200', Icon: ShieldCheck },
  review_recommended: {
    label: 'Review Recommended',
    className: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    Icon: CheckCircle
  },
  concerns: {
    label: 'Concerns Found',
    className: 'text-orange-600 bg-orange-50 border-orange-200',
    Icon: AlertTriangle
  },
  unsafe: { label: 'Unsafe', className: 'text-red-600 bg-red-50 border-red-200', Icon: ShieldAlert },
  pending: { label: 'Pending', className: 'text-muted-foreground bg-muted border-border', Icon: Clock }
};

export function TrustBadge(props: TrustBadgeProps) {
  const level = deriveTrustLevel(props);
  const { label, className, Icon } = config[level];

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${className}`}>
      <Icon className="size-3.5" />
      {label}
    </div>
  );
}
