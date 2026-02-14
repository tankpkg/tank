import Link from 'next/link';

export default function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center px-4 gap-6">
          <Link href="/" className="font-semibold text-lg">
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
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
