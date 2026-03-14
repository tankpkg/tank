interface SkillReadmeProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function SkillReadme({ content }: SkillReadmeProps) {
  return (
    <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary">
      <pre className="whitespace-pre-wrap break-words text-sm font-sans bg-transparent border-none p-0 m-0">
        {escapeHtml(content)}
      </pre>
    </div>
  );
}
