'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface DownloadButtonProps {
  name: string;
  version: string;
}

export function DownloadButton({ name, version }: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get the signed download URL
      const response = await fetch(`/api/v1/skills/${encodeURIComponent(name)}/${version}`);

      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }

      const data = await response.json();

      // 2. Fetch the actual file blob (required for cross-origin URLs to respect download filename)
      const fileResponse = await fetch(data.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await fileResponse.blob();

      // 3. Create a local blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const packageName = name.includes('/') ? name.split('/').pop()! : name;
      const filename = `${packageName}-${version}.tgz`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="ml-2">Download .tgz</span>
      </Button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
