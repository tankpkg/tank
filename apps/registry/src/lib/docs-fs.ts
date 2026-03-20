const rawDocs = import.meta.glob('/public/docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

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
  return Object.keys(rawDocs)
    .map((path) => path.split('/').pop()!)
    .filter((f) => f.endsWith('.md'));
}

export function readDocFile(filename: string): string {
  const key = Object.keys(rawDocs).find((k) => k.endsWith(`/${filename}`));
  if (!key) return '';
  return rawDocs[key];
}

export function serveDocMarkdown(slug: string): { content: string; found: boolean } {
  const filename = `${slug}.md`;
  const content = readDocFile(filename);
  if (!content) return { content: '# Not Found\n\nThis documentation page does not exist.', found: false };
  const { body } = parseFrontmatter(content);
  return { content: body, found: true };
}
