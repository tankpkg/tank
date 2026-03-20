import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import rehypeShiki from '@shikijs/rehype';
import type { Element, Root, RootContent } from 'hast';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const calloutStyles: Record<string, string> = {
  info: 'border-l-4 border-blue-500 bg-blue-500/10 p-4 rounded-r-lg my-4',
  warn: 'border-l-4 border-amber-500 bg-amber-500/10 p-4 rounded-r-lg my-4',
  error: 'border-l-4 border-red-500 bg-red-500/10 p-4 rounded-r-lg my-4'
};

type Heading = { id: string; text: string; level: number };
type HeadingFile = { data?: Record<string, unknown> & { headings?: Heading[] } };

function rehypeCallout() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'callout') return;
      const type = (node.properties?.type as string) || 'info';
      node.tagName = 'blockquote';
      node.properties = { className: calloutStyles[type] || calloutStyles.info };
    });
  };
}

function extractText(node: RootContent | Element): string {
  if (node.type === 'text') return node.value || '';
  if ('children' in node) return node.children.map(extractText).join('');
  return '';
}

function rehypeCollectHeadings() {
  return (tree: Root, file: HeadingFile) => {
    const headings: Heading[] = [];
    visit(tree, 'element', (node) => {
      if (/^h[2-4]$/.test(node.tagName) && node.properties?.id) {
        headings.push({
          id: node.properties.id as string,
          text: extractText(node),
          level: Number.parseInt(node.tagName[1], 10)
        });
      }
    });
    file.data = file.data || {};
    file.data.headings = headings;
  };
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      const val = line
        .slice(sep + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      data[key] = val;
    }
  }
  return { data, body: match[2] };
}

async function main() {
  const docsDir = join(import.meta.dir, '..', 'public', 'docs');
  const outDir = join(import.meta.dir, '..', 'src', 'generated');

  const files = readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  console.log(`[build-docs] Processing ${files.length} markdown files...`);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeCallout)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: 'wrap', properties: { className: ['anchor-heading'] } })
    .use(rehypeCollectHeadings)
    .use(rehypeShiki, {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false
    })
    .use(rehypeStringify);

  const entries: Array<{
    title: string;
    description?: string;
    slug: string;
    html: string;
    headings: Heading[];
  }> = [];

  for (const file of files) {
    const raw = readFileSync(join(docsDir, file), 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    const result = await processor.process(body);
    const headings = (result.data?.headings as Heading[]) || [];
    const slug = file.replace(/\.md$/, '');
    entries.push({
      title: data.title || slug,
      description: data.description,
      slug: slug === 'index' ? '' : slug,
      html: String(result),
      headings
    });
    console.log(`  \u2713 ${file} (${headings.length} headings)`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'docs.json'), JSON.stringify(entries));
  console.log(
    `[build-docs] Wrote ${entries.length} docs to src/generated/docs.json (${(JSON.stringify(entries).length / 1024).toFixed(0)}KB)`
  );
}

main().catch((e) => {
  console.error('[build-docs] FAILED:', e);
  process.exit(1);
});
