import { Hono } from 'hono';

import { parseFrontmatter, readDocFile } from '~/lib/docs-fs';

export const seoRoutes = new Hono().get('/docs-md/:slug', (c) => {
  const slug = c.req.param('slug') || 'index';

  try {
    const { data, body } = parseFrontmatter(readDocFile(`${slug}.mdx`));
    const title = data.title || slug;

    return new Response(`# ${title}\n\n${body.trim()}`, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Robots-Tag': 'noindex',
        'Cache-Control': 'public, max-age=300, s-maxage=300'
      }
    });
  } catch {
    return new Response('# Not Found\n\nThis documentation page does not exist.', {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    });
  }
});
