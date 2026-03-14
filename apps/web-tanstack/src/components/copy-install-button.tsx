import { Check, Clipboard } from 'lucide-react';
import { useState } from 'react';

interface CopyInstallButtonProps {
  command: string;
  className?: string;
}

export function CopyInstallButton({ command, className = '' }: CopyInstallButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${className}`}
      aria-label={copied ? 'Copied!' : 'Copy install command'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}>
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
    </button>
  );
}
