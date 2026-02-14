import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import { Separator } from '@/components/ui/separator';
import { SignOutButton } from './sign-out-button';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const { user } = session;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center px-6 font-semibold text-lg">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Tank" width={24} height={24} className="rounded-sm" />
            Tank
          </Link>
        </div>
        <Separator />
        <nav className="flex-1 px-4 py-4 space-y-1">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/tokens">Tokens</NavLink>
          <NavLink href="/orgs">Organizations</NavLink>
        </nav>
        <Separator />
        <div className="px-4 py-4 space-y-3">
          <div className="text-sm truncate">
            <p className="font-medium truncate">{user.name || 'User'}</p>
            <p className="text-muted-foreground truncate">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex md:hidden h-14 items-center border-b px-4 gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Image src="/logo.png" alt="Tank" width={22} height={22} className="rounded-sm" />
            Tank
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/tokens" className="text-muted-foreground hover:text-foreground transition-colors">
              Tokens
            </Link>
            <Link href="/orgs" className="text-muted-foreground hover:text-foreground transition-colors">
              Orgs
            </Link>
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
    >
      {children}
    </Link>
  );
}
