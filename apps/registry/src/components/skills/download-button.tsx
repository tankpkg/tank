import { Download } from 'lucide-react';

import { Button } from '~/components/ui/button';

interface DownloadButtonProps {
  skillName: string;
  version: string;
}

export function DownloadButton({ skillName, version }: DownloadButtonProps) {
  const downloadUrl = `/api/v1/skills/${encodeURIComponent(skillName)}/${encodeURIComponent(version)}`;

  return (
    <Button variant="outline" size="sm" className="gap-1.5" asChild>
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
        <Download className="size-3.5" />
        <span className="text-xs">Download</span>
      </a>
    </Button>
  );
}
