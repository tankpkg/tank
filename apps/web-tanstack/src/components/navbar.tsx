import { Link } from '@tanstack/react-router';
import {
  BookOpenIcon,
  CloudIcon,
  FileTextIcon,
  MenuIcon,
  PackageSearchIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  TrendingUpIcon,
  WrenchIcon,
  XIcon
} from 'lucide-react';
import * as React from 'react';

interface DropdownItem {
  icon: React.ReactNode;
  text: string;
  description: string;
  href: string;
}

interface NavItem {
  href?: string;
  text: string;
  items?: DropdownItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    text: 'Browse Skills',
    items: [
      {
        icon: <PackageSearchIcon className="size-4" />,
        text: 'All Skills',
        description: 'Browse the full registry',
        href: '/skills'
      },
      {
        icon: <TrendingUpIcon className="size-4" />,
        text: 'Most Popular',
        description: 'Top downloaded skills',
        href: '/skills?sort=downloads'
      },
      {
        icon: <SparklesIcon className="size-4" />,
        text: 'Recently Updated',
        description: 'Fresh and maintained',
        href: '/skills?sort=updated'
      },
      {
        icon: <ShieldCheckIcon className="size-4" />,
        text: 'Highest Rated',
        description: 'Best security scores',
        href: '/skills?sort=score'
      }
    ]
  },
  {
    text: 'Docs',
    items: [
      {
        icon: <RocketIcon className="size-4" />,
        text: 'Getting Started',
        description: 'Set up Tank in 2 minutes',
        href: '/docs/getting-started'
      },
      {
        icon: <BookOpenIcon className="size-4" />,
        text: 'Publishing Guide',
        description: 'Share your first skill',
        href: '/docs/publish-first-skill'
      },
      {
        icon: <TerminalIcon className="size-4" />,
        text: 'CLI Reference',
        description: 'All commands documented',
        href: '/docs/cli'
      },
      {
        icon: <FileTextIcon className="size-4" />,
        text: 'API Reference',
        description: 'REST API for integrations',
        href: '/docs/api'
      },
      {
        icon: <WrenchIcon className="size-4" />,
        text: 'MCP Server',
        description: 'Editor integration',
        href: '/docs/mcp'
      },
      {
        icon: <CloudIcon className="size-4" />,
        text: 'CI/CD',
        description: 'Automate publishing',
        href: '/docs/cicd'
      },
      {
        icon: <ServerIcon className="size-4" />,
        text: 'Self-Hosting',
        description: 'Run your own registry',
        href: '/docs/self-hosting'
      }
    ]
  }
];

function NavDropdownItem({ icon, text, description, href }: DropdownItem) {
  return (
    <li>
      <Link
        to={href}
        className="flex items-center gap-3 overflow-hidden rounded-lg p-2.5 transition-colors hover:bg-accent">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            {text}
          </span>
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        </div>
      </Link>
    </li>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="size-2.5 opacity-60"
      aria-hidden="true">
      <title>Toggle dropdown</title>
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Navbar() {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenMenu(text);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpenMenu(null), 150);
  };

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  React.useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen]);

  const toggleMobileSection = (text: string) => {
    setMobileSection((prev) => (prev === text ? null : text));
  };

  return (
    <>
      <nav data-testid="desktop-nav" className="max-lg:hidden">
        <ul className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            if (item.href && !item.items) {
              return (
                <li key={item.text}>
                  <Link
                    to={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {item.text}
                  </Link>
                </li>
              );
            }

            const isOpen = openMenu === item.text;

            return (
              <li
                key={item.text}
                className="relative"
                /* perspective for 3D dropdown animation — no Tailwind equivalent */
                style={{ perspective: '2000px' }}
                onMouseEnter={() => handleMouseEnter(item.text)}
                onMouseLeave={handleMouseLeave}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item.text}
                  {item.items && <ChevronIcon />}
                </button>

                {item.items && (
                  <div
                    className={`absolute -left-3 top-full z-50 w-70 pt-2 origin-top-left transition-all duration-200 ${
                      isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                    /* 3D rotateX transform — no Tailwind equivalent */
                    style={{
                      transform: isOpen ? 'rotateX(0deg) scale(1)' : 'rotateX(-15deg) scale(0.95)'
                    }}>
                    <ul className="flex flex-col gap-0.5 rounded-xl p-2 border border-border bg-popover shadow-lg">
                      {item.items.map((dropdownItem) => (
                        <NavDropdownItem key={dropdownItem.href} {...dropdownItem} />
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        data-testid="mobile-menu-toggle"
        type="button"
        className="flex items-center justify-center p-1.5 bg-transparent border-none cursor-pointer lg:hidden text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}>
        {mobileOpen ? (
          <XIcon className="size-5" />
        ) : (
          <MenuIcon className="size-5" />
        )}
      </button>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-16 z-40 border-none cursor-default bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="fixed inset-x-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-background/95 backdrop-blur-xl lg:hidden">
            <nav className="px-4 pt-1 pb-4">
              {NAV_ITEMS.map((item) => (
                <div key={item.text}>
                  {item.items ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleMobileSection(item.text)}
                        className="flex w-full items-center justify-between py-2.5 text-sm bg-transparent border-none cursor-pointer text-inherit text-muted-foreground hover:text-foreground transition-colors">
                        {item.text}
                        <svg
                          width="10"
                          height="6"
                          viewBox="0 0 10 6"
                          fill="none"
                          className={`size-2.5 opacity-60 transition-transform duration-200 ${
                            mobileSection === item.text ? 'rotate-180' : 'rotate-0'
                          }`}
                          aria-hidden="true">
                          <path
                            d="M1 1L5 5L9 1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {mobileSection === item.text && (
                        <ul className="pb-2 pl-1">
                          {item.items.map((sub) => (
                            <li key={sub.href}>
                              <Link
                                to={sub.href}
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                {sub.icon}
                                <span>{sub.text}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Link
                      to={item.href ?? '/'}
                      onClick={() => setMobileOpen(false)}
                      className="block py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {item.text}
                    </Link>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
