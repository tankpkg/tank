import { createFileRoute } from '@tanstack/react-router';
import { setResponseHeader } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { BASE_URL } from '~/consts/seo';
import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';
import { readDocFiles } from '~/lib/docs-fs';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        setResponseHeader('Content-Type', 'application/xml; charset=utf-8');
        setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        setResponseHeader('CDN-Cache-Control', 'max-age=3600, stale-while-revalidate=3600');
        return new Response(await generateSitemap());
      }
    }
  }
});

async function generateSitemap(): Promise<string> {
  const staticPages = ['/', '/skills', '/docs', '/login', '/llms.txt', '/llms-full.txt'];
  const docSlugs = readDocFiles().map((f) => f.replace(/\.md$/, ''));

  let skillNames: string[] = [];
  try {
    const rows = await db.selectDistinct({ name: skills.name }).from(skills).where(eq(skills.visibility, 'public'));
    skillNames = rows.map((row) => row.name);
  } catch {
    // DB unavailable at build time
  }

  const urls = [
    ...staticPages.map((path) => `${BASE_URL}${path}`),
    ...docSlugs.map((slug) => `${BASE_URL}/docs/${slug}`),
    ...skillNames.map((name) => `${BASE_URL}/skills/${name}`)
  ];

  const entries = urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
