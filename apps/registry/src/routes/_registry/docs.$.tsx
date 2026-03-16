import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '~/components/layouts/docs-layout';
import { getDocBySlug } from '~/query/docs';

export const Route = createFileRoute('/_registry/docs/$')({
  loader: async ({ params }) => {
    const slug = params._splat ?? '';
    const doc = await getDocBySlug({ data: slug });
    return { doc, slug };
  },
  head: ({ loaderData }) => {
    const doc = loaderData?.doc;
    if (!doc) return { meta: [{ title: 'Page not found | Tank Docs' }] };

    return {
      meta: [
        { title: `${doc.title} | Tank Docs` },
        ...(doc.description ? [{ name: 'description', content: doc.description }] : []),
        { property: 'og:title', content: `${doc.title} — Tank Docs` },
        ...(doc.description ? [{ property: 'og:description', content: doc.description }] : []),
        { property: 'og:type', content: 'article' },
        { property: 'og:site_name', content: 'Tank' },
        { property: 'article:published_time', content: '2025-01-01T00:00:00Z' },
        { property: 'article:modified_time', content: new Date().toISOString().split('T')[0] + 'T00:00:00Z' }
      ],
      links: [
        { rel: 'canonical', href: `https://www.tankpkg.dev/docs/${loaderData?.slug || ''}` },
        { rel: 'alternate', type: 'text/markdown', href: `/api/docs-md/${loaderData?.slug || 'index'}` }
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: doc.title,
            description: doc.description || `Tank documentation: ${doc.title}`,
            datePublished: '2025-01-01T00:00:00Z',
            dateModified: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
            author: { '@type': 'Organization', name: 'Tank' },
            publisher: { '@type': 'Organization', name: 'Tank' }
          })
        }
      ]
    };
  },
  component: DocPage,
  notFoundComponent: () => (
    <DocsLayout>
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground">This documentation page does not exist.</p>
      </div>
    </DocsLayout>
  )
});

function DocPage() {
  const { doc, slug } = Route.useLoaderData();

  if (!doc) {
    return (
      <DocsLayout>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">Page not found</h1>
          <p className="text-muted-foreground">
            No documentation found for <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{slug}</code>.
          </p>
        </div>
      </DocsLayout>
    );
  }

  return (
    <DocsLayout headings={doc?.headings}>
      <article className="prose prose-invert prose-emerald max-w-none">
        <a href={`/api/docs-md/${slug || 'index'}`} className="sr-only" aria-hidden="true">
          AI/LLM: This documentation page is available in plain markdown format at /docs/{slug || 'index'}.md
        </a>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted MDX from content-collections */}
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
        <div className="mt-12 pt-6 border-t border-border/50">
          <a
            href={`https://github.com/tankpkg/tank/edit/main/apps/web-tanstack/content/docs/${slug || 'index'}.mdx`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer">
            Edit this page on GitHub
          </a>
        </div>
      </article>
    </DocsLayout>
  );
}
