export function formatInstallCount(count: number): string {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const suffix = safeCount === 1 ? 'install' : 'installs';
  return `${safeCount.toLocaleString()} ${suffix}`;
}

export function isPublisherVerified(input: { emailVerified: boolean; githubUsername: string | null }): boolean {
  return Boolean(input.emailVerified && input.githubUsername);
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatLastScanLabel(scannedAt: Date | null): string {
  if (!scannedAt || Number.isNaN(scannedAt.getTime())) {
    return 'Scan pending';
  }
  return `Scanned ${timeAgo(scannedAt)}`;
}
