import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VerifiedPublisherBadgeProps {
  compact?: boolean;
}

export function VerifiedPublisherBadge({ compact = false }: VerifiedPublisherBadgeProps) {
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
      <CheckCircle2 className="size-3" />
      {compact ? 'Verified' : 'Verified Publisher'}
    </Badge>
  );
}
