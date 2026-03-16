import { createFileRoute } from '@tanstack/react-router';
import { setResponseHeader } from '@tanstack/react-start/server';

import { parseFrontmatter, readDocFile, readDocFiles } from '~/lib/docs-fs';

export const Route = createFileRoute('/_llm/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        setResponseHeader('Content-Type', 'text/plain; charset=utf-8');
        setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        setResponseHeader('CDN-Cache-Control', 'max-age=86400, stale-while-revalidate=86400');
        return new Response(generateLlmsFullTxt());
      }
    }
  }
});

function generateLlmsFullTxt(): string {
  const files = readDocFiles().sort();
  if (files.length === 0) return '# Tank Documentation\n\nNo documentation files found.';

  const pages: string[] = ['# Tank — Complete Documentation\n'];

  for (const file of files) {
    const { data, body } = parseFrontmatter(readDocFile(file));
    const slug = file.replace(/\.mdx$/, '');
    const url = slug === 'index' ? 'https://www.tankpkg.dev/docs' : `https://www.tankpkg.dev/docs/${slug}`;

    pages.push(`---
title: ${data.title || slug}
description: ${data.description || ''}
url: ${url}
---

${body.trim()}
`);
  }

  return pages.join('\n');
}
