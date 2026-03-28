import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface SkillReadmeProps {
  content: string;
}

const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n?/;

function stripFrontmatter(md: string): string {
  return md.replace(FRONTMATTER_RE, '').trimStart();
}

export function SkillReadme({ content }: SkillReadmeProps) {
  const body = stripFrontmatter(content);

  return (
    <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code: ({ className, children, ...rest }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="before:content-none after:content-none" {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          }
        }}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
