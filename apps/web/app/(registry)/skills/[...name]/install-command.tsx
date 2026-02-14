'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function InstallCommand({ name }: { name: string }) {
  const command = `tank install ${name}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — ignore silently
    }
  };

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <code className="text-sm font-mono select-all">{command}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
