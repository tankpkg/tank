import { Check, Clipboard } from 'lucide-react';

import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

interface CopyInstallButtonProps {
  command: string;
  className?: string;
}

export function CopyInstallButton({ command, className = '' }: CopyInstallButtonProps) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => copy(command)}
      className={`inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-tank hover:bg-tank/10 transition-all focus:outline-none focus:ring-2 focus:ring-tank/50 ${className}`}
      aria-label={copied ? 'Copied!' : 'Copy install command'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}>
      {copied ? <Check className="h-4 w-4 text-tank" /> : <Clipboard className="h-4 w-4" />}
    </button>
  );
}
