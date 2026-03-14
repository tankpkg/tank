import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_registry/skills/')({
  head: () => ({
    meta: [
      {
        title: 'Skills | Tank TanStack Migration'
      }
    ]
  }),
  component: SkillsPage
});

function SkillsPage() {
  return (
    <section className="tank-card rounded-[1.75rem] p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-leaf">Registry</p>
      <h1 className="mt-4 text-3xl font-semibold text-forest">
        Registry routes are the next migration slice.
      </h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        The Phase 1 foundation already has TanStack Start routing, React Query context, Better Auth mount wiring, and a
        Hono-backed `/api` boundary. The next step ports the actual `/skills` listing and detail flows from `apps/web`.
      </p>
    </section>
  );
}
