import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage
});

function DashboardPage() {
  const { session } = Route.useRouteContext();

  return (
    <section className="tank-shell py-10">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-ink-soft">Welcome, {session.user.name ?? session.user.email}</p>
    </section>
  );
}
