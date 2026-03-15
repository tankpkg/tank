import { Hono } from 'hono';

import { env } from '~/consts/env';

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
    const staticPages = ['/', '/skills', '/docs', '/login'];

    const urls = staticPages
      .map(
        (path) => `  <url>
    <loc>${baseUrl}${path}</loc>
    <changefreq>${path === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${path === '/' ? '1.0' : '0.8'}</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return c.body(xml, 200, { 'Content-Type': 'application/xml' });
  });
