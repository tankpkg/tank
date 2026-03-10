import Link from 'next/link';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { SearchTrigger } from '@/components/search-trigger';
import { Navbar } from '@/components/navbar';
import { Logo } from '@/components/logo';
import { Footer } from '@/components/footer';
import { getBrandConfig } from '@/lib/branding';

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
  const brand = getBrandConfig();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b" style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="container mx-auto h-14 px-4" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
            <Logo tight />
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
      <main className="container mx-auto px-4 py-8 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
