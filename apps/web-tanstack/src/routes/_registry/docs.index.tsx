import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_registry/docs/')({
  head: () => ({
    meta: [
      {
        title: 'Docs | Tank TanStack Migration'
      }
    ]
  }),
  component: DocsPage
});

function DocsPage() {
  return (
    <section className="tank-card rounded-[1.75rem] p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-leaf">Docs</p>
      <h1 className="mt-4 text-3xl font-semibold text-forest">Docs content stays intact; the renderer comes next.</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Fumadocs and the existing MDX content are not moved in this foundation step. This route exists so the new app
        already has the same high-level IA shape as the current web surface.
      </p>
    </section>
  );
}
