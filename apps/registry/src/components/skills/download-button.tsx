import { Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';

interface DownloadButtonProps {
  skillName: string;
  version: string;
}

interface VersionDetailResponse {
  downloadUrl: string;
}

function deriveFileName(skillName: string, version: string, urlValue: string): string {
  try {
    const url = new URL(urlValue);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last && /\.(tgz|tar\.gz|tar)$/i.test(last)) return last;
  } catch {
    // ignore — fall through to constructed name
  }
  const safeName = skillName.replace(/^@/, '').replace(/\//g, '-');
  return `${safeName}-${version}.tgz`;
}

export function DownloadButton({ skillName, version }: DownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const metadataUrl = `/api/v1/skills/${encodeURIComponent(skillName)}/${encodeURIComponent(version)}`;
      const res = await fetch(metadataUrl, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to resolve download URL (${res.status})`);
      const data = (await res.json()) as VersionDetailResponse;
      if (!data.downloadUrl) throw new Error('Registry did not return a download URL');

      const tarballRes = await fetch(data.downloadUrl);
      if (!tarballRes.ok) throw new Error(`Tarball fetch failed (${tarballRes.status})`);
      const blob = await tarballRes.blob();
      const fileName = deriveFileName(skillName, version, data.downloadUrl);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading}>
        <Download className="size-3.5" />
        <span className="text-xs">{isLoading ? 'Downloading…' : 'Download'}</span>
      </Button>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
