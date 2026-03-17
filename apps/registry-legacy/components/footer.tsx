import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/10 bg-card/50 text-card-foreground backdrop-blur-sm mt-12">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold">
            Tank
          </Link>
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
        <p className="text-center text-xs text-muted-foreground">&copy; {year} Tank. All rights reserved.</p>
      </div>
    </footer>
  );
}
