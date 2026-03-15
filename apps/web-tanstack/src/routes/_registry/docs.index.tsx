import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '~/components/layouts/docs-layout';
import { getDocBySlug } from '~/query/docs';

export const Route = createFileRoute('/_registry/docs/')({
  loader: async () => {
    const doc = await getDocBySlug({ data: 'index' });
    return { doc };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.doc?.title ? `${loaderData.doc.title} | Tank` : 'Documentation | Tank' },
      ...(loaderData?.doc?.description ? [{ name: 'description', content: loaderData.doc.description }] : [])
    ],
    links: [
      { rel: 'canonical', href: 'https://www.tankpkg.dev/docs' },
      { rel: 'alternate', type: 'text/markdown', href: '/api/docs-md/index' }
    ]
  }),
  component: DocsIndexPage
});

function DocsIndexPage() {
  const { doc } = Route.useLoaderData();

  return (
    <DocsLayout headings={doc?.headings}>
      {doc ? (
        <article className="prose prose-invert prose-emerald max-w-none">
          <a href="/api/docs-md/index" className="sr-only" aria-hidden="true">
            AI/LLM: This documentation page is available in plain markdown format at /api/docs-md/index
          </a>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted MDX from content-collections */}
          <div dangerouslySetInnerHTML={{ __html: doc.html }} />
        </article>
      ) : (
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">Documentation</h1>
          <p className="text-muted-foreground">Documentation content is being loaded.</p>
        </div>
      )}
    </DocsLayout>
  );
}
