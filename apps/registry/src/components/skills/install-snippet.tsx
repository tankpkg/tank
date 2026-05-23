import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

interface InstallSnippetProps {
  /** Skill name (e.g. "@org/package") */
  skillName: string;
  /** Optional testid prefix for the snippet container */
  testId?: string;
}

export function InstallSnippet({ skillName, testId = 'install-snippet' }: InstallSnippetProps) {
  const installCmd = `tank install -g ${skillName}`;
  const { copied, copy } = useCopyToClipboard();

  return (
    <div data-testid={testId} className="flex items-center gap-2 rounded border bg-muted/50 px-2 py-1">
      <code className="flex-1 min-w-0 truncate font-mono text-xs">{installCmd}</code>
      <button
        type="button"
        data-testid={`${testId}-copy-btn`}
        className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          copy(installCmd);
        }}>
        {copied ? <Check className="size-3 text-tank" /> : <Copy className="size-3" />}
        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
