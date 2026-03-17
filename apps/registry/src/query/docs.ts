import rehypeShiki from '@shikijs/rehype';
import { createServerFn } from '@tanstack/react-start';
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

import { parseFrontmatter, readDocFile, readDocFiles } from '~/lib/docs-fs';

const calloutStyles: Record<string, string> = {
  info: 'border-l-4 border-blue-500 bg-blue-500/10 p-4 rounded-r-lg my-4',
  warn: 'border-l-4 border-amber-500 bg-amber-500/10 p-4 rounded-r-lg my-4',
  error: 'border-l-4 border-red-500 bg-red-500/10 p-4 rounded-r-lg my-4'
};

type Heading = { id: string; text: string; level: number };
type HeadingFile = {
  data?: Record<string, unknown> & {
    headings?: Heading[];
  };
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

export interface DocEntry {
  title: string;
  description?: string;
  slug: string;
  html: string;
  headings: Heading[];
}

let docsCache: DocEntry[] | null = null;

async function loadDocs(): Promise<DocEntry[]> {
  if (docsCache) return docsCache;

  const files = readDocFiles();
  if (files.length === 0) return [];

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

  const entries: DocEntry[] = [];
  for (const file of files) {
    const { data, body } = parseFrontmatter(readDocFile(file));
    const result = await processor.process(body);
    const headings = (result.data?.headings as Heading[]) || [];
    const slug = file.replace(/\.mdx$/, '');
    entries.push({
      title: data.title || slug,
      description: data.description,
      slug: slug === 'index' ? '' : slug,
      html: String(result),
      headings
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
    return doc ?? null;
  });
