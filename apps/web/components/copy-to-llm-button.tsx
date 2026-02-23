'use client';

import { useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';

interface CopyToLLMButtonProps {
  title: string;
  description?: string;
  content: string;
  url: string;
}

export function CopyToLLMButton({
  title,
  description,
  content,
  url,
}: CopyToLLMButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Format content for LLM consumption
    const llmContent = `# ${title}

${description ? `> ${description}\n\n` : ''}Source: ${url}

---

${content}

---
*This content was exported from Tank Documentation for LLM consumption.*`;

    try {
      await navigator.clipboard.writeText(llmContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
      title="Copy this page content for LLM consumption"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          Copied!
        </>
      ) : (
        <>
          <FileText className="h-4 w-4" />
          <Copy className="h-3 w-3" />
          Copy to LLM
        </>
      )}
    </button>
  );
}
