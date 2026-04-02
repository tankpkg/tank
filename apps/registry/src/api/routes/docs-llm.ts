import { Hono } from 'hono';

import { parseFrontmatter, readDocFile, readDocFiles, stripSvg } from '~/lib/docs-fs';

export const docsLlmRoutes = new Hono()
  .get('/index', (c) => {
    const files = readDocFiles().sort();
    const index = files.map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { data } = parseFrontmatter(readDocFile(f));
      return `- [${data.title || slug}](/api/docs/${slug})`;
    });

    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return c.text(
      `# Tank Documentation (LLM-friendly)\n\nSVG-stripped markdown for each doc page:\n\n${index.join('\n')}\n`
    );
  })
  .get('/:slug', (c) => {
    const slug = c.req.param('slug').replace(/\.txt$/, '');
    const raw = readDocFile(`${slug}.md`);
    if (!raw) return c.text('# Not Found\n\nThis documentation page does not exist.', 404);

    const { data, body } = parseFrontmatter(raw);
    const header = data.title ? `# ${data.title}\n\n${data.description || ''}\n\n` : '';
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return c.text(header + stripSvg(body.trim()));
  });
