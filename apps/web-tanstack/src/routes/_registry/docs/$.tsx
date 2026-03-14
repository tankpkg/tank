import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '~/layouts/docs-layout';
import { getDocBySlug } from '~/server-fns/docs';

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
        { property: 'og:site_name', content: 'Tank' }
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
    <DocsLayout>
      <article className="prose prose-invert prose-emerald max-w-none">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted MDX from content-collections */}
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>
    </DocsLayout>
  );
}
