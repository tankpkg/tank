import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { SearchTrigger } from '@/components/search-trigger';
import { Navbar } from '@/components/navbar';

async function AuthLink() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    return (
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Dashboard
      </Link>
    );
  }

  return <SignInLink />;
}

function SignInLink() {
  return (
    <Link
      href="/login"
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Sign In
    </Link>
  );
}

export default function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b" style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="container mx-auto h-14 px-4" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
            <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
              <Image src="/logo.png" alt="Tank" width={24} height={24} className="rounded-sm" />
              Tank
            </Link>
            <Navbar />
          </div>
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '28rem', pointerEvents: 'auto' }}>
            <SearchTrigger />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <Suspense fallback={<SignInLink />}>
              <AuthLink />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
