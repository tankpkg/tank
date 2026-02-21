'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RescanSkillsButton() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    success?: number;
    failed?: number;
  } | null>(null);

  async function handleRescan() {
    if (isScanning) return;

    const confirmed = confirm(
      'This will rescan all published skills. This may take several minutes. Continue?'
    );

    if (!confirmed) return;

    setIsScanning(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/rescan-skills', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setResult({ message: data.error || 'Failed to rescan skills' });
      }
    } catch (error) {
      setResult({
        message: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        onClick={handleRescan}
        disabled={isScanning}
        variant="outline"
      >
        {isScanning ? 'Scanning...' : 'Rescan All Skills'}
      </Button>
      {result && (
        <div className="text-sm">
          <p className="font-medium">{result.message}</p>
          {result.success !== undefined && (
            <div className="text-muted-foreground mt-1">
              <p>Success: {result.success}</p>
              <p>Failed: {result.failed}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
