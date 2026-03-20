import { ShieldCheck } from 'lucide-react';

interface VerifiedPublisherBadgeProps {
  hasVerifiedEmail: boolean;
  hasGithubUsername: boolean;
}

export function VerifiedPublisherBadge({ hasVerifiedEmail, hasGithubUsername }: VerifiedPublisherBadgeProps) {
  if (!hasVerifiedEmail || !hasGithubUsername) return null;

  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-600">
      <ShieldCheck className="size-3" />
      Verified
    </div>
  );
}
