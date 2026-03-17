import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createFileRoute } from '@tanstack/react-router';
import { setResponseHeader } from '@tanstack/react-start/server';

export const Route = createFileRoute('/_llm/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        setResponseHeader('Content-Type', 'text/plain; charset=utf-8');
        setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        setResponseHeader('CDN-Cache-Control', 'max-age=86400, stale-while-revalidate=86400');

        const content = readFileSync(join(process.cwd(), 'content/llms.txt'), 'utf-8');
        return new Response(content);
      }
    }
  }
});
