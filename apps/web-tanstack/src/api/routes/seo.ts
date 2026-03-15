import { Hono } from 'hono';

import { env } from '~/consts/env';
import { parseFrontmatter, readDocFile, readDocFiles } from '~/lib/docs-fs';

export const seoRoutes = new Hono()

  .get('/robots.txt', (c) => {
    const baseUrl = env.APP_URL;
    return c.text(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard
Disallow: /admin

Sitemap: ${baseUrl}/sitemap.xml
`);
  })

  .get('/sitemap.xml', async (c) => {
    const baseUrl = env.APP_URL;
    const today = new Date().toISOString().split('T')[0];

    const staticPages = [
      { path: '/', lastmod: today },
      { path: '/skills', lastmod: today },
      { path: '/docs', lastmod: today },
      { path: '/login', lastmod: today },
      { path: '/llms.txt', lastmod: today },
      { path: '/llms-full.txt', lastmod: today }
    ];

    const docSlugs = readDocFiles()
      .map((f) => f.replace(/\.mdx$/, ''))
      .filter((slug) => slug !== 'index');

    const urls = [
      ...staticPages.map(
        ({ path, lastmod }) => `  <url>\n    <loc>${baseUrl}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
      ),
      ...docSlugs.map(
        (slug) => `  <url>\n    <loc>${baseUrl}/docs/${slug}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
      )
    ].join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return c.body(xml, 200, { 'Content-Type': 'application/xml' });
  })

  .get('/docs-md/:slug', (c) => {
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
