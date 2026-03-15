import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServerFn } from '@tanstack/react-start';
import rehypeShiki from '@shikijs/rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import type { Root } from 'hast';
import { visit } from 'unist-util-visit';
import { unified } from 'unified';

const calloutStyles: Record<string, string> = {
  info: 'border-l-4 border-blue-500 bg-blue-500/10 p-4 rounded-r-lg my-4',
  warn: 'border-l-4 border-amber-500 bg-amber-500/10 p-4 rounded-r-lg my-4',
  error: 'border-l-4 border-red-500 bg-red-500/10 p-4 rounded-r-lg my-4'
};

function rehypeCallout() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'callout' || index == null || !parent) return;
      const type = (node.properties?.type as string) || 'info';
      node.tagName = 'blockquote';
      node.properties = { className: calloutStyles[type] || calloutStyles.info };
    });
  };
}

interface DocEntry {
  title: string;
  description?: string;
  slug: string;
  html: string;
}

interface DocMeta {
  title: string;
  description?: string;
  slug: string;
}

let docsCache: DocEntry[] | null = null;

function getDocsDir(): string {
  // In production (.output/), content is at the repo root level
  // In dev, it's relative to apps/web-tanstack/
  const candidates = [
    join(process.cwd(), 'content/docs'),
    join(process.cwd(), '../../apps/web-tanstack/content/docs'),
    join(process.cwd(), 'apps/web-tanstack/content/docs')
  ];
  for (const dir of candidates) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      continue;
    }
  }
  return candidates[0];
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
      data[key] = val;
    }
  }
  return { data, body: match[2] };
}

async function loadDocs(): Promise<DocEntry[]> {
  if (docsCache) return docsCache;

  const dir = getDocsDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mdx'));
  } catch {
    return [];
  }

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeCallout)
    .use(rehypeSlug)
    .use(rehypeShiki, { theme: 'github-dark' })
    .use(rehypeStringify);

  const entries: DocEntry[] = [];
  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    const result = await processor.process(body);
    const slug = file.replace(/\.mdx$/, '');
    entries.push({
      title: data.title || slug,
      description: data.description,
      slug: slug === 'index' ? '' : slug,
      html: String(result)
    });
  }

  docsCache = entries;
  return entries;
}

export const getDocBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const docs = await loadDocs();
    const normalized = slug === '' || slug === 'index' ? '' : slug;
    const doc = docs.find((d) => d.slug === normalized);
    if (!doc) return null;
    return { title: doc.title, description: doc.description, slug: doc.slug, html: doc.html };
  });

export const getAllDocs = createServerFn({ method: 'GET' }).handler(async () => {
  const docs = await loadDocs();
  return docs.map((d) => ({ title: d.title, description: d.description, slug: d.slug }));
});
