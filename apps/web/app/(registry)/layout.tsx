import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export default async function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center px-4 gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <Image src="/logo.png" alt="Tank" width={24} height={24} className="rounded-sm" />
            Tank
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              href="/skills"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Skills
            </Link>
          </nav>
          <div className="ml-auto">
            {session ? (
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
