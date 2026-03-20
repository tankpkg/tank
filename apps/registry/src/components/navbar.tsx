import { Link } from '@tanstack/react-router';
import { MenuIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { text: 'Skills', href: '/skills' },
  { text: 'Docs', href: '/docs/overview' }
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen]);

  return (
    <>
      <nav data-testid="desktop-nav" className="max-lg:hidden">
        <ul className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.text}>
              <Link
                to={item.href}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <button
        data-testid="mobile-menu-toggle"
        type="button"
        className="flex items-center justify-center p-1.5 bg-transparent border-none cursor-pointer lg:hidden text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}>
        {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-14 z-40 border-none cursor-default bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="fixed inset-x-0 top-14 z-50 border-b border-border bg-background/95 backdrop-blur-xl lg:hidden">
            <nav className="px-4 py-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.text}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item.text}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
