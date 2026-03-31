import { useState } from 'react';

export function useClipboard() {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 2000);
    });
  }

  return { copiedLabel, copy };
}
