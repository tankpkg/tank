import docsBundle from '~/generated/docs-bundle.json';

interface RawDoc {
  slug: string;
  title: string;
  description: string;
  body: string;
}

const docs: RawDoc[] = docsBundle as RawDoc[];

export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
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

export function readDocFiles(): string[] {
  return docs.map((d) => (d.slug === '' ? 'index.mdx' : `${d.slug}.mdx`));
}

export function readDocFile(filename: string): string {
  const slug = filename.replace(/\.mdx$/, '');
  const normalized = slug === 'index' ? '' : slug;
  const doc = docs.find((d) => d.slug === normalized);
  if (!doc) throw new Error(`Doc not found: ${filename}`);
  const fm = doc.title || doc.description ? `---\ntitle: ${doc.title}\ndescription: ${doc.description}\n---\n` : '';
  return `${fm}${doc.body}`;
}

export function serveDocMarkdown(slug: string): { content: string; found: boolean } {
  const normalized = slug === 'index' ? '' : slug;
  const doc = docs.find((d) => d.slug === normalized);
  if (!doc) return { content: '# Not Found\n\nThis documentation page does not exist.', found: false };
  return { content: doc.body, found: true };
}
