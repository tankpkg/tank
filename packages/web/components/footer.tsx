import Link from 'next/link';
import { getBrandConfig } from '@/lib/branding';

export function Footer() {
  const brand = getBrandConfig();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/10 bg-card/50 text-card-foreground backdrop-blur-sm mt-12">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {brand.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/skills" className="text-sm text-muted-foreground hover:text-foreground">
              Browse
            </Link>
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <Link href="https://github.com/tankpkg/tank" className="text-sm text-muted-foreground hover:text-foreground">
              GitHub
            </Link>
          </div>
        </div>

        {/* Powered by Tank - mandatory attribution */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Powered by</span>
          <Link
            href="https://tankpkg.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Tank
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {year} {brand.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
