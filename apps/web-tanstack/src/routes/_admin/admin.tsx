import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/admin')({
  component: AdminPage
});

function AdminPage() {
  return (
    <section className="tank-shell py-10">
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-ink-soft">Admin panel — requires admin role.</p>
    </section>
  );
}
