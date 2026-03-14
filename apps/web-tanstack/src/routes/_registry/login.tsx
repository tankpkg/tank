import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_registry/login')({
  head: () => ({
    meta: [
      {
        title: 'Login | Tank TanStack Migration'
      }
    ]
  }),
  component: LoginPage
});

function LoginPage() {
  return (
    <section className="tank-card rounded-[1.75rem] p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-leaf">Authentication</p>
      <h1 className="mt-4 text-3xl font-semibold text-forest">
        Better Auth is mounted; the full login UI lands next.
      </h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Phase 1 wires the Better Auth TanStack route and shared config. The next slice ports the production login page,
        auth guards, CLI device flow, and session-aware layouts from `apps/web`.
      </p>
    </section>
  );
}
